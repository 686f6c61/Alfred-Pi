/**
 * Autopilot: detect the work domain of each turn from the user's prompt
 * (keyword scoring over pack triggers, ES/EN) and focus the session
 * inject only that domain's context, optionally apply its recommended
 * thinking level. Skills from all packs stay available all the time; the
 * model picks them from its menu. Pure Node.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { atomicWriteJson } from "./config-io.ts"
import { enabledDomainsContext, type Domain, type DomainsState } from "./domains.ts"

export type AutopilotRouting = "context" | "context+thinking"

export interface AutopilotState {
  enabled: boolean
  routing: AutopilotRouting
  enabledAt?: string
  /** Last detected domain (session stickiness when a turn has no signal). */
  lastDomainId?: string
  lastDomainAt?: string
}

const DEFAULT_STATE: AutopilotState = { enabled: false, routing: "context" }

function statePath(dataDir: string): string {
  return join(dataDir, "autopilot.json")
}

export function loadAutopilotState(dataDir: string): AutopilotState {
  const file = statePath(dataDir)
  if (!existsSync(file)) return { ...DEFAULT_STATE }
  try {
    const s = JSON.parse(readFileSync(file, "utf-8")) as AutopilotState
    return {
      enabled: Boolean(s.enabled),
      routing: s.routing === "context+thinking" ? "context+thinking" : "context",
      enabledAt: s.enabledAt,
      lastDomainId: s.lastDomainId,
      lastDomainAt: s.lastDomainAt,
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveAutopilotState(state: AutopilotState, dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
  atomicWriteJson(statePath(dataDir), state)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function repoHintExists(cwd: string, hint: string): boolean {
  const firstStar = hint.indexOf("*")
  if (firstStar === -1) return existsSync(join(cwd, hint))

  const lastSegment = basename(hint)
  if (firstStar !== hint.lastIndexOf("*") || !lastSegment.includes("*")) return false

  const pattern = new RegExp(`^${escapeRegex(lastSegment).replace("\\*", ".*")}$`)
  try {
    return readdirSync(join(cwd, dirname(hint))).some((entry) => pattern.test(entry))
  } catch {
    return false
  }
}

export interface DomainMatch {
  domain: Domain
  score: number
  matched: string[]
}

/**
 * Score every domain's triggers against the prompt (word-boundary,
 * case-insensitive substring triggers like "ci/cd" match literally).
 * Highest score wins; ties go to the earlier pack alphabetically.
 */
export function detectDomain(prompt: string, domains: Domain[]): DomainMatch | undefined {
  const lower = prompt.toLowerCase()
  let best: DomainMatch | undefined
  for (const domain of domains) {
    const triggers = domain.manifest.triggers ?? []
    const matched: string[] = []
    for (const t of triggers) {
      const needle = t.toLowerCase()
      const re = new RegExp(`(^|[^a-z0-9áéíóúñ])${escapeRegex(needle)}(?![a-z0-9áéíóúñ])`, "i")
      if (re.test(lower)) matched.push(t)
    }
    if (matched.length === 0) continue
    // Long triggers are stronger signals than generic words.
    const score = matched.reduce((sum, t) => sum + Math.min(3, Math.ceil(t.length / 6)), 0)
    if (!best || score > best.score) best = { domain, score, matched }
  }
  return best
}

/**
 * Full autopilot detection cascade:
 *   1. prompt triggers (strong signal, wins)
 *   2. repo hints - files/dirs in cwd that mark a domain
 *   3. last detected domain (stickiness for follow-up turns)
 */
export function detectDomainFull(
  prompt: string,
  domains: Domain[],
  opts?: { cwd?: string; lastDomainId?: string },
): DomainMatch | undefined {
  const byPrompt = detectDomain(prompt, domains)
  if (byPrompt) return byPrompt

  if (opts?.cwd) {
    let best: DomainMatch | undefined
    for (const domain of domains) {
      const hints = (domain.manifest.repoHints ?? []).filter((h) => repoHintExists(opts.cwd!, h))
      if (hints.length === 0) continue
      const score = hints.length
      if (!best || score > best.score) best = { domain, score, matched: hints }
    }
    if (best) return best
  }

  if (opts?.lastDomainId) {
    const last = domains.find((d) => d.manifest.id === opts.lastDomainId)
    if (last) return { domain: last, score: 0, matched: [] }
  }
  return undefined
}

/** Focused context for one detected domain (vs stacking every enabled pack). */
export function domainContext(domain: Domain): string {
  if (!domain.contextMd || !domain.contextMd.trim()) return ""
  return [`<domain-packs>`, `# ${domain.manifest.name}\n\n${domain.contextMd.trim()}`, `</domain-packs>`].join("\n\n")
}

export interface InjectionForTurnOptions {
  autopilot: AutopilotState
  prompt: string
  cwd: string
  enabled: DomainsState
  domains: Domain[]
}

/** Visible radar room when autopilot is ON and no pack was injected. */
export const SIN_SALA = "sin sala"

const RADAR_OFF_LABEL = "off (manual /domains)"

export interface RoomForTurn {
  /** Context to inject; empty when the radar found no pack. */
  injection: string
  /**
   * Visible radar room. Autopilot ON with an empty injection is «sin sala»;
   * never a fabricated general pack id.
   */
  room: string
  /** Pack id when a room was chosen; absent on «sin sala». */
  domainId?: string
}

/** Inputs for the visible radar room; used by /stack and per-turn status text. */
export interface RadarRoomLabelOpts {
  enabled: boolean
  /** Per-turn injection from injectionForTurn; empty string forces «sin sala». */
  injection?: string
  /** Pack id to show when a room is known (this turn or the stack snapshot). */
  injectedDomainId?: string
}

/**
 * Status text the radar (and /stack) can read. Empty injection beats a
 * leftover lastDomainId so the UI does not show a ghost pack.
 */
export function radarRoomLabel(opts: RadarRoomLabelOpts): string {
  if (!opts.enabled) return RADAR_OFF_LABEL
  if (opts.injection !== undefined && opts.injection.length === 0) return SIN_SALA
  const id = opts.injectedDomainId?.trim()
  return id ? id : SIN_SALA
}

/** One-line radar status for formatStackText: ON/off plus current room. */
export function formatRadarStatus(auto: { enabled: boolean; routing: string; lastDomainId?: string }): string {
  if (!auto.enabled) return RADAR_OFF_LABEL
  return `ON (${auto.routing}) · ${radarRoomLabel({ enabled: true, injectedDomainId: auto.lastDomainId })}`
}

/** Headless plain text (`--alfred-pi=autopilot`); `:json` is the machine twin. */
export function formatAutopilotText(auto: { enabled: boolean; routing: string; lastDomainId?: string }): string[] {
  return [`Alfred-Pi autopilot`, `  radar: ${formatRadarStatus(auto)}`]
}

/**
 * Per-turn radar decision: the injection string plus the room label that
 * status text can read. Autopilot ON with no match is «sin sala», not a
 * synthetic general pack.
 */
export function roomForTurn(opts: InjectionForTurnOptions): RoomForTurn {
  if (!opts.autopilot.enabled) {
    const repoRoot = Object.values(opts.enabled.enabled)[0]?.repoRoot
    return {
      injection: enabledDomainsContext(opts.enabled, repoRoot),
      room: RADAR_OFF_LABEL,
    }
  }

  const match = detectDomainFull(opts.prompt, opts.domains, {
    cwd: opts.cwd,
    lastDomainId: opts.autopilot.lastDomainId,
  })
  if (!match) {
    return { injection: "", room: SIN_SALA }
  }
  return {
    injection: domainContext(match.domain),
    room: match.domain.manifest.id,
    domainId: match.domain.manifest.id,
  }
}

/** Select one focused pack in autopilot mode or stack enabled packs manually. */
export function injectionForTurn(opts: InjectionForTurnOptions): string {
  return roomForTurn(opts).injection
}
