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
