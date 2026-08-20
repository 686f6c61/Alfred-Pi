import { test, expect, beforeEach, afterEach } from "bun:test"
import { ESSENTIALS } from "../../lib/essentials.ts"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Jornadas de instalación de esenciales. El registro y unpkg están simulados,
// y pi.exec solo graba la orden que habría recibido pi.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

function installCompleteAuditFetch(options: { incomplete?: boolean } = {}): void {
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    const registry = url.match(/^https:\/\/registry\.npmjs\.org\/(.+)\/latest$/)
    if (registry) {
      const name = decodeURIComponent(registry[1]!)
      return new Response(JSON.stringify({ name, version: "1.2.3", dist: { integrity: "sha512-test" } }))
    }
    if (url.endsWith("/?meta")) {
      return new Response(JSON.stringify({
        version: "1.2.3",
        files: [{ path: "/index.js", size: 30 }, { path: "/package.json", size: 80 }],
      }))
    }
    if (url.endsWith("/package.json")) {
      return new Response(JSON.stringify({ name: "fixture", version: "1.2.3" }))
    }
    if (url.endsWith("/index.js") && options.incomplete) return new Response("", { status: 503 })
    return new Response("export const seguro = true\n")
  }) as typeof fetch
}

beforeEach(() => {
  agent = useTempAgentDir()
  installCompleteAuditFetch()
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("essentials: muestra la ficha editorial e instala la versión auditada", async () => {
  const { essentialsScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "pkg:pi-mcp-adapter",
      undefined, // cerrar la ficha editorial
      "install",
      undefined, // cerrar el informe de auditoría
      "back",
    ],
    confirms: [true],
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
      rendered.push(component.render?.(120) ?? [])
      return scripted.ui.custom(factory)
    },
  }
  const fakePi = makeFakePi()

  await essentialsScreen(fakePi.pi as never, makeJourneyCtx({ ui: ui as never }) as never)

  expect(fakePi.execCalls).toEqual([{ cmd: "pi", args: ["install", "npm:pi-mcp-adapter@1.2.3"] }])
  const ficha = rendered.find((lines) => lines[0]?.includes("Ficha editorial"))?.join("\n") ?? ""
  expect(ficha).toContain("equipo Alfred-Pi")
  expect(ficha).toContain("2026-08-19")
  expect(scripted.notifications.some((n) => n.message.includes("Instalado pi-mcp-adapter"))).toBe(true)
  expect(scripted.statuses.at(-1)).toEqual({ key: "alfred-pkg", value: undefined })
})

test("essentials: instalar lo que falta enseña y confirma cada ficha por separado", async () => {
  const { essentialsScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "install-missing",
      ...ESSENTIALS.filter((pkg) => pkg.tier !== "advanced").flatMap(() => [undefined, undefined]),
      "back",
    ],
    confirms: ESSENTIALS.filter((pkg) => pkg.tier !== "advanced").map(() => true),
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await essentialsScreen(fakePi.pi as never, ctx as never)

  const bulkCandidates = ESSENTIALS.filter((pkg) => pkg.tier !== "advanced")
  expect(fakePi.execCalls).toHaveLength(bulkCandidates.length)
  expect(fakePi.execCalls.map((c) => c.args[1])).toEqual(bulkCandidates.map((p) => `npm:${p.id}@1.2.3`))
  expect(scripted.customCalls).toBe(2 + bulkCandidates.length * 2)
  expect(fakePi.execCalls.map((c) => c.args[1])).not.toContain("npm:pi-crew@1.2.3")
  expect(fakePi.execCalls.map((c) => c.args[1])).not.toContain("npm:@quintinshaw/pi-dynamic-workflows@1.2.3")
  expect(scripted.notifications.some((n) => n.message.includes("/reload"))).toBe(true)
})

test("essentials: una auditoría incompleta exige su propia confirmación", async () => {
  installCompleteAuditFetch({ incomplete: true })
  const { essentialsScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: ["pkg:pi-subagents", undefined, "install", undefined, "back"],
    confirms: [true],
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

  await essentialsScreen(fakePi.pi as never, makeJourneyCtx({ ui }) as never)

  expect(confirmations).toHaveLength(1)
  expect(confirmations[0]!.toLowerCase()).toContain("incompleta")
  expect(fakePi.execCalls).toEqual([{ cmd: "pi", args: ["install", "npm:pi-subagents@1.2.3"] }])
})

test("essentials: un error de auditoría no instala", async () => {
  globalThis.fetch = (async () => {
    throw new Error("sin red")
  }) as unknown as typeof fetch
  const { essentialsScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: ["pkg:pi-mcp-adapter", undefined, "install", undefined, "back"],
  })
  const fakePi = makeFakePi()

  await essentialsScreen(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications.some((n) => n.kind === "error" && n.message.includes("No se instalará"))).toBe(true)
})
