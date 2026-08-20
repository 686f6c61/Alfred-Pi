import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Characterization test for the dataDir literals in lib/screens.ts:
// several places rebuild the data directory as
// `${getBaseDir()}/pi-harness-moe` instead of calling getDataDir()
// from lib/paths.ts. The named test stays red until those copies are
// replaced with getDataDir(). Note: `getBaseDir()` used for agentDir
// and sessions paths is correct and not asserted against here.

const SOURCE = readFileSync(join(import.meta.dir, "..", "lib", "screens.ts"), "utf8")

// Every way the source currently hand-builds the data dir path.
const forbiddenLiteral = /getBaseDir\(\)\s*\+\s*["']\/pi-harness-moe["']|`[^`]*\$\{getBaseDir\(\)\}\/pi-harness-moe[^`]*`/

test("forbidden-literal regex matches the known copies", () => {
  expect(forbiddenLiteral.test('const dataDir = `${getBaseDir()}/pi-harness-moe`')).toBe(true)
  expect(forbiddenLiteral.test('const dataDir = getBaseDir() + "/pi-harness-moe"')).toBe(true)
  expect(forbiddenLiteral.test('const dataDir = getDataDir()')).toBe(false)
  expect(forbiddenLiteral.test('const agentDir = getBaseDir()')).toBe(false)
})

test("screens_ts_uses_getDataDir_instead_of_literals", () => {
  // Red while any `${getBaseDir()}/pi-harness-moe` literal remains.
  expect(forbiddenLiteral.test(SOURCE)).toBe(false)
  // If the file resolves a data dir, it must go through getDataDir.
  expect(SOURCE).toContain("getDataDir(")
})
