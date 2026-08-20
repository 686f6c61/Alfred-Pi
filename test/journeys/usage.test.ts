import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journeys over the usage screen: look at a period, set a daily cap
// and then cancel it. Sessions dir of the sandbox is empty, so every
// report renders with zero records; the point is the dialog flow and that
// budget writes stay in the temp data dir. No network, no shell.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

function readBudget(): { dailyMaxUsd?: number } {
  const file = join(agent.dataDir, "budget.json")
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as { dailyMaxUsd?: number }) : {}
}

test("usage: view the 7-day period and leave", async () => {
  const { usageScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["7", undefined] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await usageScreen(fakePi.pi as never, ctx as never)

  // period pick + report viewer, then the screen returns on its own
  expect(scripted.customCalls).toBe(2)
  expect(fakePi.execCalls).toEqual([])
  expect(existsSync(join(agent.dataDir, "budget.json"))).toBe(false)
})

test("usage: set a daily cap, then cancel it", async () => {
  const { usageScreen } = await loadScreens()
  const fakePi = makeFakePi()

  // Happy path: pick budget, enter 5.
  const happy = new ScriptedUi({ picks: ["budget"], inputs: ["5"] })
  await usageScreen(fakePi.pi as never, makeJourneyCtx({ ui: happy.ui }) as never)
  expect(readBudget().dailyMaxUsd).toBe(5)
  expect(happy.notifications.some((n) => n.message.includes("Daily budget set to $5.00"))).toBe(true)

  // Cancel path: pick budget again, empty input disables the cap.
  const cancel = new ScriptedUi({ picks: ["budget"], inputs: [""] })
  await usageScreen(fakePi.pi as never, makeJourneyCtx({ ui: cancel.ui }) as never)
  expect(readBudget().dailyMaxUsd).toBeUndefined()
  expect(cancel.notifications.some((n) => n.message.includes("Daily budget disabled"))).toBe(true)

  expect(fakePi.execCalls).toEqual([])
})
