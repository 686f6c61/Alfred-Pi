import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Source-level characterization: stack.ts must not keep a private spendToday
// duplicate of budget.spendToday; collectStack should reuse the budget one.
test("stack_spendToday_matches_budget_spendToday", () => {
  const source = readFileSync(join(import.meta.dir, "..", "lib", "stack.ts"), "utf-8")
  expect(source).not.toMatch(/function spendToday\s*\(/)
  expect(source).toContain('from "./budget.ts"')
})
