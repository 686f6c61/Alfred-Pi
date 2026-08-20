import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { classifyProviderError, describeHttpError } from "../lib/prober.ts"
import { collectStack, formatStackText } from "../lib/stack.ts"
import { loadOnboardingState, saveOnboardingState, shouldShowOnboarding, recordStep, completeOnboarding } from "../lib/onboarding.ts"
import { discoverDomains } from "../lib/domains.ts"
import { detectDomainFull } from "../lib/autopilot.ts"

const REPO = new URL("..", import.meta.url).pathname

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-wave-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// classifyProviderError

test("classifier separates fixable from switching decisions", () => {
  const e401 = classifyProviderError(401)
  expect(e401.retryUseful).toBe(false)
  expect(e401.cause).toContain("key")
  expect(e401.action).toContain("Keys")

  const e429 = classifyProviderError(429, "Rate limit exceeded; retry-after 25 seconds")
  expect(e429.retryUseful).toBe(true)
  expect(e429.retryAfterMs).toBe(25_000)
  expect(e429.cause).toContain("rate limited")

  const e429q = classifyProviderError(429, "quota limit_exceeded on this plan")
  expect(e429q.cause).toContain("quota")

  const e503 = classifyProviderError(503)
  expect(e503.retryUseful).toBe(true)
  expect(e503.action).toContain("fallback")

  const e404 = classifyProviderError(404)
  expect(e404.action).toContain("baseUrl")

  expect(describeHttpError(401, "denied")).toContain("auth rejected")
})

// ---------------------------------------------------------------------------
// collectStack + formatStackText

test("collectStack gathers autopilot, domains, budget and health shape", () => {
  const agentDir = join(dir, "agent")
  mkdirSync(join(agentDir, "sessions"), { recursive: true })
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "ollama", defaultModel: "glm-5.2:cloud", packages: ["git:x"] }))
  const info = collectStack({
    agentDir,
    repoRoot: REPO,
    model: { provider: "ollama", id: "glm-5.2:cloud" },
    thinking: "medium",
  })
  expect(info.model.provider).toBe("ollama")
  expect(info.defaults.provider).toBe("ollama")
  expect(info.autopilot.enabled).toBe(false)
  expect(info.domains.packs).toBeGreaterThanOrEqual(11)
  expect(info.domains.skillsAvailable).toBeGreaterThanOrEqual(40)
  expect(info.packages).toEqual(["git:x"])
  expect(info.budget.maxUsd).toBeUndefined()

  const text = formatStackText(info).join("\n")
  expect(text).toContain("Alfred-Pi stack")
  expect(text).toContain("active: ollama/glm-5.2:cloud · thinking medium")
  expect(text).toContain("autopilot: off")
})

// ---------------------------------------------------------------------------
// onboarding

test("onboarding shows only for empty setups and never again after done", () => {
  const fresh = shouldShowOnboarding({ modelsJsonExists: false, customProviders: 0, authEntries: 0, state: { done: false } })
  expect(fresh).toBe(true)
  expect(shouldShowOnboarding({ modelsJsonExists: true, customProviders: 2, authEntries: 0, state: { done: false } })).toBe(false)
  expect(shouldShowOnboarding({ modelsJsonExists: false, customProviders: 0, authEntries: 3, state: { done: false } })).toBe(false)
  expect(shouldShowOnboarding({ modelsJsonExists: false, customProviders: 0, authEntries: 0, state: { done: true } })).toBe(false)
})

test("shouldShowOnboarding_eskeleton_counts_as_unconfigured", () => {
  // Contract decision: a skeleton models.json (no providers, no auth) still
  // counts as unconfigured, so onboarding shows. modelsJsonExists is ignored.
  expect(shouldShowOnboarding({ modelsJsonExists: true, customProviders: 0, authEntries: 0, state: { done: false } })).toBe(true)
})

test("onboarding state records steps and completes", () => {
  saveOnboardingState({ done: false }, dir)
  let s = loadOnboardingState(dir)
  s = recordStep(s, "preset:ollama")
  s = recordStep(s, "probe")
  s = recordStep(s, "preset:ollama")
  expect(s.completedSteps).toEqual(["preset:ollama", "probe"])
  const done = completeOnboarding(s)
  expect(done.done).toBe(true)
  expect(done.dismissedAt).toBeTruthy()
  saveOnboardingState(done, dir)
  expect(loadOnboardingState(dir).done).toBe(true)
})

// ---------------------------------------------------------------------------
// the two new packs route correctly

test("new packs detect their domains", () => {
  const domains = discoverDomains(REPO)
  expect(domains.some((d) => d.manifest.id === "data-analisis")).toBe(true)
  expect(domains.some((d) => d.manifest.id === "qa-testing")).toBe(true)
  expect(detectDomainFull("por qué esta query lenta del dashboard con nulos", domains)?.domain.manifest.id).toBe("data-analisis")
  expect(detectDomainFull("este test es flaky, falla a veces en CI", domains)?.domain.manifest.id).toBe("qa-testing")
  expect(detectDomainFull("bounded context y agregados para el checkout", domains)?.domain.manifest.id).toBe("clean-code")
})
