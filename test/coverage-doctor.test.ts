import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkConfigs, runDoctor } from "../lib/doctor.ts"
import { getPaths } from "../lib/config-io.ts"

// Line-coverage companions for lib/doctor.ts: the static checkConfig
// branches (whitespace baseUrl, anthropic without /v1, command key refs,
// duplicate ids, unknown default provider, missing env auth) plus the
// runDoctor system-role sweep and health redaction. The probe side runs
// against a mocked fetch only.

const realFetch = globalThis.fetch
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-doc-"))
})
afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

test("checkConfigs_flags_every_misconfiguration", () => {
  const issues = checkConfigs({
    models: {
      providers: {
        nobase: {},
        spacey: { baseUrl: "https://api.example.com /v1", api: "openai-completions" },
        anthro: { baseUrl: "https://gateway.example.com", api: "anthropic-messages" },
        cmdkey: { baseUrl: "https://k.example/v1", api: "openai-completions", apiKey: "!steal" },
        dupes: {
          baseUrl: "https://d.example/v1",
          api: "openai-completions",
          models: [{ id: "same" }, { id: "same" }],
        },
      },
    },
    auth: { openai: { type: "api_key", key: "$PI686_MISSING_VAR" } },
    settings: { defaultProvider: "ghost" },
    env: {},
  })

  const messages = issues.map((i) => i.message)
  expect(messages).toContain("custom provider has no baseUrl")
  expect(messages).toContain("baseUrl contains whitespace: https://api.example.com /v1")
  expect(messages.some((m) => m.includes("anthropic-style baseUrl without /v1"))).toBe(true)
  expect(messages.some((m) => m.includes("command key refs are not allowed"))).toBe(true)
  expect(messages.some((m) => m.includes("duplicate model ids: same"))).toBe(true)
  expect(messages.some((m) => m.includes('defaultProvider "ghost" is neither a built-in nor a models.json provider'))).toBe(true)
  expect(messages.some((m) => m.startsWith("auth.json:") && m.includes("PI686_MISSING_VAR"))).toBe(true)
})

test("runDoctor_warns_when_backend_ignores_developer_role", async () => {
  const paths = getPaths(dir)
  writeFileSync(
    paths.models,
    JSON.stringify({
      providers: {
        local: {
          baseUrl: "http://127.0.0.1:1234/v1",
          api: "openai-completions",
          models: [{ id: "reasoner", reasoning: true }],
        },
      },
    }),
  )

  // Liveness GET /models answers ok; the two system-role POSTs honor the
  // "system" version but drop the "developer" one, which must be reported.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url.endsWith("/models")) {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "reasoner" }] }) } as unknown as Response
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role?: string }[] }
    const role = body.messages?.[0]?.role
    const content = role === "system" ? "SYSROLE-OK" : "ignored"
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) } as unknown as Response
  }) as unknown as typeof fetch

  const report = await runDoctor(paths)
  expect(report.liveness).toHaveLength(1)
  expect(report.liveness[0]!.ok).toBe(true)
  expect(report.issues.some((i) => i.severity === "warn" && i.message.includes('ignores the "developer" role'))).toBe(true)
})
