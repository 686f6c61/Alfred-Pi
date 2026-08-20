/**
 * Stack info collection: one pure function gathers everything the control
 * tower shows, so the TUI and the headless --harness-moe=stack[:json]
 * report can never drift apart. Node-only, testable without pi.
 */
import { join } from "node:path"
import { formatRadarStatus, loadAutopilotState } from "./autopilot.ts"
import { loadFallbackState } from "./fallback.ts"
import { loadBudgetState, spendToday } from "./budget.ts"
import { loadDomainsState, discoverDomains, type Domain } from "./domains.ts"
import { summarizeHealth, loadRecentHealth, type ProviderHealthSummary } from "./doctor.ts"
import { loadModels, loadAuth, loadSettings, getPaths, readJsonFile, type AuthFile, type ModelsFile, type SettingsFile } from "./config-io.ts"
import { collectUsage } from "./usage.ts"
import { presupuestoStatus } from "./house-copy.ts"

export interface StackInfo {
  model: { provider?: string; id?: string; thinking?: string; keyOk?: boolean }
  defaults: { provider?: string; model?: string }
  autopilot: { enabled: boolean; routing: string; lastDomainId?: string }
  fallback: { activeProfile?: string }
  domains: { enabled: string[]; packs: number; skillsAvailable: number; promptsAvailable: number }
  packages: string[]
  budget: { maxUsd?: number; spentTodayUsd: number }
  health: ProviderHealthSummary[]
  generatedAt: string
}

export interface StackInputs {
  agentDir: string
  repoRoot?: string
  model?: { provider?: string; id?: string } | undefined
  thinking?: string
  /** Injectable for tests; defaults to the real discovery. */
  discover?: (repoRoot: string) => Domain[]
}

function listedPackages(settings: SettingsFile): string[] {
  return (Array.isArray(settings.packages) ? (settings.packages as unknown[]) : []).filter((p): p is string => typeof p === "string")
}

function uniqueStrings(lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item)) continue
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

/** Packages declared in the project's `.pi/settings.json` (pi auto-installs them after trust). */
function loadProjectPackages(repoRoot: string): string[] {
  return listedPackages(readJsonFile<SettingsFile>(join(repoRoot, ".pi", "settings.json"), {}).data)
}

/**
 * Whether the active provider looks to have a usable key.
 * Local backends do not need one; a remote custom provider without apiKey/auth
 * is "falla tu clave". Unknown built-ins stay ready: we cannot see env keys here.
 */
function providerKeyOk(provider: string | undefined, models: ModelsFile, auth: AuthFile): boolean {
  if (!provider) return true
  if (auth[provider]?.key) return true
  const cfg = models.providers?.[provider]
  if (cfg?.apiKey) return true
  if (provider === "ollama" || provider === "llama.cpp") return true
  const base = typeof cfg?.baseUrl === "string" ? cfg.baseUrl : ""
  if (/127\.0\.0\.1|localhost/i.test(base)) return true
  if (cfg) return false
  return true
}

/**
 * Snapshot of the control tower. `packages` unions the agent settings list
 * with `.pi/settings.json` of the repo: those are what pi auto-installs after trust.
 */
export function collectStack(opts: StackInputs): StackInfo {
  const paths = getPaths(opts.agentDir)
  const dataDir = paths.dataDir
  const repoRoot = opts.repoRoot ?? opts.agentDir
  const discover = opts.discover ?? discoverDomains

  const auto = loadAutopilotState(dataDir)
  const fb = loadFallbackState(dataDir)
  const budget = loadBudgetState(dataDir)
  const domainsState = loadDomainsState(dataDir)
  const settingsR = loadSettings(paths)
  const modelsR = loadModels(paths)
  const authR = loadAuth(paths)
  const settings = (settingsR.error ? {} : settingsR.data) as SettingsFile
  const models = (modelsR.error ? { providers: {} } : modelsR.data) as ModelsFile
  const auth = (authR.error ? {} : authR.data) as AuthFile

  const packs = discover(repoRoot)
  const enabledIds = new Set(Object.keys(domainsState.enabled))
  const enabled = packs.filter((d) => enabledIds.has(d.manifest.id)).map((d) => d.manifest.id)
  const skillsAvailable = packs.reduce((n, d) => n + d.skills.length, 0)
  const promptsAvailable = packs.reduce((n, d) => n + d.prompts.length, 0)

  const { records } = collectUsage(join(opts.agentDir, "sessions"), 1)
  const spent = spendToday(records, models)
  const health = summarizeHealth(loadRecentHealth(200, paths))

  return {
    model: {
      provider: opts.model?.provider,
      id: opts.model?.id,
      thinking: opts.thinking,
      keyOk: providerKeyOk(opts.model?.provider, models, auth),
    },
    defaults: {
      provider: typeof settings.defaultProvider === "string" ? settings.defaultProvider : undefined,
      model: typeof settings.defaultModel === "string" ? settings.defaultModel : undefined,
    },
    autopilot: { enabled: auto.enabled, routing: auto.routing, lastDomainId: auto.lastDomainId },
    fallback: { activeProfile: fb.activeProfile },
    domains: { enabled, packs: packs.length, skillsAvailable, promptsAvailable },
    packages: uniqueStrings([listedPackages(settings), loadProjectPackages(repoRoot)]),
    budget: { maxUsd: budget.dailyMaxUsd, spentTodayUsd: spent },
    health,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Text report shared by `/stack` and `--harness-moe=stack`.
 * A non-empty package list gets an advisory (never a block, never an install).
 */
export function formatStackText(s: StackInfo): string[] {
  const lines: string[] = [`Alfred-Pi stack - ${s.generatedAt.slice(0, 19).replace("T", " ")}`]
  lines.push("model")
  const ready = s.model.keyOk !== false
  const houseModel = ready ? "modelo listo" : "falla tu clave"
  lines.push(`  active: ${s.model.provider ? `${s.model.provider}/${s.model.id}` : "?"}${s.model.thinking ? ` · thinking ${s.model.thinking}` : ""} · ${houseModel}`)
  if (s.defaults.provider) lines.push(`  default: ${s.defaults.provider}/${s.defaults.model ?? "?"}`)
  lines.push("autopilot & fallback")
  lines.push(`  autopilot: ${formatRadarStatus(s.autopilot)}`)
  lines.push(`  auto-fallback: ${s.fallback.activeProfile ? `fb: ${s.fallback.activeProfile}` : "off"}`)
  lines.push("domains")
  lines.push(`  enabled: ${s.domains.enabled.length > 0 ? s.domains.enabled.join(", ") : "none"}`)
  lines.push(`  packs: ${s.domains.packs} · skills available: ${s.domains.skillsAvailable} · prompts: ${s.domains.promptsAvailable}`)
  lines.push("packages")
  if (s.packages.length > 0) {
    lines.push(...s.packages.map((p) => `  ${p}`))
    // Advisory only: pi, not the harness, auto-installs on trust. Never block.
    lines.push("  advisory: pi may install these when you trust the repo; /packages audits them. Never blocks.")
  } else {
    lines.push("  (none installed)")
  }
  lines.push("presupuesto")
  if (s.budget.maxUsd) {
    const pct = Math.round((s.budget.spentTodayUsd / s.budget.maxUsd) * 100)
    lines.push(`  presupuesto al ${pct} % · ${presupuestoStatus(pct, s.budget.maxUsd)}`)
  } else {
    lines.push("  sin presupuesto diario (/usage)")
  }
  lines.push("provider health (recent probes)")
  if (s.health.length > 0) {
    for (const h of s.health) lines.push(`  ${h.ok ? "✓" : "✗"} ${h.provider} - ${(h.successRate * 100).toFixed(0)}% ok · avg ${h.avgLatencyMs ?? "?"}ms · ${h.samples} samples`)
  } else {
    lines.push("  no probes yet - run the doctor")
  }
  return lines
}
