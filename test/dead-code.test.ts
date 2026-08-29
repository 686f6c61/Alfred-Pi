import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A-TST-13 dead-code characterization, source level: no lib/ or index.ts
// edits happen here.

const PROBER = readFileSync(join(import.meta.dir, "..", "lib", "prober.ts"), "utf8")
const INDEX = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf8")

// Slice the body of a top-level function from a source string.
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = src.slice(start)
  const end = rest.indexOf("\n}")
  return end >= 0 ? rest.slice(0, end) : rest
}

test("prober_modelsUrl_switch_case_equals_default", () => {
  const body = functionBody(PROBER, "modelsUrl")
  // Guard against a bad slice: we must be looking at the URL builder.
  expect(body).toContain("/models")
  // The google case returns exactly what the default returns, so the
  // switch is dead weight: after the cleanup modelsUrl is a plain
  // template string with no switch. RED while the switch remains.
  expect(body).not.toContain("switch")
})

test("headless_output_chooses_format_on_json_suffix", () => {
  // The `:json` suffix selects JSON for machines; its absence selects the
  // human text formatter (formatStackText / formatAutopilotText /
  // formatDomainsText), exactly as docs/comandos.md promises. A fake
  // `:json` — same output with and without the suffix — is a bug: it made
  // autopilot/domains print raw JSON both ways in 0.4.0.
  const writes = INDEX.split("\n").filter((l) => l.includes("process.stdout.write"))
  expect(writes.length).toBeGreaterThan(0)
  const branchingWrites = writes.filter((l) => l.includes("JSON.stringify("))
  // stack and autopilot/domains (autopilot+domains share one write).
  expect(branchingWrites.length).toBe(2)
  for (const line of branchingWrites) {
    expect(line).toContain('":json"')
    expect(line).toMatch(/formatStackText|lines\.join/)
  }
  // No raw or alternative serialization sneaks into print mode.
  expect(INDEX).not.toMatch(/print[^}]*String\(payload/)
})
