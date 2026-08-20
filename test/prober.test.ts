import { test, expect, afterEach } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { probeLiveness, resolveKeyRef, deepProbe, probeSystemRoleSupport, maskKey, type ProbeTarget } from "../lib/prober.ts"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: string } | Response): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const r = handler(url, init)
    if (r instanceof Response) return r
    return new Response(r.body, { status: r.status })
  }) as typeof fetch
}

const openaiTarget = {
  provider: "t",
  baseUrl: "https://api.example.com/v1",
  api: "openai-completions" as const,
  apiKey: "sk-test",
  credentialPolicy: { authorizedOrigin: "https://api.example.com" },
}

test("openai liveness parses model list and sends bearer", async () => {
  let seenAuth = ""
  let seenUrl = ""
  mockFetch((url, init) => {
    seenUrl = url
    seenAuth = (init?.headers as Record<string, string>)["Authorization"] ?? ""
    return { status: 200, body: JSON.stringify({ data: [{ id: "m-1" }, { id: "m-2" }] }) }
  })
  const r = await probeLiveness(openaiTarget)
  expect(r.ok).toBe(true)
  expect(r.models).toEqual(["m-1", "m-2"])
  expect(seenUrl).toBe("https://api.example.com/v1/models")
  expect(seenAuth).toBe("Bearer sk-test")
})

test("401 becomes an actionable auth error", async () => {
  mockFetch(() => ({ status: 401, body: '{"error":"bad key"}' }))
  const r = await probeLiveness(openaiTarget)
  expect(r.ok).toBe(false)
  expect(r.error).toContain("auth rejected")
  expect(r.error).toContain("Keys")
})

test("anthropic liveness uses x-api-key + version header", async () => {
  let headers: Record<string, string> = {}
  mockFetch((url, init) => {
    headers = init?.headers as Record<string, string>
    return { status: 200, body: JSON.stringify({ data: [{ id: "claude-x" }] }) }
  })
  const r = await probeLiveness({
    provider: "t",
    baseUrl: "https://proxy.example/v1",
    api: "anthropic-messages",
    apiKey: "k",
    credentialPolicy: { authorizedOrigin: "https://proxy.example" },
  })
  expect(r.ok).toBe(true)
  expect(r.models).toEqual(["claude-x"])
  expect(headers["x-api-key"]).toBe("k")
  expect(headers["anthropic-version"]).toBe("2023-06-01")
})

// Long sentinel: it must never appear in a URL or in any error text.
const GOOGLE_SENTINEL = "sk-google-SENTINEL-probe-0123456789abcdefghij-KLMNOP"

test("google_probe_uses_header_not_query", async () => {
  // Success path: the key rides in the x-goog-api-key header only.
  let seenUrl = ""
  let seenHeaders: Record<string, string> = {}
  mockFetch((url, init) => {
    seenUrl = url
    seenHeaders = init?.headers as Record<string, string>
    return { status: 200, body: JSON.stringify({ models: [{ name: "models/gemini-pro" }] }) }
  })
  const r = await probeLiveness({
    provider: "t",
    baseUrl: "https://gen.example/v1beta",
    api: "google-generative-ai",
    apiKey: GOOGLE_SENTINEL,
    credentialPolicy: { authorizedOrigin: "https://gen.example" },
  })
  expect(r.ok).toBe(true)
  expect(r.models).toEqual(["gemini-pro"])
  expect(seenUrl.endsWith("/models")).toBe(true)
  expect(seenUrl).not.toContain(GOOGLE_SENTINEL)
  expect(seenUrl).not.toContain("?key=")
  expect(seenHeaders["x-goog-api-key"]).toBe(GOOGLE_SENTINEL)

  // Failure path: a thrown network error often embeds the requested URL, so
  // a key in the query would leak into the error text.
  mockFetch((url) => {
    throw new Error(`connect failed: ${url}`)
  })
  const fail = await probeLiveness({
    provider: "t",
    baseUrl: "https://gen.example/v1beta",
    api: "google-generative-ai",
    apiKey: GOOGLE_SENTINEL,
    credentialPolicy: { authorizedOrigin: "https://gen.example" },
  })
  expect(fail.ok).toBe(false)
  expect(fail.error ?? "").not.toContain(GOOGLE_SENTINEL)
})

test("google_deep_probe_uses_header_not_query", async () => {
  // POST :generateContent with the key in the header; custom headers ride
  // along and a stale x-goog-api-key is replaced by the resolved key.
  let captured: { url: string; method?: string; body: Record<string, unknown>; headers: Record<string, string> } | undefined
  mockFetch((url, init) => {
    captured = { url, method: init?.method, body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: init?.headers as Record<string, string> }
    return { status: 200, body: JSON.stringify({ ok: true }) }
  })
  const target = {
    provider: "t",
    baseUrl: "https://gen.example/v1beta",
    api: "google-generative-ai" as const,
    apiKey: GOOGLE_SENTINEL,
    headers: { "X-Custom": "keep-me", "x-goog-api-key": "stale-key" },
    credentialPolicy: { authorizedOrigin: "https://gen.example" },
  }
  const r = await deepProbe(target, "gemini-pro")
  expect(r.ok).toBe(true)
  expect(captured!.url).toBe("https://gen.example/v1beta/models/gemini-pro:generateContent")
  expect(captured!.url).not.toContain(GOOGLE_SENTINEL)
  expect(captured!.url).not.toContain("?key=")
  expect(captured!.method).toBe("POST")
  expect(captured!.headers["x-goog-api-key"]).toBe(GOOGLE_SENTINEL)
  expect(captured!.headers["X-Custom"]).toBe("keep-me")
  const gen = captured!.body.generationConfig as { maxOutputTokens?: number } | undefined
  expect(gen?.maxOutputTokens).toBe(1)
  expect(captured!.body.contents).toHaveLength(1)

  // Failure path: same no-leak guarantee for the deep probe.
  mockFetch((url) => {
    throw new Error(`connect failed: ${url}`)
  })
  const fail = await deepProbe(target, "gemini-pro")
  expect(fail.ok).toBe(false)
  expect(fail.error ?? "").not.toContain(GOOGLE_SENTINEL)
})

test("deepProbe posts a 1-token completion", async () => {
  let captured: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | undefined
  mockFetch((url, init) => {
    captured = { url, body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: init?.headers as Record<string, string> }
    return { status: 200, body: JSON.stringify({ ok: true }) }
  })
  const r = await deepProbe(openaiTarget, "m-1")
  expect(r.ok).toBe(true)
  expect(captured!.url).toBe("https://api.example.com/v1/chat/completions")
  expect(captured!.body.model).toBe("m-1")
  expect(captured!.body.max_tokens).toBe(1)
})

test("network error surfaces as message, not throw", async () => {
  mockFetch(() => {
    throw new Error("ECONNREFUSED weird pipe")
  })
  const r = await probeLiveness(openaiTarget)
  expect(r.ok).toBe(false)
  expect(r.error).toBeTruthy()
})

test("resolveKeyRef handles env, missing env, literals", () => {
  process.env.__PI686_TEST_KEY = "val123"
  expect(resolveKeyRef("$__PI686_TEST_KEY", process.env).value).toBe("val123")
  expect(resolveKeyRef("$__PI686_MISSING_KEY", process.env).error).toContain("not set")
  expect(resolveKeyRef("literal-key").value).toBe("literal-key")
  expect(resolveKeyRef(undefined).value).toBeUndefined()
})

test("resolveKeyRef_rejects_unauthorized_cmd", () => {
  const r = resolveKeyRef("!echo hi", process.env)
  expect(r.value).toBeUndefined()
  expect(r.error).toContain("not allowed")
})

test("resolveKeyRef_metachars_as_data", () => {
  // Benign canary: if an interpreter evaluated the tail, `touch` would
  // create an empty marker file. The tail must stay data, never code.
  const marker = join(tmpdir(), `pi686-meta-${process.pid}-${Date.now()}.mark`)
  rmSync(marker, { force: true })
  try {
    const r = resolveKeyRef(`!touch "${marker}"`, process.env)
    expect(r.value).toBeUndefined()
    expect(r.error).toContain("not allowed")
    expect(existsSync(marker)).toBe(false)
  } finally {
    rmSync(marker, { force: true })
  }
})

test("resolveKeyRef_command_failure_returns_error", () => {
  // Stable rejection message: the failure of the (never run) command must
  // not leak shell internals, and the call must not throw.
  const r = resolveKeyRef("!pi686-definitely-not-a-command", process.env)
  expect(r.value).toBeUndefined()
  expect(r.error).toContain("not allowed")
})

test("resolveKeyRef_no_output_returns_error", () => {
  // Same rejection as any other `!` ref, not a "produced no output" branch.
  const r = resolveKeyRef("!true", process.env)
  expect(r.value).toBeUndefined()
  expect(r.error).toContain("not allowed")
  expect(r.error).not.toContain("produced no output")
})

test("resolveKeyRef_braces_equal_dollar", () => {
  process.env.__PI686_TEST_KEY = "val123"
  expect(resolveKeyRef("$__PI686_TEST_KEY", process.env).value).toBe("val123")
  expect(resolveKeyRef("${__PI686_TEST_KEY}", process.env).value).toBe("val123")
  expect(resolveKeyRef("${__PI686_MISSING_KEY}", process.env).error).toContain("not set")
})

test("maskKey never leaks the middle of a literal", () => {
  expect(maskKey("sk-abcdefghijklmnop")).toBe("sk-a…mnop (19 chars)")
  expect(maskKey("$MY_VAR")).toBe("$MY_VAR")
  expect(maskKey(undefined)).toBe("(none)")
})

test("maskKey_truncates_cmd", () => {
  // Fixed label for command refs: no tail, no length hint, <= 24 chars.
  const masked = maskKey("!helper --fetch credentials-token-xyz")
  expect(masked).toBe("!cmd (hidden)")
  expect(masked.length).toBeLessThanOrEqual(24)
  expect(masked.includes("credentials-token-xyz")).toBe(false)
})

// ---------------------------------------------------------------------------
// Credential origin binding (A-CFG-05): a resolved key may only travel to
// its explicitly authorized origin.
// ---------------------------------------------------------------------------

const ORIGIN_SENTINEL = "sk-api-SENTINEL-origin-0123456789abcdefghij-KLMNOP"

test("credential_not_attached_after_origin_change", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  mockFetch((url, init) => {
    calls.push({ url, init })
    return { status: 200, body: JSON.stringify({ data: [{ id: "m-1" }] }) }
  })

  // Key authorized for api.example.com; someone later edits baseUrl to a
  // different host. The credential must never leave with the request.
  const retargeted: ProbeTarget = {
    provider: "t",
    baseUrl: "https://attacker.example/v1",
    api: "openai-completions",
    apiKey: ORIGIN_SENTINEL,
    credentialPolicy: { authorizedOrigin: "https://api.example.com" },
  }
  const r = await probeLiveness(retargeted)
  expect(calls).toHaveLength(0)
  expect(r.ok).toBe(false)
  expect(r.error ?? "").toContain("origin")
  expect(r.error ?? "").not.toContain(ORIGIN_SENTINEL)

  const d = await deepProbe(retargeted, "m-1")
  expect(calls).toHaveLength(0)
  expect(d.ok).toBe(false)
  expect(d.error ?? "").not.toContain(ORIGIN_SENTINEL)

  // Same-origin path edits keep the credential bound to its origin.
  calls.length = 0
  const sameOriginPath: ProbeTarget = { ...retargeted, baseUrl: "https://api.example.com/v2" }
  const r2 = await probeLiveness(sameOriginPath)
  expect(calls).toHaveLength(1)
  expect(r2.ok).toBe(true)
})

test("custom_provider_requires_auth_approval", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const installRecorder = () =>
    mockFetch((url, init) => {
      calls.push({ url, init })
      return { status: 200, body: JSON.stringify({ data: [{ id: "m-1" }] }) }
    })

  // HTTPS custom provider with a key but no approval: refuse before fetch.
  installRecorder()
  const noPolicy = { provider: "custom", baseUrl: "https://custom.example/v1", api: "openai-completions" as const, apiKey: ORIGIN_SENTINEL }
  const r1 = await probeLiveness(noPolicy)
  expect(calls).toHaveLength(0)
  expect(r1.ok).toBe(false)
  expect(r1.error ?? "").not.toContain(ORIGIN_SENTINEL)

  // Exact-match policy: the key now travels as the bearer header.
  calls.length = 0
  const approved: ProbeTarget = { ...noPolicy, credentialPolicy: { authorizedOrigin: "https://custom.example" } }
  const r2 = await probeLiveness(approved)
  expect(calls).toHaveLength(1)
  expect(r2.ok).toBe(true)
  expect((calls[0]!.init?.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${ORIGIN_SENTINEL}`)

  // Plain HTTP to an external host is never an authorized credential sink.
  calls.length = 0
  const httpExternal: ProbeTarget = {
    provider: "custom",
    baseUrl: "http://evil.example/v1",
    api: "openai-completions",
    apiKey: ORIGIN_SENTINEL,
    credentialPolicy: { authorizedOrigin: "http://evil.example" },
  }
  const r3 = await probeLiveness(httpExternal)
  expect(calls).toHaveLength(0)
  expect(r3.ok).toBe(false)

  // Loopback HTTP needs the explicit allowInsecureLoopback flag.
  calls.length = 0
  const loopbackNoFlag: ProbeTarget = {
    ...httpExternal,
    baseUrl: "http://127.0.0.1:11434/v1",
    credentialPolicy: { authorizedOrigin: "http://127.0.0.1:11434" },
  }
  const r4 = await probeLiveness(loopbackNoFlag)
  expect(calls).toHaveLength(0)
  expect(r4.ok).toBe(false)

  calls.length = 0
  const loopbackFlagged: ProbeTarget = {
    ...httpExternal,
    baseUrl: "http://127.0.0.1:11434/v1",
    credentialPolicy: { authorizedOrigin: "http://127.0.0.1:11434", allowInsecureLoopback: true },
  }
  const r5 = await probeLiveness(loopbackFlagged)
  expect(calls).toHaveLength(1)
  expect(r5.ok).toBe(true)

  // Sensitive custom headers are credentials too and need the same policy.
  calls.length = 0
  const headerOnly: ProbeTarget = {
    provider: "custom",
    baseUrl: "https://custom.example/v1",
    api: "openai-completions",
    headers: { Authorization: ORIGIN_SENTINEL },
  }
  const r6 = await probeLiveness(headerOnly)
  expect(calls).toHaveLength(0)
  expect(r6.ok).toBe(false)
  expect(r6.error ?? "").not.toContain(ORIGIN_SENTINEL)

  // Authenticated requests disable automatic redirects so a 3xx cannot
  // forward the credential to a Location chosen by the server.
  calls.length = 0
  mockFetch((url, init) => {
    calls.push({ url, init })
    return { status: 302, body: "redirect" }
  })
  const r7 = await probeLiveness(approved)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.init?.redirect).toBe("manual")
  expect(r7.ok).toBe(false)
})

// ---------------------------------------------------------------------------
// A-TST-10: wire-level characterization of deepProbe per API family and of
// probeSystemRoleSupport. Google uses the x-goog-api-key header, never the
// query string (A-CFG-06).
// ---------------------------------------------------------------------------

test("deepProbe_anthropic_messages", async () => {
  let captured: { url: string; method?: string; body: Record<string, unknown>; headers: Record<string, string> } | undefined
  mockFetch((url, init) => {
    captured = { url, method: init?.method, body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: init?.headers as Record<string, string> }
    return { status: 200, body: JSON.stringify({ ok: true }) }
  })
  const r = await deepProbe(
    {
      provider: "t",
      baseUrl: "https://proxy.example/v1",
      api: "anthropic-messages",
      apiKey: "k-anthropic",
      credentialPolicy: { authorizedOrigin: "https://proxy.example" },
    },
    "claude-x",
  )
  expect(r.ok).toBe(true)
  expect(captured!.url).toBe("https://proxy.example/v1/messages")
  expect(captured!.method).toBe("POST")
  expect(captured!.headers["x-api-key"]).toBe("k-anthropic")
  expect(captured!.headers["anthropic-version"]).toBe("2023-06-01")
  expect(captured!.body.max_tokens).toBe(1)
  expect(captured!.body.model).toBe("claude-x")
})

test("deepProbe_google_generateContent", async () => {
  let captured: { url: string; method?: string; body: Record<string, unknown>; headers: Record<string, string> } | undefined
  mockFetch((url, init) => {
    captured = { url, method: init?.method, body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: init?.headers as Record<string, string> }
    return { status: 200, body: JSON.stringify({ ok: true }) }
  })
  const target: ProbeTarget = {
    provider: "t",
    baseUrl: "https://gen.example/v1beta",
    api: "google-generative-ai",
    apiKey: GOOGLE_SENTINEL,
    credentialPolicy: { authorizedOrigin: "https://gen.example" },
  }
  const r = await deepProbe(target, "gemini-pro")
  expect(r.ok).toBe(true)
  expect(captured!.url).toBe("https://gen.example/v1beta/models/gemini-pro:generateContent")
  // A-CFG-06: the key rides in the header, never in the query string.
  expect(captured!.url).not.toContain("key=")
  expect(captured!.url).not.toContain(GOOGLE_SENTINEL)
  expect(captured!.method).toBe("POST")
  expect(captured!.headers["x-goog-api-key"]).toBe(GOOGLE_SENTINEL)
})

test("probeSystemRoleSupport_system_honored", async () => {
  // The backend answers the system-role probe with the sentinel but drops
  // the developer-role message, so only systemHonored must come back true.
  const roles: string[] = []
  mockFetch((_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string }[] }
    const role = body.messages[0]!.role
    roles.push(role)
    const content = role === "system" ? "SYSROLE-OK" : "hola, en que puedo ayudarte?"
    return { status: 200, body: JSON.stringify({ choices: [{ message: { content } }] }) }
  })
  const r = await probeSystemRoleSupport(openaiTarget, "m-1")
  expect(roles).toEqual(["system", "developer"])
  expect(r.systemHonored).toBe(true)
  expect(r.developerHonored).toBe(false)
  expect(r.error).toBeUndefined()
})

test("probeSystemRoleSupport_network_failure", async () => {
  mockFetch(() => {
    throw new Error("ECONNREFUSED weird pipe")
  })
  // Must resolve (not throw) with false flags and an error to show.
  const r = await probeSystemRoleSupport(openaiTarget, "m-1")
  expect(r.systemHonored).toBe(false)
  expect(r.developerHonored).toBe(false)
  expect(r.error).toBeTruthy()
})
