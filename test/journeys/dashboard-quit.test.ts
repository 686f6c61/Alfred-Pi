import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journey: open /providers, look at the dashboard, leave via Quit.
// Nothing may be written and no shell command may run.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

test("dashboard: open and Quit without touching config", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["action:quit"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  // One dashboard render asked for one choice; no component ran for real.
  expect(scripted.customCalls).toBe(1)
  // No side effects: no pi exec, no model switch, no config files created.
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
  expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
  expect(existsSync(join(agent.agentDir, "auth.json"))).toBe(false)
})

test("dashboard: Esc on the main menu closes it too", async () => {
  const { providersDashboard } = await loadScreens()
  // undefined = the Esc answer of ui.custom.
  const scripted = new ScriptedUi({ picks: [undefined] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
})
