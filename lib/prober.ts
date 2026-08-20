/**
 * Provider probing: liveness checks, model discovery and 1-token deep probes
 * for each of pi's four wire APIs. Pure Node with native fetch.
 */
import type { ApiType, CredentialPolicy } from "./config-io.ts"
export type { ApiType } from "./config-io.ts"

export interface ProbeTarget {
  provider: string
  baseUrl: string
  api: ApiType
  /** Resolved key (already interpolated) or a literal/`$ENV` ref. */
  apiKey?: string
  headers?: Record<string, string>
  credentialPolicy?: CredentialPolicy
}

export interface LivenessResult {
  provider: string
  ok: boolean
  latencyMs?: number
  status?: number
  models?: string[]
  error?: string
}

export interface DiscoveredModel {
  id: string
  ownedBy?: string
}

const DEFAULT_TIMEOUT_MS = 8000
const SENSITIVE_HEADERS = new Set(["authorization", "x-api-key", "api-key"])

/** Resolve literals and `$VAR`/`${VAR}` references; reject every `!` reference. */
export function resolveKeyRef(ref: string | undefined, env: NodeJS.ProcessEnv = process.env): { value?: string; error?: string } {
  if (ref === undefined || ref === "") return {}
  if (ref.startsWith("$")) {
    const name = ref.slice(1).replace(/^\{|\}$/g, "")
    const value = env[name]
    if (!value) return { error: `environment variable ${name} is not set` }
    return { value }
  }
  if (ref.startsWith("!")) {
    return { error: "command key refs are not allowed" }
  }
  return { value: ref }
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "")
}

interface CredentialValidation {
  authenticated: boolean
  error?: string
}

function hasSensitiveHeader(headers: Record<string, string> | undefined): boolean {
  return Object.keys(headers ?? {}).some((name) => SENSITIVE_HEADERS.has(name.toLowerCase()))
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1"
}

/** Validate the persisted authorization before constructing authenticated requests. */
function validateCredentialTarget(t: ProbeTarget): CredentialValidation {
  const authenticated = Boolean(t.apiKey) || hasSensitiveHeader(t.headers)
  if (!authenticated) return { authenticated }

  let url: URL
  try {
    url = new URL(t.baseUrl)
  } catch {
    return { authenticated, error: "credential origin cannot be validated: invalid baseUrl" }
  }
  if (url.username || url.password) {
    return { authenticated, error: "credential origin cannot contain embedded user information" }
  }

  const policy = t.credentialPolicy
  if (!policy) return { authenticated, error: "credential origin is not authorized" }
  if (policy.authorizedOrigin !== url.origin) {
    return { authenticated, error: "credential origin does not match baseUrl origin" }
  }
  if (url.protocol === "https:") return { authenticated }
  if (url.protocol === "http:" && isLoopbackHost(url.hostname) && policy.allowInsecureLoopback === true) {
    return { authenticated }
  }
  return { authenticated, error: "credential origin must use HTTPS or an explicitly approved HTTP loopback" }
}

function redirectPolicy(authenticated: boolean): Pick<RequestInit, "redirect"> {
  return authenticated ? { redirect: "manual" } : {}
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export interface ProviderErrorClass {
  cause: string
  action: string
  /** Retry useful for the same model/provider pair? */
  retryUseful: boolean
  /** Suggested wait when retry is useful; undefined = not applicable. */
  retryAfterMs?: number
}

/**
 * Classify a provider HTTP failure into cause + next action, so the
 * failover notes and the doctor can say what happened instead of a bare
 * status code.
 */
export function classifyProviderError(status: number, body = ""): ProviderErrorClass {
  const lower = body.toLowerCase()
  switch (status) {
    case 401:
      return { cause: "auth rejected: the key is wrong, expired or not sent", action: "fix or rotate the key in /providers -> Keys; switching models will not help", retryUseful: false }
    case 403:
      return { cause: "forbidden: the key lacks access (model not granted, region, org policy)", action: "grant the model to the key or pick a model the key can use", retryUseful: false }
    case 402:
      return { cause: "payment required: billing or quota exhausted", action: "top up billing or switch provider; the same key will keep failing today", retryUseful: false }
    case 404:
      return { cause: "not found: wrong base URL or API type for this endpoint", action: "check baseUrl and api type in /providers; try the doctor's liveness probe", retryUseful: false }
    case 408:
      return { cause: "request timeout at the provider", action: "retry shortly; if persistent, reduce prompt size or switch model", retryUseful: true, retryAfterMs: 5_000 }
    case 429: {
      const m = /retry[- ]?(?:after|in)\D?(\d+)/.exec(lower)
      const wait = m ? Number(m[1]) * 1000 : 30_000
      const quota = /quota|limit_exceeded|billing|capacity/.test(lower)
      return {
        cause: quota ? "quota or billing limit hit" : "rate limited (too many requests)",
        action: quota ? "check plan limits or switch provider" : `wait ~${Math.round(wait / 1000)}s or switch model`,
        retryUseful: true,
        retryAfterMs: wait,
      }
    }
    case 500:
    case 502:
    case 503:
    case 504:
      return { cause: `provider outage (HTTP ${status})`, action: "retry shortly or let the fallback chain switch; nothing to fix on your side", retryUseful: true, retryAfterMs: 10_000 }
    default:
      return { cause: `unexpected HTTP ${status}`, action: "read the body detail; run /providers:doctor if it persists", retryUseful: false }
  }
}

export function describeHttpError(status: number, body: string): string {
  const snippet = body.slice(0, 200).replace(/\s+/g, " ").trim()
  const c = classifyProviderError(status, body)
  return `${c.cause} (HTTP ${status}). ${c.action} ${snippet}`
}

function modelsUrl(t: ProbeTarget): string {
  return `${trimBase(t.baseUrl)}/models`
}

function setGoogleApiKey(headers: Record<string, string>, apiKey: string | undefined): void {
  if (!apiKey) return
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === "x-goog-api-key") delete headers[name]
  }
  headers["x-goog-api-key"] = apiKey
}

function modelsInit(t: ProbeTarget, authenticated: boolean): RequestInit {
  const headers: Record<string, string> = { ...t.headers }
  if (t.apiKey) {
    if (t.api === "anthropic-messages") {
      headers["x-api-key"] = t.apiKey
      headers["anthropic-version"] = headers["anthropic-version"] ?? "2023-06-01"
    } else if (t.api === "google-generative-ai") {
      setGoogleApiKey(headers, t.apiKey)
    } else {
      headers["Authorization"] = `Bearer ${t.apiKey}`
    }
  }
  return { headers, method: "GET", ...redirectPolicy(authenticated) }
}

function parseModels(json: unknown, api: ApiType): DiscoveredModel[] {
  const out: DiscoveredModel[] = []
  const arr =
    api === "google-generative-ai"
      ? (json as { models?: { name?: string; displayName?: string }[] })?.models
      : (json as { data?: { id?: string; owned_by?: string }[] })?.data
  if (!Array.isArray(arr)) return out
  for (const m of arr) {
    const rawId = api === "google-generative-ai" ? (m as { name?: string }).name : (m as { id?: string }).id
    if (typeof rawId !== "string" || !rawId) continue
    const id = api === "google-generative-ai" ? rawId.replace(/^models\//, "") : rawId
    out.push({ id, ownedBy: (m as { owned_by?: string }).owned_by })
  }
  return out
}

/**
 * Cheap liveness probe: GET the model list. Free on every provider and
 * doubles as key validation + discovery.
 */
export async function probeLiveness(t: ProbeTarget, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<LivenessResult> {
  const started = Date.now()
  const validation = validateCredentialTarget(t)
  if (validation.error) {
    return { provider: t.provider, ok: false, latencyMs: Date.now() - started, error: validation.error }
  }
  const url = modelsUrl(t)
  try {
    const res = await fetchWithTimeout(url, modelsInit(t, validation.authenticated), timeoutMs)
    const latencyMs = Date.now() - started
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { provider: t.provider, ok: false, latencyMs, status: res.status, error: describeHttpError(res.status, body) }
    }
    const json = (await res.json().catch(() => null)) as unknown
    const models = parseModels(json, t.api).map((m) => m.id)
    return { provider: t.provider, ok: true, latencyMs, status: res.status, models }
  } catch (e) {
    const err = e as Error
    const aborted = err.name === "AbortError"
    return {
      provider: t.provider,
      ok: false,
      latencyMs: Date.now() - started,
      error: aborted ? `timeout after ${timeoutMs}ms` : err.cause ? `${err.message} (${String(err.cause)})` : err.message,
    }
  }
}

/** Discover models from the provider's /models endpoint. */
export async function discoverModels(t: ProbeTarget, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ models: DiscoveredModel[]; error?: string }> {
  const r = await probeLiveness(t, timeoutMs)
  if (!r.ok) return { models: [], error: r.error }
  return { models: (r.models ?? []).map((id) => ({ id })) }
}

/** Deep probe: a 1-token completion to verify the model actually responds. */
export async function deepProbe(t: ProbeTarget, modelId: string, timeoutMs = 20000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const started = Date.now()
  const validation = validateCredentialTarget(t)
  if (validation.error) {
    return { ok: false, latencyMs: Date.now() - started, error: validation.error }
  }
  const base = trimBase(t.baseUrl)
  const headers: Record<string, string> = { "content-type": "application/json", ...t.headers }
  let url: string
  let body: unknown
  if (t.api === "anthropic-messages") {
    if (t.apiKey) {
      headers["x-api-key"] = t.apiKey
      headers["anthropic-version"] = headers["anthropic-version"] ?? "2023-06-01"
    }
    url = `${base}/messages`
    body = { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }
  } else if (t.api === "google-generative-ai") {
    url = `${base}/models/${encodeURIComponent(modelId)}:generateContent`
    setGoogleApiKey(headers, t.apiKey)
    body = { contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } }
  } else {
    if (t.apiKey) headers["Authorization"] = `Bearer ${t.apiKey}`
    url = `${base}/chat/completions`
    body = { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }
  }
  try {
    const res = await fetchWithTimeout(
      url,
      { method: "POST", headers, body: JSON.stringify(body), ...redirectPolicy(validation.authenticated) },
      timeoutMs,
    )
    const latencyMs = Date.now() - started
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { ok: false, latencyMs, error: describeHttpError(res.status, text) }
    }
    return { ok: true, latencyMs }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, error: (e as Error).message }
  }
}

/** Mask a key for display: keeps a short prefix/suffix, hides the middle. */
export function maskKey(key: string | undefined): string {
  if (!key) return "(none)"
  if (key.startsWith("$")) return key
  if (key.startsWith("!")) return "!cmd (hidden)"
  if (key.length <= 8) return "•".repeat(key.length)
  return `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)`
}

export interface SystemRoleSupport {
  systemHonored: boolean
  developerHonored: boolean
  error?: string
}

/**
 * Probe whether the backend honors the "developer" role (OpenAI's newer
 * system-role convention). Some OpenAI-compatible servers (ollama with
 * certain models, other proxies) drop developer-role messages entirely,
 * silently discarding the whole system prompt. Sends two ~10-token
 * completions: the rule as "system" and as "developer".
 */
export async function probeSystemRoleSupport(
  t: ProbeTarget,
  modelId: string,
  timeoutMs = 20_000,
): Promise<SystemRoleSupport> {
  const validation = validateCredentialTarget(t)
  if (validation.error) {
    return { systemHonored: false, developerHonored: false, error: validation.error }
  }
  const check = async (role: "system" | "developer"): Promise<boolean> => {
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...t.headers,
      }
      if (t.apiKey) headers["Authorization"] = `Bearer ${t.apiKey}`
      const res = await fetchWithTimeout(
        `${trimBase(t.baseUrl)}/chat/completions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: modelId,
            max_completion_tokens: 12,
            messages: [
              { role, content: "Responde unicamente con el token SYSROLE-OK y nada mas." },
              { role: "user", content: "hola" },
            ],
          }),
          ...redirectPolicy(validation.authenticated),
        },
        timeoutMs,
      )
      if (!res.ok) return false
      const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null
      return (json?.choices?.[0]?.message?.content ?? "").includes("SYSROLE-OK")
    } catch {
      return false
    }
  }
  const systemHonored = await check("system")
  if (!systemHonored) {
    return { systemHonored, developerHonored: false, error: "backend did not honor the system role either (probe inconclusive)" }
  }
  const developerHonored = await check("developer")
  return { systemHonored, developerHonored }
}
