/**
 * Runtime model fallback: track provider HTTP and transport failures per
 * provider/model and, when an active profile is set, switch to the next
 * healthy step in its chain before a turn starts. Deliberately conservative:
 * this module only counts; the adapter heals between turns (never mid-stream).
 * Chain order is the profile order, never a price sort.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteJson } from "./config-io.ts"
import type { Profile, ProfileStep } from "./profiles.ts"

export interface FallbackState {
  /** Name of the profile acting as auto-fallback chain. */
  activeProfile?: string
  /** Consecutive failed responses per `provider/model`. */
  failures: Record<string, number>
  /** Model we left when the relay fired, so the user can return to it. */
  previousModel?: { provider: string; model: string }
}

/** Switch after this many consecutive failures on the active model. */
export const FAILURE_THRESHOLD = 2

function statePath(dataDir: string): string {
  return join(dataDir, "fallback.json")
}

function readPreviousModel(raw: unknown): { provider: string; model: string } | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const rec = raw as { provider?: unknown; model?: unknown }
  if (typeof rec.provider !== "string" || typeof rec.model !== "string") return undefined
  if (!rec.provider.trim() || !rec.model.trim()) return undefined
  return { provider: rec.provider, model: rec.model }
}

export function loadFallbackState(dataDir: string): FallbackState {
  const file = statePath(dataDir)
  if (!existsSync(file)) return { failures: {} }
  try {
    const data = JSON.parse(readFileSync(file, "utf-8")) as FallbackState
    const previousModel = readPreviousModel(data.previousModel)
    return previousModel
      ? { activeProfile: data.activeProfile, failures: data.failures ?? {}, previousModel }
      : { activeProfile: data.activeProfile, failures: data.failures ?? {} }
  } catch {
    return { failures: {} }
  }
}

export function saveFallbackState(state: FallbackState, dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
  atomicWriteJson(statePath(dataDir), state)
}

export function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`
}

/** Why a turn never got an HTTP status: timeout, DNS, refused connection, or the network. */
export type TransportFailureReason = "timeout" | "dns" | "econnrefused" | "network"

const TIMEOUT_CODES = new Set(["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])
const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "EAI_NODATA"])
const REFUSED_CODES = new Set(["ECONNREFUSED"])
const NETWORK_CODES = new Set(["ECONNRESET", "EPIPE", "ENETUNREACH", "EHOSTUNREACH", "ENOTCONN", "ECONNABORTED", "UND_ERR_SOCKET"])

function reasonFromText(text: string): TransportFailureReason | undefined {
  const t = text.toLowerCase()
  if (/\beconnrefused\b/.test(t)) return "econnrefused"
  if (/\benotfound\b|\beai_again\b|getaddrinfo/.test(t)) return "dns"
  if (/\btimeout\b|\btimed out\b/.test(t)) return "timeout"
  if (/\bfetch failed\b|\beconnreset\b|\benetunreach\b|\behostunreach\b/.test(t)) return "network"
  return undefined
}

/**
 * Classify a thrown/rejected transport error. Unknown exceptions stay
 * unclassified so a bug in our code does not trigger a relay.
 */
export function classifyTransportFailure(error: unknown): TransportFailureReason | undefined {
  const walk = (value: unknown, depth: number): TransportFailureReason | undefined => {
    if (value == null || depth > 3) return undefined
    if (typeof value === "string") return reasonFromText(value)
    if (typeof value !== "object") return undefined

    const rec = value as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown }
    const code = typeof rec.code === "string" ? rec.code : undefined
    if (code && TIMEOUT_CODES.has(code)) return "timeout"
    if (code && DNS_CODES.has(code)) return "dns"
    if (code && REFUSED_CODES.has(code)) return "econnrefused"
    if (code && NETWORK_CODES.has(code)) return "network"

    const name = typeof rec.name === "string" ? rec.name : ""
    if (name === "AbortError" || name === "TimeoutError") return "timeout"

    // Nested Node/undici `cause.code` is more specific than "fetch failed".
    const nested = walk(rec.cause, depth + 1)
    if (nested) return nested

    const text = [code ?? "", name, typeof rec.message === "string" ? rec.message : ""].join(" ")
    return reasonFromText(text)
  }
  return walk(error, 0)
}

function bumpFailure(state: FallbackState, provider: string, model: string): boolean {
  const key = modelKey(provider, model)
  state.failures[key] = (state.failures[key] ?? 0) + 1
  return state.failures[key] === FAILURE_THRESHOLD
}

/**
 * Count a transport failure (timeout, DNS, refused, network) toward the
 * same threshold as an HTTP error. Does not switch models.
 */
export function recordTransportFailure(state: FallbackState, provider: string, model: string): boolean {
  return bumpFailure(state, provider, model)
}

/**
 * Record one HTTP response, or a transport error passed as `error`.
 * Returns true when the model just crossed the failure threshold (the
 * signal to switch on the next turn, never mid-stream).
 */
export function recordResponse(
  state: FallbackState,
  provider: string,
  model: string,
  status?: number | null,
  error?: unknown,
): boolean {
  if (classifyTransportFailure(error)) return bumpFailure(state, provider, model)

  const key = modelKey(provider, model)
  if (typeof status === "number" && status >= 200 && status < 400) {
    if (state.failures[key] !== undefined) delete state.failures[key]
    return false
  }
  // 4xx auth/quota won't heal by retrying the same key, but switching models
  // may land on a different provider: still a failure signal. A missing
  // status (host never answered) counts the same as an HTTP error.
  return bumpFailure(state, provider, model)
}

/**
 * First step after the failed one in the profile chain that resolves.
 * `resolve` checks registry availability (model exists + auth configured).
 */
export function nextStepAfter(
  profile: Profile,
  failedProvider: string,
  failedModel: string,
  resolve: (step: ProfileStep) => boolean,
): ProfileStep | undefined {
  const idx = profile.chain.findIndex((s) => s.provider === failedProvider && s.model === failedModel)
  if (idx < 0) {
    // Active model isn't in the chain: any healthy step works.
    return profile.chain.find(resolve)
  }
  return profile.chain.slice(idx + 1).find(resolve)
}
