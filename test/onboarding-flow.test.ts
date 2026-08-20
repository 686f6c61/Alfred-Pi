import { test, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadModels } from "../lib/config-io.ts"
import { onboardingFlow } from "../lib/onboarding-flow.ts"
import { PROVIDER_PRESETS } from "../lib/presets.ts"

test("loadModels_rejects_string", () => {
  // Types-only: FilePaths is the configuration layer's single unit, so a raw
  // path string must not compile. The helper is never invoked at runtime.
  const rejectString = () =>
    // @ts-expect-error a raw path string must be rejected by the compiler
    loadModels("/tmp")
  expect(typeof rejectString).toBe("function")
})

test("orchestration_uses_getPaths", () => {
  // Source-level contract: the orchestrator derives one FilePaths bundle and
  // hands it to every config consumer instead of raw dataDir strings.
  const source = readFileSync(join(import.meta.dir, "..", "index.ts"), "utf-8")
  expect(source).toContain("getPaths(agentDir)")
  // The orchestrator still builds one FilePaths bundle and hands it to the
  // turn curator; loadProfiles lives in that service, not in the adapter.
  expect(source).toContain("curateTurn(")
  expect(source).toContain("paths,")
  const curator = readFileSync(join(import.meta.dir, "..", "lib", "curate-turn.ts"), "utf-8")
  expect(curator).toContain("loadProfiles(paths)")
  expect(source).not.toContain("loadProfiles(getDataDir")
})

// ---------------------------------------------------------------------------
// onboarding_flow_preserves_existing_settings: drives the wizard end to end
// with a mocked UI and a mocked provider endpoint (no network), then checks
// that pre-existing settings survive the write.
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

test("onboarding_flow_preserves_existing_settings", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-agent-"))
  try {
    // Pre-existing user settings that the wizard must not clobber.
    writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: ["keep-me"], theme: "dark" }, null, 2) + "\n")

    // The liveness probe asks GET <baseUrl>/models; answer with a tiny list
    // so the flow reaches the write step without any "save anyway" confirm.
    globalThis.fetch = (async (): Promise<Response> => {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "test-model-1" }, { id: "test-model-2" }] }) } as unknown as Response
    }) as unknown as typeof fetch

    // Minimal UI script: first preset, empty key, confirm the plan write,
    // decline autopilot and budget. setStatus/notify are visual no-ops.
    let confirmCalls = 0
    let selectCalls = 0
    const ui = {
      select: async () => selectCalls++ === 0 ? 0 : 1,
      input: async () => "",
      confirm: async () => ++confirmCalls === 1,
      notify: async () => {},
      setStatus: async () => {},
    }
    const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
    const pi = undefined as unknown as Parameters<typeof onboardingFlow>[0]

    await onboardingFlow(pi, ctx, { agentDir, repoRoot: agentDir })

    const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")) as { packages?: string[]; defaultProvider?: string }
    // The wizard did write its defaults...
    expect(settings.defaultProvider).toBe("xai-grok")
    // ...without clobbering what the user already had.
    expect(settings.packages).toContain("keep-me")
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// onboarding_flow_deals_all_cards: accepting the autopilot step must run the
// same "deal all cards" routine as the autopilot screen, so domains.json in
// the test dataDir ends up with one record per pack in the test repoRoot.
// ---------------------------------------------------------------------------

function fixturePacks(repoRoot: string, count: number): void {
  for (let i = 1; i <= count; i++) {
    const id = `pack-${String(i).padStart(2, "0")}`
    const dir = join(repoRoot, "packs", id)
    mkdirSync(join(dir, "skills", `${id}-skill`), { recursive: true })
    writeFileSync(join(dir, "skills", `${id}-skill`, "SKILL.md"), `---\ndescription: ${id}\n---\n# ${id}\n`)
    writeFileSync(join(dir, "domain.json"), JSON.stringify({ id, name: id, description: "test pack" }))
  }
}

test("onboarding_flow_deals_all_cards", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-deal-"))
  const repoRoot = mkdtempSync(join(tmpdir(), "pi686-onb-repo-"))
  try {
    fixturePacks(repoRoot, 11)

    globalThis.fetch = (async (): Promise<Response> => {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "test-model-1" }] }) } as unknown as Response
    }) as unknown as typeof fetch

    // Accept everything: plan write, autopilot (which triggers the deal) and
    // the budget prompt (empty input makes it a no-op).
    let selectCalls = 0
    const ui = {
      select: async () => selectCalls++ === 0 ? 0 : 1,
      input: async () => "",
      confirm: async () => true,
      notify: async () => {},
      setStatus: async () => {},
    }
    const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
    const pi = undefined as unknown as Parameters<typeof onboardingFlow>[0]

    await onboardingFlow(pi, ctx, { agentDir, repoRoot })

    const domainsFile = join(agentDir, "alfred-pi", "domains.json")
    const domainsState = JSON.parse(readFileSync(domainsFile, "utf-8")) as { enabled: Record<string, unknown> }
    expect(Object.keys(domainsState.enabled)).toHaveLength(11)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// A-TST-06 characterization set: queued ui doubles + mocked fetch drive the
// wizard through the four contract points (failed probe, accepted write,
// skip, zero budget) without any network or real dialogs.
// ---------------------------------------------------------------------------

/** Queued ui double: every dialog shifts its answer from a script; an
 *  exhausted queue throws so unexpected dialogs fail loudly. */
function queuedUi(script: {
  select?: Array<number | undefined>
  input?: string[]
  confirm?: boolean[]
}): { ui: unknown; confirmCalls: number } {
  const state = { select: [...(script.select ?? [])], input: [...(script.input ?? [])], confirm: [...(script.confirm ?? [])], confirmCalls: 0 }
  const take = <T>(queue: T[], dialog: string): T => {
    if (queue.length === 0) throw new Error(`unexpected ${dialog} dialog: queue exhausted`)
    return queue.shift() as T
  }
  return {
    confirmCalls: 0,
    ui: {
      select: async () => take<number | undefined>(state.select, "select"),
      input: async () => take<string>(state.input, "input"),
      confirm: async () => {
        state.confirmCalls++
        return take<boolean>(state.confirm, "confirm")
      },
      notify: async () => {},
      setStatus: async () => {},
    },
    get confirmCalls() {
      return state.confirmCalls
    },
  }
}

function okFetch(models: string[]): typeof fetch {
  return (async (): Promise<Response> => {
    return { ok: true, status: 200, json: async () => ({ data: models.map((id) => ({ id })) }) } as unknown as Response
  }) as unknown as typeof fetch
}

async function runFlow(ui: unknown, agentDir: string): Promise<void> {
  const ctx = { ui } as unknown as Parameters<typeof onboardingFlow>[1]
  const pi = undefined as unknown as Parameters<typeof onboardingFlow>[0]
  await onboardingFlow(pi, ctx, { agentDir, repoRoot: agentDir })
}

test("onboardingFlow_reject_after_failed_probe", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-401-"))
  try {
    // Provider answers 401: liveness fails, then the user declines to save.
    globalThis.fetch = (async (): Promise<Response> => {
      return { ok: false, status: 401, text: async () => "" } as unknown as Response
    }) as unknown as typeof fetch

    const { ui } = queuedUi({ select: [0, 1], input: [""], confirm: [false] })
    await runFlow(ui, agentDir)

    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
    expect(existsSync(join(agentDir, "settings.json"))).toBe(false)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboardingFlow_accept_writes_preset", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-acc-"))
  try {
    // Eight models discovered: the write keeps at most five.
    globalThis.fetch = okFetch(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"])

    const { ui } = queuedUi({ select: [0, 1], input: [""], confirm: [true, false, false] })
    await runFlow(ui, agentDir)

    const models = JSON.parse(readFileSync(join(agentDir, "models.json"), "utf8")) as {
      providers: Record<string, { models?: Array<{ id: string }> }>
    }
    const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")) as { defaultProvider?: string; defaultModel?: string }
    const presetId = PROVIDER_PRESETS[0]!.id
    expect(settings.defaultProvider).toBe(presetId)
    expect(models.providers[presetId]).toBeDefined()
    expect((models.providers[presetId]!.models ?? []).length).toBeLessThanOrEqual(5)
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboardingFlow_skip_defers", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-skip-"))
  try {
    globalThis.fetch = okFetch(["m1"])

    // Select "Saltar": onboarding remains resumable with no write dialogs.
    const { ui, confirmCalls } = queuedUi({ select: [3] })
    await runFlow(ui, agentDir)

    expect(confirmCalls).toBe(0)
    expect(existsSync(join(agentDir, "models.json"))).toBe(false)
    expect(existsSync(join(agentDir, "settings.json"))).toBe(false)
    const state = JSON.parse(readFileSync(join(agentDir, "alfred-pi", "onboarding.json"), "utf8")) as { done: boolean; status?: string }
    expect(state).toMatchObject({ done: false, status: "deferred" })
  } finally {
    rmSync(agentDir, { recursive: true, force: true })
  }
})

test("onboardingFlow_zero_budget_not_saved", async () => {
  for (const raw of ["0", "abc"]) {
    const agentDir = mkdtempSync(join(tmpdir(), "pi686-onb-budget-"))
    try {
      globalThis.fetch = okFetch(["m1"])

      // Key, then the budget amount: 0 / non-numeric must not persist.
      const { ui } = queuedUi({ select: [0, 1], input: ["", raw], confirm: [true, false, true] })
      await runFlow(ui, agentDir)

      expect(existsSync(join(agentDir, "alfred-pi", "budget.json"))).toBe(false)
    } finally {
      rmSync(agentDir, { recursive: true, force: true })
    }
  }
})
