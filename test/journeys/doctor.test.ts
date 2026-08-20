import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journey: /providers:doctor. The doctor runs against a temp agent
// dir with one custom provider, fetch mocked (never real network), and the
// report is shown in the text viewer until the person closes it.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

beforeEach(() => {
  agent = useTempAgentDir()
  // One probeable custom provider: the sweep has something to liveness-check.
  writeFileSync(
    join(agent.agentDir, "models.json"),
    JSON.stringify({ providers: { p: { baseUrl: "https://p.example/v1", api: "openai-completions" } } }),
  )
  // The liveness probe asks GET <baseUrl>/models; answer offline.
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: "m1" }] }), { status: 200 })) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("doctor: run, show the report, close the viewer", async () => {
  const { doctorScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: [undefined] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await doctorScreen(fakePi.pi as never, ctx as never)

  // One report viewer rendered and closed (Esc); no dialogs, no shell.
  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
  // Statusline went to "running" and back to clean.
  expect(scripted.statuses[0]).toEqual({ key: "alfred-doctor", value: "running doctor…" })
  expect(scripted.statuses.at(-1)).toEqual({ key: "alfred-doctor", value: undefined })
  // The probe result landed in the health history inside the temp dir.
  const health = join(agent.dataDir, "health.jsonl")
  expect(existsSync(health)).toBe(true)
  expect(readFileSync(health, "utf-8")).toContain("\"provider\":\"p\"")
})

test("doctor: a failing sweep surfaces as an error notify", async () => {
  const { doctorScreen } = await loadScreens()
  // Make the data dir unusable as a directory: appendHealth cannot create
  // it and the whole sweep throws inside doctorScreen's try.
  writeFileSync(join(agent.agentDir, "alfred-pi"), "not a dir")

  const scripted = new ScriptedUi({})
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await doctorScreen(fakePi.pi as never, ctx as never)

  expect(scripted.notifications).toHaveLength(1)
  expect(scripted.notifications[0]!.kind).toBe("error")
  expect(scripted.notifications[0]!.message).toContain("Doctor failed")
  expect(scripted.customCalls).toBe(0)
  expect(scripted.statuses.at(-1)).toEqual({ key: "alfred-doctor", value: undefined })
})
