import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installedNpmPackages, isEssentialInstalled, missingEssentials, ESSENTIALS } from "../lib/essentials.ts"
import { collectUsage, aggregateUsage, costOfTokens, formatUsageReport, pricingTable } from "../lib/usage.ts"
import { recordTurnOutcome, nextStepAfter, loadFallbackState, saveFallbackState, modelKey, FAILURE_THRESHOLD } from "../lib/fallback.ts"
import type { SettingsFile, ModelsFile } from "../lib/config-io.ts"

// ---------------------------------------------------------------------------
// Essentials

test("installedNpmPackages handles scoped, versioned and local sources", () => {
  const settings: SettingsFile = {
    packages: [
      "npm:pi-mcp-adapter",
      "npm:@juicesharp/rpiv-todo",
      "npm:pi-lens@2.1.0",
      "npm:@gotgenes/pi-permission-system@^1.0.0",
      "../../.local/share/teacher-cli/packages/teacher",
      "npm:@ollama/pi-web-search",
    ],
  }
  const installed = installedNpmPackages(settings)
  expect(installed.has("pi-mcp-adapter")).toBe(true)
  expect(installed.has("@juicesharp/rpiv-todo")).toBe(true)
  expect(installed.has("pi-lens")).toBe(true)
  expect(installed.has("@gotgenes/pi-permission-system")).toBe(true)
  expect(installed.has("@ollama/pi-web-search")).toBe(true)
  expect(installed.has("teacher")).toBe(false)
})

test("isEssentialInstalled and missingEssentials", () => {
  const settings: SettingsFile = { packages: ["npm:pi-mcp-adapter", "npm:pi-lens"] }
  const mcp = ESSENTIALS.find((p) => p.id === "pi-mcp-adapter")!
  const lens = ESSENTIALS.find((p) => p.id === "pi-lens")!
  const todos = ESSENTIALS.find((p) => p.id === "@juicesharp/rpiv-todo")!
  expect(isEssentialInstalled(settings, mcp)).toBe(true)
  expect(isEssentialInstalled(settings, lens)).toBe(true)
  expect(isEssentialInstalled(settings, todos)).toBe(false)
  const missing = missingEssentials(settings)
  expect(missing.some((m) => m.id === todos.id)).toBe(true)
  expect(missing.some((m) => m.id === mcp.id)).toBe(false)
})

// ---------------------------------------------------------------------------
// Usage

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-usage-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function seedSession(lines: unknown[]): void {
  const project = join(dir, "sessions", "--tmp-proj--")
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, "2026-08-15T10-00-00Z_s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n")
}

const models: ModelsFile = {
  providers: {
    paid: {
      baseUrl: "https://paid.example/v1",
      api: "openai-completions",
      models: [
        { id: "big", cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
        { id: "free" }, // no pricing
      ],
    },
  },
}

function assistantEntry(provider: string, model: string, at: string, usage: Record<string, number>): unknown {
  return {
    type: "message",
    id: "x",
    timestamp: at,
    message: { role: "assistant", content: [], provider, model, usage },
  }
}

test("collectUsage parses session header, assistant usage and filters by date", () => {
  const now = new Date()
  const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000).toISOString()
  seedSession([
    { type: "session", version: 3, id: "s1", timestamp: iso(2), cwd: "/tmp/proj" },
    { type: "model_change", provider: "paid", modelId: "big" },
    assistantEntry("paid", "big", iso(2), { input: 1000, output: 100, cacheRead: 500, cacheWrite: 0, reasoning: 20 }),
    assistantEntry("paid", "free", iso(1), { input: 200, output: 50, cacheRead: 0, cacheWrite: 0, reasoning: 0 }),
    assistantEntry("paid", "big", "2020-01-01T10:00:00Z", { input: 999, output: 999, cacheRead: 0, cacheWrite: 0, reasoning: 0 }),
    { type: "message", id: "u1", timestamp: iso(2), message: { role: "user", content: [] } }, // not counted
  ])
  const { records } = collectUsage(join(dir, "sessions"))
  expect(records).toHaveLength(3)
  expect(records[0]!.cwd).toBe("/tmp/proj")
  expect(records[0]!.sessionId).toBe("s1")
  expect(records[0]!.input).toBe(1000)

  const recent = collectUsage(join(dir, "sessions"), 1) // last 24h: excludes the 2020 record
  expect(recent.records).toHaveLength(2)
  expect(recent.records.every((r) => r.at.startsWith(new Date().toISOString().slice(0, 4)))).toBe(true)
})

test("aggregateUsage computes cost, flags unpriced models, aggregates by day/session", () => {
  seedSession([
    { type: "session", version: 3, id: "s1", timestamp: "2026-08-15T10:00:00Z", cwd: "/tmp/proj" },
    assistantEntry("paid", "big", "2026-08-15T10:01:00Z", { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 }),
    assistantEntry("paid", "free", "2026-08-15T10:02:00Z", { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 }),
    assistantEntry("paid", "big", "2026-08-14T09:00:00Z", { input: 500_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }),
  ])
  const { records } = collectUsage(join(dir, "sessions"))
  const report = aggregateUsage(records, models)

  // big: 1M*3/1M + 1M*15/1M + 500k*3/1M = 3 + 15 + 1.5 = 19.5
  expect(report.byModel.find((m) => m.model === "big")!.cost).toBeCloseTo(19.5)
  expect(report.byModel.find((m) => m.model === "free")!.priced).toBe(false)
  expect(report.cost).toBeCloseTo(19.5)
  expect(report.turns).toBe(3)
  expect(report.pricedTurns).toBe(2)
  expect(report.sessions).toBe(1)
  expect(report.byDay.map((d) => d.day)).toEqual(["2026-08-15", "2026-08-14"])
  expect(report.topSessions[0]!.turns).toBe(3)

  const text = formatUsageReport(report).join("\n")
  expect(text).toContain("$19.5")
  expect(text).toContain("no pricing")
})

test("costOfTokens and pricingTable basics", () => {
  const table = pricingTable(models)
  expect(table.has("paid/big")).toBe(true)
  expect(table.has("paid/free")).toBe(false)
  const { cost, priced } = costOfTokens({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }, table.get("paid/big"))
  expect(priced).toBe(true)
  expect(cost).toBeCloseTo(3)
  const unpriced = costOfTokens({ input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }, undefined)
  expect(unpriced.priced).toBe(false)
})

// ---------------------------------------------------------------------------
// Fallback

test("recordTurnOutcome counts consecutive failures and resets on success", () => {
  const state = { failures: {} }
  expect(recordTurnOutcome(state, "p", "m", "error")).toBe(false)
  expect(recordTurnOutcome(state, "p", "m", "error")).toBe(true) // crossed threshold
  expect(recordTurnOutcome(state, "p", "m", "error")).toBe(false) // already above, no re-signal
  expect(state.failures[modelKey("p", "m")]).toBe(3)
  expect(recordTurnOutcome(state, "p", "m", "stop")).toBe(false)
  expect(state.failures[modelKey("p", "m")]).toBeUndefined()
  expect(FAILURE_THRESHOLD).toBeGreaterThanOrEqual(2)
})

test("nextStepAfter picks the next healthy step after the failed one", () => {
  const profile = { name: "x", chain: [{ provider: "a", model: "1" }, { provider: "b", model: "2" }, { provider: "c", model: "3" }] }
  const healthy = (s: { provider: string; model: string }) => s.provider !== "b"
  expect(nextStepAfter(profile, "a", "1", healthy)).toEqual({ provider: "c", model: "3" })
  expect(nextStepAfter(profile, "c", "3", healthy)).toBeUndefined()
  // model not in chain: any healthy step
  expect(nextStepAfter(profile, "z", "9", healthy)).toEqual({ provider: "a", model: "1" })
})

test("fallback state roundtrip", () => {
  const dataDir = join(dir, "data")
  saveFallbackState({ activeProfile: "work", failures: { "p/m": 2 } }, dataDir)
  const loaded = loadFallbackState(dataDir)
  expect(loaded.activeProfile).toBe("work")
  expect(loaded.failures["p/m"]).toBe(2)
})
