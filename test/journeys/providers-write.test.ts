import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Jornadas de escritura cancelada en /providers: cada accion (add, keys,
// defaults, backups) se aborta con Esc o input vacio antes de tocar nada, y
// el dashboard se cierra con Quit. Ningun models.json, auth.json ni
// settings.json puede aparecer.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

function assertNothingWritten(scripted: ScriptedUi, fakePi: ReturnType<typeof makeFakePi>): void {
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
  expect(existsSync(join(agent.agentDir, "auth.json"))).toBe(false)
  expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
}

test("providers: add wizard cancelled at the name input writes nothing", async () => {
  const { providersDashboard } = await loadScreens()
  // La cola de inputs de ScriptedUi no tiene respuesta Esc, asi que la
  // cancelacion equivale es el input vacio: el wizard corta ahi, antes de
  // cualquier discovery o escritura.
  const scripted = new ScriptedUi({ picks: ["action:add", "custom", "action:quit"], inputs: [""] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(3)
  assertNothingWritten(scripted, fakePi)
})

test("providers: keys screen closed with Esc writes nothing", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["action:keys", undefined, "action:quit"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(3)
  assertNothingWritten(scripted, fakePi)
})

test("providers: defaults screen closed with Esc writes nothing", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["action:defaults", undefined, "action:quit"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(3)
  assertNothingWritten(scripted, fakePi)
})

test("providers: backups screen closed with Esc writes nothing", async () => {
  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["action:backups", undefined, "action:quit"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(3)
  assertNothingWritten(scripted, fakePi)
})
