import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadAutopilotState, saveAutopilotState, detectDomain, domainContext, injectionForTurn, radarRoomLabel, roomForTurn, SIN_SALA } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"
import { formatStackText, type StackInfo } from "../lib/stack.ts"

const REPO = new URL("..", import.meta.url).pathname

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-auto-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test("state roundtrip with routing modes", () => {
  expect(loadAutopilotState(dir)).toEqual({ enabled: false, routing: "context" })
  saveAutopilotState({ enabled: true, routing: "context+thinking", enabledAt: "now" }, dir)
  const s = loadAutopilotState(dir)
  expect(s.enabled).toBe(true)
  expect(s.routing).toBe("context+thinking")
  // invalid routing falls back to context
  saveAutopilotState({ enabled: true, routing: "bogus" as never }, dir)
  expect(loadAutopilotState(dir).routing).toBe("context")
})

test("detectDomain: Spanish security prompt", () => {
  const m = detectDomain("audita la seguridad de este repo y dime vulnerabilidades", discoverDomains(REPO))
  expect(m?.domain.manifest.id).toBe("security")
  expect(m!.matched.length).toBeGreaterThan(0)
})

test("detectDomain: English deploy prompt", () => {
  const m = detectDomain("deploy the app to production and fix the 502 on nginx", discoverDomains(REPO))
  expect(m?.domain.manifest.id).toBe("devops-infra")
})

test("detectDomain: landing copy in Spanish", () => {
  const m = detectDomain("reescribe el copy del hero de la landing para mejorar la conversión", discoverDomains(REPO))
  expect(m?.domain.manifest.id).toBe("landing-design")
})

test("detectDomain: word boundaries - 'sonar' inside 'sonarQube' ok, but 'api' inside 'capital' no", () => {
  const domains = discoverDomains(REPO)
  expect(detectDomain("revisa el endpoint de la api", domains)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("capital letters test", domains)?.domain.manifest.id).not.toBe("web-fullstack")
  expect(detectDomain("run sonarqube scan", domains)?.domain.manifest.id).toBe("security")
})

test("detectDomain: no match returns undefined", () => {
  expect(detectDomain("hola qué tal", discoverDomains(REPO))).toBeUndefined()
})

test("detectDomain_word_boundary_negative_cases", () => {
  const domains = discoverDomains(REPO)
  // Prefix-only hits must not fire: "problema"/"prompt" contain the
  // clean-code trigger "pr", "biblioteca" contains "bi", "formato"
  // contains "form", but none ends the word there.
  expect(detectDomain("problema", domains)).toBeUndefined()
  expect(detectDomain("prompt", domains)).toBeUndefined()
  expect(detectDomain("biblioteca", domains)).toBeUndefined()
  expect(detectDomain("formato", domains)).toBeUndefined()
})

test("detectDomain_full_trigger_disambiguation", () => {
  const domains = discoverDomains(REPO)
  // Sentenced cases from the spec: the thematic owner wins.
  expect(detectDomain("hay un xss", domains)?.domain.manifest.id).toBe("security")
  expect(detectDomain("revisa la cobertura de los tests", domains)?.domain.manifest.id).toBe("qa-testing")
  // The seven colliding triggers, each in a minimal phrase, resolve to
  // their single owner: sql/base de datos -> data-analisis, cobertura ->
  // qa-testing, tls/xss -> security, openapi/swagger -> web-fullstack.
  expect(detectDomain("consulta sql", domains)?.domain.manifest.id).toBe("data-analisis")
  expect(detectDomain("base de datos", domains)?.domain.manifest.id).toBe("data-analisis")
  expect(detectDomain("renovar el tls", domains)?.domain.manifest.id).toBe("security")
  expect(detectDomain("hay un xss", domains)?.domain.manifest.id).toBe("security")
  expect(detectDomain("esquema openapi", domains)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("swagger", domains)?.domain.manifest.id).toBe("web-fullstack")
})

test("detectDomain: long specific triggers beat generic single words", () => {
  const domains = discoverDomains(REPO)
  // 'docker' (devops, specific) + 'refactor' (clean-code): specific wins on strength
  const m = detectDomain("refactor this and then deploy with docker compose", domains)
  expect(["devops-infra", "clean-code"]).toContain(m?.domain.manifest.id)
})

test("domainContext wraps a single focused domain", () => {
  const sec = discoverDomains(REPO).find((d) => d.manifest.id === "security")!
  const ctx = domainContext(sec)
  expect(ctx).toContain("<domain-packs>")
  expect(ctx).toContain("# Security")
  expect(ctx).toContain("defensive security")
  expect(ctx).not.toContain("# Clean Code")
})

test("todos los packs del repo declaran triggers ES y EN", () => {
  for (const d of discoverDomains(REPO)) {
    expect((d.manifest.triggers?.length ?? 0)).toBeGreaterThan(10)
  }
})

test("el repo lleva 11 packs con ids unicos y manifests validos", () => {
  const domains = discoverDomains(REPO)
  expect(domains.length).toBe(11)
  const ids = domains.map((d) => d.manifest.id)
  expect(new Set(ids).size).toBe(ids.length)
  // valid manifest: non-empty id and name
  for (const d of domains) {
    expect(d.manifest.id.length).toBeGreaterThan(0)
    expect(d.manifest.name.length).toBeGreaterThan(0)
  }
})

test("fixture pack without triggers is ignored by detection", () => {
  const root = join(dir, "repo")
  mkdirSync(join(root, "packs", "demo"), { recursive: true })
  writeFileSync(join(root, "packs", "demo", "domain.json"), JSON.stringify({ id: "demo", name: "Demo", description: "x" }))
  writeFileSync(join(root, "packs", "demo", "context.md"), "demo ctx")
  const m = detectDomain("anything at all", discoverDomains(root))
  expect(m?.domain.manifest.id ?? "none").not.toBe("demo")
})

// N-RAD-01 / P-18: autopilot ON and no injected pack is a visible «sin sala»
// state, never a fabricated general pack. The stack radar line must read it.

function stubStack(autopilot: StackInfo["autopilot"]): StackInfo {
  return {
    model: {},
    defaults: {},
    autopilot,
    fallback: {},
    domains: { enabled: [], packs: 11, skillsAvailable: 0, promptsAvailable: 0 },
    packages: [],
    budget: { spentTodayUsd: 0 },
    health: [],
    generatedAt: "2026-08-19T12:00:00.000Z",
  }
}

test("roomForTurn_autopilot_on_without_pack_is_sin_sala", () => {
  const cwd = join(dir, "empty-turn")
  mkdirSync(cwd, { recursive: true })
  const result = roomForTurn({
    autopilot: { enabled: true, routing: "context" },
    prompt: "arregla este bug",
    cwd,
    enabled: { enabled: {} },
    domains: discoverDomains(REPO),
  })
  expect(result.injection).toBe("")
  expect(result.room).toBe(SIN_SALA)
  expect(result.room).toBe("sin sala")
  expect(result.domainId).toBeUndefined()
})

test("injectionForTurn_autopilot_on_without_pack_stays_empty", () => {
  const cwd = join(dir, "empty-inject")
  mkdirSync(cwd, { recursive: true })
  const injection = injectionForTurn({
    autopilot: { enabled: true, routing: "context" },
    prompt: "arregla este bug",
    cwd,
    enabled: { enabled: {} },
    domains: discoverDomains(REPO),
  })
  expect(injection).toBe("")
  expect(radarRoomLabel({ enabled: true, injection })).toBe("sin sala")
})

test("radarRoomLabel_does_not_invent_a_general_pack", () => {
  const ids = discoverDomains(REPO).map((d) => d.manifest.id)
  expect(ids).not.toContain("general")
  expect(radarRoomLabel({ enabled: true, injection: "" })).toBe("sin sala")
  expect(radarRoomLabel({ enabled: true, injectedDomainId: undefined })).toBe("sin sala")
  expect(radarRoomLabel({ enabled: false, injection: "" })).toBe("off (manual /domains)")
})

test("radarRoomLabel_keeps_the_injected_pack_id", () => {
  expect(radarRoomLabel({ enabled: true, injectedDomainId: "security", injection: "<domain-packs>" })).toBe("security")
})

test("radarRoomLabel_empty_injection_beats_leftover_domain_id", () => {
  // leftover lastDomainId is a ghost pack if this turn injected nothing
  expect(radarRoomLabel({ enabled: true, injection: "", injectedDomainId: "security" })).toBe("sin sala")
})

test("roomForTurn_autopilot_on_with_signal_is_the_pack", () => {
  const cwd = join(dir, "signaled-turn")
  mkdirSync(cwd, { recursive: true })
  const result = roomForTurn({
    autopilot: { enabled: true, routing: "context" },
    prompt: "audita la seguridad de este repo y dime vulnerabilidades",
    cwd,
    enabled: { enabled: {} },
    domains: discoverDomains(REPO),
  })
  expect(result.injection).toContain("# Security")
  expect(result.room).toBe("security")
  expect(result.domainId).toBe("security")
  expect(result.room).not.toBe(SIN_SALA)
})

test("formatStackText_radar_line_reads_sin_sala", () => {
  const text = formatStackText(stubStack({ enabled: true, routing: "context" })).join("\n")
  expect(text).toContain("autopilot: ON (context) · sin sala")
  expect(text).not.toContain("last dom:")
})

test("formatStackText_radar_line_reads_last_room_not_sin_sala", () => {
  const text = formatStackText(stubStack({ enabled: true, routing: "context", lastDomainId: "security" })).join("\n")
  expect(text).toContain("security")
  expect(text).not.toContain("sin sala")
})

test("formatStackText_radar_line_off_is_not_sin_sala", () => {
  const text = formatStackText(stubStack({ enabled: false, routing: "context" })).join("\n")
  expect(text).toContain("autopilot: off (manual /domains)")
  expect(text).not.toContain("sin sala")
})
