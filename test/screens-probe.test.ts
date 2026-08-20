import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Characterization test for the deepProbeFlow bug in lib/screens.ts:
// `await probeLiveness(target).models` awaits undefined (the `.models`
// property of the still-pending Promise), so discovered models never
// reach the candidate list. The named test stays red until the source
// awaits the probe result before reading `.models`, e.g.
// `(await probeLiveness(target)).models`. Source-only by design: lib/
// must not be imported here.

const SOURCE = readFileSync(join(import.meta.dir, "..", "lib", "screens.ts"), "utf8")

// Matches `.models` taken off the unresolved promise
// (`await probeLiveness(target).models`, buggy) but not off the awaited
// result (`(await probeLiveness(target)).models`, fixed).
const promiseMemberAccess = /await\s+probeLiveness\([^()]*\)\s*\?\.\s*models|await\s+probeLiveness\([^()]*\)\s*\.\s*models/

test("characterization regex separates bug from fix", () => {
  expect(promiseMemberAccess.test("...(await probeLiveness(target).models ?? [])...")).toBe(true)
  expect(promiseMemberAccess.test("...(await probeLiveness(target)?.models ?? [])...")).toBe(true)
  expect(promiseMemberAccess.test("...((await probeLiveness(target)).models ?? [])...")).toBe(false)
  expect(promiseMemberAccess.test("const r = await probeLiveness(target); r.models")).toBe(false)
})

test("deepProbeFlow_awaits_liveness_result", () => {
  expect(promiseMemberAccess.test(SOURCE)).toBe(false)
})
