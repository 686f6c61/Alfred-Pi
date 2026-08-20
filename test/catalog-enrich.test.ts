import { test, expect } from "bun:test"
import { enrichWithCatalog, type Catalog } from "../lib/catalog.ts"
import type { ModelConfig } from "../lib/config-io.ts"

// Injected catalog: the enrichment must work offline and count only the
// fields it actually applied (user-provided values always win).
const CATALOG: Catalog = {
  zai: {
    "glm-5.2": {
      contextWindow: 200_000,
      maxTokens: 65_536,
      reasoning: true,
      vision: true,
      cost: { input: 0.6, output: 2.2 },
    },
  },
}

test("enrichWithCatalog_fills_metadata", async () => {
  // Everything missing: all five fields are autofilled and counted.
  const full = await enrichWithCatalog("zai-glm", [{ id: "glm-5.2" }], CATALOG)
  expect(full.filledCount).toBe(5)
  expect(full.models[0]!.contextWindow).toBe(200_000)
  expect(full.models[0]!.maxTokens).toBe(65_536)
  expect(full.models[0]!.reasoning).toBe(true)
  expect(full.models[0]!.input).toContain("image")
  expect(full.models[0]!.cost?.input).toBe(0.6)

  // A user-set field survives and is NOT counted as filled.
  const partial = await enrichWithCatalog("zai-glm", [{ id: "glm-5.2", contextWindow: 8_000 } as ModelConfig], CATALOG)
  expect(partial.models[0]!.contextWindow).toBe(8_000)
  expect(partial.filledCount).toBe(4)

  // Unknown model: nothing to fill.
  const none = await enrichWithCatalog("zai-glm", [{ id: "not-in-catalog" }], CATALOG)
  expect(none.filledCount).toBe(0)
  expect(none.models[0]).toEqual({ id: "not-in-catalog" })
})
