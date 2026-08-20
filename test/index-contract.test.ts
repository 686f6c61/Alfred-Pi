import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import piHarnessMoe from "../index.ts"
import { loadFallbackState } from "../lib/fallback.ts"
import { presupuestoStatus, relevoAviso, salaStatus } from "../lib/house-copy.ts"

// Contract tests for the orchestrator's three events against a fake pi.
// PI_CODING_AGENT_DIR points at a temp agent dir BEFORE the plugin is
// invoked; findRepoRoot still resolves the real repo (11 packs).

type Handler = (event: unknown, ctx: unknown) => unknown

const realFetch = globalThis.fetch
const realStdoutWrite = process.stdout.write.bind(process.stdout)
const prevAgentDir = process.env.PI_CODING_AGENT_DIR
let agentDir: string
let stdoutChunks: string[]
let flagValue: string | undefined
let setModelCalls: { provider?: string; id?: string }[]
let notifyCalls: string[]
let handlers: Record<string, Handler>

function installPlugin(): void {
  handlers = {}
  flagValue = undefined
  setModelCalls = []
  notifyCalls = []
  const pi = {
    registerCommand: () => {},
    registerFlag: () => {},
    on: (name: string, fn: Handler) => {
      handlers[name] = fn
    },
    getFlag: (name: string) => (name === "alfred-pi" || name === "harness-moe" ? flagValue : undefined),
    getThinkingLevel: () => "medium",
    setModel: async (m: { provider?: string; id?: string }) => {
      setModelCalls.push(m)
      return true
    },
  }
  piHarnessMoe(pi as unknown as Parameters<typeof piHarnessMoe>[0])
}

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi686-idx-"))
  process.env.PI_CODING_AGENT_DIR = agentDir
  // Offline: the update check must never reach the network in tests.
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
  installPlugin()
})

afterEach(() => {
  if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
  else process.env.PI_CODING_AGENT_DIR = prevAgentDir
  globalThis.fetch = realFetch
  process.stdout.write = realStdoutWrite
  rmSync(agentDir, { recursive: true, force: true })
})

const dataDir = () => join(agentDir, "alfred-pi")

test("session_start_stack_json", async () => {
  flagValue = "stack:json"
  stdoutChunks = []
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : String(chunk))
    return true
  }) as unknown as typeof process.stdout.write

  await handlers["session_start"]!({}, { mode: "print" })
  process.stdout.write = realStdoutWrite

  const payload = JSON.parse(stdoutChunks.join("")) as { domains: { packs: number }; autopilot: { enabled: boolean } }
  expect(payload.domains.packs).toBe(11)
  expect(payload.autopilot.enabled).toBe(false)
})

test("before_agent_start_focused_context", async () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(join(dataDir(), "autopilot.json"), JSON.stringify({ enabled: true, routing: "context" }))

  const ret = (await handlers["before_agent_start"]!(
    { prompt: "audita la seguridad de este repo y dime vulnerabilidades", systemPrompt: "base" },
    { mode: "print", cwd: agentDir },
  )) as { systemPrompt?: string } | undefined

  expect(ret?.systemPrompt).toContain("# Security")
  expect(ret?.systemPrompt ?? "").not.toContain("# Clean Code")
})

function refused(): Error {
  return Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { code: "ECONNREFUSED" })
}

function timeoutErr(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" })
}

test("after_provider_response_heal", async () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(
    join(dataDir(), "profiles.json"),
    JSON.stringify({ profiles: [{ name: "heal", chain: [{ provider: "failing", model: "m1" }, { provider: "healthy", model: "m2" }] }] }),
  )
  writeFileSync(join(dataDir(), "fallback.json"), JSON.stringify({ activeProfile: "heal", failures: {} }))

  const ctx = {
    mode: "print",
    ui: { notify: async (msg: string) => void notifyCalls.push(msg), setStatus: async () => {} },
    model: { provider: "failing", id: "m1" },
    modelRegistry: {
      find: (provider: string, model: string) => ({ provider, id: model }),
      hasConfiguredAuth: () => true,
    },
  }

  await handlers["after_provider_response"]!({ status: 500 }, ctx)
  expect(notifyCalls).toHaveLength(0)
  await handlers["after_provider_response"]!({ status: 500 }, ctx)
  // Two consecutive 500s cross the threshold: the user is warned in house copy.
  expect(notifyCalls.length).toBeGreaterThan(0)
  expect(notifyCalls.some((n) => n.includes("paso a tu reserva"))).toBe(true)
  expect(notifyCalls).toContain(relevoAviso("failing/m1", "healthy/m2"))

  // The next turn heals: the healthy step replaces the failing model.
  await handlers["before_agent_start"]!({ prompt: "sigue", systemPrompt: "base" }, ctx)
  expect(setModelCalls).toHaveLength(1)
  expect(setModelCalls[0]).toEqual({ provider: "healthy", id: "m2" })
  expect(notifyCalls.filter((n) => n.includes("paso a tu reserva")).length).toBeGreaterThanOrEqual(1)
  expect(loadFallbackState(dataDir()).previousModel).toEqual({ provider: "failing", model: "m1" })
})

test("after_provider_response_transport_counts_and_never_setModel", async () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(
    join(dataDir(), "profiles.json"),
    JSON.stringify({ profiles: [{ name: "heal", chain: [{ provider: "failing", model: "m1" }, { provider: "healthy", model: "m2" }] }] }),
  )
  writeFileSync(join(dataDir(), "fallback.json"), JSON.stringify({ activeProfile: "heal", failures: {} }))

  const ctx = {
    mode: "print",
    ui: { notify: async (msg: string) => void notifyCalls.push(msg), setStatus: async () => {} },
    model: { provider: "failing", id: "m1" },
    modelRegistry: {
      find: (provider: string, model: string) => ({ provider, id: model }),
      hasConfiguredAuth: () => true,
    },
  }

  // A 200 with a transport error must still count: today the adapter only
  // forwards status, so 200 would reset the counter.
  await handlers["after_provider_response"]!({ status: 200, error: timeoutErr() }, ctx)
  expect(notifyCalls).toHaveLength(0)
  expect(setModelCalls).toHaveLength(0)
  await handlers["after_provider_response"]!({ status: 200, error: refused() }, ctx)
  expect(notifyCalls.length).toBeGreaterThan(0)
  expect(notifyCalls.some((n) => n.includes("paso a tu reserva"))).toBe(true)
  expect(setModelCalls).toHaveLength(0)
})

test("before_agent_start_sin_sala_status", async () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(join(dataDir(), "autopilot.json"), JSON.stringify({ enabled: true, routing: "context" }))

  const statuses: { key: string; value: string | undefined }[] = []
  await handlers["before_agent_start"]!(
    { prompt: "arregla este bug", systemPrompt: "base" },
    {
      mode: "tui",
      cwd: agentDir,
      ui: {
        notify: async () => {},
        setStatus: async (key: string, value: string | undefined) => {
          statuses.push({ key, value })
        },
      },
    },
  )
  expect(statuses.some((s) => s.key === "alfred-sala" && s.value === "sin sala")).toBe(true)
  expect(statuses.some((s) => s.key === "alfred-sala" && String(s.value).includes("dom:"))).toBe(false)
})

test("before_agent_start_domain_status_uses_salaStatus", async () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(join(dataDir(), "autopilot.json"), JSON.stringify({ enabled: true, routing: "context" }))

  const statuses: { key: string; value: string | undefined }[] = []
  await handlers["before_agent_start"]!(
    { prompt: "audita la seguridad de este repo y dime vulnerabilidades", systemPrompt: "base" },
    {
      mode: "tui",
      cwd: agentDir,
      ui: {
        notify: async () => {},
        setStatus: async (key: string, value: string | undefined) => {
          statuses.push({ key, value })
        },
      },
    },
  )
  expect(statuses.some((s) => s.key === "alfred-sala" && s.value === salaStatus("security"))).toBe(true)
  expect(statuses.some((s) => String(s.value).includes("dom:"))).toBe(false)
})

test("before_agent_start_budget_exceeded_once", async () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(join(dataDir(), "budget.json"), JSON.stringify({ dailyMaxUsd: 0.001 }))
  writeFileSync(
    join(agentDir, "models.json"),
    JSON.stringify({ providers: { p: { baseUrl: "https://p.example/v1", api: "openai-completions", models: [{ id: "m", cost: { input: 3, output: 15 } }] } } }),
  )
  // Today's session: 1M input tokens at $3/M already blows the $0.001 cap.
  const sessionsDir = join(agentDir, "sessions", "proj")
  mkdirSync(sessionsDir, { recursive: true })
  const today = new Date().toISOString()
  writeFileSync(
    join(sessionsDir, "s.jsonl"),
    [
      JSON.stringify({ type: "session", id: "s", cwd: agentDir }),
      JSON.stringify({ type: "message", timestamp: today, message: { role: "assistant", provider: "p", model: "m", usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } } }),
    ].join("\n") + "\n",
  )

  const event = { prompt: "sigue con lo anterior", systemPrompt: "base" }
  const statuses: { key: string; value: string | undefined }[] = []
  const first = (await handlers["before_agent_start"]!(event, {
    mode: "tui",
    cwd: agentDir,
    ui: {
      notify: async () => {},
      setStatus: async (key: string, value: string | undefined) => {
        statuses.push({ key, value })
      },
    },
  })) as { systemPrompt?: string; message?: unknown }
  expect(first?.systemPrompt).toContain("<budget-exceeded>")
  expect(statuses.some((s) => s.key === "alfred-presupuesto" && s.value === presupuestoStatus(300000, 0.001))).toBe(true)
  expect(statuses.some((s) => s.key === "alfred-presupuesto" && String(s.value).toLowerCase().includes("budget"))).toBe(false)
  // Default persona (Alfred) rides along once per session.
  expect(first?.message).toBeTruthy()

  const second = (await handlers["before_agent_start"]!(event, { mode: "print", cwd: agentDir })) as { systemPrompt?: string; message?: unknown }
  expect(second?.systemPrompt).toContain("<budget-exceeded>")
  expect(second?.message).toBeUndefined()
})
