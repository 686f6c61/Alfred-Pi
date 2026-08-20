import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journeys over the profiles screen: leave untouched, snapshot the
// current model into a new profile, and try a delete that is refused.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

function readProfiles(): { profiles?: Array<{ name: string; chain: Array<{ provider: string; model: string }> }> } {
  const file = join(agent.dataDir, "profiles.json")
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as { profiles?: Array<{ name: string; chain: Array<{ provider: string; model: string }> }> }) : {}
}

test("profiles: Back leaves without writing anything", async () => {
  const { profilesScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["back"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui, model: { provider: "p1", id: "m1" } })

  await profilesScreen(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
  expect(readProfiles().profiles).toBeUndefined()
})

test("profiles: create snapshots the current model, then Back", async () => {
  const { profilesScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["new", "back"], inputs: ["work"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui, model: { provider: "xai-grok", id: "grok-4" } })

  await profilesScreen(fakePi.pi as never, ctx as never)

  // menu, menu (after the notify round-trip)
  expect(scripted.customCalls).toBe(2)
  const saved = readProfiles().profiles ?? []
  expect(saved).toHaveLength(1)
  expect(saved[0]!.name).toBe("work")
  expect(saved[0]!.chain).toEqual([{ provider: "xai-grok", model: "grok-4" }])
  expect(scripted.notifications.some((n) => n.message.includes('"work" created'))).toBe(true)
  expect(fakePi.execCalls).toEqual([])
})

test("profiles: delete refused by confirm keeps the profile", async () => {
  const { profilesScreen } = await loadScreens()
  // Create first, then open the profile, pick Delete and answer no.
  const scripted = new ScriptedUi({
    picks: ["new", "profile:work", "delete", "back"],
    inputs: ["work"],
    confirms: [false],
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui, model: { provider: "p1", id: "m1" } })

  await profilesScreen(fakePi.pi as never, ctx as never)

  expect(readProfiles().profiles?.map((p) => p.name)).toEqual(["work"])
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
})
