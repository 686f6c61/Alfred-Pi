import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"

// Characterization test for A-PCK-09: the recommended-packages screen tells
// users to install manually but never mentions the security audit or points
// to /packages. The showText block inside the `action === "packages"`
// branch must mention both, so installs go through the audited flow.

const source = readFileSync(new URL("../lib/screens.ts", import.meta.url), "utf8")

test("recommended_packages_mentions_audit", () => {
  const branchStart = source.indexOf('action === "packages"')
  expect(branchStart).toBeGreaterThanOrEqual(0)

  // The showText call ends with the closing bracket of its lines array.
  const blockEnd = source.indexOf("])", branchStart)
  expect(blockEnd).toBeGreaterThan(branchStart)

  const block = source.slice(branchStart, blockEnd)
  expect(block).toContain("audit")
  expect(block).toContain("/packages")
})
