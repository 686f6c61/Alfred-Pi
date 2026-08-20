import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  getPaths,
  loadModels,
  loadAuth,
  planWrites,
  applyPlan,
  backupFiles,
  listBackups,
  pinBackup,
  unpinBackup,
  restoreBackup,
  pruneBackups,
  atomicWriteText,
  type AuthFile,
  type ModelsFile,
} from "../lib/config-io.ts"

// Long unique sentinels: they must never leak into any printable diff, while
// the opaque `after` payload keeps carrying them verbatim.
const SENTINEL_AUTH_KEY = "sk-ant-SENTINEL-authkey-0123456789abcdef-FEED"
const SENTINEL_MODEL_API_KEY = "sk-models-SENTINEL-apikey-0123456789abcdef-FEED"
const SENTINEL_AUTH_HEADER = "HEADER-SENTINEL-authorization-0123456789abcdef-FEED"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-test-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function seedModels(models: ModelsFile): void {
  writeFileSync(getPaths(dir).models, JSON.stringify(models, null, 2) + "\n")
}

test("loadModels on missing file returns fallback without error", () => {
  const r = loadModels(getPaths(dir))
  expect(r.existed).toBe(false)
  expect(r.data.providers).toEqual({})
})

test("planWrites shows diff and applyPlan writes atomically", () => {
  seedModels({ providers: { alpha: { baseUrl: "https://a.example/v1", api: "openai-completions", models: [{ id: "m1" }] } } })

  const next = loadModels(getPaths(dir)).data
  next.providers.alpha!.models!.push({ id: "m2" })

  const plan = planWrites({ models: next }, getPaths(dir))
  expect(plan).toHaveLength(1)
  expect(plan[0]!.diff).toContain("+")
  expect(plan[0]!.diff).toContain('"m2"')

  applyPlan(plan, getPaths(dir))

  const onDisk = JSON.parse(readFileSync(getPaths(dir).models, "utf-8")) as ModelsFile
  expect(onDisk.providers.alpha!.models!.map((m) => m.id)).toEqual(["m1", "m2"])
  // no temp files left behind
  expect(readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([])
})

test("planWrites with identical content produces no plan", () => {
  seedModels({ providers: { alpha: { baseUrl: "https://a", api: "openai-completions" } } })
  const same = loadModels(getPaths(dir)).data
  expect(planWrites({ models: same }, getPaths(dir))).toHaveLength(0)
})

test("backups: created, retention prunes to 10, pin protects", () => {
  const paths = getPaths(dir)
  seedModels({ providers: {} })

  let oldestPath = ""
  for (let i = 0; i < 12; i++) {
    writeFileSync(paths.models, JSON.stringify({ i }) + "\n")
    const b = backupFiles([paths.models], paths)!
    if (i === 0) oldestPath = join(paths.backupsDir, b.id)
  }

  let all = listBackups(paths)
  expect(all.length).toBe(10)

  // Pruned backups must be gone from disk, not just from the listing.
  expect(existsSync(oldestPath)).toBe(false)

  // pin the newest, then force more backups: pinned survives
  const pinnedId = all[0]!.id
  pinBackup(pinnedId, paths)
  for (let i = 0; i < 3; i++) {
    writeFileSync(paths.models, JSON.stringify({ i: `x${i}` }) + "\n")
    backupFiles([paths.models], paths)
  }
  all = listBackups(paths)
  expect(all.find((b) => b.id === pinnedId)!.pinned).toBe(true)
  expect(existsSync(join(paths.backupsDir, pinnedId))).toBe(true)
  expect(all.length).toBeLessThanOrEqual(11) // 10 unpinned + 1 pinned
  expect(pruneBackups(paths)).toBeGreaterThanOrEqual(0)
})

test("backupFiles_creates_0700_tree", () => {
  const paths = getPaths(dir)
  seedModels({ providers: {} })

  const backup = backupFiles([paths.models], paths)!

  // Backups hold secrets too: the tree must be owner-only from creation.
  expect(statSync(paths.backupsDir).mode & 0o777).toBe(0o700)
  expect(statSync(join(paths.backupsDir, backup.id)).mode & 0o777).toBe(0o700)
})

test("backupFiles_sets_0600_on_sensitive_files", () => {
  const paths = getPaths(dir)
  writeFileSync(paths.auth, JSON.stringify({ anthropic: { type: "api", key: "sk-x" } }) + "\n")
  writeFileSync(paths.models, JSON.stringify({ providers: {} }) + "\n")
  writeFileSync(paths.settings, JSON.stringify({ theme: "dark" }) + "\n")
  for (const f of [paths.auth, paths.models, paths.settings]) chmodSync(f, 0o644)

  const backup = backupFiles([paths.auth, paths.models, paths.settings], paths)!
  const snap = join(paths.backupsDir, backup.id)

  // Every snapshot file (and its metadata) is sensitive: 0600 regardless of
  // the source files' looser modes.
  for (const name of ["auth.json", "models.json", "settings.json", "backup.json"]) {
    expect(statSync(join(snap, name)).mode & 0o777).toBe(0o600)
  }
})

test("restoreBackup puts old content back and takes a safety snapshot", () => {
  const paths = getPaths(dir)
  seedModels({ providers: { before: { baseUrl: "https://before" } } })
  const backup = backupFiles([paths.models], paths)

  writeFileSync(paths.models, JSON.stringify({ providers: { after: {} } }))

  const r = restoreBackup(backup!.id, paths)
  expect(r.ok).toBe(true)
  const restored = JSON.parse(readFileSync(paths.models, "utf-8"))
  expect(restored.providers.before).toBeDefined()
  // safety backup captured the "after" state
  const safetyContent = JSON.parse(readFileSync(join(paths.backupsDir, r.safetyBackup!.id, "models.json"), "utf-8"))
  expect(safetyContent.providers.after).toBeDefined()
})

test("atomicWriteText overwrites and preserves nothing weird on missing file", () => {
  const target = join(dir, "nested", "file.json")
  // parent must exist for our writer; config files always live in existing dirs
  mkdirSync(join(dir, "nested"), { recursive: true })
  atomicWriteText(target, "hello\n")
  expect(readFileSync(target, "utf-8")).toBe("hello\n")
  atomicWriteText(target, "world\n")
  expect(readFileSync(target, "utf-8")).toBe("world\n")
  expect(existsSync(target)).toBe(true)
})

test("unpin allows pruning again", () => {
  const paths = getPaths(dir)
  seedModels({ providers: {} })
  writeFileSync(paths.models, "{}\n")
  const b = backupFiles([paths.models], paths)!
  pinBackup(b.id, paths)
  expect(listBackups(paths)[0]!.pinned).toBe(true)
  unpinBackup(b.id, paths)
  expect(listBackups(paths).find((x) => x.id === b.id)!.pinned).toBe(false)
})

test("planWrites_redacts_secrets", () => {
  const paths = getPaths(dir)
  seedModels({
    providers: {
      alpha: { baseUrl: "https://a.example/v1", api: "openai-completions", models: [{ id: "m1" }] },
    },
  })
  writeFileSync(paths.auth, JSON.stringify({ anthropic: { type: "api", key: "old-key" } }, null, 2) + "\n")

  const models = loadModels(paths).data
  const auth = loadAuth(paths).data
  models.providers.alpha!.apiKey = SENTINEL_MODEL_API_KEY
  models.providers.alpha!.headers = { Authorization: `Bearer ${SENTINEL_AUTH_HEADER}` }
  auth.anthropic!.key = SENTINEL_AUTH_KEY

  const plan = planWrites({ models, auth }, paths)
  expect(plan.length).toBeGreaterThanOrEqual(2)

  const sentinels = [SENTINEL_AUTH_KEY, SENTINEL_MODEL_API_KEY, SENTINEL_AUTH_HEADER]
  for (const p of plan) {
    for (const s of sentinels) {
      expect(p.diff).not.toContain(s)
    }
  }

  // The opaque payloads still carry the real values.
  const authWrite = plan.find((p) => p.kind === "auth")!
  expect(authWrite.after).toContain(SENTINEL_AUTH_KEY)
  const modelsWrite = plan.find((p) => p.kind === "models")!
  expect(modelsWrite.after).toContain(SENTINEL_MODEL_API_KEY)
  expect(modelsWrite.after).toContain(SENTINEL_AUTH_HEADER)
})

test("planWrites_new_file_diff", () => {
  const paths = getPaths(dir)
  expect(existsSync(paths.auth)).toBe(false)

  const auth: AuthFile = { anthropic: { type: "api", key: SENTINEL_AUTH_KEY } }
  const plan = planWrites({ auth }, paths)

  expect(plan).toHaveLength(1)
  expect(plan[0]!.diff).toContain("new file")
  expect(plan[0]!.diff).not.toContain(SENTINEL_AUTH_KEY)
  expect(plan[0]!.after).toContain(SENTINEL_AUTH_KEY)

  applyPlan(plan, paths)
  expect(existsSync(paths.auth)).toBe(true)
})

test("applyPlan_auth_0600", () => {
  const paths = getPaths(dir)
  expect(existsSync(paths.auth)).toBe(false)

  const auth: AuthFile = { anthropic: { type: "api", key: "sk-live-key" } }
  const plan = planWrites({ auth }, paths)
  applyPlan(plan, paths)

  // Content persisted and owner-only permissions: auth.json holds secrets.
  expect(readFileSync(paths.auth, "utf-8")).toContain("sk-live-key")
  expect(statSync(paths.auth).mode & 0o777).toBe(0o600)
})

test("restoreBackup_restores_0600", () => {
  const paths = getPaths(dir)
  writeFileSync(paths.auth, JSON.stringify({ anthropic: { type: "api", key: "original-key" } }, null, 2) + "\n")

  // A backup whose copy of auth.json has loosened to 0644 (e.g. created by a
  // tool that ignores modes) must still restore owner-only permissions.
  const backup = backupFiles([paths.auth], paths)!
  chmodSync(join(paths.backupsDir, backup.id, "auth.json"), 0o644)

  writeFileSync(paths.auth, JSON.stringify({ anthropic: { type: "api", key: "changed-key" } }, null, 2) + "\n")
  const r = restoreBackup(backup.id, paths)

  expect(r.ok).toBe(true)
  expect(readFileSync(paths.auth, "utf-8")).toContain("original-key")
  expect(statSync(paths.auth).mode & 0o777).toBe(0o600)
})

test("atomicWriteText_preserves_0600", () => {
  const target = join(dir, "preserve.json")
  writeFileSync(target, "first\n")
  chmodSync(target, 0o600)

  // Rewriting without an explicit mode must never widen permissions.
  atomicWriteText(target, "second\n")
  expect(readFileSync(target, "utf-8")).toBe("second\n")
  expect(statSync(target).mode & 0o777).toBe(0o600)
})
