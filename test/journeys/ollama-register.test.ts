import { test, expect, beforeEach, afterEach } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Ollama journeys against a mocked local server: listing works, a model is
// registered in models.json (write accepted inside the temp dir) and the
// pull path streams NDJSON progress before its register confirm. The
// models.dev catalog fetch answers empty so no autofill happens.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

beforeEach(() => {
  agent = useTempAgentDir()
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "llama3.2", size: 123 }] }), { status: 200 })
    }
    if (url.endsWith("/api/ps")) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 })
    }
    if (url.endsWith("/api/pull")) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder()
          controller.enqueue(enc.encode('{"status":"pulling manifest"}\n{"status":"success"}\n'))
          controller.close()
        },
      })
      return new Response(body, { status: 200 })
    }
    if (url.includes("models.dev")) return new Response("{}", { status: 200 })
    throw new Error(`unexpected fetch: ${url}`)
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("ollama: register a listed model in models.json", async () => {
  const { ollamaScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "model:llama3.2", // ollama menu: the unregistered model
      "register", // model menu: register in pi
      undefined, // close the diff preview
      "back", // leave
    ],
    confirms: [true], // apply the write
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await ollamaScreen(fakePi.pi as never, ctx as never)

  const models = readFileSync(join(agent.agentDir, "models.json"), "utf-8")
  expect(models).toContain("llama3.2")
  expect(scripted.notifications.some((n) => n.message.includes("registered"))).toBe(true)
  expect(fakePi.execCalls).toEqual([])
})

test("ollama: pull a model, accept its register confirm", async () => {
  const { ollamaScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "pull", // ollama menu: pull
      "model:llama3.2", // after the pull the menu re-renders
      "register",
      undefined, // diff preview
      "back",
    ],
    inputs: ["llama3.2"],
    confirms: [true, true], // register? apply?
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await ollamaScreen(fakePi.pi as never, ctx as never)

  // Pull progress reached the statusline and the register wrote the model.
  expect(scripted.statuses.some((s) => (s.value ?? "").includes("pulling"))).toBe(true)
  expect(scripted.notifications.some((n) => n.message.includes("Pulled llama3.2"))).toBe(true)
  expect(readFileSync(join(agent.agentDir, "models.json"), "utf-8")).toContain("llama3.2")
})
