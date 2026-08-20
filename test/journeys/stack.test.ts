import { test, expect, beforeEach, afterEach } from "bun:test"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journey: /stack. The control tower opens, the person reads it and
// closes the viewer. Nothing is written and no shell command runs.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

test("stack: open, read, close", async () => {
  const { stackScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: [undefined] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui, model: { provider: "p", id: "m" } })

  await stackScreen(fakePi.pi as never, ctx as never)

  // One text viewer rendered and closed; no side effects at all.
  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
  expect(scripted.statuses).toEqual([])
})
