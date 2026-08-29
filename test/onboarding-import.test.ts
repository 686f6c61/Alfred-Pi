import { test, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadModels } from "../lib/config-io.ts"
import { onboardingFlow } from "../lib/onboarding-flow.ts"
import type { OpencodeImportItem } from "../lib/import-sources.ts"

// Journey: primera sesión con claves ya guardadas en OpenCode. Paso 0 del
// asistente las encuentra, una confirmación las importa, la sonda habla con
// un endpoint falso y el modelo por defecto queda escrito sin teclear nada.

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

test("onboarding_imports_opencode_servers_and_sets_default_model", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-imp-"))
  try {
    globalThis.fetch = (async (): Promise<Response> => {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "glm-4.7" }, { id: "glm-4.7-air" }] }) } as unknown as Response
    }) as unknown as typeof fetch

    const items: OpencodeImportItem[] = [
      {
        sourceId: "zai-coding-plan",
        kind: "preset",
        presetId: "zai-coding",
        presetLabel: "z.ai GLM (Coding Plan)",
        baseUrl: "https://api.z.ai/api/coding",
        key: "zl-key-e2e-1234567890",
        keyMasked: "zl-key-… (22 chars)",
      },
    ]

    // UI script: confirmar importación, autorizar origen, aplicar plan,
    // declinar autopilot y presupuesto.
    let confirmCalls = 0
    const ui = {
      confirm: async (title: string) => {
        confirmCalls += 1
        if (confirmCalls === 1) return title.includes("OpenCode")
        if (confirmCalls === 2) return title.includes("Autorizar claves")
        return confirmCalls === 3 // aplicar plan; luego se declinan extras
      },
      notify: async () => {},
      setStatus: async () => {},
      select: async () => undefined,
      input: async () => "",
    }
    const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
    const pi = { setModel: async () => true } as unknown as Parameters<typeof onboardingFlow>[0]

    await onboardingFlow(pi, ctx, {
      agentDir,
      repoRoot: agentDir,
      importScan: () => items,
    })

    const models = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf-8")) as {
      providers?: Record<string, { baseUrl?: string; apiKey?: string; models?: { id: string }[] }>
    }
    const zai = models.providers?.["zai-coding"]
    expect(zai).toBeDefined()
    expect(zai?.baseUrl).toBe("https://api.z.ai/api/coding")
    expect(zai?.apiKey).toBe("zl-key-e2e-1234567890")
    expect(zai?.models?.map((m) => m.id)).toContain("glm-4.7")

    const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")) as {
      defaultProvider?: string
      defaultModel?: string
    }
    expect(settings.defaultProvider).toBe("zai-coding")
    expect(settings.defaultModel).toBe("glm-4.7")
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding_with_declined_import_falls_back_to_classic_wizard", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-imp2-"))
  try {
    globalThis.fetch = (async (): Promise<Response> => {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "test-model-1" }] }) } as unknown as Response
    }) as unknown as typeof fetch

    // UI: rechaza la importación, acepta todo lo demás del asistente clásico
    // (ruta nube → preset xai-grok).
    let confirms = 0
    let selects = 0
    const ui = {
      confirm: async () => ++confirms !== 1,
      select: async () => ++selects === 1 ? 0 : 1,
      input: async () => "",
      notify: async () => {},
      setStatus: async () => {},
    }
    const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
    const pi = undefined as unknown as Parameters<typeof onboardingFlow>[0]

    await onboardingFlow(pi, ctx, {
      agentDir,
      repoRoot: agentDir,
      importScan: () => [
        {
          sourceId: "ollama-cloud",
          kind: "preset",
          presetId: "ollama-cloud",
          presetLabel: "Ollama Cloud",
          baseUrl: "https://ollama.com/v1",
          key: "oc-key",
          keyMasked: "oc-key… (6 chars)",
        },
      ],
    })

    // El clásico escribió el preset elegido (primera nube = xai-grok).
    const models = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf-8")) as {
      providers?: Record<string, unknown>
    }
    expect(models.providers?.["xai-grok"]).toBeDefined()
    // Y la importación declinada no escribió el suyo.
    expect(models.providers?.["ollama-cloud"]).toBeUndefined()
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding_without_scanner_keeps_no_import_step", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-imp3-"))
  try {
    // Sin importScan (comportamiento por defecto de lib/ pura): el paso 0 no
    // existe y el asistente clásico arranca por la ruta.
    let confirms = 0
    const ui = {
      select: async () => 3, // saltar por ahora
      confirm: async () => ++confirms,
      notify: async () => {},
      input: async () => "",
      setStatus: async () => {},
    }
    const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
    await onboardingFlow(undefined as never, ctx, { agentDir, repoRoot: agentDir })
    // saltar → difiere y no escribe modelos
    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
    expect(confirms).toBe(0)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding_imports_guided_url_and_azure_headers_flow_to_probe_and_config", async () => {
  // Dos servidores: opencode-go sin URL en OpenCode (el asistente la pide,
  // sugerencia Zen) y azure-openai con cabecera api-key de $ENV. La sonda
  // captura las cabeceras reales para probar que la clave viaja donde toca.
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-imp4-"))
  try {
    process.env.AZURE_OPENAI_API_KEY = "az-env-key-999"
    const captured: Array<Record<string, string>> = []
    globalThis.fetch = (async (_url: string | URL, init?: { headers?: Record<string, string> }): Promise<Response> => {
      captured.push(init?.headers ?? {})
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "model-x" }] }) } as unknown as Response
    }) as unknown as typeof fetch

    let confirms = 0
    let inputs = 0
    const ui = {
      confirm: async () => ++confirms <= 3, // importar, autorizar 2 orígenes, aplicar
      input: async (t: string) => {
        inputs += 1
        return t.includes("opencode-go") ? "https://opencode.ai/zen/v1" : "https://mi-recurso.openai.azure.com/openai/v1"
      },
      notify: async () => {},
      setStatus: async () => {},
      select: async () => undefined,
    }
    const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
    const pi = { setModel: async () => true } as unknown as Parameters<typeof onboardingFlow>[0]

    await onboardingFlow(pi, ctx, {
      agentDir,
      repoRoot: agentDir,
      importScan: () => [
        { sourceId: "opencode-go", kind: "custom", suggestedUrl: "https://opencode.ai/zen/v1", key: "zen-key-000", keyMasked: "zen-key…" },
        { sourceId: "azure", kind: "preset", presetId: "azure-openai", presetLabel: "Azure OpenAI (avanzado)", baseUrl: "https://mi-recurso.openai.azure.com/openai/v1", key: "$AZURE_OPENAI_API_KEY", keyMasked: "az-env-k…" },
      ],
    })

    const models = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf-8")) as {
      providers?: Record<string, { baseUrl?: string; apiKey?: string; headers?: Record<string, string> }>
    }
    // la URL guiada se usó…
    expect(models.providers?.["opencode-go"]?.baseUrl).toBe("https://opencode.ai/zen/v1")
    // …y las cabeceras de Azure llegaron resueltas a la config
    expect(models.providers?.["azure-openai"]?.headers).toEqual({ "api-key": "az-env-key-999" })
    // la sonda recibió la autorización correcta en ambas
    const lowered = captured.map((h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])))
    expect(lowered.some((h) => h["authorization"] === "Bearer zen-key-000")).toBe(true)
    expect(lowered.some((h) => h["api-key"] === "az-env-key-999")).toBe(true)
    expect(inputs).toBe(1) // solo opencode-go pidió URL
  } finally {
    delete process.env.AZURE_OPENAI_API_KEY
    rmSync(agentDir, { recursive: true, force: true })
  }
})
