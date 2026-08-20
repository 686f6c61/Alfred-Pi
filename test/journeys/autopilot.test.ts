import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journeys over the autopilot screen: leave untouched, turn it on
// but cancel the deal-all-cards offer, and try the prompt detection test.
// State writes land in the temp agent dir; no network, no shell.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

function readAutopilotState(): { enabled?: boolean; enabledAt?: string } {
  const file = join(agent.dataDir, "autopilot.json")
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as { enabled?: boolean; enabledAt?: string }) : {}
}

test("autopilot: Back leaves without writing state", async () => {
  const { autopilotScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["back"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await autopilotScreen(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(readAutopilotState().enabled).toBeUndefined()
})

test("autopilot: turn ON, cancel the deal, run a prompt test, Back", async () => {
  const { autopilotScreen } = await loadScreens()
  // toggle ON (0 packs enabled in the sandbox -> deal offer), decline it,
  // run the detection test (input + result viewer), then leave.
  const scripted = new ScriptedUi({
    picks: ["toggle", "test", undefined, "back"],
    confirms: [false],
    inputs: ["audita la seguridad de este repo"],
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await autopilotScreen(fakePi.pi as never, ctx as never)

  // menu, menu (after toggle), detection viewer, menu (Back)
  expect(scripted.customCalls).toBe(4)
  // Autopilot ended up ON with a timestamp.
  const state = readAutopilotState()
  expect(state.enabled).toBe(true)
  expect(state.enabledAt).toBeTruthy()
  // Declining the deal must not enable any pack behind our back.
  expect(existsSync(join(agent.dataDir, "domains.json"))).toBe(false)
  expect(scripted.notifications.some((n) => n.message.includes("Autopilot ON"))).toBe(true)
  expect(fakePi.execCalls).toEqual([])
})

test("autopilot: usa el copy de salas y elimina la jerga de cartas", () => {
  const source = readFileSync(join(import.meta.dir, "..", "..", "lib", "screens.ts"), "utf8")
  expect(source).toContain("dealAllSalasLabel()")
  expect(source).not.toContain("Deal all cards")
})

test("selección de modelo: una intención conserva el orden y confirma la ficha ausente", async () => {
  writeFileSync(join(agent.agentDir, "models.json"), JSON.stringify({
    providers: {
      "custom-lab": {
        baseUrl: "https://api.example.test/v1",
        api: "openai-completions",
        models: [{ id: "sin-ficha" }],
      },
    },
  }))
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    otro: { models: { conocido: { limit: { context: 8_000, output: 1_000 } } } },
  }))) as typeof fetch
  try {
    const { providersDashboard } = await loadScreens()
    const scripted = new ScriptedUi({
      picks: ["action:defaults", "custom-lab", "intent:vision", "sin-ficha", "medium", undefined, "action:quit"],
      confirms: [true, false],
    })
    const confirmations: string[] = []
    const ui = {
      ...scripted.ui,
      confirm: async (title: string, subtitle?: string): Promise<boolean> => {
        confirmations.push(`${title}\n${subtitle ?? ""}`)
        return scripted.ui.confirm(title, subtitle)
      },
    }
    const fakePi = makeFakePi()

    await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui }) as never)

    expect(confirmations[0]).toContain("Visión")
    expect(confirmations[0]).toContain("sin ficha")
    expect(confirmations[0]).not.toContain("USD/M")
    expect(fakePi.execCalls).toEqual([])
    expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
  } finally {
    globalThis.fetch = realFetch
  }
})
