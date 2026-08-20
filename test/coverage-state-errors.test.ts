import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadBudgetState } from "../lib/budget.ts"
import { loadFallbackState } from "../lib/fallback.ts"
import { loadOnboardingState } from "../lib/onboarding.ts"
import { loadPersonaState } from "../lib/persona.ts"
import { loadAutopilotState, detectDomainFull } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"
import { installedVersion, checkForUpdate } from "../lib/update-check.ts"
import { fetchCatalog, lookupCatalog } from "../lib/catalog.ts"
import { exportProfiles, type ProfilesFile } from "../lib/profiles.ts"
import { findRepoRoot } from "../lib/paths.ts"
import { collectUsage, formatUsageReport, type UsageReport } from "../lib/usage.ts"
import { appendHealth, loadRecentHealth } from "../lib/doctor.ts"
import { collectStack, formatStackText } from "../lib/stack.ts"
import { getPaths } from "../lib/config-io.ts"

// Line-coverage companions for the small state modules: every corrupt-JSON
// reset, the update-check catch path, catalog cache edges, profiles export,
// paths fallback, usage file errors and the stack health section. All file
// work happens inside temp dirs; fetch is always mocked.

const REPO = new URL("..", import.meta.url).pathname
const realFetch = globalThis.fetch
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-states-"))
})
afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

test("corrupt_state_files_reset_to_defaults", () => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "budget.json"), "{ nope")
  expect(loadBudgetState(dir)).toEqual({})
  writeFileSync(join(dir, "fallback.json"), "{ nope")
  expect(loadFallbackState(dir)).toEqual({ failures: {} })
  writeFileSync(join(dir, "onboarding.json"), "{ nope")
  expect(loadOnboardingState(dir)).toEqual({ done: false })
  writeFileSync(join(dir, "persona.json"), "{ nope")
  expect(loadPersonaState(dir).persona).toBe("alfred")
  writeFileSync(join(dir, "autopilot.json"), "{ nope")
  expect(loadAutopilotState(dir)).toEqual({ enabled: false, routing: "context" })
})

test("detectDomainFull_glob_hint_on_missing_directory_is_false", () => {
  // A glob repoHint walks the hint's directory; when it does not exist the
  // readdirSync inside repoHintExists throws and the hint is safely false.
  const domains = discoverDomains(REPO)
  const m = detectDomainFull("hello there", domains, { cwd: join(dir, "does-not-exist") })
  expect(m).toBeUndefined()
})

test("installedVersion_falls_back_when_package_json_missing", () => {
  expect(installedVersion(dir)).toBe("0.0.0")
})

test("checkForUpdate_survives_stale_and_corrupt_cache", async () => {
  const dataDir = join(dir, "data")
  mkdirSync(dataDir, { recursive: true })
  // Stale success cache (older than the 24h TTL): falls through to a fetch
  // that rejects, returning an error state instead of throwing.
  const stale = { current: "1.0.0", latest: "9.9.9", updateAvailable: true, checkedAt: new Date(Date.now() - 25 * 3600_000).toISOString() }
  writeFileSync(join(dataDir, "update-cache.json"), JSON.stringify(stale))
  globalThis.fetch = (async () => {
    throw new Error("offline")
  }) as unknown as typeof fetch
  const staleState = await checkForUpdate({ dataDir, repoRoot: REPO })
  expect(staleState.error).toBe("offline")

  // Corrupt cache JSON: the parse throws, the catch falls through to a fresh
  // (failing) check; the user never sees an exception.
  writeFileSync(join(dataDir, "update-cache.json"), "{ nope")
  const corruptState = await checkForUpdate({ dataDir, repoRoot: REPO })
  expect(corruptState.error).toBe("offline")
})

test("fetchCatalog_falls_back_when_cache_is_stale_or_corrupt", async () => {
  const dataDir = join(dir, "data")
  mkdirSync(dataDir, { recursive: true })
  globalThis.fetch = (async () => {
    throw new Error("offline")
  }) as unknown as typeof fetch

  const stale = { fetchedAt: new Date(Date.now() - 25 * 3600_000).toISOString(), catalog: { x: {} } }
  writeFileSync(join(dataDir, "catalog-cache.json"), JSON.stringify(stale))
  expect(await fetchCatalog({ dataDir })).toBeNull()

  writeFileSync(join(dataDir, "catalog-cache.json"), "{ nope")
  expect(await fetchCatalog({ dataDir })).toBeNull()
})

test("lookupCatalog_resolves_ollama_cloud_models", () => {
  const catalog = { "ollama-cloud": { "glm-5.2": { contextWindow: 200000 } } }
  const meta = lookupCatalog(catalog, "ollama", "glm-5.2:cloud")
  expect(meta?.contextWindow).toBe(200000)
})

test("exportProfiles_serializes_the_file", () => {
  const file: ProfilesFile = { profiles: [{ name: "daily", chain: [{ provider: "ollama", model: "m1" }] }] }
  const text = exportProfiles(file)
  expect(JSON.parse(text)).toEqual(file)
})

test("findRepoRoot_falls_back_to_start_when_no_packs_upwards", () => {
  // From a temp dir nothing upwards contains packs/ + package.json, so the
  // walk gives up and returns the resolved start itself.
  expect(findRepoRoot(dir)).toBe(dir)
})

test("collectUsage_skips_corrupt_lines_and_reports_unreadable_files", () => {
  const proj = join(dir, "sessions", "proj")
  mkdirSync(proj, { recursive: true })
  // One corrupt line (skipped), one valid assistant message (kept).
  const good = [
    "{corrupt json",
    JSON.stringify({ type: "session", id: "s-1", cwd: "/work/app" }),
    JSON.stringify({ type: "message", timestamp: new Date().toISOString(), message: { role: "assistant", provider: "p", model: "m", usage: { input: 10, output: 5 } } }),
  ].join("\n")
  writeFileSync(join(proj, "good.jsonl"), good)
  // An unreadable session file: readFileSync throws and lands in errors.
  writeFileSync(join(proj, "locked.jsonl"), "{}")
  chmodSync(join(proj, "locked.jsonl"), 0o000)

  const { records, errors } = collectUsage(join(dir, "sessions"))
  try {
    expect(records).toHaveLength(1)
    expect(records[0]!.sessionId).toBe("s-1")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("locked.jsonl")

    const report = { sessions: 1, turns: 1, cost: 0, pricedTurns: 0, tokens: records[0]!, byModel: [], byDay: [], topSessions: [], errors } as unknown as UsageReport
    expect(formatUsageReport(report, "today").join("\n")).toContain("warnings: 1 unreadable session file(s)")
  } finally {
    chmodSync(join(proj, "locked.jsonl"), 0o644)
  }
})

test("formatStackText_lists_provider_health_when_history_exists", () => {
  const agentDir = join(dir, "agent")
  const paths = getPaths(agentDir)
  appendHealth(
    [
      { provider: "ollama", ok: true, latencyMs: 42, error: null },
      { provider: "ollama", ok: true, latencyMs: 58, error: null },
    ],
    paths,
  )
  const info = collectStack({ agentDir, repoRoot: REPO, model: { provider: "ollama", id: "m1" } })
  expect(info.health).toHaveLength(1)
  const text = formatStackText(info).join("\n")
  expect(text).toContain("ollama - 100% ok · avg 50ms · 2 samples")
})

test("health_history_redacts_secrets_in_error_strings", () => {
  const paths = getPaths(join(dir, "agent"))
  appendHealth(
    [{ provider: "leaky", ok: false, latencyMs: null, error: 'Bearer abc123 api_key: "s3cr3t" at https://user:pass@host/x' }],
    paths,
  )
  const [entry] = loadRecentHealth(10, paths)
  expect(entry?.error).toContain("Bearer [redacted]")
  expect(entry?.error).toContain("api_key: [redacted]")
  expect(entry?.error).toContain("https://user:[redacted]@host/x")
  expect(entry?.error).not.toContain("abc123")
  expect(entry?.error).not.toContain("s3cr3t")
})
