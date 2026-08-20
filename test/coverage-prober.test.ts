import { test, expect, beforeEach, afterEach } from "bun:test"
import { classifyProviderError, probeLiveness, deepProbe, probeSystemRoleSupport, type ProbeTarget } from "../lib/prober.ts"

// Line-coverage companions for lib/prober.ts: credential-origin validation
// failures (invalid baseUrl, embedded userinfo), the remaining HTTP error
// classes, a failing deep probe and the system-role probe guard. fetch is
// always mocked; targets point at loopback placeholders only.

const realFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
})
afterEach(() => {
  globalThis.fetch = realFetch
})

test("classifyProviderError covers 403 402 408 500 502", () => {
  const e403 = classifyProviderError(403)
  expect(e403.cause).toContain("forbidden")
  expect(e403.retryUseful).toBe(false)

  const e402 = classifyProviderError(402)
  expect(e402.cause).toContain("payment required")
  expect(e402.retryUseful).toBe(false)

  const e408 = classifyProviderError(408)
  expect(e408.retryUseful).toBe(true)
  expect(e408.retryAfterMs).toBe(5_000)

  const e500 = classifyProviderError(500)
  expect(e500.cause).toBe("provider outage (HTTP 500)")

  const e502 = classifyProviderError(502)
  expect(e502.retryAfterMs).toBe(10_000)
})

test("probeLiveness rejects invalid baseUrl and embedded userinfo", async () => {
  const invalid = await probeLiveness({ provider: "bad", baseUrl: "not a url at all", api: "openai-completions", apiKey: "k" })
  expect(invalid.ok).toBe(false)
  expect(invalid.error).toContain("credential origin cannot be validated: invalid baseUrl")

  const userinfo = await probeLiveness({
    provider: "ui",
    baseUrl: "https://user:pass@api.example.com/v1",
    api: "openai-completions",
    apiKey: "k",
    credentialPolicy: { authorizedOrigin: "https://api.example.com" },
  })
  expect(userinfo.ok).toBe(false)
  expect(userinfo.error).toContain("credential origin cannot contain embedded user information")
})

test("deepProbe reports a non-ok completion endpoint", async () => {
  globalThis.fetch = (async (): Promise<Response> => {
    return { ok: false, status: 500, text: async () => "boom" } as unknown as Response
  }) as unknown as typeof fetch
  const r = await deepProbe({ provider: "p", baseUrl: "http://127.0.0.1:1234/v1", api: "openai-completions" }, "m1")
  expect(r.ok).toBe(false)
  expect(r.error).toContain("provider outage (HTTP 500)")
})

test("probeSystemRoleSupport guards invalid credential targets", async () => {
  const r = await probeSystemRoleSupport(
    { provider: "p", baseUrl: "not a url", api: "openai-completions", apiKey: "k" },
    "m1",
  )
  expect(r.systemHonored).toBe(false)
  expect(r.developerHonored).toBe(false)
  expect(r.error).toContain("credential origin cannot be validated")
})
