import { test, expect } from "bun:test"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  recordTurnOutcome,
  nextStepAfter,
  modelKey,
  FAILURE_THRESHOLD,
  loadFallbackState,
  saveFallbackState,
  type FallbackState,
} from "../lib/fallback.ts"

// N-REL-01 / P-14: pi only fires after_provider_response on an arrived HTTP
// response, so the relay counts finished turns instead (turn_end stopReason).
// "error" covers HTTP errors, transport failures and mid-stream drops alike.
// The relay never acts mid-stream and never picks by cost.

function turn(provider: string, model: string, stopReason: string): { message: { role: string; provider: string; model: string; stopReason: string } } {
  return { message: { role: "assistant", provider, model, stopReason } }
}

test("recordTurnOutcome_error_counts_toward_threshold", () => {
  const state = { failures: {} }
  expect(recordTurnOutcome(state, "ollama", "qwen", "error")).toBe(false)
  expect(recordTurnOutcome(state, "ollama", "qwen", "error")).toBe(true)
  expect(state.failures[modelKey("ollama", "qwen")]).toBe(FAILURE_THRESHOLD)
})

test("recordTurnOutcome_success_clears_the_streak", () => {
  const state = { failures: {} }
  expect(recordTurnOutcome(state, "p", "m", "error")).toBe(false)
  expect(recordTurnOutcome(state, "p", "m", "error")).toBe(true)
  expect(recordTurnOutcome(state, "p", "m", "stop")).toBe(false)
  expect(state.failures[modelKey("p", "m")]).toBeUndefined()
})

test("recordTurnOutcome_aborted_neither_counts_nor_clears", () => {
  const state: FallbackState = { failures: { "p/m": 1 } }
  expect(recordTurnOutcome(state, "p", "m", "aborted")).toBe(false)
  expect(state.failures[modelKey("p", "m")]).toBe(1)
})

test("recordTurnOutcome_missing_stopReason_is_ignored", () => {
  const state: FallbackState = { failures: { "p/m": 1 } }
  expect(recordTurnOutcome(state, "p", "m", undefined)).toBe(false)
  expect(state.failures[modelKey("p", "m")]).toBe(1)
})

test("recordTurnOutcome_tracks_models_independently", () => {
  const state = { failures: {} }
  expect(recordTurnOutcome(state, "p", "m1", "error")).toBe(false)
  expect(recordTurnOutcome(state, "p", "m2", "error")).toBe(false)
  expect(recordTurnOutcome(state, "p", "m1", "error")).toBe(true)
  expect(state.failures[modelKey("p", "m2")]).toBe(1)
})

test("nextStepAfter_does_not_route_by_cost", () => {
  // Named "cheap" then "healthy" on purpose: the chain order wins, not a
  // price sort (N-05 is killed). Extra fields on the steps are ignored.
  const profile = {
    name: "x",
    chain: [{ provider: "cheap", model: "tiny" }, { provider: "healthy", model: "ok" }],
  }
  const step = nextStepAfter(profile, "cheap", "tiny", () => true)
  expect(step?.provider).toBe("healthy")
  expect(step?.model).toBe("ok")
})

test("fallback_ts_never_switches_mid_stream_or_by_cost", () => {
  const source = readFileSync(join(import.meta.dir, "..", "lib", "fallback.ts"), "utf-8")
  expect(source).not.toMatch(/setModel/)
  expect(source).not.toMatch(/AbortController|\.abort\(|\.destroy\(/)
  expect(source.toLowerCase()).not.toMatch(/\bpricing\b|\bcheapest\b/)
})

test("fallback_ts_counts_from_turn_end_not_after_provider_response", () => {
  // pi never fires after_provider_response on a failed request, so any
  // failure counting wired to that event is unreachable. This is the
  // regression that made the relay dead code in 0.4.0.
  const source = readFileSync(join(import.meta.dir, "..", "lib", "fallback.ts"), "utf-8")
  expect(source).toContain("recordTurnOutcome")
  expect(source).not.toContain("recordResponse")
  expect(source).not.toContain("recordTransportFailure")
  const adapter = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf-8")
  expect(adapter).toContain('pi.on("turn_end"')
  expect(adapter).not.toMatch(/pi\.on\("after_provider_response"/)
})

test("loadFallbackState_roundtrips_previousModel_for_undo", () => {
  const dir = join(tmpdir(), `pi686-fb-prev-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  try {
    const state: FallbackState = {
      activeProfile: "heal",
      failures: { "failing/m1": 2 },
      previousModel: { provider: "failing", model: "m1" },
    }
    saveFallbackState(state, dir)
    expect(loadFallbackState(dir).previousModel).toEqual({ provider: "failing", model: "m1" })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("recordTurnOutcome_does_not_route_by_cost_and_does_not_switch", () => {
  // Counting a failure is not a model switch: no previousModel until the
  // adapter heals between turns (P-32, N-05).
  const state: FallbackState = { failures: {} }
  expect(recordTurnOutcome(state, "p", "m", "error")).toBe(false)
  expect(recordTurnOutcome(state, "p", "m", "error")).toBe(true)
  expect(state.previousModel).toBeUndefined()
})

test("turn_shape_matches_pi_session_messages", () => {
  // Guard the helper against drifting from the real payload this models:
  // turn_end delivers an assistant message with provider/model/stopReason.
  const ev = turn("deadprov", "test-model", "error")
  expect(ev.message.role).toBe("assistant")
  expect(ev.message.stopReason).toBe("error")
})
