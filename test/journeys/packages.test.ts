import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"
import { saveAuditReceipt } from "../../lib/pkg-audit.ts"

// Jornada humana por /packages: busqueda con query vacio y fuente git auditada
// en local (fixture en tmp, sin clone real ni red). El confirm en false deja
// pi.exec sin una sola llamada.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch
let fetchCalls: string[] = []

function installRecordingFetch(): void {
  fetchCalls = []
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    fetchCalls.push(url)
    const body = url.startsWith("https://registry.npmjs.org/-/v1/search")
      ? { objects: [] }
      : { downloads: 0 }
    return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response
  }) as unknown as typeof fetch
}

function installPackageAuditFetch(): void {
  fetchCalls = []
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    fetchCalls.push(url)
    if (url.startsWith("https://registry.npmjs.org/-/v1/search")) {
      return new Response(JSON.stringify({
        objects: [{ package: { name: "lab-pkg", version: "2.3.4", description: "paquete de prueba" } }],
      }))
    }
    if (url.startsWith("https://api.npmjs.org/downloads")) {
      return new Response(JSON.stringify({ downloads: 420 }))
    }
    if (url === "https://registry.npmjs.org/lab-pkg") {
      return new Response(JSON.stringify({
        "dist-tags": { latest: "2.3.4" },
        time: { "2.3.4": "2026-08-18T10:30:00.000Z" },
        versions: {
          "2.3.4": {
            description: "paquete de prueba",
            repository: { url: "git+https://github.com/example/lab-pkg.git" },
            license: "MIT",
            type: "module",
            _npmUser: { name: "editora-lab" },
            dist: { unpackedSize: 12_345 },
            dependencies: { alfa: "^1.0.0", beta: "^2.0.0" },
            pi: { extensions: ["./index.ts"], skills: ["./skills/lab"] },
          },
        },
        readme: "# Lab",
      }))
    }
    const registry = url.match(/^https:\/\/registry\.npmjs\.org\/(.+)\/latest$/)
    if (registry) {
      const name = decodeURIComponent(registry[1]!)
      return new Response(JSON.stringify({ name, version: "2.3.4", dist: { integrity: "sha512-test" } }))
    }
    if (url.endsWith("/?meta")) {
      return new Response(JSON.stringify({
        version: "2.3.4",
        files: [{ path: "/index.js", size: 30 }, { path: "/package.json", size: 80 }],
      }))
    }
    if (url.endsWith("/package.json")) {
      return new Response(JSON.stringify({ name: "fixture", version: "2.3.4" }))
    }
    return new Response("export const seguro = true\n")
  }) as typeof fetch
}

beforeEach(() => {
  agent = useTempAgentDir()
  installRecordingFetch()
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("packages: empty search query ends in a warning and Back", async () => {
  const { packagesScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["search", "back"], inputs: [""] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await packagesScreen(fakePi.pi as never, ctx as never)

  // Una sola peticion de busqueda; cero resultados -> aviso, sin exec.
  expect(fetchCalls).toHaveLength(1)
  expect(scripted.notifications).toEqual([{ message: "Ningún paquete de pi coincide con la búsqueda", kind: "warning" }])
  expect(fakePi.execCalls).toEqual([])
})

test("packages: el buscador audita e instala la versión exacta", async () => {
  installPackageAuditFetch()
  const { packagesScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: ["search", "lab-pkg", "install", undefined, "back"],
    inputs: ["lab"],
    confirms: [true],
  })
  const fakePi = makeFakePi()

  await packagesScreen(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  expect(fakePi.execCalls).toEqual([{ cmd: "pi", args: ["install", "npm:lab-pkg@2.3.4"] }])
  expect(scripted.statuses.some((s) => s.key === "alfred-audit" && s.value?.includes("lab-pkg"))).toBe(true)
})

test("packages: la tarjeta de confianza muestra metadatos, recibo y aviso de permisos", async () => {
  installPackageAuditFetch()
  saveAuditReceipt(agent.dataDir, {
    name: "lab-pkg",
    version: "2.3.4",
    installSpec: "lab-pkg@2.3.4",
    ok: true,
    complete: true,
    filesSelected: 2,
    filesFetched: 2,
    filesSkipped: [],
    filesScanned: 2,
    bytesScanned: 240,
    findings: [],
    domains: ["api.example.test"],
  })
  const { packagesScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: ["search", "lab-pkg", "info", undefined, "back", "back"],
    inputs: ["lab"],
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

  await packagesScreen(fakePi.pi as never, makeJourneyCtx({ ui: ui as never }) as never)

  const card = rendered.find((lines) => lines[0]?.includes("Tarjeta de confianza"))?.join("\n") ?? ""
  expect(card).toContain("Editor: editora-lab")
  expect(card).toContain("Fecha de versión: 2026-08-18")
  expect(card).toContain("Licencia: MIT")
  expect(card).toContain("Tipo: module")
  expect(card).toContain("Tamaño desempaquetado: 12.345 B")
  expect(card).toContain("Dependencias directas (2): alfa, beta")
  expect(card).toContain("Repositorio: https://github.com/example/lab-pkg.git")
  expect(card).toContain("Manifiesto pi: extensions: ./index.ts; skills: ./skills/lab")
  expect(card).toContain("Alcance de red: api.example.test")
  expect(card).toContain("Popularidad: 420 descargas en el último mes")
  expect(card).toContain("Curaduría: vivo")
  expect(card).toContain("Este paquete corre con tus permisos")
  expect(fakePi.execCalls).toEqual([])
})

test("packages: la memoria por proyecto requiere opt-in y nunca instala paquetes", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi686-memory-project-"))
  try {
    const { packagesScreen } = await loadScreens()
    const scripted = new ScriptedUi({ picks: ["memory", "back"], confirms: [true] })
    const fakePi = makeFakePi()

    await packagesScreen(
      fakePi.pi as never,
      makeJourneyCtx({ ui: scripted.ui, cwd: projectRoot }) as never,
    )

    const policy = JSON.parse(readFileSync(join(projectRoot, ".alfred-pi", "memory-policy.json"), "utf8")) as { allow?: boolean }
    expect(policy.allow).toBe(true)
    expect(fakePi.execCalls).toEqual([])
    expect(scripted.notifications.some((n) => n.message.includes("Memoria por proyecto activada"))).toBe(true)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test("packages: local-first enseña el aviso y reutiliza la instalación auditada", async () => {
  installPackageAuditFetch()
  const { packagesScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: ["local-first", "@mjasnikovs/pi-task", undefined, "install", undefined, "back", "back"],
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
      rendered.push(component.render?.(160) ?? [])
      return scripted.ui.custom(factory)
    },
  }
  const fakePi = makeFakePi()

  await packagesScreen(fakePi.pi as never, makeJourneyCtx({ ui: ui as never }) as never)

  const card = rendered.find((lines) => lines[0]?.includes("Local-first, @mjasnikovs/pi-task"))?.join("\n") ?? ""
  expect(card).toContain("Planificación estructurada para modelos locales")
  expect(fakePi.execCalls).toEqual([{ cmd: "pi", args: ["install", "npm:@mjasnikovs/pi-task@2.3.4"] }])
})

test("packages: un recomendado de pack usa la misma auditoría e identidad", async () => {
  installPackageAuditFetch()
  const { domainsScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: ["domain:ai-agents", "packages", "pi-subagents", undefined, "back"],
    confirms: [true],
  })
  const fakePi = makeFakePi()

  await domainsScreen(fakePi.pi as never, makeJourneyCtx({ ui: scripted.ui }) as never)

  expect(fakePi.execCalls).toEqual([{ cmd: "pi", args: ["install", "npm:pi-subagents@2.3.4"] }])
})

test("packages: git source audited locally, install declined (no exec, no network)", async () => {
  const { packagesScreen } = await loadScreens()
  // Fixture local: gitSourceKind la clasifica como "local" y se escanea en
  // sitio, sin clone, sin fetch y sin git real.
  const fixture = mkdtempSync(join(tmpdir(), "pi686-pkg-git-"))
  mkdirSync(join(fixture, "lib"), { recursive: true })
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ name: "fixture-pkg", version: "0.0.1" }))
  writeFileSync(join(fixture, "lib", "index.ts"), "export const fine = 1\n")
  try {
    const scripted = new ScriptedUi({
      picks: ["git", undefined, "back"],
      inputs: [fixture],
      confirms: [false],
    })
    const fakePi = makeFakePi()
    const ctx = makeJourneyCtx({ ui: scripted.ui })

    await packagesScreen(fakePi.pi as never, ctx as never)

    // Auditoria local: ninguna peticion de red, ningun comando ejecutado.
    expect(fetchCalls).toEqual([])
    expect(fakePi.execCalls).toEqual([])
    expect(scripted.notifications).toEqual([])
    expect(scripted.statuses.some((s) => s.key === "alfred-audit" && s.value === undefined)).toBe(true)
    expect(existsSync(join(agent.agentDir, "settings.json"))).toBe(false)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
