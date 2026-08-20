import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectDomainFull } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"

// repoHints with a `*.sql` glob must resolve against the working directory,
// so a neutral prompt in a repo that carries SQL files lands on data-analisis.
let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "pi686-hints-"))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

test("dataAnalisis_repoHints_resolvable", () => {
  writeFileSync(join(cwd, "foo.sql"), "SELECT 1;\n")
  const domains = discoverDomains(new URL("..", import.meta.url).pathname)
  const m = detectDomainFull("hello there", domains, { cwd })
  expect(m?.domain.manifest.id).toBe("data-analisis")
})
