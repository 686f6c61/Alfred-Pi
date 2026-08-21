/**
 * Alfred-Pi - control center for the pi coding agent.
 *
 * Adds:
 *   /providers         provider/model/key manager TUI (models.json, auth.json, settings.json)
 *   /providers:doctor  health checks + config reconciliation
 *   /profile           quick model-profile switching
 *   /domains           work-area packs (skills, prompts, injected context)
 *   --alfred-pi doctor  headless doctor report (--harness-moe still aliases, deprecated)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { getBaseDir, findRepoRoot } from "./lib/paths.ts"
import { runDoctor, formatDoctorReport } from "./lib/doctor.ts"
import { loadDomainsState, discoverDomains } from "./lib/domains.ts"
import { checkForUpdate } from "./lib/update-check.ts"
import { loadFallbackState, saveFallbackState, recordResponse, nextStepAfter, modelKey } from "./lib/fallback.ts"
import { loadProfiles } from "./lib/profiles.ts"
import { relevoAviso } from "./lib/house-copy.ts"
import { loadAutopilotState } from "./lib/autopilot.ts"
import { curateTurn } from "./lib/curate-turn.ts"
import { collectStack, formatStackText } from "./lib/stack.ts"
import { loadOnboardingState, shouldShowOnboarding } from "./lib/onboarding.ts"
import { PERSONAS, loadPersonaState, savePersonaState, buildHeaderLines } from "./lib/persona.ts"
import { installedVersion } from "./lib/update-check.ts"
import { collectUsage, aggregateUsage, formatUsageReport } from "./lib/usage.ts"
import { getPaths, loadModels, loadAuth } from "./lib/config-io.ts"
import { join } from "node:path"
import { providersDashboard, doctorScreen, profilesScreen, domainsScreen, essentialsScreen, usageScreen, ollamaScreen, autopilotScreen, packagesScreen, stackScreen } from "./lib/screens.ts"

export default function piHarnessMoe(pi: ExtensionAPI): void {
  const agentDir = getBaseDir()
  const paths = getPaths(agentDir)
  const dataDir = paths.dataDir
  const repoRoot = findRepoRoot()

  // -------------------------------------------------------------------------
  // Commands

  pi.registerCommand("providers", {
    description: "Alfred-Pi: manage providers, models, keys, defaults, profiles, domains, backups",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await providersDashboard(pi, ctx)
    },
  })

  pi.registerCommand("providers:doctor", {
    description: "Alfred-Pi: provider health checks + config reconciliation",
    handler: async (_args: string, ctx) => {
      if (ctx.mode === "print") {
        const report = await runDoctor()
        process.stdout.write(formatDoctorReport(report).join("\n") + "\n")
        return
      }
      if (!ctx.ui) return
      await doctorScreen(pi, ctx)
    },
  })

  pi.registerCommand("profile", {
    description: "Alfred-Pi: switch model profiles (stacks with fallback chains)",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await profilesScreen(pi, ctx)
    },
  })

  pi.registerCommand("domains", {
    description: "Alfred-Pi: enable/disable work-area packs (security, clean code, web…)",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await domainsScreen(pi, ctx)
    },
  })

  pi.registerCommand("essentials", {
    description: "Alfred-Pi: install the curated parity packages (MCP, subagents, plan mode…)",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await essentialsScreen(pi, ctx)
    },
  })

  pi.registerCommand("usage", {
    description: "Alfred-Pi: usage & cost per session/model/day from local session files",
    handler: async (_args: string, ctx) => {
      if (ctx.mode === "print") {
        process.stdout.write(headlessUsage("all").join("\n") + "\n")
        return
      }
      if (!ctx.ui) return
      await usageScreen(pi, ctx)
    },
  })

  pi.registerCommand("ollama", {
    description: "Alfred-Pi: manage ollama models (list, pull, remove, register in pi)",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await ollamaScreen(pi, ctx)
    },
  })

  pi.registerCommand("autopilot", {
    description: "Alfred-Pi: auto-detect the work domain per turn - focused context, zero manual switching",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await autopilotScreen(pi, ctx)
    },
  })

  pi.registerCommand("packages", {
    description: "Alfred-Pi: browse the pi package ecosystem - search, details, security audit, install",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await packagesScreen(pi, ctx)
    },
  })

  pi.registerCommand("stack", {
    description: "Alfred-Pi: control tower - model, autopilot, domains, packages, health, budget",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      await stackScreen(pi, ctx)
    },
  })

  pi.registerCommand("persona", {
    description: "Alfred-Pi: response persona (Alfred the butler, or neutral)",
    handler: async (_args: string, ctx) => {
      if (!ctx.ui) return
      const current = loadPersonaState(dataDir)
      const pick = await ctx.ui.select(
        `Persona (current: ${PERSONAS.find((p) => p.id === current.persona)?.name ?? current.persona})`,
        PERSONAS.map((p) => `${p.name} - ${p.description}`),
      )
      if (pick === undefined) return
      const chosen = PERSONAS.find((p) => pick.startsWith(p.name))
      if (!chosen) return
      savePersonaState({ persona: chosen.id }, dataDir)
      await ctx.ui.notify(`Persona: ${chosen.name}${chosen.id === "alfred" ? ". Muy bien, señor." : ""}`, "info")
    },
  })

  // -------------------------------------------------------------------------
  // Headless flag: pi --alfred-pi=doctor. --harness-moe remains a deprecated alias.

  pi.registerFlag("alfred-pi", {
    type: "string",
    description: "Alfred-Pi actions: doctor, usage[:days], stack, autopilot, domains (:json variants)",
  })
  pi.registerFlag("harness-moe", {
    type: "string",
    description: "Deprecated alias of --alfred-pi",
  })

  // -------------------------------------------------------------------------
  // Statusline + update check + headless dispatch

  function headlessUsage(range: string): string[] {
    const sinceDays = range === "all" ? undefined : Number(range)
    const { records, errors } = collectUsage(join(paths.agentDir, "sessions"), sinceDays)
    const report = aggregateUsage(records, loadModels(paths).data)
    report.errors.push(...errors)
    return formatUsageReport(report, range === "all" ? "all time" : `last ${range} days`)
  }

  let updateNotified = false
  let personaDelivered = false

  function updateStatusline(ctx: { ui?: { setStatus(k: string, v: string | undefined): void }; model?: { provider?: string; id?: string } }): void {
    if (!ctx.ui) return
    const m = ctx.model as unknown as { provider?: string; id?: string } | undefined
    if (!m?.provider || !m?.id) return
    let authOk = true
    try {
      const status = (ctx as unknown as { modelRegistry?: { getProviderAuthStatus(p: string): { configured: boolean } } }).modelRegistry?.getProviderAuthStatus(m.provider)
      authOk = status?.configured !== false
    } catch {
      // assume ok
    }
    ctx.ui.setStatus("alfred", `${m.provider}/${m.id}${authOk ? "" : " ⚠key"}`)
  }

  pi.on("session_start", async (_event, ctx) => {
    personaDelivered = false
    // Headless doctor / usage
    const canonical = pi.getFlag("alfred-pi")
    const legacy = pi.getFlag("harness-moe")
    const flag = typeof canonical === "string" && canonical ? canonical : legacy
    const usedLegacy = !(typeof canonical === "string" && canonical) && typeof legacy === "string"
    if (typeof flag === "string") {
      const value = flag.replace(/^=/, "").trim().toLowerCase()
      if (value === "doctor") {
        const report = await runDoctor()
        const lines = formatDoctorReport(report)
        if (usedLegacy) lines.unshift("aviso: --harness-moe está deprecado; el canónico es --alfred-pi")
        if (ctx.mode === "print") {
          process.stdout.write(lines.join("\n") + "\n")
        } else if (ctx.ui) {
          await ctx.ui.notify(lines.slice(0, 3).join(" · "), "info")
        }
      } else if (value === "usage" || /^usage:\d+$/.test(value)) {
        // usage:N acota el informe a los últimos N días; usage a secas los cubre todos.
        const range = /^usage:(\d+)$/.exec(value)?.[1] ?? "all"
        if (ctx.mode === "print") {
          process.stdout.write(headlessUsage(range).join("\n") + "\n")
        } else if (ctx.ui) {
          await ctx.ui.notify(headlessUsage(range).slice(0, 3).join(" · "), "info")
        }
      } else if (value === "stack" || value === "stack:json") {
        const model = ctx.model as unknown as { provider?: string; id?: string } | undefined
        let thinking: string | undefined
        try {
          thinking = String(pi.getThinkingLevel())
        } catch {
          thinking = undefined
        }
        const info = collectStack({ agentDir, repoRoot, model, thinking })
        if (ctx.mode === "print") {
          process.stdout.write(value.endsWith(":json") ? JSON.stringify(info, null, 2) + "\n" : formatStackText(info).join("\n") + "\n")
        }
      } else if (value === "autopilot" || value === "autopilot:json" || value === "domains" || value === "domains:json") {
        const which = value.split(":")[0]!
        const packs = discoverDomains(repoRoot)
        const domainsState = loadDomainsState(dataDir)
        const auto = loadAutopilotState(dataDir)
        const payload =
          which === "autopilot"
            ? { enabled: auto.enabled, routing: auto.routing, lastDomainId: auto.lastDomainId ?? null }
            : {
                packs: packs.map((d) => ({
                  id: d.manifest.id,
                  name: d.manifest.name,
                  skills: d.skills.length,
                  prompts: d.prompts.length,
                  enabled: Boolean(domainsState.enabled[d.manifest.id]),
                })),
              }
        if (ctx.mode === "print") {
          process.stdout.write(value.endsWith(":json") ? JSON.stringify(payload, null, 2) + "\n" : JSON.stringify(payload, null, 2) + "\n")
        }
      }
    }

    // First-run onboarding: offer the wizard when nothing is configured.
    if (ctx.mode === "tui" && ctx.ui) {
      try {
        const modelsR = loadModels(paths)
        const authR = loadAuth(paths)
        const obState = loadOnboardingState(dataDir)
        if (shouldShowOnboarding({ modelsJsonExists: modelsR.existed, customProviders: Object.keys((modelsR.error ? { providers: {} } : modelsR.data).providers ?? {}).length, authEntries: Object.keys((authR.error ? {} : authR.data) ?? {}).length, state: obState })) {
          const want = await ctx.ui.confirm("Welcome to Alfred-Pi", "No providers configured yet. Run the guided setup now?")
          if (want) {
            const { onboardingFlow } = await import("./lib/onboarding-flow.ts")
            await onboardingFlow(pi, ctx, { agentDir, repoRoot })
          } else {
            const { completeOnboarding } = await import("./lib/onboarding.ts")
            const ob = await import("./lib/onboarding.ts")
            ob.saveOnboardingState(ob.completeOnboarding(loadOnboardingState(dataDir)), dataDir)
          }
        }
      } catch {
        // onboarding is a courtesy; never fail a session over it
      }
    }

    if (ctx.mode === "tui") updateStatusline(ctx)

    // Startup header: branding + two-line pitch (product of harness.moe).
    if (ctx.mode === "tui" && ctx.ui) {
      try {
        const version = installedVersion(repoRoot)
        ctx.ui.setHeader((tui, theme) => ({
          render: (width: number) => buildHeaderLines(version).map((l) => (l.length > width - 2 ? l.slice(0, width - 2) : l)),
          handleInput: () => undefined,
          invalidate: () => undefined,
        }))
      } catch {
        // header is cosmetic; never fail a session over it
      }
    }

    // Update channel (24h cache, notify once per session).
    void checkForUpdate({ dataDir, repoRoot }).then((state) => {
      if (state.updateAvailable && !updateNotified && ctx.ui) {
        updateNotified = true
        ctx.ui.notify(`Alfred-Pi ${state.latest} available (you have ${state.current}) - pi update`, "info")
      }
    }).catch(() => {
      // The background update check must never reject the session lifecycle.
    })
  })

  pi.on("model_select", (_event, ctx) => {
    if (ctx.mode === "tui") updateStatusline(ctx)
  })

  // -------------------------------------------------------------------------
  // Runtime fallback: track provider failures, auto-switch before a turn

  pi.on("after_provider_response", async (event, ctx) => {
    const model = ctx.model as unknown as { provider?: string; id?: string } | undefined
    if (!model?.provider || !model?.id) return
    const state = loadFallbackState(dataDir)
    const payload = event as { status?: number; error?: unknown; err?: unknown }
    // Count HTTP and transport here; setModel only runs in before_agent_start.
    const crossed = recordResponse(state, model.provider, model.id, payload.status, payload.error ?? payload.err)
    saveFallbackState(state, dataDir)
    if (crossed && state.activeProfile && ctx.ui) {
      const from = `${model.provider}/${model.id}`
      let to = state.activeProfile
      try {
        const profile = loadProfiles(paths).profiles.find((p) => p.name === state.activeProfile)
        if (profile) {
          const registry = ctx as unknown as {
            modelRegistry?: { find(p: string, m: string): unknown; hasConfiguredAuth(found: unknown): boolean }
          }
          const step = nextStepAfter(profile, model.provider, model.id, (s) => {
            try {
              const found = registry.modelRegistry?.find(s.provider, s.model)
              return Boolean(found && registry.modelRegistry?.hasConfiguredAuth(found))
            } catch {
              return false
            }
          })
          if (step) to = `${step.provider}/${step.model}`
        }
      } catch {
        // Destination label stays the profile name when the chain cannot be read.
      }
      await ctx.ui.notify(relevoAviso(from, to), "warning")
    }
  })

  // -------------------------------------------------------------------------
  // Domain packs context injection (+ pre-turn fallback heal)

  pi.on("before_agent_start", async (event, ctx) => {
    const model = ctx.model as unknown as { provider?: string; id?: string } | undefined
    const patch = curateTurn(
      {
        paths,
        repoRoot,
        prompt: event.prompt ?? "",
        systemPrompt: event.systemPrompt,
        cwd: ctx.cwd,
        model: model?.provider && model?.id ? { provider: model.provider, id: model.id } : undefined,
        personaDelivered,
      },
      {
        resolveStep: (step) => {
          try {
            const found = ctx.modelRegistry.find(step.provider, step.model)
            return Boolean(found && ctx.modelRegistry.hasConfiguredAuth(found))
          } catch {
            return false
          }
        },
      },
    )
    personaDelivered = true

    if (patch.heal) {
      const found = ctx.modelRegistry.find(patch.heal.provider, patch.heal.model)
      if (found && (await pi.setModel(found))) {
        const fresh = loadFallbackState(dataDir)
        if (model?.provider && model?.id) {
          delete fresh.failures[modelKey(model.provider, model.id)]
          fresh.previousModel = { provider: model.provider, model: model.id }
        }
        saveFallbackState(fresh, dataDir)
        if (ctx.ui) {
          const from = model?.provider && model?.id ? `${model.provider}/${model.id}` : "?"
          const text = patch.healNotify?.text ?? relevoAviso(from, `${patch.heal.provider}/${patch.heal.model}`)
          await ctx.ui.notify(text, patch.healNotify?.level ?? "info")
        }
        if (ctx.mode === "tui") updateStatusline({ ...ctx, model: found as never })
      }
    }
    if (patch.thinkingLevel) {
      try {
        ctx.setThinkingLevel(patch.thinkingLevel as never)
      } catch {
        // clamped/unsupported levels are ignored by pi anyway
      }
    }
    if (ctx.ui) {
      try {
        ctx.ui.setStatus("alfred-sala", patch.domainStatus)
        if (patch.budgetStatus) ctx.ui.setStatus("alfred-presupuesto", patch.budgetStatus)
      } catch {
        // status is TUI-only
      }
      if (patch.budgetNotify) void ctx.ui.notify(patch.budgetNotify.text, patch.budgetNotify.level)
    }

    if (!patch.systemPrompt && !patch.message) return undefined
    return {
      ...(patch.systemPrompt ? { systemPrompt: patch.systemPrompt } : {}),
      ...(patch.message ? { message: patch.message } : {}),
    }
  })
}
