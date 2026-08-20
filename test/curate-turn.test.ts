import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { curateTurn } from "../lib/curate-turn.ts"
import { getPaths } from "../lib/config-io.ts"
import { loadFallbackState } from "../lib/fallback.ts"
import { presupuestoStatus, relevoAviso, salaStatus } from "../lib/house-copy.ts"

// curateTurn: the pure per-turn curation service extracted from the
// before_agent_start adapter (A-TST-09). RED while lib/curate-turn.ts
// does not exist. No pi imports inside: everything arrives via TurnInput.

const REPO = new URL("..", import.meta.url).pathname

let agentDir: string

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi686-curate-"))
})

afterEach(() => {
  rmSync(agentDir, { recursive: true, force: true })
})

const dataDir = () => join(agentDir, "alfred-pi")

test("curateTurn_heal_on_threshold", () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(
    join(dataDir(), "profiles.json"),
    JSON.stringify({ profiles: [{ name: "heal", chain: [{ provider: "failing", model: "m1" }, { provider: "healthy", model: "m2" }] }] }),
  )
  // Two consecutive failures already recorded: the threshold is crossed.
  writeFileSync(join(dataDir(), "fallback.json"), JSON.stringify({ activeProfile: "heal", failures: { "failing/m1": 2 } }))

  const patch = curateTurn(
    { paths: getPaths(agentDir), repoRoot: REPO, prompt: "sigue", systemPrompt: "base", model: { provider: "failing", id: "m1" } },
    { resolveStep: () => true },
  )
  expect(patch.heal).toEqual({ provider: "healthy", model: "m2" })
  expect(patch.healNotify?.text).toBe(relevoAviso("failing/m1", "healthy/m2"))
  expect(patch.healNotify?.text).toContain("paso a tu reserva")
  // The model we leave is stored so a later undo can come back.
  expect(loadFallbackState(dataDir()).previousModel).toEqual({ provider: "failing", model: "m1" })
})

test("curateTurn_one_pack_autopilot", () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(join(dataDir(), "autopilot.json"), JSON.stringify({ enabled: true, routing: "context" }))

  const patch = curateTurn({ paths: getPaths(agentDir), repoRoot: REPO, prompt: "audita la seguridad de este repo y dime vulnerabilidades", systemPrompt: "base" })
  expect(patch.systemPrompt ?? "").toContain("# Security")
  expect(patch.systemPrompt ?? "").not.toContain("# Clean Code")
  expect(patch.domainStatus).toBe(salaStatus("security"))
  expect(patch.domainStatus).not.toContain("dom:")
})

test("curateTurn_autopilot_on_without_pack_is_sin_sala", () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(join(dataDir(), "autopilot.json"), JSON.stringify({ enabled: true, routing: "context" }))

  const patch = curateTurn({
    paths: getPaths(agentDir),
    repoRoot: REPO,
    cwd: agentDir,
    prompt: "arregla este bug",
    systemPrompt: "base",
  })
  expect(patch.domainStatus).toBe("sin sala")
  expect(patch.systemPrompt ?? "").not.toContain("<domain-packs>")
})

test("curateTurn_budget_exceeded", () => {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(join(dataDir(), "budget.json"), JSON.stringify({ dailyMaxUsd: 0.001 }))
  writeFileSync(
    join(agentDir, "models.json"),
    JSON.stringify({ providers: { p: { baseUrl: "https://p.example/v1", api: "openai-completions", models: [{ id: "m", cost: { input: 3, output: 15 } }] } } }),
  )
  // Today's session: 1M input tokens at $3/M blows the $0.001 cap.
  const sessionsDir = join(agentDir, "sessions", "proj")
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(
    join(sessionsDir, "s.jsonl"),
    [
      JSON.stringify({ type: "session", id: "s", cwd: agentDir }),
      JSON.stringify({ type: "message", timestamp: new Date().toISOString(), message: { role: "assistant", provider: "p", model: "m", usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 } } }),
    ].join("\n") + "\n",
  )

  const patch = curateTurn({ paths: getPaths(agentDir), repoRoot: REPO, prompt: "sigue con lo anterior", systemPrompt: "base", personaDelivered: false })
  expect(patch.systemPrompt ?? "").toContain("<budget-exceeded>")
  expect(patch.budgetStatus).toBe(presupuestoStatus(300000, 0.001))
  expect(patch.budgetStatus?.toLowerCase()).not.toContain("budget")
  // Persona directive rides along exactly once per session.
  expect(patch.message).toBeTruthy()
  const again = curateTurn({ paths: getPaths(agentDir), repoRoot: REPO, prompt: "sigue con lo anterior", systemPrompt: "base", personaDelivered: true })
  expect(again.systemPrompt ?? "").toContain("<budget-exceeded>")
  expect(again.message).toBeUndefined()
})

test("curateTurn_rejects_bad_FilePaths", () => {
  // Types-only: TurnInput.paths is FilePaths, so a raw string must not
  // compile. The helper is never invoked at runtime.
  const rejectString = () =>
    // @ts-expect-error paths must be a FilePaths object, not a string
    curateTurn({ paths: "/tmp/agent", prompt: "x" })
  expect(typeof rejectString).toBe("function")
})
