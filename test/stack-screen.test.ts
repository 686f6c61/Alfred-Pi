import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Source-level contract: stackScreen must derive its output from
// collectStack + formatStackText (the /stack and --harness-moe=stack
// renderers) instead of hand-formatting the sections again.
test("stackScreen_matches_formatStackText", () => {
  const source = readFileSync(join(import.meta.dir, "..", "lib", "screens.ts"), "utf-8")
  const start = source.indexOf("export async function stackScreen")
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf("\n}", start)
  const body = source.slice(start, end === -1 ? undefined : end)

  expect(body).toContain("collectStack")
  expect(body).toContain("formatStackText")
  // No hand-rebuilt sections: the big literal block and the hand-written
  // "autopilot & fallback" header must be gone.
  expect(body).not.toContain("const lines: string[]")
  expect(body).not.toContain('"autopilot & fallback"')
})
