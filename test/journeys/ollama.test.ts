import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Jornada humana por /ollama contra un servidor mockeado: listar y salir, y
// tirar de un modelo con registro rechazado. Ningun exec, ningun models.json.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch
let fetchCalls: string[] = []

interface MockResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  body: null
}

/** Mock del servidor ollama: /api/tags, /api/ps y /api/pull. */
function installOllamaFetch(): void {
  fetchCalls = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    fetchCalls.push(url)
    let res: MockResponse
    if (url.endsWith("/api/tags")) {
      res = {
        ok: true,
        status: 200,
        body: null,
        json: () => Promise.resolve({ models: [{ name: "llama3.2:latest", size: 2019393189, details: { parameter_size: "3B" } }] }),
      }
    } else if (url.endsWith("/api/ps")) {
      res = { ok: true, status: 200, body: null, json: () => Promise.resolve({ models: [] }) }
    } else if (url.endsWith("/api/pull")) {
      // Sin cuerpo: ollamaPull lo trata como descarga completada.
      res = { ok: true, status: 200, body: null, json: () => Promise.resolve({}) }
    } else {
      res = { ok: false, status: 404, body: null, json: () => Promise.resolve({}) }
    }
    void init
    return res as unknown as Response
  }) as unknown as typeof fetch
}

beforeEach(() => {
  agent = useTempAgentDir()
  installOllamaFetch()
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("ollama: Back leaves after listing models", async () => {
  const { ollamaScreen } = await loadScreens()
  const scripted = new ScriptedUi({ picks: ["back"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await ollamaScreen(fakePi.pi as never, ctx as never)

  // El listado pregunta tags y ps una sola vez; nada mas ocurre.
  expect(fetchCalls).toHaveLength(2)
  expect(scripted.customCalls).toBe(1)
  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications).toEqual([])
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
})

test("ollama: pull a model, decline registration", async () => {
  const { ollamaScreen } = await loadScreens()
  // Listado (tags+ps) -> pull -> input -> POST /api/pull -> confirm en false
  // -> listado de nuevo -> Back.
  const scripted = new ScriptedUi({ picks: ["pull", "back"], inputs: ["llama3.2"], confirms: [false] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await ollamaScreen(fakePi.pi as never, ctx as never)

  // Dos listados (antes y despues del pull) mas el propio pull.
  expect(fetchCalls.filter((u) => u.endsWith("/api/tags"))).toHaveLength(2)
  expect(fetchCalls.filter((u) => u.endsWith("/api/pull"))).toHaveLength(1)
  expect(scripted.notifications).toEqual([{ message: "Pulled llama3.2", kind: "info" }])
  // Registro rechazado: ni models.json ni exec ni cambio de modelo.
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
})
