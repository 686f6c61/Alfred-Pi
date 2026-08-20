/**
 * Curacion de un turno: heal de fallback, contexto de dominio, presupuesto
 * y persona. Puro respecto de pi; lee y escribe solo ficheros de lib/.
 */
import { join } from "node:path"
import { loadModels, type FilePaths } from "./config-io.ts"
import { loadFallbackState, saveFallbackState, nextStepAfter, modelKey, FAILURE_THRESHOLD } from "./fallback.ts"
import { loadProfiles, type ProfileStep } from "./profiles.ts"
import { loadAutopilotState, saveAutopilotState, roomForTurn, SIN_SALA } from "./autopilot.ts"
import { presupuestoStatus, relevoAviso, salaStatus } from "./house-copy.ts"
import { loadDomainsState, discoverDomains } from "./domains.ts"
import { loadBudgetState, saveBudgetState, evaluateBudget, spendToday, budgetExceededNote } from "./budget.ts"
import { collectUsage } from "./usage.ts"
import { loadPersonaState, personaPrompt, personaDirective } from "./persona.ts"

/** Entrada de un turno. `paths` es FilePaths: un string no es representable. */
export interface TurnInput {
  paths: FilePaths
  prompt: string
  systemPrompt?: string
  cwd?: string
  repoRoot?: string
  model?: { provider: string; id: string }
  personaDelivered?: boolean
}

export interface TurnHeal {
  provider: string
  model: string
}

export interface TurnMessage {
  customType: string
  content: { type: "text"; text: string }[]
  display: false
}

export interface TurnPatch {
  systemPrompt?: string
  message?: TurnMessage
  heal?: TurnHeal
  /** Aviso en lengua de la casa cuando este turno planea un relevo (el adaptador notifica, nunca a mitad de stream). */
  healNotify?: { text: string; level: "warning" | "info" }
  thinkingLevel?: string
  domainStatus?: string
  budgetStatus?: string
  budgetNotify?: { text: string; level: "warning" | "info" }
}

export interface CurateTurnDeps {
  resolveStep?: (step: ProfileStep) => boolean
}

/**
 * Compone el parche del turno a partir del estado en disco.
 *
 * @param input datos del turno (FilePaths, prompt, modelo activo)
 * @param deps `resolveStep` decide que eslabon del perfil es usable
 * @returns parche que el adaptador de index.ts aplica (setModel + return)
 */
export function curateTurn(input: TurnInput, deps: CurateTurnDeps = {}): TurnPatch {
  const { paths } = input
  const dataDir = paths.dataDir
  const repoRoot = input.repoRoot ?? paths.agentDir
  const cwd = input.cwd ?? paths.agentDir
  const patch: TurnPatch = {}

  const fbState = loadFallbackState(dataDir)
  if (fbState.activeProfile && input.model && deps.resolveStep) {
    const failures = fbState.failures[modelKey(input.model.provider, input.model.id)] ?? 0
    if (failures >= FAILURE_THRESHOLD) {
      const profile = loadProfiles(paths).profiles.find((p) => p.name === fbState.activeProfile)
      if (profile) {
        const step = nextStepAfter(profile, input.model.provider, input.model.id, deps.resolveStep)
        if (step) {
          patch.heal = { provider: step.provider, model: step.model }
          if (step.thinkingLevel) patch.thinkingLevel = step.thinkingLevel
          const from = `${input.model.provider}/${input.model.id}`
          const to = `${step.provider}/${step.model}`
          patch.healNotify = { text: relevoAviso(from, to), level: "warning" }
          // Guardamos el modelo que dejamos para poder volver; el cambio es entre turnos.
          fbState.previousModel = { provider: input.model.provider, model: input.model.id }
          saveFallbackState(fbState, dataDir)
        }
      }
    }
  }

  const auto = loadAutopilotState(dataDir)
  const domains = discoverDomains(repoRoot)
  const enabled = loadDomainsState(dataDir)
  const decided = roomForTurn({
    autopilot: auto,
    prompt: input.prompt ?? "",
    cwd,
    enabled,
    domains,
  })
  if (auto.enabled) {
    patch.domainStatus = decided.domainId ? salaStatus(decided.domainId) : SIN_SALA
  }
  const context = decided.injection
  if (auto.enabled && decided.domainId) {
    if (auto.lastDomainId !== decided.domainId) {
      const next = loadAutopilotState(dataDir)
      next.lastDomainId = decided.domainId
      next.lastDomainAt = new Date().toISOString()
      saveAutopilotState(next, dataDir)
    }
    if (auto.routing === "context+thinking") {
      const level = domains.find((d) => d.manifest.id === decided.domainId)?.manifest.recommended?.thinkingLevel
      if (level && !patch.thinkingLevel) patch.thinkingLevel = level
    }
  }

  const budget = loadBudgetState(dataDir)
  let budgetNote: string | undefined
  if (budget.dailyMaxUsd !== undefined && budget.dailyMaxUsd > 0) {
    const { records } = collectUsage(join(paths.agentDir, "sessions"), 1)
    const spend = spendToday(records, loadModels(paths).data)
    const { status, nextState } = evaluateBudget(budget, spend)
    saveBudgetState(nextState, dataDir)
    patch.budgetStatus = presupuestoStatus(status.pct, status.maxUsd)
    if (status.shouldNotify && status.level !== "ok" && status.level !== "unset") {
      patch.budgetNotify = {
        text:
          status.level === "critical"
            ? `Daily budget EXCEEDED: $${status.spendUsd.toFixed(4)} of $${status.maxUsd.toFixed(2)} - frugality mode on`
            : `Budget ${status.pct}% used ($${status.spendUsd.toFixed(4)} of $${status.maxUsd.toFixed(2)})`,
        level: status.level === "critical" ? "warning" : "info",
      }
    }
    if (status.level === "critical") budgetNote = budgetExceededNote(status)
  }

  const personaId = loadPersonaState(dataDir).persona
  const persona = personaPrompt(personaId) || undefined
  const extras = [persona, context, budgetNote].filter(Boolean).join("\n\n")
  const directive = input.personaDelivered ? "" : personaDirective(personaId)
  if (directive) {
    patch.message = {
      customType: "harness-moe-persona",
      content: [{ type: "text", text: directive }],
      display: false,
    }
  }

  if (extras && input.systemPrompt) {
    patch.systemPrompt = input.systemPrompt + "\n\n" + extras
  }
  return patch
}
