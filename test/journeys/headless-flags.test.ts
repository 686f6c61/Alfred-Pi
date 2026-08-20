import { test, expect, beforeEach, afterEach } from "bun:test"
import { ScriptedUi, makeFakePi, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journey: headless flags. Every supported --harness-moe value runs
// the session_start handler in print mode and writes its payload to stdout;
// :json variants must be valid JSON. No network, no pi exec.

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>
type IndexModule = typeof import("../../index.ts")

let indexMod: IndexModule | undefined
async function loadIndex(): Promise<IndexModule> {
  indexMod ??= await import("../../index.ts")
  return indexMod
}

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch
const realStdoutWrite = process.stdout.write.bind(process.stdout)

beforeEach(() => {
  agent = useTempAgentDir()
  // Offline: the update check must blow up harmlessly, nothing else fetches.
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

async function runHeadless(flag: string, names: string[] = ["alfred-pi"]): Promise<string> {
  const mod = await loadIndex()
  const handlers: Record<string, Handler> = {}
  const fakePi = makeFakePi()
  const pi = {
    ...fakePi.pi,
    on: (name: string, fn: Handler) => {
      handlers[name] = fn
    },
    getFlag: (name: string) => (names.includes(name) ? flag : undefined),
  }
  mod.default(pi as never)

  const chunks: string[] = []
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk))
    return true
  }) as unknown as typeof process.stdout.write
  try {
    await handlers["session_start"]!({}, { mode: "print" })
  } finally {
    process.stdout.write = realStdoutWrite
  }
  expect(fakePi.execCalls).toEqual([])
  return chunks.join("")
}

test("headless: doctor and usage print their text reports", async () => {
  const doctor = await runHeadless("doctor")
  expect(doctor).toContain("Alfred-Pi doctor")
  expect(doctor).not.toContain("aviso: --harness-moe")

  const legacy = await runHeadless("doctor", ["harness-moe"])
  expect(legacy).toContain("Alfred-Pi doctor")
  expect(legacy).toContain("aviso: --harness-moe está deprecado")

  const usage = await runHeadless("usage")
  expect(usage).toContain("Alfred-Pi usage")
})

test("headless: stack prints text and stack:json prints valid JSON", async () => {
  const text = await runHeadless("stack")
  expect(text).toContain("Alfred-Pi stack")

  const json = JSON.parse(await runHeadless("stack:json")) as { domains: { packs: number }; autopilot: { enabled: boolean } }
  expect(json.domains.packs).toBe(11)
  expect(json.autopilot.enabled).toBe(false)
})

test("headless: autopilot and domains flags print valid JSON payloads", async () => {
  for (const flag of ["autopilot", "autopilot:json"]) {
    const payload = JSON.parse(await runHeadless(flag)) as { enabled: boolean; routing: string }
    expect(payload.enabled).toBe(false)
    expect(payload.routing).toBe("context")
  }
  for (const flag of ["domains", "domains:json"]) {
    const payload = JSON.parse(await runHeadless(flag)) as { packs: { id: string; enabled: boolean }[] }
    expect(payload.packs).toHaveLength(11)
    expect(payload.packs.every((p) => p.enabled === false)).toBe(true)
  }
})
