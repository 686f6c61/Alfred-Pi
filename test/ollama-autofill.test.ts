import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Characterization test for the ollama metadata autofill bug in
// lib/screens.ts: the `action === "metadata"` branch reads
// `next.providers.ollama!.models` without ensuring the ollama provider
// entry exists, so a missing entry throws a TypeError. The named test
// stays red until that branch creates the provider first (e.g. via an
// `ensureOllamaProvider` helper) instead of using the non-null
// assertion. Source-only by design: lib/ must not be imported here.

const SOURCE = readFileSync(join(import.meta.dir, "..", "lib", "screens.ts"), "utf8")

// Slice the body of the `action === "metadata"` branch, from the branch
// condition to the next `} else` (or end of the if-chain).
function metadataBranch(src: string): string {
  const start = src.indexOf('action === "metadata"')
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = src.slice(start)
  const end = rest.indexOf("} else")
  return end >= 0 ? rest.slice(0, end) : rest
}

test("metadata branch slice lands on the right code", () => {
  const branch = metadataBranch(SOURCE)
  // Guard against silent passes from a bad slice: the real branch
  // enriches the model and applies the result.
  expect(branch).toContain("enrichWithCatalog")
  expect(branch).toContain("confirmAndApply")
})

test("ollama_autofill_creates_provider_if_missing", () => {
  const branch = metadataBranch(SOURCE)
  // Red while the branch dereferences `next.providers.ollama!` without
  // creating the provider; green once it ensures the entry first.
  expect(branch).not.toMatch(/next\.providers\.ollama!/)
})
