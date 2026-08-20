import { test, expect } from "bun:test"
import { ESSENTIALS } from "../lib/essentials.ts"
import * as essentialsModule from "../lib/essentials.ts"

// P-23 (cubo Siguiente). Contrato rojo de la jerarquía de orquestación en
// esenciales: «instala todos los que faltan» no puede dejar dos sistemas de
// subagentes peleándose. Base (pi-subagents) frente a avanzado (crew y
// dynamic-workflows), agrupados por una función consultable desde la ficha.

interface TieredPackage {
  id: string
  tier?: string
}

function essentialById(id: string): TieredPackage | undefined {
  return ESSENTIALS.find((p) => p.id === id) as TieredPackage | undefined
}

test("pi-subagents is the base orchestration tier", () => {
  const subagents = essentialById("pi-subagents")
  expect(subagents).toBeDefined()
  expect(subagents?.tier, "tier de pi-subagents").toBe("base")
})

test("pi-crew and dynamic workflows are the advanced orchestration tier", () => {
  const crew = essentialById("pi-crew")
  expect(crew).toBeDefined()
  expect(crew?.tier, "tier de pi-crew").toBe("advanced")
  const workflows = essentialById("@quintinshaw/pi-dynamic-workflows")
  expect(workflows).toBeDefined()
  expect(workflows?.tier, "tier de dynamic-workflows").toBe("advanced")
})

test("essentialOrchestrationTiers groups base apart from advanced", () => {
  const api = essentialsModule as unknown as Record<string, unknown>
  expect(typeof api.essentialOrchestrationTiers, "API ausente: essentialOrchestrationTiers").toBe("function")
  const tiers = (api.essentialOrchestrationTiers as () => { base: TieredPackage[]; advanced: TieredPackage[] })()
  const baseIds = tiers.base.map((p) => p.id)
  const advancedIds = tiers.advanced.map((p) => p.id)
  expect(baseIds).toContain("pi-subagents")
  expect(advancedIds).toContain("pi-crew")
  expect(advancedIds).toContain("@quintinshaw/pi-dynamic-workflows")
  // Nadie puede estar en los dos grupos a la vez.
  for (const id of baseIds) {
    expect(advancedIds, `${id} no puede ser base y avanzado`).not.toContain(id)
  }
})
