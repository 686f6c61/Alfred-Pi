import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"
import { backupFiles } from "../../lib/config-io.ts"
import { loadProfiles } from "../../lib/profiles.ts"

// Viajes humanos de profundidad en /providers. models.json se prepara en
// el temporal ANTES de abrir la TUI: un proveedor custom con un modelo.
// Todo queda en el sandbox (PI_CODING_AGENT_DIR), sin red (fetch mockeado
// donde hace falta) y sin pi.exec real.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

interface LabProvider {
  baseUrl: string
  api: string
  apiKey?: string
  models: Array<{ id: string }>
}

/** Siembra models.json con el proveedor custom de laboratorio. */
function seedModels(overrides: Partial<LabProvider> = {}): void {
  const provider: LabProvider = {
    baseUrl: "https://api.example.com/v1",
    api: "openai-completions",
    models: [{ id: "lab-1" }],
    ...overrides,
  }
  writeFileSync(join(agent.agentDir, "models.json"), JSON.stringify({ providers: { "custom-lab": provider } }, null, 2) + "\n")
}

function readModels(): { providers: Record<string, LabProvider> } {
  return JSON.parse(readFileSync(join(agent.agentDir, "models.json"), "utf8")) as { providers: Record<string, LabProvider> }
}

function assertNoExtraWrites(fakePi: ReturnType<typeof makeFakePi>): void {
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
  // Ninguna escritura pasa por config-io sin dejar backup.
  expect(existsSync(join(agent.dataDir, "backups"))).toBe(false)
  expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
  expect(existsSync(join(agent.agentDir, "auth.json"))).toBe(false)
}

test("providers: open the custom provider, Back, Quit, nothing extra written", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels()
  const before = readFileSync(join(agent.agentDir, "models.json"), "utf8")
  const scripted = new ScriptedUi({ picks: ["provider:custom-lab", "back", "action:quit"] })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // dashboard, menu del proveedor, dashboard
  expect(scripted.customCalls).toBe(3)
  expect(scripted.notifications).toEqual([])
  assertNoExtraWrites(fakePi)
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf8")).toBe(before)
})

test("providers: test connection shows the discovered models, then Esc", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels()
  globalThis.fetch = (async (): Promise<Response> =>
    ({ ok: true, status: 200, json: async () => ({ data: [{ id: "lab-1" }, { id: "lab-2" }] }) }) as unknown as Response) as typeof fetch
  const scripted = new ScriptedUi({ picks: ["provider:custom-lab", "test", undefined, "action:quit"] })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // dashboard, menu del proveedor, visor del resultado, dashboard
  expect(scripted.customCalls).toBe(4)
  // El probe encendio y apago su status.
  const probeStatuses = scripted.statuses.filter((s) => s.key === "alfred-probe")
  expect(probeStatuses[0]!.value).toContain("probing custom-lab")
  expect(probeStatuses[probeStatuses.length - 1]!.value).toBeUndefined()
  assertNoExtraWrites(fakePi)
})

test("providers: keys refuses to delete the key when confirm is false", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels({ apiKey: "sk-lab-secret" })
  const scripted = new ScriptedUi({
    picks: ["action:keys", "custom-lab", "remove", "back", "action:quit"],
    confirms: [false],
  })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // selector de proveedor, menu de clave (x2 tras el continue), dashboard
  expect(scripted.customCalls).toBe(5)
  // La clave sigue intacta: el confirm false aborta antes de escribir.
  expect(readModels().providers["custom-lab"]!.apiKey).toBe("sk-lab-secret")
  assertNoExtraWrites(fakePi)
})

test("providers: defaults closed with Esc at the model pick writes nothing", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels()
  const scripted = new ScriptedUi({ picks: ["action:defaults", "custom-lab", undefined, "action:quit"] })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // provider, modelo (Esc), dashboard
  expect(scripted.customCalls).toBe(4)
  expect(scripted.notifications).toEqual([])
  assertNoExtraWrites(fakePi)
})

test("providers: applyProfile switches the session to the healthy chain step", async () => {
  const { applyProfile } = await loadScreens()
  seedModels()
  mkdirSync(agent.dataDir, { recursive: true })
  writeFileSync(
    join(agent.dataDir, "profiles.json"),
    JSON.stringify({ profiles: [{ name: "lab", chain: [{ provider: "custom-lab", model: "lab-1" }] }] }, null, 2) + "\n",
  )
  const profile = loadProfiles().profiles[0]!
  expect(profile.name).toBe("lab")

  const scripted = new ScriptedUi({})
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({
    ui: scripted.ui,
    registryModels: [{ provider: "custom-lab", id: "lab-1" }],
    authConfigured: ["custom-lab"],
  })

  await applyProfile(fakePi.pi as never, ctx as never, profile as never)

  expect(fakePi.setModelCalls).toHaveLength(1)
  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications.some((n) => n.message.includes("custom-lab/lab-1") && n.kind === "info")).toBe(true)
})

test("providers: backups list closed with Esc leaves the snapshot alone", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels()
  const info = backupFiles([join(agent.agentDir, "models.json")])
  expect(info).toBeDefined()
  const scripted = new ScriptedUi({ picks: ["action:backups", undefined, "action:quit"] })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  expect(scripted.customCalls).toBe(3)
  // El backup original sigue ahi, unico e intacto.
  expect(readdirSync(join(agent.dataDir, "backups"))).toHaveLength(1)
  expect(fakePi.execCalls).toEqual([])
})

test("providers: restore refused with confirm false keeps the current config", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels()
  const info = backupFiles([join(agent.agentDir, "models.json")])
  expect(info).toBeDefined()
  const before = readFileSync(join(agent.agentDir, "models.json"), "utf8")
  const scripted = new ScriptedUi({
    picks: ["action:backups", `backup:${info!.id}`, "restore", "back", "action:quit"],
    confirms: [false],
  })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // lista, menu del backup, lista de nuevo, dashboard
  expect(scripted.customCalls).toBe(5)
  expect(scripted.notifications).toEqual([])
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf8")).toBe(before)
  // Ni restore ni backup de seguridad: seguimos con exactamente un snapshot.
  expect(readdirSync(join(agent.dataDir, "backups"))).toHaveLength(1)
  expect(fakePi.execCalls).toEqual([])
})
