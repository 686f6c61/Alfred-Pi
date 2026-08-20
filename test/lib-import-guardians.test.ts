import { test, expect } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// Import guardians (A-TST-16, A-TST-17). Structural checks over lib/
// sources so the dependency rules survive future refactors:
//   - autopilot/persona stay decoupled from config-io's write planner
//   - only screens.ts and onboarding-flow.ts may depend on pi packages

const LIB = join(import.meta.dir, "..", "lib")

function importsOf(file: string): string {
  return readFileSync(join(LIB, file), "utf8")
    .split("\n")
    .filter((l) => l.trim().startsWith("import"))
    .join("\n")
}

test("autopilot_does_not_import_planWrites", () => {
  // autopilot owns its tiny state file; the heavyweight plan → diff →
  // backup pipeline of config-io must not leak into it.
  expect(importsOf("autopilot.ts")).not.toContain("planWrites")
})

test("persona_does_not_import_planWrites", () => {
  expect(importsOf("persona.ts")).not.toContain("planWrites")
})

test("no_lib_file_imports_pi_except_whitelist", () => {
  // Known conformity with pi (D2-H05, duplicate of D3-H04): screens.ts
  // needs the SelectList UI and onboarding-flow.ts the ExtensionAPI/Context
  // types. Every other lib/ module stays pure Node with zero pi imports,
  // which is what keeps lib/ testable outside an agent host.
  const whitelist = new Set(["screens.ts", "onboarding-flow.ts"])
  const offenders: string[] = []
  for (const f of readdirSync(LIB).filter((f) => f.endsWith(".ts"))) {
    if (whitelist.has(f)) continue
    if (/@earendil-works\//.test(importsOf(f))) offenders.push(f)
  }
  expect(offenders).toEqual([])
})
