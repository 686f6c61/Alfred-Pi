import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journey: add a provider by hand from the dashboard. Discovery runs
// offline (fetch dead) so the person types one model id; the diff preview
// opens and they decline: nothing may be written.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

beforeEach(() => {
  agent = useTempAgentDir()
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("add provider: wizard to preview, decline, nothing written", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "action:add", // dashboard: open the wizard
      "custom", // wizard: hand-entered provider
      "openai-completions", // wizard: api type
      undefined, // close the diff preview viewer
      undefined, // dashboard: Esc to leave
    ],
    inputs: [
      "my-prov", // provider id
      "https://api.example.com/v1", // base URL
      "", // api key: empty, local server, no credential approval needed
      "m1", // discovery failed offline: one model id by hand
    ],
    confirms: [false], // decline "Apply changes?"
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  // Five scripted custom answers: dashboard, preset, api, preview, dashboard.
  expect(scripted.customCalls).toBe(5)
  expect(scripted.notifications).toEqual([])
  // Declined at the confirm: no plan was applied, no config written.
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
  expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
  expect(fakePi.execCalls).toEqual([])
})
