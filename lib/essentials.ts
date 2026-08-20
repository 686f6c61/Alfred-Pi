/**
 * Essentials: a curated catalog of the pi packages that bring pi to parity
 * with heavier agents (MCP, subagents, plan mode, permissions, web access…).
 * pi-harness-moe never installs silently - the user picks from the /essentials
 * screen and we run `pi install` explicitly.
 */
import type { SettingsFile } from "./config-io.ts"

export interface EssentialPackage {
  /** npm package name used as `pi install npm:<id>` source. */
  id: string
  label: string
  category: string
  description: string
  curator: string
  reviewedAt: string
  tier?: "base" | "advanced"
}

const EDITORIAL_REVIEW = {
  curator: "equipo Alfred-Pi",
  reviewedAt: "2026-08-19T00:00:00.000Z",
} as const

export const ESSENTIALS: EssentialPackage[] = [
  {
    ...EDITORIAL_REVIEW,
    id: "pi-mcp-adapter",
    label: "MCP adapter",
    category: "MCP",
    description: "Use MCP servers without flooding context - one proxy tool (~200 tokens) instead of 10K+ of tool defs. /mcp panel.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "pi-subagents",
    label: "Subagents",
    category: "Orchestration",
    description: "Child-session delegation with built-in scout/researcher/worker/reviewer roles. /subagents-doctor.",
    tier: "base",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "@quintinshaw/pi-dynamic-workflows",
    label: "Dynamic workflows",
    category: "Orchestration",
    description: "Fan a task out across many subagents dynamically (Claude-Code style). /workflows.",
    tier: "advanced",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "pi-crew",
    label: "Crew (worktrees)",
    category: "Orchestration",
    description: "Coordinated agent teams with git worktrees and async task orchestration - parallel coding without conflicts.",
    tier: "advanced",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "@narumitw/pi-plan-mode",
    label: "Plan mode",
    category: "Planning",
    description: "Codex-style read-only /plan workflow: explore, draft a plan, then implement it.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "@gotgenes/pi-permission-system",
    label: "Permission system",
    category: "Safety",
    description: "Allow/ask/deny gates for tools, bash patterns, MCP and paths - inline TUI dialogs.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "pi-web-access",
    label: "Web access",
    category: "Web",
    description: "Web search (Exa/Brave/Tavily/DDG), fetch with PDF/YouTube extraction, GitHub clone. /websearch.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "@juicesharp/rpiv-todo",
    label: "Todos",
    category: "Tasks",
    description: "Todo overlay rebuilt from the conversation - survives /reload and compaction. /todos.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "pi-lens",
    label: "LSP + linters",
    category: "Code quality",
    description: "LSP diagnostics, linters and ast-grep feedback on every edit. /lens-health.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "pi-powerline-footer",
    label: "Powerline footer",
    category: "UI",
    description: "Rich status bar: model, thinking, git, cost, context %, cache stats. Promotes status keys from other extensions.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "@juicesharp/rpiv-ask-user-question",
    label: "Preguntar al usuario",
    category: "Human",
    description: "Permite que el modelo pregunte al usuario en vez de adivinar cuando falta una decisión.",
  },
  {
    ...EDITORIAL_REVIEW,
    id: "pi-background-tasks",
    label: "Tareas en segundo plano",
    category: "Tasks",
    description: "Ejecuta tareas largas sin secuestrar el turno de conversación.",
  },
]

/** Extract the set of npm package names recorded in settings.json `packages`. */
export function installedNpmPackages(settings: SettingsFile): Set<string> {
  const out = new Set<string>()
  const packages = Array.isArray(settings["packages"]) ? (settings["packages"] as unknown[]) : []
  for (const p of packages) {
    if (typeof p === "string" && p.startsWith("npm:")) {
      // "npm:name@version" / "npm:@scope/name@version" / "npm:name"
      const spec = p.slice(4)
      const name = spec.startsWith("@") ? "@" + (spec.slice(1).split("@")[0] ?? "") : (spec.split("@")[0] ?? "")
      if (name) out.add(name)
    }
  }
  return out
}

export function isEssentialInstalled(settings: SettingsFile, pkg: EssentialPackage): boolean {
  return installedNpmPackages(settings).has(pkg.id)
}

export function missingEssentials(settings: SettingsFile): EssentialPackage[] {
  const installed = installedNpmPackages(settings)
  return ESSENTIALS.filter((p) => !installed.has(p.id))
}

/** Return the mutually exclusive orchestration levels shown by the UI. */
export function essentialOrchestrationTiers(): { base: EssentialPackage[]; advanced: EssentialPackage[] } {
  return {
    base: ESSENTIALS.filter((pkg) => pkg.tier === "base"),
    advanced: ESSENTIALS.filter((pkg) => pkg.tier === "advanced"),
  }
}
