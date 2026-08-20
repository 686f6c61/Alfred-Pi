import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectDomainFull } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"

// Characterization test for A-PCK-04: qa-testing repoHints do not include
// "test/", so a repo whose tests live in test/ is not detected when the
// prompt is neutral. Only the hint table should change, never the engine.

const REPO = new URL("..", import.meta.url).pathname

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-qahint-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test("qaTesting_detected_with_test_dir", () => {
  mkdirSync(join(dir, "test"))
  const m = detectDomainFull("hello there", discoverDomains(REPO), { cwd: dir })
  expect(m?.domain.manifest.id).toBe("qa-testing")
})
