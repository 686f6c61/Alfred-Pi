import { test, expect } from "bun:test"
import { detectDomain } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"

// Characterization tests for A-PCK-12 H-01: "presupuesto" and the bare
// "agentes" trigger over-capture. A budget question or a generic "configure
// the agents" request must not route to ai-agents; the pack should only
// fire on orchestration-specific wording.

const domains = discoverDomains(new URL("..", import.meta.url).pathname)

test("detectDomain_presupuesto_not_ai_agents", () => {
  const m = detectDomain("cuanto presupuesto queda hoy", domains)
  expect(m?.domain.manifest.id ?? "none").not.toBe("ai-agents")
})

test("detectDomain_agentes_generico_not_ai_agents", () => {
  const m = detectDomain("configura los agentes", domains)
  expect(m?.domain.manifest.id ?? "none").not.toBe("ai-agents")
})
