import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Jornada humana por /essentials: entrar y salir, y auditar un paquete con
// install rechazado. El fetch va mockeado (identidad de registry + unpkg) y
// pi.exec es un grabador: si el confirm llega en false, nada se instala.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch
let fetchCalls: string[] = []

interface MockResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

/** Respuesta JSON como texto: fetchText lee .text(), no .json(). */
const jsonText = (body: unknown): MockResponse => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) })

/** Mock del flujo de auditNpmPackage: registry, meta de unpkg, package.json y fuentes. */
function installAuditFetch(): void {
  fetchCalls = []
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    fetchCalls.push(url)
    let res: MockResponse
    if (url.startsWith("https://registry.npmjs.org/pi-subagents")) {
      res = jsonText({ name: "pi-subagents", version: "1.0.0", dist: { integrity: "sha512-x" } })
    } else if (url.endsWith("?meta")) {
      res = jsonText({ version: "1.0.0", files: [{ path: "/index.ts", size: 40 }, { path: "/package.json", size: 90 }] })
    } else if (url.endsWith("/package.json")) {
      res = jsonText({ name: "pi-subagents", version: "1.0.0" })
    } else {
      // cuerpo de fuente benigno para cualquier fichero de unpkg
      res = { ok: true, status: 200, text: () => Promise.resolve("export const ok = 1\n") }
    }
    return res as unknown as Response
  }) as unknown as typeof fetch
}

beforeEach(() => {
  agent = useTempAgentDir()
  installAuditFetch()
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("essentials: Back leaves without side effects", async () => {
  const { essentialsScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["back"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await essentialsScreen(fakePi.pi as never, ctx as never)

  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
  expect(fetchCalls).toEqual([])
})

test("essentials: audit a package, then decline install (pi.exec untouched)", async () => {
  const { essentialsScreen } = await loadScreens()
  // Menu -> pkg -> audit -> visor (Esc) -> menu -> pkg -> install -> visor
  // (Esc) -> confirm false -> menu -> Back. Sin confirm no hay pi install.
  const scripted = new ScriptedUi({
    picks: [
      "pkg:pi-subagents",
      undefined, // ficha editorial
      "audit",
      undefined,
      "pkg:pi-subagents",
      undefined, // ficha editorial
      "install",
      undefined,
      "back",
    ],
    confirms: [false],
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await essentialsScreen(fakePi.pi as never, ctx as never)

  // Dos auditorias completas contra el mock (identidad + meta + package.json + fuente).
  expect(fetchCalls.length).toBeGreaterThanOrEqual(8)
  // El status de auditoria siempre se limpia al terminar.
  expect(scripted.statuses.at(-1)).toEqual({ key: "alfred-audit", value: undefined })
  // Install rechazado: ningun pi exec, ninguna notificacion, nada escrito.
  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
  expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
})

test("essentials: separa la orquestación base de la avanzada y explica el motivo", async () => {
  const { essentialsScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: ["orchestration-base", undefined, "back", "orchestration-advanced", undefined, "back", "back"],
  })
  const rendered: string[][] = []
  const ui = {
    ...scripted.ui,
    custom: async (factory: unknown): Promise<unknown> => {
      const component = (
        factory as (
          tui: unknown,
          theme: unknown,
          kb: unknown,
          done: (value?: unknown) => void,
        ) => { render?(width: number): string[] }
      )({}, {}, {}, () => {})
      rendered.push(component.render?.(160) ?? [])
      return scripted.ui.custom(factory)
    },
  }
  const fakePi = makeFakePi()

  await essentialsScreen(fakePi.pi as never, makeJourneyCtx({ ui: ui as never }) as never)

  const base = rendered.find((lines) => lines[0]?.includes("Orquestación base"))?.join("\n") ?? ""
  const advanced = rendered.find((lines) => lines[0]?.includes("Orquestación avanzada"))?.join("\n") ?? ""
  expect(base).toContain("pi-subagents")
  expect(base).toContain("Motivo:")
  expect(advanced).toContain("pi-crew")
  expect(advanced).toContain("@quintinshaw/pi-dynamic-workflows")
  expect(advanced).toContain("Motivo:")
  expect(fetchCalls).toEqual([])
  expect(fakePi.execCalls).toEqual([])
})
