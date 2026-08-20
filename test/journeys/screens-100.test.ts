import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"
import { discoverDomains } from "../../lib/domains.ts"

// Viajes para el 100 % de lib/screens.ts (lote B del plan de cobertura):
// sort del dashboard con custom + built-in, deepProbeFlow, discoverFlow via
// models editor, setDefaults con switch de sesion, packageActions tras
// busqueda, dealAllCards en ambos estados y la fontaneria de componentes
// (invalidate + toggleAll). Cero red: fetch mockeado donde hace falta.

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
  models: Array<{ id: string }>
}

function seedModels(models: string[] = ["lab-1"]): void {
  const provider: LabProvider = { baseUrl: "https://api.example.com/v1", api: "openai-completions", models: models.map((id) => ({ id })) }
  writeFileSync(join(agent.agentDir, "models.json"), JSON.stringify({ providers: { "custom-lab": provider } }, null, 2) + "\n")
}

function readModels(): { providers: Record<string, LabProvider> } {
  return JSON.parse(readFileSync(join(agent.agentDir, "models.json"), "utf8")) as { providers: Record<string, LabProvider> }
}

/** fetch que responde JSON 200 a cualquier URL con el cuerpo dado. */
function jsonResponse(urlPredicate: (url: string) => boolean, body: unknown, status = 200): { test: (url: string) => boolean; respond: typeof fetch } {
  return {
    test: urlPredicate,
    respond: (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (urlPredicate(url)) return new Response(JSON.stringify(body), { status })
      return new Response("{}", { status: 404 })
    }) as unknown as typeof fetch,
  }
}

function routeFetch(...routes: { test: (url: string) => boolean; respond: typeof fetch }[]): void {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    for (const r of routes) if (r.test(url)) return r.respond(input)
    return new Response("{}", { status: 404 })
  }) as typeof fetch
}

test("dashboard: custom provider sorts before the registry built-in", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels()
  // El registry aporta un built-in; models.json aporta el custom. La rama
  // de ordenacion (custom primero, localeCompare despues) se pisa con ambos.
  const scripted = new ScriptedUi({ picks: ["provider:custom-lab", "back", "action:quit"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui, registryModels: [{ provider: "aaa-builtin", id: "m" }] })

  await providersDashboard(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(3)
  expect(fakePi.execCalls).toEqual([])
  expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
})

test("provider menu: deep probe discovers candidates and probes the picked model", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels(["lab-1"])
  routeFetch(
    jsonResponse((u) => u.endsWith("/models"), { data: [{ id: "lab-1" }, { id: "lab-2" }] }),
    jsonResponse((u) => u.endsWith("/chat/completions"), { ok: true }),
  )
  const scripted = new ScriptedUi({ picks: ["provider:custom-lab", "deep", "lab-2", undefined, "action:quit"] })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // dashboard, menu del provider, pick de modelo, visor, dashboard
  expect(scripted.customCalls).toBe(5)
  const probeStatuses = scripted.statuses.filter((s) => s.key === "alfred-probe")
  expect(probeStatuses.some((s) => s.value?.includes("1-token probe on custom-lab/lab-2"))).toBe(true)
  expect(probeStatuses[probeStatuses.length - 1]!.value).toBeUndefined()
  expect(fakePi.execCalls).toEqual([])
})

test("models editor: add via discover, multiPick selection, plan refused", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels(["lab-1"])
  routeFetch(jsonResponse((u) => u.endsWith("/models"), { data: [{ id: "lab-1" }, { id: "lab-9" }] }))
  const before = readFileSync(join(agent.agentDir, "models.json"), "utf8")
  const scripted = new ScriptedUi({
    picks: ["provider:custom-lab", "models", "add", "discover", ["lab-9"] as unknown as string, undefined, "back", "action:quit"],
    confirms: [false],
  })
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // dashboard, menu, editor, como-add, multiPick, visor del diff, editor, dashboard
  expect(scripted.customCalls).toBe(8)
  // Confirm false: el diff se rechazo y models.json queda intacto.
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf8")).toBe(before)
  const statuses = scripted.statuses.filter((s) => s.key === "alfred-probe")
  expect(statuses.some((s) => s.value?.includes("discovering models on custom-lab"))).toBe(true)
  expect(fakePi.execCalls).toEqual([])
})

test("provider menu: setDefaults writes settings and switches the live session", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels(["lab-1", "lab-2"])
  const scripted = new ScriptedUi({ picks: ["provider:custom-lab", "default", "lab-2", "high", undefined, "action:quit"], confirms: [true] })
  const fakePi = makeFakePi()
  const thinkingApplied: string[] = []
  const ctx = {
    ...makeJourneyCtx({ ui: scripted.ui, registryModels: [{ provider: "custom-lab", id: "lab-2" }], authConfigured: ["custom-lab"] }),
    setThinkingLevel: (level: string) => thinkingApplied.push(level),
  }

  await providersDashboard(fakePi.pi as never, ctx as never)

  const settings = JSON.parse(readFileSync(join(agent.agentDir, "settings.json"), "utf8")) as { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string }
  expect(settings.defaultProvider).toBe("custom-lab")
  expect(settings.defaultModel).toBe("lab-2")
  expect(settings.defaultThinkingLevel).toBe("high")
  expect(fakePi.setModelCalls).toHaveLength(1)
  expect(thinkingApplied).toEqual(["high"])
  expect(scripted.notifications.some((n) => n.message.includes("Session switched to custom-lab/lab-2 (high)"))).toBe(true)
  expect(fakePi.execCalls).toEqual([])
})

test("packages: search, details, audit and exact version install", async () => {
  const { packagesScreen } = await loadScreens()
  routeFetch(
    jsonResponse((u) => u.includes("/-/v1/search"), { objects: [{ package: { name: "lab-pkg", version: "1.0.0", description: "lab package" } }] }),
    jsonResponse((u) => u.includes("api.npmjs.org/downloads"), { downloads: 42 }),
    jsonResponse((u) => u === "https://registry.npmjs.org/lab-pkg", {
      "dist-tags": { latest: "1.0.0" },
      versions: { "1.0.0": { description: "lab package", license: "MIT" } },
      readme: "# lab",
    }),
    jsonResponse((u) => u.endsWith("/lab-pkg/latest"), { name: "lab-pkg", version: "1.0.0", dist: { integrity: "sha512-test" } }),
    jsonResponse((u) => u.endsWith("/lab-pkg@1.0.0/?meta"), {
      version: "1.0.0",
      files: [{ path: "/index.js", size: 30 }, { path: "/package.json", size: 80 }],
    }),
    jsonResponse((u) => u.endsWith("/lab-pkg@1.0.0/package.json"), { name: "lab-pkg", version: "1.0.0" }),
    jsonResponse((u) => u.endsWith("/lab-pkg@1.0.0/index.js"), { source: "benign" }),
  )
  const scripted = new ScriptedUi({
    picks: ["search", "lab-pkg", "info", undefined, "audit", undefined, "install", undefined, "back"],
    inputs: ["lab"],
    confirms: [true],
  })
  const fakePi = makeFakePi()

  await packagesScreen(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  // entrada, resultado, info, auditoría, instalación auditada y vuelta
  expect(scripted.customCalls).toBe(9)
  // El install pasa por pi.exec grabado, sin tocar la red de npm de verdad.
  expect(fakePi.execCalls).toEqual([{ cmd: "pi", args: ["install", "npm:lab-pkg@1.0.0"], ...fakePi.execCalls[0] }])
  expect(fakePi.execCalls[0]!.cmd).toBe("pi")
  expect(fakePi.execCalls[0]!.args).toEqual(["install", "npm:lab-pkg@1.0.0"])
  expect(scripted.notifications.some((n) => n.message.includes("Instalado lab-pkg"))).toBe(true)
  const auditStatuses = scripted.statuses.filter((s) => s.key === "alfred-audit")
  expect(auditStatuses.some((s) => s.value?.includes("auditando lab-pkg"))).toBe(true)
})

test("autopilot: enable-all deals every pending pack", async () => {
  const { autopilotScreen } = await loadScreens()
  const total = discoverDomains().length
  expect(total).toBeGreaterThan(0)
  const scripted = new ScriptedUi({ picks: ["enable-all", "back"] })
  const fakePi = makeFakePi()

  await autopilotScreen(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  const domains = JSON.parse(readFileSync(join(agent.dataDir, "domains.json"), "utf8")) as { enabled: Record<string, unknown> }
  expect(Object.keys(domains.enabled)).toHaveLength(total)
  expect(scripted.notifications.some((n) => n.message.includes("run /reload"))).toBe(true)
  expect(fakePi.execCalls).toEqual([])
  // El reparto es scope agent: nada en el cwd del repo.
  expect(existsSync(join(process.cwd(), ".pi"))).toBe(false)
})

test("autopilot: enable-all with every pack already enabled notifies and writes nothing", async () => {
  const { autopilotScreen } = await loadScreens()
  mkdirSync(agent.dataDir, { recursive: true })
  const enabled = Object.fromEntries(discoverDomains().map((d) => [d.manifest.id, { scope: "agent" }]))
  writeFileSync(join(agent.dataDir, "domains.json"), JSON.stringify({ enabled }, null, 2) + "\n")
  const before = readFileSync(join(agent.dataDir, "domains.json"), "utf8")
  const scripted = new ScriptedUi({ picks: ["enable-all", "back"] })
  const fakePi = makeFakePi()

  await autopilotScreen(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  expect(scripted.notifications.some((n) => n.message.includes("All packs already enabled"))).toBe(true)
  expect(readFileSync(join(agent.dataDir, "domains.json"), "utf8")).toBe(before)
  expect(fakePi.execCalls).toEqual([])
})

// ---------------------------------------------------------------------------
// Fontaneria de componentes: un ui.custom que invoca la factoria real y
// ejercita invalidate(), render() y el toggle-all del multiselect.

test("components: invalidate, render and toggle-all run on the real widgets", async () => {
  const { providersDashboard } = await loadScreens()
  seedModels(["lab-1"])
  routeFetch(jsonResponse((u) => u.endsWith("/models"), { data: [{ id: "lab-1" }, { id: "lab-9" }] }))
  const queue = ["provider:custom-lab", "models", "add", "discover", "back", "action:quit"]
  const components: Array<{ invalidated: boolean; rendered: boolean }> = []
  const NOT_SET = Symbol("not-set")
  const ui = {
    custom: async (factory: (tui: unknown, theme: unknown, kb: unknown, done: (v: unknown) => void) => unknown): Promise<unknown> => {
      let value: unknown = NOT_SET
      const done = (v: unknown): void => {
        value = v
      }
      const comp = factory({}, {}, {}, done) as { invalidate?(): void; render(w: number): string[]; handleInput(d: string): void }
      const record = { invalidated: false, rendered: false }
      if (typeof comp.invalidate === "function") {
        const origInvalidate = comp.invalidate.bind(comp)
        ;(comp as { invalidate(): void }).invalidate = () => {
          record.invalidated = true
          origInvalidate()
        }
        comp.invalidate()
      }
      record.rendered = comp.render(80).length > 0
      components.push(record)
      // "a" dos veces recorre toggleAll en ambos sentidos (marcar todo y
      // limpiar); Enter confirma la seleccion (vacia en el multiselect).
      comp.handleInput("a")
      comp.handleInput("a")
      comp.handleInput("\r")
      if (value === NOT_SET) done(queue.shift())
      return value
    },
    confirm: async () => false,
    input: async () => "",
    select: async () => undefined,
    editor: async () => undefined,
    notify: async () => {},
    setStatus: async () => {},
  }
  const fakePi = makeFakePi()

  await providersDashboard(fakePi.pi as never, makeJourneyCtx({ ui }) as never)

  // Cada dialogo paso por la factoria real: todos renderizan y los seis
  // picks (DashboardComponent) invocan invalidate; el multiselect no lo
  // implementa (es opcional en Component).
  expect(components.length).toBeGreaterThanOrEqual(5)
  expect(components.every((c) => c.rendered)).toBe(true)
  expect(components.filter((c) => c.invalidated)).toHaveLength(6)
  // El multiPick resolvio vacio por si mismo: la cola no se gasto de mas.
  // dashboard, menu, editor, como-add, multiPick, editor, dashboard
  expect(components).toHaveLength(7)
  expect(fakePi.execCalls).toEqual([])
})
