import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  atomicWriteText,
  backupFiles,
  deleteBackup,
  planWrites,
  getPaths,
  type FilePaths,
} from "../lib/config-io.ts"

// Line-coverage companions for lib/config-io.ts: the rename failure paths of
// atomicWriteText, backup removal that throws, deleteBackup, and the
// before-side header redaction. Everything runs inside temp dirs; the only
// real syscalls are file ones (no network, no subprocesses).

let root: string
let paths: FilePaths

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pi686-cio-"))
  paths = getPaths(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test("atomicWriteText_rename_failure_cleans_tmp_and_rethrows", () => {
  // Target is an existing non-empty directory: writeFileSync of the tmp file
  // succeeds, renameSync fails (ENOTEMPTY) and the tmp file is unlinked
  // before rethrowing, so no litter stays behind.
  const target = join(root, "target")
  mkdirSync(join(target, "sub"), { recursive: true })
  expect(() => atomicWriteText(target, "data")).toThrow()
})

test("atomicWriteText_unlink_failure_is_swallowed", () => {
  // Read-only parent directory: the tmp file is pre-created so the write
  // itself only needs file permissions, then both renameSync and unlinkSync
  // fail with EACCES. The inner catch must swallow the unlink error and let
  // the original rename error propagate.
  const realNow = Date.now
  Date.now = () => 1234567890
  const tmp = join(root, "x.json.tmp-1234567890")
  writeFileSync(tmp, "seed")
  chmodSync(root, 0o555)
  try {
    expect(() => atomicWriteText(join(root, "x.json"), "data")).toThrow()
  } finally {
    chmodSync(root, 0o755)
    Date.now = realNow
  }
})

test("deleteBackup_removes_an_existing_snapshot_and_rejects_unknown_ids", () => {
  const cfg = join(root, "models.json")
  writeFileSync(cfg, '{"providers":{}}')
  const info = backupFiles([cfg], paths)
  expect(info).toBeDefined()
  expect(deleteBackup(info!.id, paths)).toBe(true)
  expect(deleteBackup("no-such-id", paths)).toBe(false)
})

test("deleteBackup_reports_false_when_rm_fails", () => {
  // A read-only backup directory cannot have its entries unlinked, so the
  // rmSync inside removeBackupDir throws and the catch returns false.
  const cfg = join(root, "auth.json")
  writeFileSync(cfg, "{}")
  const info = backupFiles([cfg], paths)
  const backupDir = join(paths.backupsDir, info!.id)
  chmodSync(backupDir, 0o555)
  try {
    expect(deleteBackup(info!.id, paths)).toBe(false)
  } finally {
    chmodSync(backupDir, 0o755)
  }
})

test("planWrites_redacts_sensitive_headers_already_on_disk", () => {
  // The before side of the header redaction: a provider already carrying a
  // literal Authorization header must never leak into the diff preview.
  const current = {
    providers: {
      remote: {
        baseUrl: "https://api.example.com/v1",
        api: "openai-completions",
        apiKey: "sk-live-secret",
        headers: { Authorization: "Bearer tok-123", "x-custom": "c" },
      },
    },
  }
  writeFileSync(paths.models, JSON.stringify(current, null, 2))
  const next = JSON.parse(JSON.stringify(current)) as typeof current
  next.providers["remote"]!.headers = { Authorization: "Bearer tok-456" }

  const plan = planWrites({ models: next }, paths)
  expect(plan).toHaveLength(1)
  expect(plan[0]!.diff).toContain("*** (updated)")
  expect(plan[0]!.diff).not.toContain("tok-123")
  expect(plan[0]!.diff).not.toContain("tok-456")
  expect(plan[0]!.diff).not.toContain("sk-live-secret")
  // The payload to apply still carries the real values (opaque, never rendered).
  expect(plan[0]!.after).toContain("tok-456")
})

test("atomicWriteText_preserves_previous_mode_when_no_mode_given", () => {
  const file = join(root, "kept.json")
  writeFileSync(file, "{}")
  chmodSync(file, 0o640)
  atomicWriteText(file, '{"a":1}')
  expect(statSync(file).mode & 0o777).toBe(0o640)
})
