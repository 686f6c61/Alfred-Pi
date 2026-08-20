/**
 * Ollama model management against the local server API (no CLI parsing):
 * list, running processes, pull with progress, remove - plus helpers to
 * register models into pi's models.json. Cloud models (`:cloud` suffix) are
 * registered with `_launch: true` so ollama routes them to the cloud.
 */
import type { ModelConfig, ModelsFile, ProviderConfig } from "./config-io.ts"

export const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434"

/** Base URL of the ollama provider from models.json (no /v1 - native API). */
export function ollamaBase(models: ModelsFile): string {
  const url = models.providers?.ollama?.baseUrl
  return url ? url.replace(/\/v1\/?$/, "").replace(/\/+$/, "") : DEFAULT_OLLAMA_BASE
}

/** Ensure models.json has the provider required for Ollama registrations. */
export function ensureOllamaProvider(models: ModelsFile): ProviderConfig {
  models.providers.ollama ??= {
    baseUrl: `${ollamaBase(models)}/v1`,
    api: "openai-completions",
    apiKey: "ollama",
    compat: { supportsDeveloperRole: false },
  }
  return models.providers.ollama
}

export interface OllamaModel {
  name: string
  sizeBytes?: number
  parameterSize?: string
  quantization?: string
  family?: string
}

async function ollamaFetch(base: string, path: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${base}${path}`, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** GET /api/tags - installed models. */
export async function ollamaTags(base: string): Promise<{ models: OllamaModel[]; error?: string }> {
  try {
    const res = await ollamaFetch(base, "/api/tags")
    if (!res.ok) return { models: [], error: `HTTP ${res.status}` }
    const json = (await res.json()) as { models?: { name?: string; size?: number; details?: { parameter_size?: string; quantization_level?: string; family?: string } }[] }
    const models = (json.models ?? [])
      .filter((m) => typeof m.name === "string" && m.name)
      .map((m) => ({
        name: m.name!,
        sizeBytes: m.size,
        parameterSize: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        family: m.details?.family,
      }))
    return { models }
  } catch (e) {
    return { models: [], error: (e as Error).message }
  }
}

/** GET /api/ps - currently loaded models. */
export async function ollamaPs(base: string): Promise<{ names: string[]; error?: string }> {
  try {
    const res = await ollamaFetch(base, "/api/ps")
    if (!res.ok) return { names: [], error: `HTTP ${res.status}` }
    const json = (await res.json()) as { models?: { name?: string }[] }
    return { names: (json.models ?? []).map((m) => m.name ?? "").filter(Boolean) }
  } catch (e) {
    return { names: [], error: (e as Error).message }
  }
}

/** DELETE /api/delete - remove a model from the server. */
export async function ollamaRm(base: string, name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await ollamaFetch(base, "/api/delete", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: name }),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * POST /api/pull - stream NDJSON progress. `onStatus` receives the last
 * status line (e.g. "pulling manifest", "pulling 42%"). Long timeout: model
 * downloads take a while.
 */
export async function ollamaPull(
  base: string,
  name: string,
  onStatus: (status: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await ollamaFetch(base, "/api/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: name }),
    }, 20 * 60 * 1000)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    if (!res.body) return { ok: true }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const evt = JSON.parse(line) as { status?: string; error?: string }
          if (evt.error) return { ok: false, error: evt.error }
          if (evt.status) onStatus(evt.status)
        } catch {
          // ignore partial lines
        }
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function isCloudModel(name: string): boolean {
  const tag = name.includes(":") ? (name.split(":").pop() ?? "") : ""
  return tag === "cloud" || name.endsWith(":cloud")
}

/** models.json entry for an ollama model (cloud models get `_launch: true`). */
export function toModelsEntry(name: string, meta?: { contextWindow?: number; maxTokens?: number; reasoning?: boolean }): ModelConfig {
  const entry: ModelConfig = { id: name }
  if (meta?.contextWindow) entry.contextWindow = meta.contextWindow
  if (meta?.maxTokens) entry.maxTokens = meta.maxTokens
  if (meta?.reasoning) entry.reasoning = meta.reasoning
  if (isCloudModel(name)) {
    ;(entry as Record<string, unknown>)._launch = true
  }
  return entry
}

/** Names registered under the ollama provider in models.json. */
export function registeredOllamaModels(models: ModelsFile): Set<string> {
  return new Set((models.providers?.ollama?.models ?? []).map((m) => m.id))
}

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return ""
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)}GB`
  return `${Math.round(bytes / 1024 ** 2)}MB`
}

export function describeOllamaModel(m: OllamaModel, registered: boolean, running: boolean): string {
  const bits = [
    isCloudModel(m.name) ? "cloud" : "local",
    m.parameterSize,
    m.quantization,
    formatSize(m.sizeBytes),
    registered ? "registered in pi" : "not registered",
    running ? "· running" : "",
  ].filter(Boolean)
  return bits.join(" · ")
}
