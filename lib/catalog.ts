/**
 * Model metadata catalog from models.dev (open API, 180+ providers): context
 * windows, output limits, reasoning/vision flags and $/M pricing, used to
 * autofill models.json entries. Cached for 24h; every failure degrades to
 * "no autofill" - never blocks a flow.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteJson, type ModelConfig } from "./config-io.ts"

export const CATALOG_URL = "https://models.dev/api.json"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** The slice of the models.dev schema we consume. */
export interface CatalogModelMeta {
  contextWindow?: number
  maxTokens?: number
  reasoning?: boolean
  vision?: boolean
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
}

export type Catalog = Record<string, Record<string, CatalogModelMeta>>

/** pi provider ids (and our preset ids) → models.dev provider ids. */
export const PROVIDER_ALIASES: Record<string, string> = {
  "zai-glm": "zai",
  "zai-glm-openai": "zai",
  "zai": "zai",
  "zai-coding": "zai-coding-plan",
  "xai-grok": "xai",
  "moonshot-kimi": "moonshotai",
  "openai-codex": "openai",
  "anthropic-claude": "anthropic",
  "together": "togetherai",
  "fireworks": "fireworks-ai",
  "google": "google",
  "huggingface": "huggingface",
  "github-models": "github",
}

export type ModelIntention = "local" | "vision" | "reasoner" | "fast"

export interface IntentionModel {
  id?: string
  provider?: string
  baseUrl?: string
  meta?: CatalogModelMeta
}

export interface IntentionModelPick {
  id: string
  missingMeta: boolean
}

function isLocalBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "::1"
  } catch {
    return false
  }
}

/** Classify a model from stable capabilities without inferring missing data. */
export function classifyIntention(entry: IntentionModel): ModelIntention | undefined {
  const provider = entry.provider?.trim().toLowerCase()
  if (provider === "ollama" || provider === "llama.cpp" || isLocalBaseUrl(entry.baseUrl)) return "local"
  if (entry.meta?.vision === true) return "vision"
  if (entry.meta?.reasoning === true) return "reasoner"
  if (entry.meta?.cost && Object.values(entry.meta.cost).some((value) => typeof value === "number" && Number.isFinite(value))) {
    return "fast"
  }
  return undefined
}

/**
 * Keep source order for matching models and retain models without a catalog
 * card so the caller can show an honest confirmation instead of hiding them.
 */
export function pickModelsForIntention(models: IntentionModel[], intention: ModelIntention): IntentionModelPick[] {
  const picks: IntentionModelPick[] = []
  for (const model of models) {
    if (typeof model.id !== "string" || model.id.length === 0) continue
    const missingMeta = model.meta === undefined
    if (missingMeta || classifyIntention(model) === intention) picks.push({ id: model.id, missingMeta })
  }
  return picks
}

function cachePath(dataDir: string): string {
  return join(dataDir, "catalog-cache.json")
}

function validLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function validCost(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000
}

/** Parse the models.dev payload into the slim Catalog shape (exported for tests). */
export function parseForTest(json: unknown): Catalog | null {
  return parseCatalog(json)
}

function parseCatalog(json: unknown): Catalog | null {
  if (typeof json !== "object" || json === null) return null
  const catalog: Catalog = {}
  for (const [providerId, provider] of Object.entries(json as Record<string, unknown>)) {
    const models = (provider as { models?: Record<string, unknown> })?.models
    if (typeof models !== "object" || models === null) continue
    const entry: Record<string, CatalogModelMeta> = {}
    for (const [modelId, raw] of Object.entries(models)) {
      const m = raw as {
        reasoning?: boolean
        attachment?: boolean
        limit?: { context?: number; output?: number }
        cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number }
      }
      if (!m || typeof m !== "object") continue
      const meta: CatalogModelMeta = {}
      const contextWindow = validLimit(m.limit?.context) ? m.limit.context : undefined
      const maxTokens = validLimit(m.limit?.output) ? m.limit.output : undefined
      if (contextWindow !== undefined && maxTokens !== undefined) {
        if (maxTokens <= contextWindow) {
          meta.contextWindow = contextWindow
          meta.maxTokens = maxTokens
        }
      } else {
        if (contextWindow !== undefined) meta.contextWindow = contextWindow
        if (maxTokens !== undefined) meta.maxTokens = maxTokens
      }
      if (typeof m.reasoning === "boolean") meta.reasoning = m.reasoning
      if (typeof m.attachment === "boolean") meta.vision = m.attachment
      if (m.cost && typeof m.cost === "object") {
        const cost: CatalogModelMeta["cost"] = {}
        if (validCost(m.cost.input)) cost.input = m.cost.input
        if (validCost(m.cost.output)) cost.output = m.cost.output
        if (validCost(m.cost.cache_read)) cost.cacheRead = m.cost.cache_read
        if (validCost(m.cost.cache_write)) cost.cacheWrite = m.cost.cache_write
        if (Object.keys(cost).length > 0) meta.cost = cost
      }
      entry[modelId] = meta
    }
    catalog[providerId] = entry
  }
  return Object.keys(catalog).length > 0 ? catalog : null
}

/**
 * Fetch the catalog with a 24h file cache. Returns null on any failure
 * (offline, timeout, bad payload) - callers fall back to manual entry.
 */
export async function fetchCatalog(opts: { dataDir: string; force?: boolean; timeoutMs?: number }): Promise<Catalog | null> {
  const file = cachePath(opts.dataDir)
  if (!opts.force && existsSync(file)) {
    try {
      const cached = JSON.parse(readFileSync(file, "utf-8")) as { fetchedAt: string; catalog: Catalog }
      if (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
        return cached.catalog
      }
    } catch {
      // fall through to fresh fetch
    }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000)
    let res: Response
    try {
      res = await fetch(CATALOG_URL, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return null
    const catalog = parseCatalog(await res.json())
    if (!catalog) return null
    try {
      mkdirSync(opts.dataDir, { recursive: true })
      atomicWriteJson(file, { fetchedAt: new Date().toISOString(), catalog })
    } catch {
      // cache write is best-effort
    }
    return catalog
  } catch {
    return null
  }
}

/** Look up model metadata, resolving provider aliases first. */
export function lookupCatalog(catalog: Catalog, providerId: string, modelId: string): CatalogModelMeta | undefined {
  const direct = catalog[providerId]?.[modelId]
  if (direct) return direct
  const alias = PROVIDER_ALIASES[providerId]
  if (alias) {
    const viaAlias = catalog[alias]?.[modelId]
    if (viaAlias) return viaAlias
  }
  // Ollama cloud models ("glm-5.2:cloud") live under the "ollama-cloud"
  // vendor with the suffix stripped ("glm-5.2").
  if (providerId === "ollama" && modelId.endsWith(":cloud")) {
    return catalog["ollama-cloud"]?.[modelId.replace(/:cloud$/, "")]
  }
  return undefined
}

/**
 * Fill only the fields the entry is missing - user-provided values always win.
 * Returns the model plus a list of the fields that were autofilled.
 */
export function applyCatalogToModel(
  model: { contextWindow?: number; maxTokens?: number; reasoning?: boolean; input?: string[]; cost?: Record<string, number | undefined> },
  meta: CatalogModelMeta,
): { model: typeof model; filled: string[] } {
  const filled: string[] = []
  const next = { ...model }
  if (next.contextWindow === undefined && meta.contextWindow !== undefined) {
    next.contextWindow = meta.contextWindow
    filled.push("contextWindow")
  }
  if (next.maxTokens === undefined && meta.maxTokens !== undefined) {
    next.maxTokens = meta.maxTokens
    filled.push("maxTokens")
  }
  if (next.reasoning === undefined && meta.reasoning !== undefined) {
    next.reasoning = meta.reasoning
    filled.push("reasoning")
  }
  if ((next.input === undefined || next.input.length === 0) && meta.vision !== undefined) {
    next.input = meta.vision ? ["text", "image"] : ["text"]
    filled.push("input")
  }
  if (next.cost === undefined && meta.cost !== undefined) {
    next.cost = meta.cost
    filled.push("cost")
  }
  return { model: next, filled }
}

/** Enrich model entries from an already resolved catalog. */
export async function enrichWithCatalog(
  providerId: string,
  entries: ModelConfig[],
  catalog: Catalog | null,
): Promise<{ models: ModelConfig[]; filledCount: number }> {
  if (!catalog) return { models: entries, filledCount: 0 }
  let filledCount = 0
  const models = entries.map((entry) => {
    const meta = lookupCatalog(catalog, providerId, entry.id)
    if (!meta) return entry
    const { model, filled } = applyCatalogToModel(entry, meta)
    filledCount += filled.length
    return model as ModelConfig
  })
  return { models, filledCount }
}
