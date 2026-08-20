/**
 * Daily budget guard: cap what pi spends per day (from local session usage +
 * your pricing table). Tracks warn/critical levels, notifies once per level
 * per day, and injects a frugality note into the system prompt when the
 * budget is exceeded. It observes and nudges - it cannot truly block a turn.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteJson } from "./config-io.ts"
import type { UsageRecord, UsageTokens } from "./usage.ts"
import type { ModelsFile } from "./config-io.ts"
import { costOfTokens, pricingTable } from "./usage.ts"

export interface BudgetState {
  /** Maximum USD per day; undefined = no budget. */
  dailyMaxUsd?: number
  /** Day (YYYY-MM-DD) of the last notification, per level. */
  warnedOn?: string
  criticalOn?: string
}

export type BudgetLevel = "ok" | "warn" | "critical" | "unset"

export interface BudgetStatus {
  level: BudgetLevel
  spendUsd: number
  maxUsd: number
  pct: number
  shouldNotify: boolean
}

export interface BudgetEvaluation {
  status: BudgetStatus
  nextState: BudgetState
}

function statePath(dataDir: string): string {
  return join(dataDir, "budget.json")
}

export function loadBudgetState(dataDir: string): BudgetState {
  const file = statePath(dataDir)
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as BudgetState
  } catch {
    return {}
  }
}

export function saveBudgetState(state: BudgetState, dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
  atomicWriteJson(statePath(dataDir), state)
}

/** Sum today's spend from usage records using the models.json pricing table. */
export function spendToday(records: UsageRecord[], models: ModelsFile, today = new Date().toISOString().slice(0, 10)): number {
  const prices = pricingTable(models)
  let total = 0
  for (const r of records) {
    if (r.at.slice(0, 10) !== today) continue
    total += costOfTokens(r as UsageTokens, prices.get(`${r.provider}/${r.model}`)).cost
  }
  return total
}

/**
 * Evaluate the budget. `now` (YYYY-MM-DD) drives the once-per-day notify
 * dedup; shouldNotify is true the first time a level is hit that day. Returns
 * the status and a persistable next state without mutating the input state.
 */
export function evaluateBudget(state: BudgetState, spendUsd: number, now = new Date().toISOString().slice(0, 10)): BudgetEvaluation {
  if (state.dailyMaxUsd === undefined || state.dailyMaxUsd <= 0) {
    return {
      status: { level: "unset", spendUsd, maxUsd: 0, pct: 0, shouldNotify: false },
      nextState: { ...state },
    }
  }
  const pct = Math.round((spendUsd / state.dailyMaxUsd) * 100)
  if (spendUsd >= state.dailyMaxUsd) {
    const shouldNotify = state.criticalOn !== now
    return {
      status: { level: "critical", spendUsd, maxUsd: state.dailyMaxUsd, pct, shouldNotify },
      nextState: { ...state, criticalOn: now, warnedOn: now },
    }
  }
  if (pct >= 80) {
    const shouldNotify = state.warnedOn !== now
    return {
      status: { level: "warn", spendUsd, maxUsd: state.dailyMaxUsd, pct, shouldNotify },
      nextState: { ...state, warnedOn: now },
    }
  }
  return {
    status: { level: "ok", spendUsd, maxUsd: state.dailyMaxUsd, pct, shouldNotify: false },
    nextState: { ...state },
  }
}

/** System-prompt note injected when the daily budget is exceeded. */
export function budgetExceededNote(status: BudgetStatus): string {
  return [
    `<budget-exceeded>`,
    `Daily budget: $${status.spendUsd.toFixed(4)} spent of $${status.maxUsd.toFixed(2)} (${status.pct}%).`,
    `Be frugal now: keep answers tight, avoid re-reading large files, prefer cheap operations,`,
    `and ask the user before starting large multi-step tasks or subagent fan-outs.`,
    `</budget-exceeded>`,
  ].join("\n")
}
