import { test, expect, beforeEach, afterEach } from "bun:test"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Component journeys: with invokeFactory the real DashboardComponent and
// TextViewComponent factories run (render + handleInput) instead of being
// short-circuited. Esc closes any of them; the stack viewer also scrolls.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

test("components: stack viewer renders, scrolls with j/k and closes with q", async () => {
  const { stackScreen } = await loadScreens()
  const scripted = new ScriptedUi({ invokeFactory: true, keys: ["j", "j", "k", "q"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui, model: { provider: "p", id: "m" } })

  await stackScreen(fakePi.pi as never, ctx as never)

  // The TextViewComponent factory ran once, rendered, scrolled and closed.
  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
})

test("components: dashboard factory renders and Esc leaves the dashboard", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({ invokeFactory: true })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  // One DashboardComponent (SelectList wrapper) rendered; Esc resolved
  // done(undefined) and the dashboard loop ended.
  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
})
