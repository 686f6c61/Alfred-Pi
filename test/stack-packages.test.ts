import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { collectStack, formatStackText, type StackInfo } from "../lib/stack.ts"
import { presupuestoStatus } from "../lib/house-copy.ts"

// N-STK-01 / P-17: si hay paquetes en settings, /stack avisa (advisory)
// de que pi puede instalarlos al confiar el repo y que /packages los audita.
// Nunca bloquea ni instala.

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-stk-pkg-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function stubStack(over: Partial<StackInfo> = {}): StackInfo {
  return {
    model: {},
    defaults: {},
    autopilot: { enabled: false, routing: "context" },
    fallback: {},
    domains: { enabled: [], packs: 0, skillsAvailable: 0, promptsAvailable: 0 },
    packages: [],
    budget: { spentTodayUsd: 0 },
    health: [],
    generatedAt: "2026-08-19T12:00:00.000Z",
    ...over,
  }
}

test("formatStackText_packages_advisory_when_listed", () => {
  const text = formatStackText(stubStack({ packages: ["npm:evil-pkg"] })).join("\n")
  expect(text).toContain("npm:evil-pkg")
  expect(text).toContain("/packages")
  expect(text.toLowerCase()).toMatch(/trust/)
  expect(text.toLowerCase()).toMatch(/audit/)
  expect(text.toLowerCase()).toMatch(/advisor|advisory|never blocks|does not block/)
})

test("formatStackText_packages_no_advisory_when_empty", () => {
  const text = formatStackText(stubStack({ packages: [] })).join("\n")
  expect(text).toContain("(none installed)")
  expect(text).not.toContain("/packages")
  expect(text.toLowerCase()).not.toMatch(/auto-install/)
  expect(text.toLowerCase()).not.toMatch(/trust the repo|trust this repo/)
})

test("collectStack_reads_project_pi_settings_packages", () => {
  const repoRoot = join(dir, "proj")
  const agentDir = join(dir, "agent")
  mkdirSync(join(repoRoot, ".pi"), { recursive: true })
  mkdirSync(join(agentDir, "sessions"), { recursive: true })
  writeFileSync(join(repoRoot, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:from-project"] }))

  const info = collectStack({ agentDir, repoRoot, discover: () => [] })
  expect(info.packages).toContain("npm:from-project")
  const text = formatStackText(info).join("\n")
  expect(text).toContain("npm:from-project")
  expect(text).toContain("/packages")
})

test("collectStack_unions_agent_and_project_packages", () => {
  const repoRoot = join(dir, "proj")
  const agentDir = join(dir, "agent")
  mkdirSync(join(repoRoot, ".pi"), { recursive: true })
  mkdirSync(join(agentDir, "sessions"), { recursive: true })
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: ["git:x", "npm:shared"] }))
  writeFileSync(join(repoRoot, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:from-project", "npm:shared"] }))

  const info = collectStack({ agentDir, repoRoot, discover: () => [] })
  expect(info.packages).toEqual(["git:x", "npm:shared", "npm:from-project"])
})

test("collectStack_agent_settings_packages_also_trigger_advisory", () => {
  const agentDir = join(dir, "agent")
  const repoRoot = join(dir, "empty-proj")
  mkdirSync(join(agentDir, "sessions"), { recursive: true })
  mkdirSync(repoRoot, { recursive: true })
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: ["git:x"] }))

  const info = collectStack({ agentDir, repoRoot, discover: () => [] })
  expect(info.packages).toEqual(["git:x"])
  expect(formatStackText(info).join("\n")).toContain("/packages")
})

test("stack_ts_does_not_install_or_block", () => {
  const source = readFileSync(join(import.meta.dir, "..", "lib", "stack.ts"), "utf-8")
  expect(source).not.toMatch(/pi\.exec|installSpec|child_process/)
  expect(source).not.toMatch(/throw new Error\(/)
})

test("formatStackText_speaks_house_copy_modelo_listo", () => {
  const text = formatStackText(stubStack({ model: { provider: "ollama", id: "m1" } })).join("\n")
  expect(text).toContain("modelo listo")
  expect(text).not.toContain("dom:")
  expect(text.toLowerCase()).not.toMatch(/budget\s+\d+%\s+of/)
})

test("formatStackText_speaks_house_copy_presupuesto_al", () => {
  const text = formatStackText(stubStack({ budget: { maxUsd: 5, spentTodayUsd: 4 } })).join("\n")
  expect(text).toContain("presupuesto al 80 %")
  expect(text).toContain(presupuestoStatus(80, 5))
  expect(text.toLowerCase()).not.toContain("budget")
})

test("formatStackText_falla_tu_clave_when_remote_key_missing", () => {
  const agentDir = join(dir, "agent-nokey")
  const repoRoot = join(dir, "proj-nokey")
  mkdirSync(join(agentDir, "sessions"), { recursive: true })
  mkdirSync(repoRoot, { recursive: true })
  writeFileSync(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        paid: { baseUrl: "https://api.example/v1", api: "openai-completions", models: [{ id: "big" }] },
      },
    }),
  )

  const info = collectStack({ agentDir, repoRoot, model: { provider: "paid", id: "big" }, discover: () => [] })
  expect(info.model.keyOk).toBe(false)
  const text = formatStackText(info).join("\n")
  expect(text).toContain("falla tu clave")
  expect(text).not.toContain("modelo listo")
})
