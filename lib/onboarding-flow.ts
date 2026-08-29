/**
 * Guided first-run setup: provider from a preset, optional key, test,
 * default model, autopilot and budget. Runs over ctx.ui dialogs so it
 * works in TUI and degrades to a no-op without ui. Pure state decisions
 * live in onboarding.ts; this file is the conversation.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { PROVIDER_PRESETS, findPreset, type ProviderPreset } from "./presets.ts"
import { resolveKeyRef, probeLiveness, type ApiType } from "./prober.ts"
import { loadModels, loadSettings, planWrites, applyPlan, getPaths, type CredentialPolicy, type PlannedWrite, type ProviderConfig } from "./config-io.ts"
import { loadOnboardingState, saveOnboardingState, recordStep, completeOnboarding, deferOnboarding, blockOnboarding, type OnboardingState } from "./onboarding.ts"
import { loadAutopilotState, saveAutopilotState } from "./autopilot.ts"
import { loadBudgetState, saveBudgetState } from "./budget.ts"
import { enableAllDomains } from "./domains.ts"
import { DEFAULT_OLLAMA_BASE, ollamaTags } from "./ollama.ts"
import { scanOpencodeSources, usableBaseUrl, type OpencodeImportItem } from "./import-sources.ts"

const ROUTE_LABELS = [
  "Ya pago una nube o tengo una clave",
  "Solo mi máquina",
  "Uso una pasarela",
  "Saltar por ahora",
] as const

const GATEWAY_IDS = ["openrouter", "litellm", "custom-openai"] as const
const LOCAL_PRESET_IDS = new Set(["ollama", "lmstudio", "vllm", "sglang"])
const GATEWAY_PRESET_IDS = new Set<string>(GATEWAY_IDS)

interface OnboardingModelRegistry {
  refresh?: () => Promise<void> | void
  find?: (provider: string, model: string) => unknown
}

interface OnboardingContext {
  ui?: ExtensionContext["ui"]
  cwd?: string
  modelRegistry?: OnboardingModelRegistry
}

interface TextComponent {
  render(width: number): string[]
  handleInput(data: string): void
  invalidate(): void
}

class OnboardingDiffView implements TextComponent {
  private offset = 0
  private viewport = 14

  constructor(
    private readonly title: string,
    private readonly lines: string[],
    private readonly done: () => void,
  ) {}

  render(width: number): string[] {
    const visible = this.lines.slice(this.offset, this.offset + this.viewport)
    const out = [this.title, "", ...visible.map((line) => line.slice(0, Math.max(1, width - 2)))]
    out.push("", this.lines.length > this.viewport ? "Arriba/abajo para desplazarte; q o Esc para cerrar." : "q o Esc para cerrar.")
    return out
  }

  handleInput(data: string): void {
    if (data === "\x1b" || data === "\x03" || data === "q" || data === "\r") {
      this.done()
      return
    }
    if (data === "\x1b[A" || data === "k") this.offset = Math.max(0, this.offset - 1)
    if (data === "\x1b[B" || data === "j") this.offset = Math.min(Math.max(0, this.lines.length - this.viewport), this.offset + 1)
  }

  invalidate(): void {}
}

function saveDeferred(state: OnboardingState, dataDir: string): void {
  saveOnboardingState(deferOnboarding(state), dataDir)
}

async function deferWithMessage(ui: ExtensionContext["ui"], state: OnboardingState, dataDir: string, message: string): Promise<void> {
  saveDeferred(state, dataDir)
  await ui.notify(message, "info")
}

function cloudPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((preset) => !LOCAL_PRESET_IDS.has(preset.id) && !GATEWAY_PRESET_IDS.has(preset.id))
}

function gatewayPresets(): ProviderPreset[] {
  return GATEWAY_IDS.map((id) => findPreset(id)).filter((preset): preset is ProviderPreset => preset !== undefined)
}

function keySummary(key: string): string {
  if (!key) return "no configurada"
  if (key.startsWith("$")) return key
  return "***"
}

async function showPlanDiff(ui: ExtensionContext["ui"], plan: PlannedWrite[], preset: ProviderPreset, model: string | undefined, key: string): Promise<void> {
  const lines = [
    `Proveedor: ${preset.label}`,
    `Modelo por defecto: ${model ?? "sin modelo descubierto"}`,
    `Clave: ${keySummary(key)}`,
    "",
    ...plan.flatMap((write) => write.diff.split("\n")),
  ]
  const custom = (ui as unknown as {
    custom?: <T>(factory: (tui: unknown, theme: unknown, kb: unknown, done: (value?: T) => void) => TextComponent) => Promise<T>
  }).custom
  if (typeof custom === "function") {
    await custom.call(ui, (tui, theme, kb, done) => {
      void tui
      void theme
      void kb
      return new OnboardingDiffView(`Vista previa: ${plan.length} archivo(s) cambiarán`, lines, () => done())
    })
    return
  }
  await ui.notify(lines.join("\n"), "info")
}

async function activateSessionModel(
  pi: ExtensionAPI,
  ctx: OnboardingContext,
  provider: string,
  modelId: string | undefined,
): Promise<boolean> {
  const ui = ctx.ui!
  if (!modelId) {
    await ui.notify("La configuración se guardó sin un modelo descubierto. Abre /model cuando el proveedor ya publique uno.", "warning")
    return false
  }
  const setModel = (pi as unknown as { setModel?: (model: unknown) => Promise<boolean> | boolean } | undefined)?.setModel
  if (typeof setModel !== "function") {
    await ui.notify(`La configuración se guardó, pero esta versión de pi no permite activar ${provider}/${modelId} en la sesión. Abre /model y elígelo.`, "warning")
    return false
  }
  try {
    await ctx.modelRegistry?.refresh?.()
    const model = ctx.modelRegistry?.find?.(provider, modelId)
    if (!model) {
      await ui.notify(`La configuración se guardó, pero pi todavía no encuentra ${provider}/${modelId}. Abre /model y elígelo.`, "warning")
      return false
    }
    if (!(await setModel.call(pi, model))) {
      await ui.notify(`Pi no pudo activar ${provider}/${modelId}. La configuración está guardada; abre /model y elígelo.`, "warning")
      return false
    }
    return true
  } catch (error) {
    await ui.notify(`Pi no pudo activar ${provider}/${modelId}: ${(error as Error).message}. La configuración está guardada; abre /model.`, "warning")
    return false
  }
}

async function approveCredentialOrigin(ui: ExtensionContext["ui"], baseUrl: string): Promise<CredentialPolicy | undefined> {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    await ui.notify("La URL base no es válida; no se autorizaron credenciales.", "error")
    return undefined
  }
  if (url.username || url.password) {
    await ui.notify("La URL base no puede contener credenciales.", "error")
    return undefined
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    await ui.notify("Las credenciales requieren HTTPS o un loopback HTTP aprobado expresamente.", "error")
    return undefined
  }
  const approved = await ui.confirm(
    `Autorizar credenciales para ${url.origin}?`,
    "La clave solo se enviará a este origen exacto; cambiar baseUrl exigirá otra aprobación.",
  )
  if (!approved) return undefined
  return {
    authorizedOrigin: url.origin,
    ...(url.protocol === "http:" ? { allowInsecureLoopback: true } : {}),
  }
}


async function importFoundSources(
  pi: ExtensionAPI,
  ctx: OnboardingContext,
  dirs: { agentDir: string; repoRoot: string },
  items: OpencodeImportItem[],
  state: OnboardingState,
): Promise<{ done: boolean; modelSummary: string; state: OnboardingState }> {
  const ui = ctx.ui!
  const paths = getPaths(dirs.agentDir)

  // Un solo permiso de orígenes: la clave solo viaja a los origenes listados.
  // Los servidores sin URL en OpenCode la piden aquí, con sugerencia.
  const origins: string[] = []
  const usable: Array<{ item: OpencodeImportItem; origin: string; allowInsecure: boolean; api: ApiType; preset?: ProviderPreset; baseUrl: string }> = []
  for (const original of items) {
    let item = original
    if (!item.baseUrl) {
      const raw = await ui.input(`URL base para ${item.sourceId}`, item.suggestedUrl ?? "https://")
      const url = usableBaseUrl(raw?.trim())
      if (!url) {
        await ui.notify(`Sin URL utilizable para ${item.sourceId}: se omite. Puedes añadirla luego en /providers.`, "warning")
        continue
      }
      item = { ...item, baseUrl: url }
    }
    const preset = item.presetId ? findPreset(item.presetId) : undefined
    const api = (preset?.api ?? "openai-completions") as ApiType
    let origin = ""
    let allowInsecure = false
    try {
      const url = new URL(item.baseUrl)
      origin = url.origin
      allowInsecure = url.protocol === "http:"
    } catch {
      continue
    }
    if (!origins.includes(origin)) origins.push(origin)
    usable.push({ item, origin, allowInsecure, api, preset: preset ?? undefined, baseUrl: item.baseUrl })
  }
  if (usable.length === 0) {
    await ui.notify("Ninguno de los servidores encontrados tiene una URL utilizable; nada se importó.", "warning")
    return { done: false }
  }
  const okOrigins = await ui.confirm(
    `Autorizar claves para: ${origins.join(", ")}?`,
    "La clave solo se enviará a estos orígenes exactos.",
  )
  if (!okOrigins) {
    await ui.notify("Nada importado. Puedes usar el asistente clásico o /providers.", "info")
    return { done: false }
  }

  // Sonda por servidor: se importa todo, pero el estado de cada uno queda claro.
  const modelsR = loadModels(paths)
  const models = modelsR.error ? { providers: {} } : modelsR.data
  let defaultProvider: string | undefined
  let defaultModel: string | undefined
  const results: string[] = []
  for (const { item, origin, allowInsecure, api, preset, baseUrl } of usable) {
    const providerId = item.presetId ?? item.sourceId
    await ui.setStatus("alfred-onboarding", `probando ${item.sourceId}...`)
    const importHeaders = Object.fromEntries(
      Object.entries(preset?.headers ?? {}).map(([name, ref]) => [name, resolveKeyRef(ref).value ?? ref]),
    )
    const probe = await probeLiveness({
      provider: providerId,
      baseUrl,
      api,
      apiKey: item.key,
      headers: importHeaders,
      credentialPolicy: { authorizedOrigin: origin, ...(allowInsecure ? { allowInsecureLoopback: true } : {}) },
    })
    await ui.setStatus("alfred-onboarding", undefined)
    const discovered = (probe.models ?? []).slice(0, 5).map((id) => ({ id }))
    models.providers[providerId] = {
      baseUrl,
      api,
      apiKey: item.key,
      credentialPolicy: { authorizedOrigin: origin, ...(allowInsecure ? { allowInsecureLoopback: true } : {}) },
      ...(Object.keys(importHeaders).length > 0 ? { headers: importHeaders } : {}),
      ...(preset?.compat ? { compat: preset.compat } : {}),
      ...(discovered.length > 0 ? { models: discovered } : {}),
    }
    const mark = probe.ok ? `responde: ${probe.latencyMs} ms, ${probe.models?.length ?? 0} modelos` : `sin respuesta: ${probe.error ?? "?"} (guardado igualmente)`
    results.push(`· ${item.sourceId} → ${providerId}: ${mark}`)
    if (probe.ok && !defaultProvider) {
      defaultProvider = providerId
      defaultModel = discovered[0]?.id
    }
  }

  const settings = loadSettings(paths)
  const settingsNext = settings.error ? {} : settings.data
  if (defaultProvider) {
    settingsNext.defaultProvider = defaultProvider
    settingsNext.defaultModel = defaultModel
  }
  const plan = planWrites({ models, settings: settingsNext }, paths)
  const lines = [
    ...results,
    "",
    `Modelo por defecto: ${defaultProvider ? `${defaultProvider}/${defaultModel ?? "?"}` : "ninguno con sonda viva"}`,
    ...plan.flatMap((write) => write.diff.split("\n")),
  ]
  const custom = (ui as unknown as {
    custom?: <T>(factory: (tui: unknown, theme: unknown, kb: unknown, done: (value?: T) => void) => TextComponent) => Promise<T>
  }).custom
  if (typeof custom === "function") {
    await custom.call(ui, (tui, theme, kb, done) => {
      void tui
      void theme
      void kb
      return new OnboardingDiffView(`Importación: ${plan.length} archivo(s) cambiarán`, lines, () => done())
    })
  } else {
    await ui.notify(lines.join("\n"), "info")
  }
  const apply = await ui.confirm("¿Aplicar la importación?", "Se hará una copia de seguridad antes de la escritura atómica.")
  if (!apply) {
    await ui.notify("Nada escrito. Puedes usar el asistente clásico o /providers.", "info")
    return { done: false }
  }
  applyPlan(plan, paths)
  state = recordStep(state, "import:opencode")
  saveOnboardingState(state, paths.dataDir)
let modelSummary = "La configuración está guardada. Puedes elegir el modelo desde /model sin depender de /reload."
  if (defaultProvider) {
    const activated = await activateSessionModel(pi, ctx, defaultProvider, defaultModel)
    if (activated) modelSummary = `${defaultProvider}/${defaultModel} ya está activo en esta sesión.`
  }
  return { done: true, modelSummary, state }
}


/** Tramo común de cierre: autopilot y presupuesto opcionales + alta completada. */
async function finishSetup(
  pi: ExtensionAPI,
  ctx: OnboardingContext,
  dirs: { agentDir: string; repoRoot: string },
  state: OnboardingState,
  modelResult: string,
): Promise<void> {
  const ui = ctx.ui!
  const paths = getPaths(dirs.agentDir)
  const auto = await ui.confirm("¿Activar autopilot y preparar los packs por turno?", "Puedes cambiarlo después desde /autopilot.")
  if (auto) {
    const autoState = loadAutopilotState(paths.dataDir)
    autoState.enabled = true
    autoState.enabledAt = new Date().toISOString()
    saveAutopilotState(autoState, paths.dataDir)
    // Same routine as "deal all cards": every pack's skills on the menu.
    const dealt = enableAllDomains({ agentDir: dirs.agentDir, cwd: process.cwd(), dataDir: paths.dataDir, repoRoot: dirs.repoRoot })
    const okCount = dealt.filter((r) => r.ok).length
    if (dealt.length > 0) await ui.notify(`Preparados ${okCount}/${dealt.length} packs. Se cargarán al ejecutar /reload; el modelo de esta sesión no depende de esa recarga.`, "info")
    state = recordStep(state, "autopilot")
    saveOnboardingState(state, paths.dataDir)
  }

  const wantBudget = await ui.confirm(
    "¿Fijar un presupuesto diario en USD?",
    "Habrá aviso al 80 % y modo frugal al 100 %. El guardián lee tus sesiones locales y te avisa; no te corta ni envía datos a ningún sitio. Puedes saltarlo.",
  )
  if (wantBudget) {
    const raw = await ui.input("Máximo de USD por día", "5")
    const value = Number(raw)
    if (!Number.isNaN(value) && value > 0) {
      const b = loadBudgetState(paths.dataDir)
      b.dailyMaxUsd = value
      saveBudgetState(b, paths.dataDir)
      state = recordStep(state, `budget:${value}`)
      saveOnboardingState(state, paths.dataDir)
    }
  }

  saveOnboardingState(completeOnboarding(state), paths.dataDir)
  const packsResult = auto ? "Ejecuta /reload cuando quieras cargar los packs preparados." : "Puedes abrir /autopilot cuando quieras activar el radar."
  await ui.notify(`Listo. ${modelResult} ${packsResult} Cierre opcional: instala @gotgenes/pi-permission-system desde /essentials para pedir permiso antes de bash y escrituras, si tú lo decides.`, "info")
}

export async function onboardingFlow(
  pi: ExtensionAPI,
  ctx: OnboardingContext,
  dirs: { agentDir: string; repoRoot: string; importScan?: () => OpencodeImportItem[] },
): Promise<void> {
  const ui = ctx.ui
  if (!ui) return
  const paths = getPaths(dirs.agentDir)
  let state = loadOnboardingState(paths.dataDir)

  // Step 0: claves que ya viven en esta máquina (OpenCode primero). Importar
  // gana a interrogar: el escaneo se inyecta desde el adaptador para que lib/
  // siga siendo pura y los viajes de test no lean el disco real.
  const found = dirs.importScan?.() ?? []
  if (found.length > 0) {
    const list = found.map((i) => `· ${i.sourceId} → ${i.kind === "preset" ? i.presetLabel : i.baseUrl} · ${i.keyMasked}`).join("\n")
    const wantImport = await ui.confirm(
      `Encontré ${found.length} servidor(es) con clave en OpenCode`,
      `¿Los importo?\n${list}\nCopia, no muda: OpenCode seguirá funcionando igual.`,
    )
    if (wantImport) {
      const imported = await importFoundSources(pi, ctx, dirs, found, state)
      if (imported.done) {
        await finishSetup(pi, ctx, dirs, imported.state, imported.modelSummary)
        return
      }
      // sin permiso de orígenes o sin sonda viva: sigue el asistente clásico
    }
  }

  // Step 1: start from the person's route, then show human preset labels.
  const route = await ui.select("¿Cómo quieres usar tu modelo?", [...ROUTE_LABELS])
  if (route === undefined || route >= 3) {
    await deferWithMessage(ui, state, paths.dataDir, "Asistente cerrado por ahora y diferido. Volverá mientras no haya un proveedor; también puedes abrir /providers.")
    return
  }

  state = recordStep(state, `route:${route === 0 ? "cloud" : route === 1 ? "local" : "gateway"}`)
  saveOnboardingState(state, paths.dataDir)

  let preset: ProviderPreset | undefined
  let ollamaModels: string[] | undefined

  if (route === 0) {
    const presets = cloudPresets()
    const choice = await ui.select(
      "Nube: elige el acceso que ya tienes",
      ["Suscripción con acceso nativo de pi mediante /login", ...presets.map((item) => item.label)],
    )
    if (choice === undefined) {
      await deferWithMessage(ui, state, paths.dataDir, "Asistente diferido. Puedes volver cuando tengas a mano tu suscripción o clave.")
      return
    }
    if (choice === 0) {
      await deferWithMessage(ui, state, paths.dataDir, "Ejecuta /login y elige tu proveedor nativo. Cuando pi guarde el acceso, el asistente dejará de mostrarse.")
      return
    }
    preset = presets[choice - 1]
  } else if (route === 1) {
    const localChoices = [
      "Ollama instalado en mi máquina",
      "llama.cpp mediante el acceso nativo de pi",
      "LM Studio ya encendido",
      "vLLM ya encendido",
      "SGLang ya encendido",
    ]
    const choice = await ui.select("Máquina local: elige cómo sirves el modelo", localChoices)
    if (choice === undefined) {
      await deferWithMessage(ui, state, paths.dataDir, "Asistente local diferido. Puedes volver cuando tu servidor esté listo.")
      return
    }
    if (choice === 1) {
      await deferWithMessage(ui, state, paths.dataDir, "Ejecuta /login y elige llama.cpp para seguir el recorrido nativo de pi.")
      return
    }
    if (choice === 0) {
      const tags = await ollamaTags(DEFAULT_OLLAMA_BASE)
      if (tags.error) {
        const reason = `Ollama no responde: ${tags.error}`
        saveOnboardingState(blockOnboarding(state, reason), paths.dataDir)
        await ui.notify(`${reason}. Ejecuta \`ollama serve\` y vuelve a abrir el asistente. No se descargó nada.`, "warning")
        return
      }
      if (tags.models.length === 0) {
        const reason = "Ollama no tiene modelos instalados"
        saveOnboardingState(blockOnboarding(state, reason), paths.dataDir)
        await ui.notify(`${reason}. Abre /ollama para elegir una descarga y confirmarla, o ejecuta \`ollama pull <modelo>\`.`, "warning")
        return
      }
      preset = findPreset("ollama")
      ollamaModels = tags.models.map((model) => model.name)
    } else {
      preset = findPreset(choice === 2 ? "lmstudio" : choice === 3 ? "vllm" : "sglang")
    }
  } else {
    const presets = gatewayPresets()
    const choice = await ui.select("Pasarela: elige la que ya utilizas", presets.map((item) => item.label))
    if (choice === undefined) {
      await deferWithMessage(ui, state, paths.dataDir, "Asistente diferido. Puedes volver cuando tengas preparada tu pasarela.")
      return
    }
    preset = presets[choice]
  }

  if (!preset) {
    saveOnboardingState(blockOnboarding(state, "No se encontró el preset elegido"), paths.dataDir)
    await ui.notify("No se encontró la configuración elegida. Abre /providers para continuar a mano.", "error")
    return
  }

  state = recordStep(state, `preset:${preset.id}`)
  saveOnboardingState(state, paths.dataDir)

  // Step 1b: pasarelas y servidores propios deciden su propia URL. La
  // validación y el consentimiento van por approveCredentialOrigin, con sus
  // diagnósticos específicos.
  let credentialPolicy = preset.credentialPolicy
  let presetBaseUrl = preset.baseUrl
  if (GATEWAY_PRESET_IDS.has(preset.id) || preset.id === "custom-openai") {
    const raw = await ui.input(`URL base para ${preset.label}`, preset.baseUrl)
    const policy = await approveCredentialOrigin(ui, (raw ?? "").trim())
    if (!policy) {
      saveDeferred(state, paths.dataDir)
      await ui.notify("Asistente diferido; no se autorizó ni se escribió la credencial.", "warning")
      return
    }
    presetBaseUrl = (raw ?? "").trim()
    credentialPolicy = policy
  }

  // Step 2: literal local keys need no question; cloud keys keep env refs.
  const keyDefault = preset.keyEnv ? `$${preset.keyEnv}` : preset.keyLiteral ?? ""
  const key = preset.keyLiteral !== undefined
    ? preset.keyLiteral
    : (await ui.input(`Clave para ${preset.label} (literal, $ENV_VAR o vacía)`, keyDefault)) ?? ""

  // Step 3: probe before writing. Ollama's native tags endpoint already did it.
  const resolved = resolveKeyRef(key === "" ? undefined : key)
  if (key && !credentialPolicy) {
    credentialPolicy = await approveCredentialOrigin(ui, presetBaseUrl)
    if (!credentialPolicy) {
      saveDeferred(state, paths.dataDir)
      await ui.notify("Asistente diferido; no se autorizó ni se escribió la credencial.", "warning")
      return
    }
  }
  let probe: Awaited<ReturnType<typeof probeLiveness>>
  if (ollamaModels) {
    probe = { ok: true, latencyMs: 0, models: ollamaModels }
  } else {
    await ui.setStatus("alfred-onboarding", `probando ${preset.label}...`)
    const extraHeaders = Object.fromEntries(
      Object.entries(preset.headers ?? {}).map(([name, ref]) => [name, resolveKeyRef(ref).value ?? ref]),
    )
    probe = await probeLiveness({
      provider: preset.id,
      baseUrl: presetBaseUrl,
      api: preset.api as ApiType,
      apiKey: resolved.value,
      headers: extraHeaders,
      credentialPolicy,
    })
    await ui.setStatus("alfred-onboarding", undefined)
  }
  if (!probe.ok) {
    const goOn = await ui.confirm(
      `No pude hablar con ${preset.label}: ${probe.error}`,
      "¿Guardar el proveedor igualmente y continuar?",
    )
    if (!goOn) {
      const reason = `${preset.id}: ${probe.error ?? "la sonda falló"}`
      saveOnboardingState(blockOnboarding(state, reason), paths.dataDir)
      await ui.notify("Asistente bloqueado; nada se escribió. Corrige la conexión y vuelve a intentarlo.", "warning")
      return
    }
  } else {
    await ui.notify(`${preset.label} responde: ${probe.latencyMs} ms, ${probe.models?.length ?? 0} modelos.`, "info")
  }
  state = recordStep(state, "probe")
  saveOnboardingState(state, paths.dataDir)

  // Step 4: show the redacted real diff before the safe planned write.
  const modelsR = loadModels(paths)
  const models = modelsR.error ? { providers: {} } : modelsR.data
  const provider: ProviderConfig = {
    baseUrl: presetBaseUrl,
    api: preset.api,
    ...(key ? { apiKey: key } : {}),
    ...(credentialPolicy ? { credentialPolicy } : {}),
    ...(Object.keys(preset.headers ?? {}).length > 0 ? { headers: preset.headers } : {}),
    ...(preset.compat ? { compat: preset.compat } : {}),
  }
  const discovered = (probe.models ?? []).slice(0, 5).map((id) => ({ id }))
  if (discovered.length > 0) provider.models = discovered
  models.providers[preset.id] = provider

  const settings = loadSettings(paths)
  const settingsNext = settings.error ? {} : settings.data
  settingsNext.defaultProvider = preset.id
  settingsNext.defaultModel = discovered[0]?.id

  const plan = planWrites({ models, settings: settingsNext }, paths)
  if (plan.length > 0) {
    await showPlanDiff(ui, plan, preset, settingsNext.defaultModel as string | undefined, key)
    const ok = await ui.confirm("¿Aplicar estos cambios?", "Se hará una copia de seguridad antes de la escritura atómica.")
    if (!ok) {
      saveDeferred(state, paths.dataDir)
      await ui.notify("Nada escrito. El asistente queda diferido; también puedes abrir /providers.", "info")
      return
    }
    applyPlan(plan, paths)
  } else {
    await ui.notify("La configuración ya coincide con el plan; no hay archivos que escribir.", "info")
  }
  state = recordStep(state, "provider-written")
  saveOnboardingState(state, paths.dataDir)
  const modelActivated = await activateSessionModel(pi, ctx, preset.id, settingsNext.defaultModel as string | undefined)

  const modelResult = modelActivated && settingsNext.defaultModel
    ? `${preset.id}/${settingsNext.defaultModel} ya está activo en esta sesión.`
    : "La configuración está guardada. Puedes elegir el modelo desde /model sin depender de /reload."
  await finishSetup(pi, ctx, dirs, state, modelResult)
}
