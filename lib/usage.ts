/**
 * Usage & cost tracking from pi's local session JSONL files (ccusage-style,
 * offline-first). Pricing comes from models.json custom entries; models
 * without pricing data show token counts and "n/a" cost.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ModelsFile } from "./config-io.ts"

export interface UsageTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

export interface UsageRecord extends UsageTokens {
  at: string
  provider: string
  model: string
  sessionId: string
  cwd: string
}

export interface SessionUsage {
  sessionId: string
  file: string
  cwd: string
  startedAt: string
  lastAt: string
  turns: number
  cost: number
  priced: boolean
  tokens: UsageTokens
}

export interface ModelUsage {
  provider: string
  model: string
  cost: number
  priced: boolean
  tokens: UsageTokens
}

export interface DayUsage {
  day: string
  cost: number
  tokens: UsageTokens
}

export interface UsageReport {
  sessions: number
  turns: number
  cost: number
  pricedTurns: number
  tokens: UsageTokens
  byModel: ModelUsage[]
  byDay: DayUsage[]
  topSessions: SessionUsage[]
  errors: string[]
}

const ZERO: UsageTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }

function addTokens(a: UsageTokens, b: UsageTokens): UsageTokens {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    reasoning: a.reasoning + b.reasoning,
  }
}

/** Walk session .jsonl files under sessionsDir and extract assistant usage records. */
export function collectUsage(sessionsDir: string, sinceDays?: number): { records: UsageRecord[]; errors: string[] } {
  const records: UsageRecord[] = []
  const errors: string[] = []
  const sinceMs = sinceDays !== undefined ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : undefined
  if (!existsSync(sessionsDir)) return { records, errors }
  for (const projectDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!projectDir.isDirectory()) continue
    const dir = join(sessionsDir, projectDir.name)
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue
      const path = join(dir, file.name)
      let sessionId = file.name.replace(/\.jsonl$/, "")
      let cwd = ""
      try {
        const lines = readFileSync(path, "utf-8").split("\n")
        for (const line of lines) {
          if (!line.trim()) continue
          let entry: Record<string, unknown>
          try {
            entry = JSON.parse(line) as Record<string, unknown>
          } catch {
            continue
          }
          if (entry.type === "session") {
            sessionId = typeof entry.id === "string" ? entry.id : sessionId
            cwd = typeof entry.cwd === "string" ? entry.cwd : ""
            continue
          }
          if (entry.type !== "message") continue
          const message = entry.message as
            | { role?: string; provider?: string; model?: string; usage?: Record<string, number> }
            | undefined
          if (message?.role !== "assistant" || !message.usage) continue
          const at = typeof entry.timestamp === "string" ? entry.timestamp : ""
          if (sinceMs !== undefined && at) {
            const t = Date.parse(at)
            if (!Number.isNaN(t) && t < sinceMs) continue
          }
          records.push({
            at,
            provider: message.provider ?? "?",
            model: message.model ?? "?",
            sessionId,
            cwd,
            input: message.usage.input ?? 0,
            output: message.usage.output ?? 0,
            cacheRead: message.usage.cacheRead ?? 0,
            cacheWrite: message.usage.cacheWrite ?? 0,
            reasoning: message.usage.reasoning ?? 0,
          })
        }
      } catch (e) {
        errors.push(`${path}: ${(e as Error).message}`)
      }
    }
  }
  return { records, errors }
}

/** Pricing table ($ per 1M tokens) from models.json custom entries. */
export function pricingTable(models: ModelsFile): Map<string, NonNullable<ModelsFile["providers"][string]["models"]>[number]["cost"]> {
  const table = new Map<string, NonNullable<ModelsFile["providers"][string]["models"]>[number]["cost"]>()
  for (const [provider, cfg] of Object.entries(models.providers ?? {})) {
    for (const m of cfg.models ?? []) {
      if (m.cost && (m.cost.input !== undefined || m.cost.output !== undefined)) {
        table.set(`${provider}/${m.id}`, m.cost)
      }
    }
  }
  return table
}

export function costOfTokens(tokens: UsageTokens, cost: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | undefined): { cost: number; priced: boolean } {
  if (!cost) return { cost: 0, priced: false }
  const c =
    ((tokens.input * (cost.input ?? 0)) +
      (tokens.output * (cost.output ?? 0)) +
      (tokens.cacheRead * (cost.cacheRead ?? 0)) +
      (tokens.cacheWrite * (cost.cacheWrite ?? 0))) /
    1_000_000
  return { cost: c, priced: true }
}

export function aggregateUsage(records: UsageRecord[], models: ModelsFile, topN = 8): UsageReport {
  const prices = pricingTable(models)
  const byModel = new Map<string, ModelUsage>()
  const byDay = new Map<string, DayUsage>()
  const bySession = new Map<string, SessionUsage>()
  const report: UsageReport = {
    sessions: 0,
    turns: 0,
    cost: 0,
    pricedTurns: 0,
    tokens: { ...ZERO },
    byModel: [],
    byDay: [],
    topSessions: [],
    errors: [],
  }

  for (const r of records) {
    const modelKey = `${r.provider}/${r.model}`
    const price = prices.get(modelKey)
    const { cost, priced } = costOfTokens(r, price)

    report.turns++
    report.tokens = addTokens(report.tokens, r)
    report.cost += cost
    if (priced) report.pricedTurns++

    const mu = byModel.get(modelKey) ?? { provider: r.provider, model: r.model, cost: 0, priced: true, tokens: { ...ZERO } }
    mu.cost += cost
    mu.tokens = addTokens(mu.tokens, r)
    if (!priced) mu.priced = false
    byModel.set(modelKey, mu)

    const day = r.at.slice(0, 10)
    const du = byDay.get(day) ?? { day, cost: 0, tokens: { ...ZERO } }
    du.cost += cost
    du.tokens = addTokens(du.tokens, r)
    byDay.set(day, du)

    const su = bySession.get(r.sessionId) ?? {
      sessionId: r.sessionId,
      file: r.cwd,
      cwd: r.cwd,
      startedAt: r.at,
      lastAt: r.at,
      turns: 0,
      cost: 0,
      priced: true,
      tokens: { ...ZERO },
    }
    su.turns++
    su.cost += cost
    su.tokens = addTokens(su.tokens, r)
    su.lastAt = r.at
    if (r.at < su.startedAt) su.startedAt = r.at
    if (!priced) su.priced = false
    bySession.set(r.sessionId, su)
  }

  report.sessions = bySession.size
  report.byModel = [...byModel.values()].sort((a, b) => b.cost - a.cost || b.tokens.output - a.tokens.output)
  report.byDay = [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14)
  report.topSessions = [...bySession.values()].sort((a, b) => b.cost - a.cost || b.turns - a.turns).slice(0, topN)
  return report
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

export function formatUsageReport(report: UsageReport, label = "all time"): string[] {
  const lines: string[] = []
  lines.push(`Alfred-Pi usage - ${label}`)
  lines.push("")
  lines.push(
    `sessions: ${report.sessions} · turns: ${report.turns} · cost: $${report.cost.toFixed(4)} (${report.pricedTurns}/${report.turns} turns priced)`,
  )
  lines.push(
    `tokens: in ${fmt(report.tokens.input)} · out ${fmt(report.tokens.output)} · cache read ${fmt(report.tokens.cacheRead)} · cache write ${fmt(report.tokens.cacheWrite)} · reasoning ${fmt(report.tokens.reasoning)}`,
  )
  lines.push("")
  if (report.byModel.length > 0) {
    lines.push("by model:")
    for (const m of report.byModel) {
      lines.push(`  ${m.provider}/${m.model} - ${m.priced ? `$${m.cost.toFixed(4)}` : "n/a (no pricing; set cost in /providers)"} · in ${fmt(m.tokens.input)} / out ${fmt(m.tokens.output)}`)
    }
    lines.push("")
  }
  if (report.byDay.length > 0) {
    lines.push("recent days:")
    for (const d of report.byDay) {
      lines.push(`  ${d.day} - $${d.cost.toFixed(4)} · in ${fmt(d.tokens.input)} / out ${fmt(d.tokens.output)}`)
    }
    lines.push("")
  }
  if (report.topSessions.length > 0) {
    lines.push("top sessions:")
    for (const s of report.topSessions) {
      const where = s.cwd.replace(/^.*\//, "") || "?"
      lines.push(`  ${s.startedAt.slice(0, 16).replace("T", " ")} ${where} - ${s.turns} turn${s.turns === 1 ? "" : "s"} · ${s.priced ? `$${s.cost.toFixed(4)}` : "n/a"} · in ${fmt(s.tokens.input)} / out ${fmt(s.tokens.output)}`)
    }
  }
  if (report.errors.length > 0) {
    lines.push("", `warnings: ${report.errors.length} unreadable session file(s)`)
  }
  return lines
}
