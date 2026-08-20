import { test, expect } from "bun:test"
import { PROVIDER_ALIASES, lookupCatalog, type Catalog, type CatalogModelMeta } from "../lib/catalog.ts"
import * as catalogModule from "../lib/catalog.ts"

// P-21 y P-22 (cubo Siguiente). Contrato rojo del catálogo de models.dev:
// alias completos para los ids de presets, ficha honesta cuando no hay datos
// y selección de modelo por intención, nunca por ranking semanal de precios.
// Las APIs nuevas (classifyIntention, pickModelsForIntention) se leen por
// namespace para que el rojo sea de aserción y no de enlace del módulo.

type ModelIntention = "local" | "vision" | "reasoner" | "fast"

interface IntentionEntry {
  id?: string
  provider?: string
  baseUrl?: string
  meta?: CatalogModelMeta
}

interface IntentionPick {
  id: string
  missingMeta: boolean
}

const api = catalogModule as unknown as Record<string, unknown>

function classifyIntention(entry: IntentionEntry): ModelIntention | undefined {
  const fn = api.classifyIntention as ((e: IntentionEntry) => ModelIntention | undefined) | undefined
  return fn?.(entry)
}

function pickModelsForIntention(models: IntentionEntry[], intention: ModelIntention): IntentionPick[] {
  const fn = api.pickModelsForIntention as ((m: IntentionEntry[], i: ModelIntention) => IntentionPick[]) | undefined
  return fn ? fn(models, intention) : []
}

test("PROVIDER_ALIASES maps the preset ids used by the intentions screen", () => {
  // Equivalencias comprobadas contra models.dev (P-22): cada id de preset
  // debe resolver al proveedor real del catálogo.
  const required: Record<string, string> = {
    "zai-coding": "zai-coding-plan",
    "xai-grok": "xai",
    "moonshot-kimi": "moonshotai",
    "openai-codex": "openai",
    "anthropic-claude": "anthropic",
    together: "togetherai",
    fireworks: "fireworks-ai",
  }
  for (const [preset, provider] of Object.entries(required)) {
    expect(PROVIDER_ALIASES[preset], `alias de ${preset}`).toBe(provider)
  }
})

test("PROVIDER_ALIASES keeps the aliases that already worked", () => {
  // El candado pide conservar los alias actuales: no se rompe lo ganado.
  const preserved: Record<string, string> = {
    "zai-glm": "zai",
    "zai-glm-openai": "zai",
    zai: "zai",
    google: "google",
    huggingface: "huggingface",
    "github-models": "github",
  }
  for (const [preset, provider] of Object.entries(preserved)) {
    expect(PROVIDER_ALIASES[preset], `alias conservado de ${preset}`).toBe(provider)
  }
})

test("lookupCatalog resolves a model through a preset alias", () => {
  const catalog: Catalog = {
    xai: { "grok-4": { contextWindow: 256_000, maxTokens: 32_000 } },
    "zai-coding-plan": { "glm-5.3": { reasoning: true } },
  }
  const viaXai = lookupCatalog(catalog, "xai-grok", "grok-4")
  expect(viaXai).toBeDefined()
  expect(viaXai?.contextWindow).toBe(256_000)
  const viaZai = lookupCatalog(catalog, "zai-coding", "glm-5.3")
  expect(viaZai).toBeDefined()
  expect(viaZai?.reasoning).toBe(true)
})

test("lookupCatalog returns undefined when there is no card and never invents cost", () => {
  const catalog: Catalog = {
    xai: {
      "grok-lite": { contextWindow: 8_000 },
      "grok-4": { contextWindow: 256_000 },
    },
  }
  // Proveedor desconocido: sin ficha, sin precio inventado.
  expect(lookupCatalog(catalog, "desconocido", "grok-4")).toBeUndefined()
  // Modelo desconocido en proveedor conocido: igual de honesto.
  expect(lookupCatalog(catalog, "xai-grok", "no-existe")).toBeUndefined()
  // Ficha sin coste: el campo cost sigue sin aparecer.
  const lite = lookupCatalog(catalog, "xai-grok", "grok-lite")
  expect(lite).toBeDefined()
  expect(lite?.cost).toBeUndefined()
})

test("classifyIntention exists as a function", () => {
  expect(typeof api.classifyIntention, "API ausente: classifyIntention").toBe("function")
})

test("classifyIntention returns local for ollama, llama.cpp and localhost baseUrl", () => {
  expect(classifyIntention({ provider: "ollama" })).toBe("local")
  expect(classifyIntention({ provider: "llama.cpp" })).toBe("local")
  expect(classifyIntention({ provider: "openai-completions", baseUrl: "http://localhost:11434/v1" })).toBe("local")
})

test("classifyIntention returns vision, reasoner and fast from catalog metadata", () => {
  expect(classifyIntention({ provider: "xai-grok", meta: { vision: true } })).toBe("vision")
  // Razonador con coste: reasoning gana a fast.
  expect(classifyIntention({ provider: "xai-grok", meta: { reasoning: true, cost: { input: 3, output: 15 } } })).toBe("reasoner")
  expect(classifyIntention({ provider: "xai-grok", meta: { cost: { input: 0.2, output: 0.4 } } })).toBe("fast")
})

test("classifyIntention is honest: no metadata means no intention", () => {
  // «Sin datos» honesto cuando models.dev no tiene ficha (P-21).
  expect(classifyIntention({ provider: "xai-grok" })).toBeUndefined()
})

test("pickModelsForIntention exists as a function", () => {
  expect(typeof api.pickModelsForIntention, "API ausente: pickModelsForIntention").toBe("function")
})

test("pickModelsForIntention keeps input order instead of a weekly price ranking", () => {
  // Prohibido ordenar por ranking semanal de precios: el orden de entrada
  // manda, aunque el segundo modelo sea más barato.
  const picks = pickModelsForIntention(
    [
      { id: "glm-caro", meta: { cost: { input: 5, output: 5 } } },
      { id: "glm-barato", meta: { cost: { input: 0.1, output: 0.1 } } },
    ],
    "fast",
  )
  expect(picks.map((p) => p.id)).toEqual(["glm-caro", "glm-barato"])
})

test("pickModelsForIntention marks models without a catalog card as missingMeta", () => {
  // Quien no tiene ficha se muestra con missingMeta para que la persona
  // confirme, no se esconde ni se rellena con datos inventados.
  const picks = pickModelsForIntention(
    [
      { id: "con-ficha", meta: { cost: { input: 1, output: 1 } } },
      { id: "sin-ficha" },
    ],
    "fast",
  )
  const conFicha = picks.find((p) => p.id === "con-ficha")
  const sinFicha = picks.find((p) => p.id === "sin-ficha")
  expect(conFicha?.missingMeta).toBe(false)
  expect(sinFicha).toBeDefined()
  expect(sinFicha?.missingMeta).toBe(true)
})
