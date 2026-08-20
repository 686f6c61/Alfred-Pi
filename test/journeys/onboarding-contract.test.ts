import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { onboardingFlow } from "../../lib/onboarding-flow.ts"

interface UiScript {
  selects?: Array<number | undefined>
  inputs?: Array<string | undefined>
  confirms?: boolean[]
}

class OnboardingUi {
  private readonly selects: Array<number | undefined>
  private readonly inputs: Array<string | undefined>
  private readonly confirms: boolean[]
  readonly selectCalls: Array<{ title: string; items: string[] }> = []
  readonly confirmCalls: Array<{ title: string; subtitle?: string }> = []
  readonly notifications: Array<{ message: string; kind: string }> = []
  readonly rendered: string[] = []

  constructor(script: UiScript) {
    this.selects = [...(script.selects ?? [])]
    this.inputs = [...(script.inputs ?? [])]
    this.confirms = [...(script.confirms ?? [])]
  }

  private take<T>(queue: T[], what: string): T {
    if (queue.length === 0) throw new Error(`unexpected ${what}: queue exhausted`)
    return queue.shift() as T
  }

  readonly ui = {
    select: async (title: string, items: string[]): Promise<number | undefined> => {
      this.selectCalls.push({ title, items: [...items] })
      return this.take(this.selects, "select")
    },
    input: async (): Promise<string | undefined> => this.take(this.inputs, "input"),
    confirm: async (title: string, subtitle?: string): Promise<boolean> => {
      this.confirmCalls.push({ title, subtitle })
      return this.take(this.confirms, "confirm")
    },
    notify: async (message: string, kind = "info"): Promise<void> => {
      this.notifications.push({ message, kind })
    },
    setStatus: async (): Promise<void> => {},
    custom: async (factory: unknown): Promise<unknown> =>
      await new Promise((resolve) => {
        const component = (
          factory as (
            tui: unknown,
            theme: unknown,
            kb: unknown,
            done: (value?: unknown) => void,
          ) => { render?(width: number): string[]; handleInput?(data: string): void } | undefined
        )({}, {}, {}, resolve)
        this.rendered.push(...(component?.render?.(240) ?? []))
        if (component?.handleInput) {
          for (let i = 0; i < 40; i++) {
            component.handleInput("j")
            this.rendered.push(...(component.render?.(240) ?? []))
          }
          component.handleInput("\x1b")
        } else resolve(undefined)
      }),
  }
}

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined
}

function okCloudFetch(models: string[]): typeof fetch {
  return (async (): Promise<Response> =>
    ({ ok: true, status: 200, json: async () => ({ data: models.map((id) => ({ id })) }) }) as unknown as Response) as typeof fetch
}

async function inAgent(
  fn: (agentDir: string) => Promise<void>,
): Promise<void> {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onboarding-contract-"))
  try {
    await fn(agentDir)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
}

async function run(
  agentDir: string,
  scripted: OnboardingUi,
  options: {
    pi?: unknown
    modelRegistry?: unknown
  } = {},
): Promise<void> {
  await onboardingFlow(
    options.pi as never,
    { ui: scripted.ui, modelRegistry: options.modelRegistry } as never,
    { agentDir, repoRoot: agentDir },
  )
}

test("onboarding pregunta primero por el recorrido humano y Saltar difiere", async () => {
  await inAgent(async (agentDir) => {
    const scripted = new OnboardingUi({ selects: [3] })
    await run(agentDir, scripted)

    expect(scripted.selectCalls[0]?.items).toEqual([
      "Ya pago una nube o tengo una clave",
      "Solo mi máquina",
      "Uso una pasarela",
      "Saltar por ahora",
    ])
    expect(scripted.selectCalls[0]?.items.every((item) => !item.includes("://") && !item.includes("xai-grok"))).toBe(true)
    const state = readJson<{ done: boolean; status?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state).toMatchObject({ done: false, status: "deferred" })
  })
})

test("onboarding deriva una suscripción nativa a login sin matar el asistente", async () => {
  await inAgent(async (agentDir) => {
    let fetchCalls = 0
    globalThis.fetch = (async (): Promise<Response> => {
      fetchCalls++
      throw new Error("no debía sondear")
    }) as unknown as typeof fetch
    const scripted = new OnboardingUi({ selects: [0, 0] })
    await run(agentDir, scripted)

    expect(fetchCalls).toBe(0)
    expect(scripted.notifications.some((n) => n.message.includes("/login"))).toBe(true)
    const state = readJson<{ done: boolean; status?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state).toMatchObject({ done: false, status: "deferred" })
  })
})

test("onboarding bloquea un fallo de sonda rechazado y conserva el motivo", async () => {
  await inAgent(async (agentDir) => {
    globalThis.fetch = (async (): Promise<Response> =>
      ({ ok: false, status: 401, text: async () => "" }) as unknown as Response) as unknown as typeof fetch
    const scripted = new OnboardingUi({ selects: [0, 1], inputs: [""], confirms: [false] })
    await run(agentDir, scripted)

    const state = readJson<{ done: boolean; status?: string; blockedReason?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state?.done).toBe(false)
    expect(state?.status).toBe("blocked")
    expect(state?.blockedReason).toContain("xai-grok")
    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
  })
})

test("onboarding enseña el diff real y rechazarlo difiere sin escribir", async () => {
  await inAgent(async (agentDir) => {
    globalThis.fetch = okCloudFetch(["modelo-prueba"])
    const scripted = new OnboardingUi({ selects: [0, 1], inputs: [""], confirms: [false] })
    await run(agentDir, scripted)

    const preview = scripted.rendered.join("\n")
    expect(preview).toContain("+++ models.json (new file)")
    expect(preview).toContain('"defaultProvider": "xai-grok"')
    expect(preview).toContain("Clave: no configurada")
    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
    expect(existsSync(join(agentDir, "settings.json"))).toBe(false)
    const state = readJson<{ done: boolean; status?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state).toMatchObject({ done: false, status: "deferred" })
  })
})

test("onboarding activa el modelo escrito y deja el cierre de permisos como opción", async () => {
  await inAgent(async (agentDir) => {
    globalThis.fetch = okCloudFetch(["modelo-activo"])
    const scripted = new OnboardingUi({ selects: [0, 1], inputs: [""], confirms: [true, false, false] })
    const setModelCalls: unknown[] = []
    let refreshCalls = 0
    const model = { provider: "xai-grok", id: "modelo-activo" }
    await run(agentDir, scripted, {
      pi: {
        setModel: async (value: unknown) => {
          setModelCalls.push(value)
          return true
        },
      },
      modelRegistry: {
        refresh: async () => {
          refreshCalls++
        },
        find: (provider: string, id: string) => provider === model.provider && id === model.id ? model : undefined,
      },
    })

    expect(refreshCalls).toBe(1)
    expect(setModelCalls).toEqual([model])
    expect(scripted.notifications.some((n) => n.message.includes("ya está activo en esta sesión"))).toBe(true)
    expect(scripted.notifications.some((n) => n.message.includes("@gotgenes/pi-permission-system") && n.message.includes("si tú lo decides"))).toBe(true)
    expect(scripted.confirmCalls).toHaveLength(3)
  })
})

test("onboarding explica cómo activar cuando pi no ofrece setModel", async () => {
  await inAgent(async (agentDir) => {
    globalThis.fetch = okCloudFetch(["modelo-guardado"])
    const scripted = new OnboardingUi({ selects: [0, 1], inputs: [""], confirms: [true, false, false] })
    await run(agentDir, scripted)

    expect(scripted.notifications.some((n) => n.message.includes("/model") && n.message.includes("no permite activar"))).toBe(true)
    expect(scripted.notifications.at(-1)?.message).not.toBe("Listo. Escribe /reload.")
  })
})

test("onboarding local bloquea Ollama apagado con un comando de recuperación", async () => {
  await inAgent(async (agentDir) => {
    globalThis.fetch = (async (): Promise<Response> => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const scripted = new OnboardingUi({ selects: [1, 0] })
    await run(agentDir, scripted)

    const state = readJson<{ status?: string; blockedReason?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state?.status).toBe("blocked")
    expect(state?.blockedReason).toContain("ECONNREFUSED")
    expect(scripted.notifications.some((n) => n.message.includes("ollama serve"))).toBe(true)
    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
  })
})

test("onboarding local distingue Ollama vacío y no descarga nada", async () => {
  await inAgent(async (agentDir) => {
    const requests: RequestInfo[] = []
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      requests.push(input as RequestInfo)
      return { ok: true, status: 200, json: async () => ({ models: [] }) } as unknown as Response
    }) as unknown as typeof fetch
    const scripted = new OnboardingUi({ selects: [1, 0] })
    await run(agentDir, scripted)

    const state = readJson<{ status?: string; blockedReason?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state?.status).toBe("blocked")
    expect(state?.blockedReason).toContain("no tiene modelos")
    expect(scripted.notifications.some((n) => n.message.includes("/ollama"))).toBe(true)
    expect(requests.every((request) => String(request).endsWith("/api/tags"))).toBe(true)
  })
})

test("onboarding local registra un Ollama listo y activa su primer modelo", async () => {
  await inAgent(async (agentDir) => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ input, init })
      return { ok: true, status: 200, json: async () => ({ models: [{ name: "qwen2.5-coder:7b" }] }) } as unknown as Response
    }) as unknown as typeof fetch
    const scripted = new OnboardingUi({ selects: [1, 0], confirms: [true, false, false] })
    const setModelCalls: unknown[] = []
    const model = { provider: "ollama", id: "qwen2.5-coder:7b" }
    await run(agentDir, scripted, {
      pi: { setModel: async (value: unknown) => (setModelCalls.push(value), true) },
      modelRegistry: { refresh: async () => {}, find: () => model },
    })

    const settings = readJson<{ defaultProvider?: string; defaultModel?: string }>(join(agentDir, "settings.json"))
    expect(settings).toMatchObject({ defaultProvider: "ollama", defaultModel: "qwen2.5-coder:7b" })
    expect(setModelCalls).toEqual([model])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.init?.method ?? "GET").toBe("GET")
  })
})

test("onboarding local deriva llama.cpp al recorrido nativo", async () => {
  await inAgent(async (agentDir) => {
    let fetchCalls = 0
    globalThis.fetch = (async (): Promise<Response> => {
      fetchCalls++
      throw new Error("no debía sondear")
    }) as unknown as typeof fetch
    const scripted = new OnboardingUi({ selects: [1, 1] })
    await run(agentDir, scripted)

    expect(fetchCalls).toBe(0)
    expect(scripted.notifications.some((n) => n.message.includes("/login") && n.message.includes("llama.cpp"))).toBe(true)
    const state = readJson<{ done: boolean; status?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state).toMatchObject({ done: false, status: "deferred" })
  })
})
