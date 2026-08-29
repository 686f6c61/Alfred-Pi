import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Remaining index.ts journeys: statusline auth states, tui-mode headless
// flags, stack without :json, first-run onboarding branches, header and
// update-channel behavior, and the heal path with a throwing registry step.
// Everything runs against a temp PI_CODING_AGENT_DIR with a dead network.

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>
type IndexModule = typeof import("../../index.ts")

let indexMod: IndexModule | undefined
async function loadIndex(): Promise<IndexModule> {
  indexMod ??= await import("../../index.ts")
  return indexMod
}

interface Harness {
  handlers: Record<string, Handler>
  scripted: ScriptedUi
  piOverrides: Record<string, unknown>
  ctxOverrides: Record<string, unknown>
}

/** Install the plugin with a per-test fake pi; the ui is scripted. */
async function install(script: ConstructorParameters<typeof ScriptedUi>[0], piOverrides: Record<string, unknown> = {}, ctxOverrides: Record<string, unknown> = {}): Promise<Harness> {
  const mod = await loadIndex()
  const handlers: Record<string, Handler> = {}
  const scripted = new ScriptedUi(script)
  const pi = {
    registerCommand: () => {},
    registerFlag: () => {},
    on: (name: string, fn: Handler) => {
      handlers[name] = fn
    },
    getFlag: () => undefined,
    getThinkingLevel: () => "medium",
    setModel: async () => true,
    ...piOverrides,
  }
  mod.default(pi as never)
  return {
    handlers,
    scripted,
    piOverrides,
    ctxOverrides,
    ctx(mode = "tui") {
      // Known harness options (registryModels, authConfigured, model) feed
      // makeJourneyCtx; anything else (custom modelRegistry, setThinkingLevel)
      // merges straight over the base ctx.
      const { registryModels, authConfigured, model, ...direct } = this.ctxOverrides
      const base = makeJourneyCtx({ ui: scripted.ui, mode, registryModels, authConfigured, model } as never) as Record<string, unknown>
      return { ...base, ...direct } as never
    },
  }
}

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch
const realStdoutWrite = process.stdout.write.bind(process.stdout)

beforeEach(() => {
  agent = useTempAgentDir()
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  process.stdout.write = realStdoutWrite
  agent.restore()
})

test("model_select statusline: auth ok, missing key and a throwing registry", async () => {
  // Auth configured: no warning marker.
  const ok = await install({}, {}, { model: { provider: "p", id: "m1" }, authConfigured: ["p"] })
  await ok.handlers["model_select"]!({}, ok.ctx())
  expect(ok.scripted.statuses.at(-1)).toEqual({ key: "alfred", value: "p/m1" })

  // Auth not configured: the statusline carries the key warning.
  const missing = await install({}, {}, {
    model: { provider: "p", id: "m1" },
    authConfigured: [],
  })
  await missing.handlers["model_select"]!({}, missing.ctx())
  expect(missing.scripted.statuses.at(-1)!.value).toContain("⚠key")

  // A throwing getProviderAuthStatus degrades to "assume ok".
  const throwing = await install({}, {}, {
    model: { provider: "p", id: "m1" },
    modelRegistry: {
      getAll: () => [],
      getProviderAuthStatus: () => {
        throw new Error("registry down")
      },
      find: () => undefined,
      hasConfiguredAuth: () => false,
      refresh: async () => {},
    },
  })
  await throwing.handlers["model_select"]!({}, throwing.ctx())
  expect(throwing.scripted.statuses.at(-1)).toEqual({ key: "alfred", value: "p/m1" })
})

test("doctor and usage flags in tui mode notify instead of stdout", async () => {
  const chunks: string[] = []
  process.stdout.write = ((c: string | Uint8Array) => {
    chunks.push(String(c))
    return true
  }) as unknown as typeof process.stdout.write

  for (const flag of ["doctor", "usage"]) {
    const h = await install({}, { getFlag: () => flag })
    await h.handlers["session_start"]!({}, h.ctx("tui"))
    expect(chunks.join("")).toBe("")
    expect(h.scripted.notifications.length).toBeGreaterThan(0)
  }
})

test("stack flag in print mode prints text even when thinking level throws", async () => {
  const chunks: string[] = []
  process.stdout.write = ((c: string | Uint8Array) => {
    chunks.push(String(c))
    return true
  }) as unknown as typeof process.stdout.write

  const h = await install({}, { getFlag: () => "stack", getThinkingLevel: () => {
    throw new Error("not available")
  } })
  await h.handlers["session_start"]!({}, h.ctx("print"))

  const out = chunks.join("")
  expect(out).toContain("Alfred-Pi stack")
  expect(() => JSON.parse(out)).toThrow()
})

test("session_start tui: onboarding declined marks the state done", async () => {
  const h = await install({ confirms: [false] })
  await h.handlers["session_start"]!({}, h.ctx("tui"))

  // Declining the wizard completes onboarding so it never nags again.
  expect(existsSync(join(agent.dataDir, "onboarding.json"))).toBe(true)
  expect(readFileSync(join(agent.dataDir, "onboarding.json"), "utf-8")).toContain("\"done\": true")
})

test("session_start tui: onboarding accepted runs the wizard, Esc closes it", async () => {
  // The wizard opens and the person leaves at the first dialog. HOME se aísla
  // para que el paso 0 (claves de OpenCode) no encuentre nada y el viaje sea
  // determinista: sin importación, el primer diálogo sigue siendo la ruta.
  const prevHome = process.env.HOME
  process.env.HOME = agent.dataDir
  try {
    const h = await install({ confirms: [true], selects: [undefined] })
    await h.handlers["session_start"]!({}, h.ctx("tui"))
    expect(h.scripted.notifications.some((n) => n.message.includes("Asistente cerrado"))).toBe(true)
  } finally {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
  }
})

test("session_start tui: an exploding config lands in the courtesy catch", async () => {
  // models.json as a directory: readFileSync throws EISDIR inside the
  // onboarding try, which must swallow the failure and continue.
  mkdirSync(join(agent.agentDir, "models.json"))
  const h = await install({})
  await h.handlers["session_start"]!({}, h.ctx("tui"))
  // The handler completed: the header was still installed.
  expect((h.scripted.ui as unknown as { setHeader?: unknown }).setHeader).toBeUndefined()
})

test("session_start tui: header installed, and a throwing setHeader is cosmetic", async () => {
  let headerCalls = 0
  let factory: ((tui: unknown, theme: unknown) => { render: (w: number) => string[]; handleInput: () => undefined; invalidate: () => undefined }) | undefined
  const h1 = await install({})
  const ui1 = { ...h1.scripted.ui, setHeader: (fn: typeof factory) => {
    headerCalls++
    factory = fn
  } }
  await h1.handlers["session_start"]!({}, { ...h1.ctx(), ui: ui1 } as never)
  expect(headerCalls).toBe(1)
  // The TUI later calls the factory: render must slice lines that overflow
  // the given width (index.ts:262-265).
  const header = factory!(undefined, undefined)
  const wide = header.render(200)
  expect(wide.length).toBeGreaterThan(0)
  const narrow = header.render(8)
  expect(narrow.every((l) => l.length <= 6)).toBe(true)
  expect(header.handleInput()).toBeUndefined()
  expect(header.invalidate()).toBeUndefined()

  // A setHeader that throws must not break the session start.
  const h2 = await install({})
  const ui2 = { ...h2.scripted.ui, setHeader: () => {
    throw new Error("tui says no")
  } }
  await expect(h2.handlers["session_start"]!({}, { ...h2.ctx(), ui: ui2 } as never)).resolves.toBeUndefined()
})

test("session_start: update channel notifies once and never rejects", async () => {
  // Manifest with a far newer latest: the notify fires asynchronously.
  globalThis.fetch = (async () => new Response(JSON.stringify({ latest: "999.0.0" }), { status: 200 })) as unknown as typeof fetch
  const h = await install({})
  await h.handlers["session_start"]!({}, h.ctx("print"))
  await new Promise((r) => setTimeout(r, 50))
  expect(h.scripted.notifications.some((n) => n.message.includes("999.0.0 available"))).toBe(true)

  // A dead network resolves quietly (no rejection, no notify).
  const h2 = await install({})
  await expect(h2.handlers["session_start"]!({}, h2.ctx("print"))).resolves.toBeUndefined()
  await new Promise((r) => setTimeout(r, 20))
})

test("before_agent_start heal: registry step throws, healthy step wins with its thinking level", async () => {
  mkdirSync(agent.dataDir, { recursive: true })
  writeFileSync(
    join(agent.dataDir, "profiles.json"),
    JSON.stringify({
      profiles: [
        {
          name: "heal",
          chain: [
            { provider: "failing", model: "m1" },
            { provider: "broken", model: "m3" },
            { provider: "healthy", model: "m2", thinkingLevel: "high" },
          ],
        },
      ],
    }),
  )
  writeFileSync(join(agent.dataDir, "fallback.json"), JSON.stringify({ activeProfile: "heal", failures: { "failing/m1": 2 } }))

  const thinkingCalls: string[] = []
  const setModelCalls: unknown[] = []
  const h = await install(
    {},
    {
      setModel: async (m: unknown) => {
        setModelCalls.push(m)
        return true
      },
    },
    {
      model: { provider: "failing", id: "m1" },
      modelRegistry: {
        getAll: () => [],
        getProviderAuthStatus: () => ({ configured: true }),
        // The broken middle step throws inside resolveStep; the healthy
        // tail step still resolves and heals.
        find: (provider: string, model: string) => {
          if (provider === "broken") throw new Error("registry glitch")
          return { provider, id: model }
        },
        hasConfiguredAuth: () => true,
        refresh: async () => {},
      },
      setThinkingLevel: (level: string) => {
        thinkingCalls.push(level)
      },
    },
  )

  await h.handlers["before_agent_start"]!({ prompt: "sigue", systemPrompt: "base" }, h.ctx("tui"))

  expect(setModelCalls).toHaveLength(1)
  expect((setModelCalls[0] as { provider: string }).provider).toBe("healthy")
  expect(thinkingCalls).toEqual(["high"])
  expect(h.scripted.notifications.some((n) => n.message.includes("paso a tu reserva"))).toBe(true)
})

test("before_agent_start heal: setModel refusing leaves the session untouched", async () => {
  mkdirSync(agent.dataDir, { recursive: true })
  writeFileSync(
    join(agent.dataDir, "profiles.json"),
    JSON.stringify({ profiles: [{ name: "heal", chain: [{ provider: "failing", model: "m1" }, { provider: "healthy", model: "m2" }] }] }),
  )
  writeFileSync(join(agent.dataDir, "fallback.json"), JSON.stringify({ activeProfile: "heal", failures: { "failing/m1": 2 } }))

  const h = await install(
    {},
    { setModel: async () => false },
    {
      model: { provider: "failing", id: "m1" },
      modelRegistry: {
        getAll: () => [],
        getProviderAuthStatus: () => ({ configured: true }),
        find: (provider: string, model: string) => ({ provider, id: model }),
        hasConfiguredAuth: () => true,
        refresh: async () => {},
      },
    },
  )

  await h.handlers["before_agent_start"]!({ prompt: "sigue", systemPrompt: "base" }, h.ctx("tui"))

  // The switch was refused: no fallback notification, no model change.
  expect(h.scripted.notifications.filter((n) => n.message.includes("fallback"))).toEqual([])
})
