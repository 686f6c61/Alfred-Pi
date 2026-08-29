/**
 * Runtime model fallback: track provider failures per provider/model and,
 * when an active profile is set, switch to the next healthy step in its
 * chain before a turn starts. Deliberately conservative: this module only
 * counts; the adapter heals between turns (never mid-stream). Chain order
 * is the profile order, never a price sort.
 *
 * Counting reads `turn_end`, not `after_provider_response`: pi only fires
 * the latter once an HTTP response arrives, so connection refused, DNS,
 * timeouts and non-2xx responses never reach it. `turn_end` fires for
 * every turn outcome with `stopReason` ("error", "aborted", "stop", ...),
 * which covers HTTP errors, transport failures and mid-stream drops alike.
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

function bumpFailure(state: FallbackState, provider: string, model: string): boolean {
  const key = modelKey(provider, model)
  state.failures[key] = (state.failures[key] ?? 0) + 1
  return state.failures[key] === FAILURE_THRESHOLD
}

/**
 * Record one finished turn for `provider/model` from its `stopReason`.
 * Returns true when the model just crossed the failure threshold (the
 * signal to switch on the next turn, never mid-stream).
 */
export function recordTurnOutcome(state: FallbackState, provider: string, model: string, stopReason: string | undefined): boolean {
  if (stopReason === "error") {
    // HTTP status is gone by now (4xx, 5xx, transport, mid-stream): the
    // switch may land on a different provider, so every error counts.
    return bumpFailure(state, provider, model)
  }
  // A user abort is not a provider failure, and an unknown payload shape
  // must not clear a streak the next real turn would still resolve.
  if (!stopReason || stopReason === "aborted") return false
  const key = modelKey(provider, model)
  if (state.failures[key] !== undefined) delete state.failures[key]
  return false
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
