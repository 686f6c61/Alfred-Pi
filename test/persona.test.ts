import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PERSONAS, DEFAULT_PERSONA, loadPersonaState, savePersonaState, personaPrompt, buildHeaderLines } from "../lib/persona.ts"

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-persona-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test("default persona is Alfred and it exists", () => {
  expect(DEFAULT_PERSONA).toBe("alfred")
  expect(PERSONAS.find((p) => p.id === "alfred")).toBeDefined()
  expect(loadPersonaState(dir).persona).toBe("alfred")
})

test("persona prompt obeys house style: no emojis, no em dash inside sentences", () => {
  const prompt = personaPrompt("alfred")
  expect(prompt).toContain("<persona>")
  expect(prompt).toContain("mayordomo")
  expect(prompt).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  // la raya solo puede aparecer citando la norma, nunca usada como inciso
  const dashes = (prompt.match(/—/g) ?? []).length
  expect(dashes).toBeLessThanOrEqual(1)
})

test("persona state roundtrip and invalid ids fall back to default", () => {
  savePersonaState({ persona: "none" }, dir)
  expect(loadPersonaState(dir).persona).toBe("none")
  savePersonaState({ persona: "bogus" } as never, dir)
  expect(loadPersonaState(dir).persona).toBe(DEFAULT_PERSONA)
})

test("neutral persona injects nothing", () => {
  expect(personaPrompt("none")).toBe("")
  expect(personaPrompt("missing")).toBe("")
})

test("header carries branding, author and a two-line pitch with version", () => {
  const lines = buildHeaderLines("9.9.9")
  expect(lines).toHaveLength(3)
  expect(lines[0]).toContain("Alfred-Pi")
  expect(lines[0]).toContain("harness.moe")
  expect(lines[0]).toContain("@686f6c61")
  expect(lines[2]).toContain("v9.9.9")
  for (const l of lines) expect(l.length).toBeLessThan(110)
})
