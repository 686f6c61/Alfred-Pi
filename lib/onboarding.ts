/**
 * First-run onboarding: when the agent dir has no providers configured and
 * the wizard has not been dismissed, the harness offers a guided setup
 * (provider from a preset, key, default, autopilot, budget). This module is
 * pure state; the conversation adapter lives in onboarding-flow.ts.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteJson } from "./config-io.ts"

export interface OnboardingState {
  /** True once the wizard completed or was dismissed. */
  done: boolean
  status?: "in_progress" | "completed" | "deferred" | "blocked"
  blockedReason?: string
  dismissedAt?: string
  completedSteps?: string[]
}

function statePath(dataDir: string): string {
  return join(dataDir, "onboarding.json")
}

export function loadOnboardingState(dataDir: string): OnboardingState {
  const file = statePath(dataDir)
  if (!existsSync(file)) return { done: false }
  try {
    const s = JSON.parse(readFileSync(file, "utf-8")) as OnboardingState
    const validStatus = ["in_progress", "completed", "deferred", "blocked"].includes(s.status ?? "")
    return {
      done: Boolean(s.done),
      ...(validStatus ? { status: s.status } : {}),
      ...(typeof s.blockedReason === "string" ? { blockedReason: s.blockedReason } : {}),
      dismissedAt: s.dismissedAt,
      completedSteps: s.completedSteps ?? [],
    }
  } catch {
    return { done: false }
  }
}

export function saveOnboardingState(state: OnboardingState, dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
  atomicWriteJson(statePath(dataDir), state)
}

/**
 * Should the wizard show? Only when there is nothing configured (no
 * custom providers and no auth entries) and the user has not dismissed
 * it before. Returning users never see it again.
 */
export function shouldShowOnboarding(opts: {
  modelsJsonExists: boolean
  customProviders: number
  authEntries: number
  state: OnboardingState
}): boolean {
  if (opts.state.done || opts.state.status === "completed") return false
  if (opts.customProviders > 0 || opts.authEntries > 0) return false
  // An empty models.json skeleton still counts as unconfigured.
  return true
}

export function recordStep(state: OnboardingState, step: string): OnboardingState {
  return { ...state, done: false, status: "in_progress", completedSteps: [...new Set([...(state.completedSteps ?? []), step])] }
}

export function completeOnboarding(state: OnboardingState): OnboardingState {
  const { blockedReason: _blockedReason, ...rest } = state
  return { ...rest, done: true, status: "completed", dismissedAt: new Date().toISOString() }
}

export function deferOnboarding(state: OnboardingState): OnboardingState {
  const { blockedReason: _blockedReason, ...rest } = state
  return { ...rest, done: false, status: "deferred" }
}

export function blockOnboarding(state: OnboardingState, reason: string): OnboardingState {
  return { ...state, done: false, status: "blocked", blockedReason: reason }
}
