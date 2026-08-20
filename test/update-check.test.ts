import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import { checkForUpdate, compareVersions } from "../lib/update-check.ts"

// Characterization tests for A-TST-01: the update channel caches successes
// for 24h but not failures, and the session-start fire-and-forget call in
// index.ts has no .catch. The retry_backoff and unhandled_rejection tests
// pin the missing behavior; they are expected to be red until lib/ and
// index.ts grow the failure cache and the catch chain.

const REPO = new URL("..", import.meta.url).pathname

const realFetch = globalThis.fetch
let dir: string
let fetchCalls: number

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-upd-"))
  fetchCalls = 0
})
afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

/** fetch mock: counts calls, then answers with the given behavior. */
function mockFetch(behave: () => Promise<Response>): void {
  globalThis.fetch = (async () => {
    fetchCalls++
    return behave()
  }) as unknown as typeof fetch
}

const manifestOk = (): Promise<Response> =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ latest: "9.9.9" }) } as unknown as Response)

const manifestFail = (): Promise<Response> => Promise.reject(new Error("network down"))

test("compareVersions_ignores_prefix", () => {
  expect(compareVersions("v1.2.3", "1.2.3")).toBe(0)
  // pre-release suffixes are ignored for the update decision
  expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0)
  expect(compareVersions("v2.0.0", "v1.9.9")).toBe(1)
  expect(compareVersions("1.0.0", "1.0.10")).toBe(-1)
})

test("checkForUpdate_network_failure", async () => {
  mockFetch(manifestFail)
  const state = await checkForUpdate({ dataDir: dir, repoRoot: REPO })
  expect(state.updateAvailable).toBe(false)
  expect(state.error).toBeTruthy()
})

test("checkForUpdate_cache_hit", async () => {
  mockFetch(manifestOk)
  const first = await checkForUpdate({ dataDir: dir, repoRoot: REPO })
  expect(first.latest).toBe("9.9.9")
  // Second call inside the 24h window must not hit the network again,
  // even when fetch is now broken: the cache serves the answer.
  mockFetch(manifestFail)
  const second = await checkForUpdate({ dataDir: dir, repoRoot: REPO })
  expect(second.latest).toBe("9.9.9")
  expect(second.error).toBeFalsy()
  expect(fetchCalls).toBe(1)
})

test("checkForUpdate_force_miss", async () => {
  mockFetch(manifestOk)
  await checkForUpdate({ dataDir: dir, repoRoot: REPO })
  await checkForUpdate({ dataDir: dir, repoRoot: REPO, force: true })
  expect(fetchCalls).toBe(2)
})

test("checkForUpdate_retry_backoff", async () => {
  // Two calls with a failing fetch, same dataDir, inside the window:
  // the failure must be cached so the second session does not refetch.
  // Also covers session_start_no_consent_no_calls.
  mockFetch(manifestFail)
  await checkForUpdate({ dataDir: dir, repoRoot: REPO })
  await checkForUpdate({ dataDir: dir, repoRoot: REPO })
  expect(fetchCalls).toBe(1)
})

test("checkForUpdate_unhandled_rejection", () => {
  // The session-start caller fires and forgets; the promise chain must
  // end in .catch so a rejection never escapes as unhandled.
  const source = readFileSync(join(REPO, "index.ts"), "utf8")
  const start = source.indexOf("void checkForUpdate")
  expect(start).toBeGreaterThanOrEqual(0)
  const chain = source.slice(start, start + 800)
  expect(chain).toContain(".catch(")
})
