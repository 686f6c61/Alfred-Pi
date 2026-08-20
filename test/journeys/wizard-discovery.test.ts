import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Wizard journeys with a live discovery: the endpoint answers two models
// offline, so the wizard reaches the multi-select. The scripted pick queue
// can now answer string[] (chosen set) and, in the factory variant, the
// real MultiSelectComponent runs and is driven with keys.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

beforeEach(() => {
  agent = useTempAgentDir()
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url.includes("/v1/models")) {
      return new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), { status: 200 })
    }
    if (url.includes("models.dev")) return new Response("{}", { status: 200 })
    throw new Error(`unexpected fetch: ${url}`)
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

const WIZARD_INPUTS = ["my-prov", "https://api.example.com/v1", ""]

test("wizard: discovery offers models, multi-select answered with a set, preview declined", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "action:add", // dashboard: open the wizard
      "custom", // wizard: hand-entered provider
      "openai-completions", // wizard: api type
      ["m1", "m2"], // multi-select: both discovered models
      undefined, // close the diff preview
      undefined, // dashboard: Esc to leave
    ],
    inputs: [...WIZARD_INPUTS, ""], // + skip the "add another by hand" prompt
    confirms: [false], // decline "Apply changes?"
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  // Declined at the confirm: nothing written despite the full wizard run.
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
  expect(fakePi.execCalls).toEqual([])
})

test("wizard: the real MultiSelectComponent runs, space toggles and Enter confirms", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({
    invokeFactory: true,
    // The queue empties exactly at the multi-select, so its factory runs.
    picks: ["action:add", "custom", "openai-completions"],
    keys: [" ", "\r"], // toggle the first model, confirm the selection
    inputs: [...WIZARD_INPUTS, ""], // + skip the "add another by hand" prompt
    confirms: [false],
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  // The component returned the toggled model and the wizard still declined.
  expect(scripted.customCalls).toBeGreaterThanOrEqual(5)
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
})
