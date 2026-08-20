import { test, expect } from "bun:test"
import { PROVIDER_PRESETS, findPreset } from "../lib/presets.ts"

test("preset ids are unique and well-formed", () => {
  const ids = PROVIDER_PRESETS.map((p) => p.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const p of PROVIDER_PRESETS) {
    expect(p.id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    expect(p.label.length).toBeGreaterThan(3)
    expect(["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"]).toContain(p.api)
    // remote endpoints must be https; local ones http on loopback
    if (p.baseUrl.startsWith("https://")) continue
    expect(p.baseUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+\/v1$/)
  }
})

test("every keyed preset uses env refs, never literal secrets", () => {
  for (const p of PROVIDER_PRESETS) {
    if (p.keyEnv) expect(p.keyEnv).toMatch(/^[A-Z][A-Z0-9_]*$/)
    if (p.keyLiteral) expect(p.keyLiteral).toMatch(/^(ollama|lm-studio|none)$/) // placeholders for keyless local servers
  }
})

test("coding vendors the project promises are present", () => {
  for (const id of ["xai-grok", "moonshot-kimi", "openai-codex", "anthropic-claude", "zai-coding", "ollama-cloud", "vllm", "sglang", "custom-openai"]) {
    expect(findPreset(id)).toBeDefined()
  }
})

test("findPreset returns undefined for unknown ids", () => {
  expect(findPreset("nope")).toBeUndefined()
})
