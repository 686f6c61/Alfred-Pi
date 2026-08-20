import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Provider editing journeys: models editor (add by hand, edit JSON, deep
// probe, remove), raw provider JSON editor, and setting a key on a custom
// provider, which walks the credential-origin approval. Everything stays
// inside the temp agent dir; the network is dead.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

beforeEach(() => {
  agent = useTempAgentDir()
  writeFileSync(
    join(agent.agentDir, "models.json"),
    JSON.stringify({
      providers: { p: { baseUrl: "https://p.example/v1", api: "openai-completions", models: [{ id: "m1" }] } },
    }),
  )
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("models editor: add a model by hand, decline the write", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "provider:p", // dashboard: the custom provider
      "models", // provider menu: models editor
      "add", // models: add
      "manual", // add: manual entry
      undefined, // close the diff preview
      undefined, // models editor: Esc
      undefined, // dashboard: Esc
    ],
    inputs: ["m2"],
    confirms: [false],
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(true)
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf-8")).not.toContain('"m2"')
})

test("models editor: edit a model JSON, decline; invalid JSON warns", async () => {
  const { providersDashboard } = await loadScreens()

  const valid = new ScriptedUi({
    picks: ["provider:p", "models", "model:m1", "edit", undefined, undefined, undefined],
    editors: [JSON.stringify({ id: "m1", contextWindow: 64000 })],
    confirms: [false],
  })
  await providersDashboard(makeFakePi().pi as never, makeJourneyCtx({ ui: valid.ui }) as never)
  // Declined: the model keeps its original JSON.
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf-8")).not.toContain("64000")

  const broken = new ScriptedUi({
    picks: ["provider:p", "models", "model:m1", "edit", undefined, undefined],
    editors: ["{not json"],
  })
  await providersDashboard(makeFakePi().pi as never, makeJourneyCtx({ ui: broken.ui }) as never)
  expect(broken.notifications.some((n) => n.message.includes("Invalid JSON"))).toBe(true)
})

test("models editor: deep probe shows its result offline, remove declines", async () => {
  const { providersDashboard } = await loadScreens()

  const probe = new ScriptedUi({
    picks: ["provider:p", "models", "model:m1", "probe", undefined, undefined, undefined],
  })
  await providersDashboard(makeFakePi().pi as never, makeJourneyCtx({ ui: probe.ui }) as never)
  // Offline probe: the status went probing and back, the viewer opened.
  expect(probe.statuses.some((s) => (s.value ?? "").includes("probing"))).toBe(true)
  expect(probe.statuses.at(-1)).toEqual({ key: "alfred-probe", value: undefined })
  expect(probe.customCalls).toBeGreaterThanOrEqual(5)

  const remove = new ScriptedUi({
    picks: ["provider:p", "models", "model:m1", "remove", undefined, undefined],
    confirms: [false],
  })
  await providersDashboard(makeFakePi().pi as never, makeJourneyCtx({ ui: remove.ui }) as never)
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf-8")).toContain('"m1"')
})

test("provider JSON editor: valid edit declines, invalid JSON warns", async () => {
  const { providersDashboard } = await loadScreens()

  const valid = new ScriptedUi({
    picks: ["provider:p", "edit", undefined, undefined],
    editors: [JSON.stringify({ baseUrl: "https://p.example/v2", api: "openai-completions", models: [{ id: "m1" }] })],
    confirms: [false],
  })
  await providersDashboard(makeFakePi().pi as never, makeJourneyCtx({ ui: valid.ui }) as never)
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf-8")).toContain("/v1")

  const broken = new ScriptedUi({
    picks: ["provider:p", "edit", undefined],
    editors: ["{{{"],
  })
  await providersDashboard(makeFakePi().pi as never, makeJourneyCtx({ ui: broken.ui }) as never)
  expect(broken.notifications.some((n) => n.message.includes("Invalid JSON"))).toBe(true)
})

test("set key on a custom provider: origin approved, write declined", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "provider:p", // dashboard
      "key", // provider menu: keys
      "set", // keys: set
      undefined, // close the diff preview
      undefined, // dashboard: Esc
    ],
    inputs: ["sk-live-key"],
    confirms: [true, false], // approve the origin, decline the write
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  // The origin approval ran (confirm consumed) but nothing was written.
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf-8")).not.toContain("sk-live-key")
  expect(scripted.notifications).toEqual([])
})
