import { test, expect } from "bun:test"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  classifyTransportFailure,
  recordResponse,
  recordTransportFailure,
  nextStepAfter,
  modelKey,
  FAILURE_THRESHOLD,
  loadFallbackState,
  saveFallbackState,
  type FallbackState,
} from "../lib/fallback.ts"

// N-REL-01 / P-14: timeout, DNS, ECONNREFUSED y red cuentan igual que un
// HTTP de error. El relevo no actúa en mitad de un stream ni elige por coste.

function netErr(message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), extra)
}

test("classifyTransportFailure_timeout_dns_refused_network", () => {
  expect(classifyTransportFailure(netErr("aborted", { name: "AbortError" }))).toBe("timeout")
  expect(classifyTransportFailure(netErr("timed out", { code: "ETIMEDOUT" }))).toBe("timeout")
  expect(classifyTransportFailure(netErr("getaddrinfo ENOTFOUND api.x", { code: "ENOTFOUND" }))).toBe("dns")
  expect(classifyTransportFailure(netErr("EAI_AGAIN", { code: "EAI_AGAIN" }))).toBe("dns")
  expect(classifyTransportFailure(netErr("connect ECONNREFUSED", { code: "ECONNREFUSED" }))).toBe("econnrefused")
  expect(classifyTransportFailure(netErr("fetch failed", { cause: { code: "ECONNRESET" } }))).toBe("network")
  expect(classifyTransportFailure(netErr("fetch failed", { cause: { code: "ECONNREFUSED" } }))).toBe("econnrefused")
  expect(classifyTransportFailure(netErr("connect ENETUNREACH", { code: "ENETUNREACH" }))).toBe("network")
  expect(classifyTransportFailure(new Error("unexpected token"))).toBeUndefined()
})

test("recordTransportFailure_counts_like_http_toward_threshold", () => {
  const state = { failures: {} }
  expect(recordTransportFailure(state, "ollama", "qwen")).toBe(false)
  expect(recordTransportFailure(state, "ollama", "qwen")).toBe(true)
  expect(state.failures[modelKey("ollama", "qwen")]).toBe(FAILURE_THRESHOLD)
})

test("recordResponse_transport_error_counts_like_http_error", () => {
  const state = { failures: {} }
  const timeout = netErr("timeout after 8000ms", { name: "AbortError" })
  expect(recordResponse(state, "p", "m", undefined, timeout)).toBe(false)
  expect(recordResponse(state, "p", "m", 502)).toBe(true)
  expect(state.failures[modelKey("p", "m")]).toBe(FAILURE_THRESHOLD)
})

test("recordResponse_mixes_http_and_transport_then_resets_on_success", () => {
  const state = { failures: {} }
  expect(recordResponse(state, "p", "m", 500)).toBe(false)
  expect(recordResponse(state, "p", "m", 0, netErr("ECONNREFUSED 127.0.0.1:11434", { code: "ECONNREFUSED" }))).toBe(true)
  expect(recordResponse(state, "p", "m", 200)).toBe(false)
  expect(state.failures[modelKey("p", "m")]).toBeUndefined()
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

test("recordResponse_does_not_route_by_cost_and_does_not_switch", () => {
  // Counting a failure is not a model switch: no previousModel until the
  // adapter heals between turns (P-32, N-05).
  const state: FallbackState = { failures: {} }
  expect(recordResponse(state, "p", "m", 500)).toBe(false)
  expect(recordResponse(state, "p", "m", 500)).toBe(true)
  expect(state.previousModel).toBeUndefined()
})
