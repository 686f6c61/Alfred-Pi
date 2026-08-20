import { test, expect } from "bun:test"
import { isValidProviderId } from "../lib/presets.ts"

// Provider ids become file names, header keys and CLI tokens: they must not
// start with a digit nor contain whitespace or path/meta characters.
test("isValidProviderId_table_test", () => {
  expect(isValidProviderId("mi-proveedor_2")).toBe(true)
  expect(isValidProviderId("zai-glm")).toBe(true)

  expect(isValidProviderId("1openai")).toBe(false)
  expect(isValidProviderId("9local")).toBe(false)
  expect(isValidProviderId("mi proveedor")).toBe(false)
  expect(isValidProviderId("a.b")).toBe(false)
  expect(isValidProviderId("a/b")).toBe(false)
  expect(isValidProviderId("a#b")).toBe(false)
})
