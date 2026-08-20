import { test, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { onboardingFlow } from "../../lib/onboarding-flow.ts"
import { PROVIDER_PRESETS } from "../../lib/presets.ts"

// Viajes extra del asistente de primer arranque (onda 3): presupuesto
// aceptado, autopilot si/no, cancelaciones intermedias y el camino de
// "guardar igual" cuando el probe falla. Doble de ui encolado y fetch
// mockeado: cero red, todo en temporales.

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

interface Script {
  select?: Array<number | undefined>
  input?: Array<string | undefined>
  confirm?: boolean[]
}

/** Doble encolado: cada dialogo desencola su respuesta; cola agotada = error. */
function queuedUi(script: Script): { ui: unknown; confirms: number; inputs: number; confirmations: Array<{ title: string; description?: string }> } {
  const s = {
    select: [...(script.select ?? [])],
    input: [...(script.input ?? [])],
    confirm: [...(script.confirm ?? [])],
    confirms: 0,
    inputs: 0,
    confirmations: [] as Array<{ title: string; description?: string }>,
  }
  const take = <T>(queue: T[], what: string): T => {
    if (queue.length === 0) throw new Error(`unexpected ${what}: queue exhausted`)
    return queue.shift() as T
  }
  return {
    get confirms() {
      return s.confirms
    },
    get inputs() {
      return s.inputs
    },
    get confirmations() {
      return s.confirmations
    },
    ui: {
      select: async () => take<number | undefined>(s.select, "select"),
      input: async () => {
        s.inputs++
        return take<string | undefined>(s.input, "input")
      },
      confirm: async (title: string, description?: string) => {
        s.confirms++
        s.confirmations.push({ title, description })
        return take<boolean>(s.confirm, "confirm")
      },
      notify: async () => {},
      setStatus: async () => {},
    },
  }
}

function okFetch(models: string[]): typeof fetch {
  return (async (): Promise<Response> =>
    ({ ok: true, status: 200, json: async () => ({ data: models.map((id) => ({ id })) }) }) as unknown as Response) as typeof fetch
}

function failFetch(): typeof fetch {
  return (async (): Promise<Response> =>
    ({ ok: false, status: 401, text: async () => "" }) as unknown as Response) as typeof fetch
}

async function runFlow(ui: unknown, dirs: { agentDir: string; repoRoot: string }): Promise<void> {
  const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
  const pi = undefined as unknown as Parameters<typeof onboardingFlow>[0]
  await onboardingFlow(pi, ctx, dirs)
}

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined
}

function fixturePacks(repoRoot: string, count: number): void {
  for (let i = 1; i <= count; i++) {
    const id = `pack-${String(i).padStart(2, "0")}`
    const dir = join(repoRoot, "packs", id)
    mkdirSync(join(dir, "skills", `${id}-skill`), { recursive: true })
    writeFileSync(join(dir, "skills", `${id}-skill`, "SKILL.md"), `---\ndescription: ${id}\n---\n# ${id}\n`)
    writeFileSync(join(dir, "domain.json"), JSON.stringify({ id, name: id, description: "test pack" }))
  }
}

test("onboarding: probe ok and a positive budget is persisted", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-more-budget-"))
  try {
    globalThis.fetch = okFetch(["m1", "m2"])
    // clave vacia; confirma escritura; rechaza autopilot; acepta presupuesto 7.5
    const scripted = queuedUi({ select: [0, 1], input: ["", "7.5"], confirm: [true, false, true] })
    await runFlow(scripted.ui, { agentDir, repoRoot: agentDir })

    const budget = readJson<{ dailyMaxUsd?: number }>(join(agentDir, "alfred-pi", "budget.json"))
    expect(budget?.dailyMaxUsd).toBe(7.5)
    const state = readJson<{ done: boolean; completedSteps: string[] }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state?.done).toBe(true)
    expect(state?.completedSteps).toContain("budget:7.5")
    const guardian = scripted.confirmations.find((confirmation) => confirmation.title.includes("presupuesto diario"))
    expect(guardian?.description).toContain("lee tus sesiones locales y te avisa")
    expect(guardian?.description).toContain("no te corta ni envía datos a ningún sitio")
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding: autopilot yes deals every pack and flips the switch", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-more-auto-yes-"))
  const repoRoot = mkdtempSync(join(tmpdir(), "pi686-onb-more-auto-repo-"))
  try {
    fixturePacks(repoRoot, 3)
    globalThis.fetch = okFetch(["m1"])
    // escritura si, autopilot si, presupuesto no
    const scripted = queuedUi({ select: [0, 1], input: [""], confirm: [true, true, false] })
    await runFlow(scripted.ui, { agentDir, repoRoot })

    const auto = readJson<{ enabled?: boolean; enabledAt?: string }>(join(agentDir, "alfred-pi", "autopilot.json"))
    expect(auto?.enabled).toBe(true)
    expect(auto?.enabledAt).toBeTruthy()
    const domains = readJson<{ enabled: Record<string, unknown> }>(join(agentDir, "alfred-pi", "domains.json"))
    expect(Object.keys(domains?.enabled ?? {})).toHaveLength(3)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test("onboarding: autopilot no leaves no switch file", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-more-auto-no-"))
  try {
    globalThis.fetch = okFetch(["m1"])
    const scripted = queuedUi({ select: [0, 1], input: [""], confirm: [true, false, false] })
    await runFlow(scripted.ui, { agentDir, repoRoot: agentDir })

    expect(scripted.confirms).toBe(3)
    expect(existsSync(join(agentDir, "alfred-pi", "autopilot.json"))).toBe(false)
    expect(existsSync(join(agentDir, "alfred-pi", "domains.json"))).toBe(false)
    // El proveedor si quedo escrito: solo el radar quedo apagado.
    expect(existsSync(join(agentDir, "models.json"))).toBe(true)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding: refusing the plan write cancels before any file lands", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-more-cancel-plan-"))
  try {
    globalThis.fetch = okFetch(["m1"])
    const scripted = queuedUi({ select: [0, 1], input: [""], confirm: [false] })
    await runFlow(scripted.ui, { agentDir, repoRoot: agentDir })

    expect(scripted.confirms).toBe(1)
    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
    expect(existsSync(join(agentDir, "settings.json"))).toBe(false)
    expect(existsSync(join(agentDir, "alfred-pi", "autopilot.json"))).toBe(false)
    const state = readJson<{ done: boolean; status?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state).toMatchObject({ done: false, status: "deferred" })
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding: key on an unapproved origin, confirm false cancels the wizard", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-more-cancel-origin-"))
  try {
    // custom-openai no trae credentialPolicy: una clave literal dispara la
    // aprobacion de origen. El fetch falla a proposito: si el flujo llegara
    // al probe, el test lo delataria por los archivos escritos.
    globalThis.fetch = failFetch()
    const idx = PROVIDER_PRESETS.findIndex((p) => p.id === "custom-openai")
    expect(idx).toBeGreaterThanOrEqual(0)
    const scripted = queuedUi({ select: [2, 2], input: ["sk-lab-literal"], confirm: [false] })
    await runFlow(scripted.ui, { agentDir, repoRoot: agentDir })

    expect(scripted.confirms).toBe(1)
    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
    expect(existsSync(join(agentDir, "settings.json"))).toBe(false)
    expect(existsSync(join(agentDir, "auth.json"))).toBe(false)
    const state = readJson<{ done: boolean; status?: string }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state).toMatchObject({ done: false, status: "deferred" })
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding: Esc at the key input is treated as empty, the wizard continues", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-more-esc-key-"))
  try {
    globalThis.fetch = okFetch(["m1"])
    // Caracterizacion: el input de clave no tiene semantica de cancelacion
    // hoy; Esc (undefined) equivale a clave vacia y el asistente sigue.
    const scripted = queuedUi({ select: [0, 1], input: [undefined, ""], confirm: [true, false, false] })
    await runFlow(scripted.ui, { agentDir, repoRoot: agentDir })

    const models = readJson<{ providers: Record<string, { apiKey?: string }> }>(join(agentDir, "models.json"))
    const presetId = PROVIDER_PRESETS[0]!.id
    expect(models?.providers[presetId]?.apiKey).toBeUndefined()
    expect(existsSync(join(agentDir, "settings.json"))).toBe(true)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboarding: failed probe with save-anyway writes the provider without models", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-more-saveanyway-"))
  try {
    globalThis.fetch = failFetch()
    // guardar igual si; escritura si; autopilot y presupuesto no
    const scripted = queuedUi({ select: [0, 1], input: [""], confirm: [true, true, false, false] })
    await runFlow(scripted.ui, { agentDir, repoRoot: agentDir })

    expect(scripted.confirms).toBe(4)
    const models = readJson<{ providers: Record<string, { baseUrl?: string; models?: Array<{ id: string }> }> }>(join(agentDir, "models.json"))
    const presetId = PROVIDER_PRESETS[0]!.id
    expect(models?.providers[presetId]?.baseUrl).toBe(PROVIDER_PRESETS[0]!.baseUrl)
    // Sin discovery no hay modelos ni defaultModel.
    expect(models?.providers[presetId]?.models).toBeUndefined()
    const settings = readJson<{ defaultProvider?: string; defaultModel?: string }>(join(agentDir, "settings.json"))
    expect(settings?.defaultProvider).toBe(presetId)
    expect(settings?.defaultModel).toBeUndefined()
    const state = readJson<{ done: boolean; completedSteps: string[] }>(join(agentDir, "alfred-pi", "onboarding.json"))
    expect(state?.done).toBe(true)
    expect(state?.completedSteps).toContain("probe")
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})
