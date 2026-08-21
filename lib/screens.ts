/**
 * TUI screens for pi-harness-moe: a SelectList dashboard plus dialog-driven
 * flows for providers, keys, defaults, doctor, profiles, domains, backups,
 * ollama, packages, stack, autopilot, usage and essentials.
 */
import { SelectList } from "@earendil-works/pi-tui"
import { getSelectListTheme } from "@earendil-works/pi-coding-agent"
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent"
import type { SelectItem } from "@earendil-works/pi-tui"
import { join } from "node:path"
import {
  type ModelsFile,
  type AuthFile,
  type SettingsFile,
  type ProviderConfig,
  type ModelConfig,
  type CredentialPolicy,
  getPaths,
  loadModels,
  loadAuth,
  loadSettings,
  planWrites,
  applyPlan,
  listBackups,
  pinBackup,
  unpinBackup,
  restoreBackup,
} from "./config-io.ts"
import { PROVIDER_PRESETS, findPreset, isValidProviderId } from "./presets.ts"
import { probeLiveness, discoverModels, deepProbe, resolveKeyRef, maskKey, type ApiType, type ProbeTarget } from "./prober.ts"
import { runDoctor, formatDoctorReport, summarizeHealth, loadRecentHealth } from "./doctor.ts"
import { loadProfiles, saveProfiles, upsertProfile, deleteProfile, pickStep, type Profile } from "./profiles.ts"
import {
  discoverDomains,
  loadDomainsState,
  isDomainEnabled,
  enableDomain,
  disableDomain,
  enableAllDomains,
} from "./domains.ts"
import {
  ESSENTIALS,
  isEssentialInstalled,
  missingEssentials,
  installedNpmPackages,
  essentialOrchestrationTiers,
  type EssentialPackage,
} from "./essentials.ts"
import { collectUsage, aggregateUsage, formatUsageReport } from "./usage.ts"
import { loadFallbackState, saveFallbackState, nextStepAfter } from "./fallback.ts"
import {
  fetchCatalog,
  enrichWithCatalog,
  lookupCatalog,
  classifyIntention,
  pickModelsForIntention,
  type Catalog,
  type CatalogModelMeta,
  type IntentionModel,
  type ModelIntention,
} from "./catalog.ts"
import {
  auditNpmPackage,
  formatAuditReport,
  auditHasHighFindings,
  auditStatus,
  installTargetFromAudit,
  loadAuditReceipt,
  saveAuditReceipt,
  type PackageAudit,
} from "./pkg-audit.ts"
import { loadAutopilotState, saveAutopilotState, detectDomain, type AutopilotRouting } from "./autopilot.ts"
import { loadBudgetState, saveBudgetState, spendToday } from "./budget.ts"
import { searchPiPackages, packageDetail, packageDownloads, type PackageDetail, type RegistryPackage } from "./packages-registry.ts"
import { auditGitSource } from "./pkg-audit.ts"
import { collectStack, formatStackText } from "./stack.ts"
import {
  ollamaBase,
  ollamaTags,
  ollamaPs,
  ollamaRm,
  ollamaPull,
  toModelsEntry,
  ensureOllamaProvider,
  registeredOllamaModels,
  describeOllamaModel,
} from "./ollama.ts"
import { getBaseDir, getDataDir } from "./paths.ts"
import { dealAllSalasLabel } from "./house-copy.ts"
import { LOCAL_FIRST } from "./local-first.ts"
import { loadMemoryPolicy, saveMemoryPolicy } from "./memory-policy.ts"
import { assessCuration } from "./curation-watchdog.ts"

type Ui = ExtensionContext["ui"]

const API_TYPES: ApiType[] = ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"]
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const
const MODEL_INTENTIONS: Array<{ value: ModelIntention; label: string; description: string }> = [
  { value: "fast", label: "Rápido", description: "Modelos con ficha de coste, sin ordenar por precio." },
  { value: "reasoner", label: "Razonador", description: "Modelos cuya ficha declara razonamiento." },
  { value: "vision", label: "Visión", description: "Modelos cuya ficha declara entrada de imagen." },
  { value: "local", label: "Local", description: "Ollama, llama.cpp o un endpoint local." },
]

// ---------------------------------------------------------------------------
// Custom components

interface Component {
  render(width: number): string[]
  handleInput(data: string): void
  invalidate?(): void
  dispose?(): void
}

/** Wraps a SelectList with a title bar, footer hints and Esc-to-cancel. */
class DashboardComponent implements Component {
  constructor(
    private readonly list: SelectList,
    private readonly title: string,
    private readonly footer: string[],
    private readonly done: (result: string | undefined) => void,
  ) {}

  render(width: number): string[] {
    return [this.title, "", ...this.list.render(width), "", ...this.footer.map((f) => `  ${f}`)]
  }

  handleInput(data: string): void {
    if (data === "\x1b" || data === "\x03") {
      this.done(undefined)
      return
    }
    this.list.handleInput(data)
  }

  invalidate(): void {
    this.list.invalidate()
  }
}

/** Scrollable read-only text viewer (diffs, reports, pack context). */
class TextViewComponent implements Component {
  private offset = 0
  private viewport = 10

  constructor(
    private readonly title: string,
    private readonly lines: string[],
    private readonly done: () => void,
    private readonly colorize?: (line: string) => string,
  ) {}

  render(width: number): string[] {
    const out: string[] = [this.title, ""]
    this.viewport = Math.max(4, 14)
    const slice = this.lines.slice(this.offset, this.offset + this.viewport)
    out.push(
      ...slice.map((l) => {
        const plain = l.length > width - 2 ? l.slice(0, width - 2) : l
        return this.colorize ? this.colorize(plain) : plain
      }),
    )
    if (this.lines.length > this.viewport) {
      out.push("", `  ↑/↓ scroll · q/Esc close  (${this.offset + 1}-${Math.min(this.offset + this.viewport, this.lines.length)} of ${this.lines.length})`)
    } else {
      out.push("", "  q/Esc close")
    }
    return out
  }

  handleInput(data: string): void {
    if (data === "\x1b" || data === "\x03" || data === "q" || data === "\r") {
      this.done()
      return
    }
    if (data === "\x1b[A" || data === "k") {
      this.offset = Math.max(0, this.offset - 1)
    } else if (data === "\x1b[B" || data === "j") {
      this.offset = Math.min(Math.max(0, this.lines.length - this.viewport), this.offset + 1)
    }
  }
}

/** Diff coloring: additions green, removals red, hunk headers cyan. */
function diffColor(line: string): string {
  if (line.startsWith("+")) return `\x1b[32m${line}\x1b[39m`
  if (line.startsWith("-")) return `\x1b[31m${line}\x1b[39m`
  if (line.startsWith("@@")) return `\x1b[36m${line}\x1b[39m`
  return line
}

/** Show read-only text lines in a fullscreen overlay. */
async function showText(ui: Ui, title: string, lines: string[], opts?: { diff?: boolean }): Promise<void> {
  if (!lines.length) lines = ["(empty)"]
  await ui.custom<void>((tui, theme, _kb, done) => new TextViewComponent(title, lines, done, opts?.diff ? diffColor : undefined))
}

/** Show a titled list and return the selected value (or undefined on Esc). */
async function pick(ui: Ui, title: string, items: SelectItem[], footer?: string[]): Promise<string | undefined> {
  return ui.custom<string | undefined>((tui, theme, _kb, done) => {
    const list = new SelectList(items, 16, getSelectListTheme(theme as Theme))
    list.onSelect = (item) => done(item.value)
    list.onCancel = () => done(undefined)
    return new DashboardComponent(list, title, footer ?? ["↑/↓ select · Enter open · Esc back"], done)
  })
}

/** Multi-select checklist: space toggles, Enter confirms the chosen set. */
class MultiSelectComponent implements Component {
  private index = 0
  private offset = 0
  private readonly viewport = 14
  constructor(
    private readonly title: string,
    private readonly items: SelectItem[],
    private readonly selected: Set<string>,
    private readonly done: (result: string[] | undefined) => void,
  ) {}

  private toggleAll(): void {
    if (this.selected.size === this.items.length) this.selected.clear()
    else for (const i of this.items) this.selected.add(i.value)
  }

  render(width: number): string[] {
    const out: string[] = [this.title, ""]
    const end = Math.min(this.items.length, this.offset + this.viewport)
    for (let i = this.offset; i < end; i++) {
      const item = this.items[i]!
      const isCursor = i === this.index
      const cursor = isCursor ? "▸ " : "  "
      const mark = this.selected.has(item.value) ? "\x1b[32m[x]\x1b[39m" : "[ ]"
      const plain = `${mark} ${item.label}`.slice(0, Math.max(10, width - 2))
      out.push(`${cursor}${isCursor ? `\x1b[1m${plain}\x1b[22m` : plain}`)
      if (isCursor && item.description) {
        out.push(`      ${item.description.slice(0, Math.max(10, width - 8))}`)
      }
    }
    if (this.items.length > this.viewport) {
      out.push("", `  (${this.offset + 1}-${end} of ${this.items.length})`)
    }
    out.push("", "  ↑/↓ move · space toggle · a all · Enter confirm · Esc cancel")
    return out
  }

  handleInput(data: string): void {
    if (data === "\x1b" || data === "\x03") {
      this.done(undefined)
      return
    }
    if (data === "\x1b[A" || data === "k") {
      this.index = Math.max(0, this.index - 1)
      if (this.index < this.offset) this.offset = this.index
    } else if (data === "\x1b[B" || data === "j") {
      this.index = Math.min(this.items.length - 1, this.index + 1)
      if (this.index >= this.offset + this.viewport) this.offset = this.index - this.viewport + 1
    } else if (data === " ") {
      const value = this.items[this.index]?.value
      if (value !== undefined) {
        if (this.selected.has(value)) this.selected.delete(value)
        else this.selected.add(value)
      }
    } else if (data === "a") {
      this.toggleAll()
    } else if (data === "\r" || data === "\n") {
      this.done([...this.selected])
    }
  }
}

/** Show a multi-select checklist; returns chosen values or undefined on Esc. */
async function multiPick(ui: Ui, title: string, items: SelectItem[], preselected: string[] = []): Promise<string[] | undefined> {
  return ui.custom<string[] | undefined>((tui, theme, _kb, done) => new MultiSelectComponent(title, items, new Set(preselected), done))
}

// ---------------------------------------------------------------------------
// Shared helpers

interface Ctx extends ExtensionContext {
  ui: Ui
}

function authBadge(ctx: Ctx, provider: string): string {
  try {
    const status = ctx.modelRegistry.getProviderAuthStatus(provider)
    if (!status?.configured) return "✗ no key"
    switch (status.source) {
      case "stored":
        return "✓ key"
      case "environment":
        return "✓ env"
      case "models_json_key":
        return "✓ models.json"
      case "models_json_command":
        return "✓ cmd"
      case "runtime":
        return "✓ runtime"
      case "fallback":
        return "✓ fallback"
      default:
        return status.label ? `✓ ${status.label}` : "✓"
    }
  } catch {
    return "? unknown"
  }
}

/** Plan → diff preview → confirm → apply → live refresh. */
async function confirmAndApply(pi: ExtensionAPI, ctx: Ctx, changes: { models?: ModelsFile; auth?: AuthFile; settings?: SettingsFile }): Promise<boolean> {
  const paths = getPaths()
  const plan = planWrites(changes, paths)
  if (plan.length === 0) {
    await ctx.ui.notify("No changes to write", "info")
    return false
  }
  const diffLines = plan.flatMap((p) => p.diff.split("\n"))
  await showText(ctx.ui, `Preview - ${plan.length} file(s) will change`, diffLines, { diff: true })
  const okToApply = await ctx.ui.confirm("Apply changes?", "A backup is taken automatically before writing.")
  if (!okToApply) return false
  applyPlan(plan, paths)
  try {
    await ctx.modelRegistry.refresh()
  } catch {
    // refresh is best-effort; /model also reloads models.json
  }
  return true
}

function freshModels(): ModelsFile {
  const r = loadModels()
  if (r.error) throw new Error(`models.json: ${r.error}`)
  return r.data
}

function freshAuth(): AuthFile {
  const r = loadAuth()
  if (r.error) throw new Error(`auth.json: ${r.error}`)
  return r.data
}

function freshSettings(): SettingsFile {
  const r = loadSettings()
  if (r.error) throw new Error(`settings.json: ${r.error}`)
  return r.data
}

function probeTargetFromConfig(provider: string, config: ProviderConfig): ProbeTarget | undefined {
  if (!config.baseUrl || !config.api) return undefined
  return {
    provider,
    baseUrl: config.baseUrl,
    api: config.api as ApiType,
    apiKey: resolveKeyRef(config.apiKey).value,
    headers: config.headers,
    credentialPolicy: config.credentialPolicy,
  }
}

function credentialPolicyMatchesBaseUrl(policy: CredentialPolicy | undefined, baseUrl: string): boolean {
  if (!policy) return false
  try {
    const url = new URL(baseUrl)
    if (url.username || url.password || policy.authorizedOrigin !== url.origin) return false
    if (url.protocol === "https:") return true
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1"
    return url.protocol === "http:" && loopback && policy.allowInsecureLoopback === true
  } catch {
    return false
  }
}

async function approveCredentialOrigin(ctx: Ctx, baseUrl: string): Promise<CredentialPolicy | undefined> {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    await ctx.ui.notify("Invalid base URL; credentials were not authorized", "error")
    return undefined
  }
  if (url.username || url.password) {
    await ctx.ui.notify("Base URL must not contain embedded credentials", "error")
    return undefined
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    await ctx.ui.notify("Credentials require HTTPS or an explicitly approved HTTP loopback", "error")
    return undefined
  }
  const approved = await ctx.ui.confirm(
    `Authorize credentials for ${url.origin}?`,
    "The key will be sent only to this exact origin. Changing baseUrl will require new approval.",
  )
  if (!approved) return undefined
  return {
    authorizedOrigin: url.origin,
    ...(url.protocol === "http:" ? { allowInsecureLoopback: true } : {}),
  }
}

// ---------------------------------------------------------------------------
// Providers dashboard

export async function providersDashboard(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  while (true) {
    const models = freshModels()
    const settings = freshSettings()
    const customIds = Object.keys(models.providers ?? {})

    // Providers known to the registry (built-ins with catalogs + customs).
    const registryIds = new Set<string>()
    try {
      for (const m of ctx.modelRegistry.getAll()) registryIds.add(String((m as unknown as { provider: string }).provider))
    } catch {
      // registry unavailable (e.g. odd mode) - customs still shown
    }
    const allIds = [...new Set([...customIds, ...registryIds])].sort((a, b) => {
      const aCustom = customIds.includes(a) ? 0 : 1
      const bCustom = customIds.includes(b) ? 0 : 1
      if (aCustom !== bCustom) return aCustom - bCustom
      return a.localeCompare(b)
    })

    const defaultProvider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : undefined
    const defaultModel = typeof settings.defaultModel === "string" ? settings.defaultModel : undefined

    const items: SelectItem[] = allIds.map((id) => {
      const custom = models.providers?.[id]
      const modelCount = custom?.models?.length ?? countRegistryModels(ctx, id)
      const isDefault = id === defaultProvider
      const kind = custom ? "custom" : "built-in"
      return {
        value: `provider:${id}`,
        label: `${isDefault ? "★ " : ""}${id}${isDefault ? ` (${defaultModel ?? "?"})` : ""}`,
        description: `${kind} · ${authBadge(ctx, id)} · ${modelCount} model${modelCount === 1 ? "" : "s"}`,
      }
    })

    items.push(
      { value: "action:add", label: "+ Add provider…", description: "wizard with presets and model discovery" },
      { value: "action:keys", label: "Keys & auth…", description: "manage API keys for any provider" },
      { value: "action:defaults", label: "Defaults…", description: "default provider, model and thinking level" },
      { value: "action:doctor", label: "Doctor…", description: "health checks + config reconciliation" },
      { value: "action:profiles", label: "Profiles…", description: "model stacks with fallback chains" },
      { value: "action:usage", label: "Usage & cost…", description: "per session/model/day from local session files" },
      { value: "action:domains", label: "Domains…", description: "work-area packs (skills, prompts, context)" },
      { value: "action:autopilot", label: "Autopilot…", description: "auto-detect the domain per turn - focused context, zero manual switching" },
      { value: "action:essentials", label: "Essentials…", description: "curated packages (MCP, subagents, plan mode…)" },
      { value: "action:packages", label: "Package browser…", description: "search any pi package · audit · install" },
      { value: "action:stack", label: "Stack…", description: "control tower: model, autopilot, domains, health, budget" },
      { value: "action:ollama", label: "Ollama…", description: "local + cloud models: list, pull, remove, register in pi" },
      { value: "action:backups", label: "Backups…", description: "restore, pin or delete config snapshots" },
      { value: "action:quit", label: "Quit", description: "close the dashboard" },
    )

    const choice = await pick(ctx.ui, "Alfred-Pi - providers", items, ["↑/↓ move · Enter open · Esc close"])

    if (choice === undefined || choice === "action:quit") return
    if (choice.startsWith("provider:")) {
      await providerMenu(pi, ctx, choice.slice("provider:".length))
    } else if (choice === "action:add") {
      await addProviderWizard(pi, ctx)
    } else if (choice === "action:keys") {
      await keysScreen(pi, ctx)
    } else if (choice === "action:defaults") {
      await defaultsScreen(pi, ctx)
    } else if (choice === "action:doctor") {
      await doctorScreen(pi, ctx)
    } else if (choice === "action:profiles") {
      await profilesScreen(pi, ctx)
    } else if (choice === "action:usage") {
      await usageScreen(pi, ctx)
    } else if (choice === "action:domains") {
      await domainsScreen(pi, ctx)
    } else if (choice === "action:autopilot") {
      await autopilotScreen(pi, ctx)
    } else if (choice === "action:essentials") {
      await essentialsScreen(pi, ctx)
    } else if (choice === "action:packages") {
      await packagesScreen(pi, ctx)
    } else if (choice === "action:stack") {
      await stackScreen(pi, ctx)
    } else if (choice === "action:ollama") {
      await ollamaScreen(pi, ctx)
    } else if (choice === "action:backups") {
      await backupsScreen(pi, ctx)
    }
  }
}

function countRegistryModels(ctx: Ctx, provider: string): number {
  try {
    return ctx.modelRegistry.getAll().filter((m) => (m as unknown as { provider: string }).provider === provider).length
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Catalog autofill (models.dev)

let catalogPromise: Promise<Catalog | null> | undefined

function getCatalog(): Promise<Catalog | null> {
  catalogPromise ??= fetchCatalog({ dataDir: getDataDir() })
  return catalogPromise
}

function configuredCatalogMeta(model: ModelConfig | undefined): CatalogModelMeta | undefined {
  if (!model) return undefined
  const meta: CatalogModelMeta = {}
  if (typeof model.contextWindow === "number") meta.contextWindow = model.contextWindow
  if (typeof model.maxTokens === "number") meta.maxTokens = model.maxTokens
  if (typeof model.reasoning === "boolean") meta.reasoning = model.reasoning
  if (Array.isArray(model.input)) meta.vision = model.input.includes("image")
  if (model.cost && Object.values(model.cost).some((value) => typeof value === "number" && Number.isFinite(value))) {
    meta.cost = model.cost
  }
  return Object.keys(meta).length > 0 ? meta : undefined
}

function intentionEntries(
  provider: string,
  modelIds: string[],
  config: ProviderConfig | undefined,
  catalog?: Catalog | null,
): IntentionModel[] {
  return modelIds.map((id) => ({
    id,
    provider,
    baseUrl: config?.baseUrl,
    meta: (catalog ? lookupCatalog(catalog, provider, id) : undefined)
      ?? configuredCatalogMeta(config?.models?.find((model) => model.id === id)),
  }))
}

function modelCard(entry: IntentionModel): string {
  if (!entry.meta) return "sin ficha"
  const details: string[] = []
  const classification = classifyIntention(entry)
  if (classification) {
    details.push(MODEL_INTENTIONS.find((item) => item.value === classification)?.label.toLowerCase() ?? classification)
  }
  if (typeof entry.meta.contextWindow === "number") details.push(`${Math.round(entry.meta.contextWindow / 1000)}k de contexto`)
  const input = entry.meta.cost?.input
  const output = entry.meta.cost?.output
  if (typeof input === "number") details.push(`entrada ${input} USD/M`)
  if (typeof output === "number") details.push(`salida ${output} USD/M`)
  return details.join(" · ") || "ficha sin precio"
}

async function confirmIntentionModel(
  ctx: Ctx,
  provider: string,
  entries: IntentionModel[],
  intention: ModelIntention,
): Promise<string | undefined> {
  const candidates = pickModelsForIntention(entries, intention)
  if (candidates.length === 0) {
    await ctx.ui.notify(
      `No hay modelos para la intención «${MODEL_INTENTIONS.find((item) => item.value === intention)?.label ?? intention}».`,
      "warning",
    )
    return undefined
  }
  const selected = await pick(
    ctx.ui,
    `Modelo para «${MODEL_INTENTIONS.find((item) => item.value === intention)?.label ?? intention}»`,
    candidates.map((candidate) => {
      const entry = entries.find((model) => model.id === candidate.id)!
      return {
        value: candidate.id,
        label: candidate.id,
        description: candidate.missingMeta ? "sin ficha" : modelCard(entry),
      }
    }),
    ["Se conserva el orden del proveedor; no hay clasificación semanal por precio."],
  )
  if (!selected) return undefined
  const entry = entries.find((model) => model.id === selected)!
  const confirmed = await ctx.ui.confirm(
    `¿Usar ${provider}/${selected} para «${MODEL_INTENTIONS.find((item) => item.value === intention)?.label ?? intention}»?`,
    modelCard(entry),
  )
  return confirmed ? selected : undefined
}

async function chooseModel(
  ctx: Ctx,
  provider: string,
  modelIds: string[],
  config: ProviderConfig | undefined,
): Promise<string | undefined> {
  const configuredEntries = intentionEntries(provider, modelIds, config)
  const choice = await pick(ctx.ui, `Modelo predeterminado, ${provider}`, [
    ...MODEL_INTENTIONS.map((intention) => ({
      value: `intent:${intention.value}`,
      label: `Intención: ${intention.label}`,
      description: intention.description,
    })),
    ...configuredEntries.map((entry) => ({ value: entry.id!, label: entry.id!, description: modelCard(entry) })),
  ])
  if (!choice) return undefined
  if (!choice.startsWith("intent:")) return choice
  const intention = choice.slice("intent:".length) as ModelIntention
  const catalog = await getCatalog()
  return confirmIntentionModel(ctx, provider, intentionEntries(provider, modelIds, config, catalog), intention)
}

async function resolveDiscoveredSelection(
  ctx: Ctx,
  provider: string,
  modelIds: string[],
  config: ProviderConfig,
  selected: string[] | undefined,
  catalog: Catalog | null,
): Promise<string[] | undefined> {
  if (!selected) return undefined
  const intentions = selected.filter((value) => value.startsWith("intent:"))
  if (intentions.length === 0) return selected
  if (intentions.length !== 1 || selected.length !== 1) {
    await ctx.ui.notify("Elige una sola intención o modelos concretos, no ambas opciones a la vez.", "warning")
    return undefined
  }
  const intention = intentions[0]!.slice("intent:".length) as ModelIntention
  const model = await confirmIntentionModel(
    ctx,
    provider,
    intentionEntries(provider, modelIds, config, catalog),
    intention,
  )
  return model ? [model] : undefined
}

// ---------------------------------------------------------------------------
// Single provider menu

async function providerMenu(pi: ExtensionAPI, ctx: Ctx, name: string): Promise<void> {
  const models = freshModels()
  const custom = models.providers?.[name]
  if (!custom) {
    // Built-in provider: keys + default + doctor apply.
    const action = await pick(ctx.ui, `${name} (built-in)`, [
      { value: "key", label: "Set API key…", description: "writes auth.json" },
      { value: "default", label: "Set as default…", description: "choose model + set defaults" },
      { value: "test", label: "Test connection", description: "liveness probe" },
      { value: "back", label: "Back", description: "" },
    ])
    if (action === "key") await setKeyFlow(pi, ctx, name, undefined)
    else if (action === "default") await defaultsScreen(pi, ctx, name)
    else if (action === "test") await testProvider(pi, ctx, name, custom)
    return
  }

  const action = await pick(ctx.ui, `${name} - ${custom.baseUrl ?? "?"}`, [
    { value: "models", label: "Models…", description: `${custom.models?.length ?? 0} configured · add / edit / remove` },
    { value: "edit", label: "Edit provider (JSON)…", description: "baseUrl, api, headers - raw with validation" },
    { value: "key", label: "API key…", description: `current: ${maskKey(custom.apiKey)}` },
    { value: "discover", label: "Re-discover models…", description: "GET /models - manual entries are kept" },
    { value: "test", label: "Test connection", description: "liveness probe with latency" },
    { value: "deep", label: "Deep probe a model…", description: "1-token completion (costs a few tokens)" },
    { value: "default", label: "Set as default…", description: "default provider + model" },
    { value: "delete", label: "Delete provider", description: "removes it from models.json" },
    { value: "back", label: "Back", description: "" },
  ])

  switch (action) {
    case "models":
      await modelsEditor(pi, ctx, name)
      break
    case "edit":
      await editProviderJson(pi, ctx, name)
      break
    case "key":
      await setKeyFlow(pi, ctx, name, custom)
      break
    case "discover":
      await discoverFlow(pi, ctx, name)
      break
    case "test":
      await testProvider(pi, ctx, name, custom)
      break
    case "deep":
      await deepProbeFlow(pi, ctx, name, custom)
      break
    case "default":
      await defaultsScreen(pi, ctx, name)
      break
    case "delete": {
      const sure = await ctx.ui.confirm(`Delete provider "${name}"?`, "models.json entry will be removed (backup taken).")
      if (!sure) return
      const next = freshModels()
      delete next.providers[name]
      await confirmAndApply(pi, ctx, { models: next })
      break
    }
  }
}

async function editProviderJson(pi: ExtensionAPI, ctx: Ctx, name: string): Promise<void> {
  const models = freshModels()
  const current = models.providers[name]
  if (!current) return
  const text = await ctx.ui.editor(`Edit ${name} (provider JSON)`, JSON.stringify(current, null, 2))
  if (text === undefined) return
  let parsed: ProviderConfig
  try {
    parsed = JSON.parse(text) as ProviderConfig
  } catch (e) {
    await ctx.ui.notify(`Invalid JSON: ${(e as Error).message}`, "error")
    return
  }
  const next = freshModels()
  next.providers[name] = parsed
  await confirmAndApply(pi, ctx, { models: next })
}

async function testProvider(pi: ExtensionAPI, ctx: Ctx, name: string, custom: ProviderConfig | undefined): Promise<void> {
  let target = custom ? probeTargetFromConfig(name, custom) : undefined
  if (!target) {
    // Built-in: ask the registry for provider details.
    try {
      const p = ctx.modelRegistry.getProvider(name) as unknown as { baseUrl?: string; api?: string } | undefined
      if (p?.baseUrl && p?.api) {
        const key = (await ctx.modelRegistry.getApiKeyForProvider(name)) ?? undefined
        target = {
          provider: name,
          baseUrl: p.baseUrl,
          api: p.api as ApiType,
          apiKey: key,
          credentialPolicy: findPreset(name)?.credentialPolicy,
        }
      }
    } catch {
      // leave undefined
    }
  }
  if (!target) {
    await ctx.ui.notify(`No probeable endpoint for "${name}"`, "warning")
    return
  }
  ctx.ui.setStatus("alfred-probe", `probing ${name}…`)
  const result = await probeLiveness(target)
  ctx.ui.setStatus("alfred-probe", undefined)
  const lines = [
    `${result.ok ? "✓" : "✗"} ${name} - ${result.ok ? `alive, ${result.latencyMs}ms` : result.error}`,
    result.models ? `models (${result.models.length}): ${result.models.slice(0, 40).join(", ")}${result.models.length > 40 ? " …" : ""}` : "",
    "",
    "Recent health (this provider):",
    ...summarizeHealth(loadRecentHealth().filter((h) => h.provider === name)).map(
      (s) => `  success ${(s.successRate * 100).toFixed(0)}% · avg ${s.avgLatencyMs ?? "?"}ms · ${s.samples} samples`,
    ),
  ].filter((l) => l !== "")
  await showText(ctx.ui, `Test - ${name}`, lines)
}

async function deepProbeFlow(pi: ExtensionAPI, ctx: Ctx, name: string, custom: ProviderConfig | undefined): Promise<void> {
  if (!custom?.baseUrl || !custom.api) {
    await ctx.ui.notify("Deep probe needs a custom provider with baseUrl + api", "warning")
    return
  }
  const target = probeTargetFromConfig(name, custom)!
  const candidates = [...(custom.models ?? []).map((m) => m.id), ...((await probeLiveness(target)).models ?? [])]
  const unique = [...new Set(candidates)]
  if (unique.length === 0) {
    await ctx.ui.notify("No models to probe", "warning")
    return
  }
  const modelId = await pick(
    ctx.ui,
    `Deep probe - pick a model for ${name}`,
    unique.map((id) => ({ value: id, label: id, description: "" })),
  )
  if (!modelId) return
  ctx.ui.setStatus("alfred-probe", `1-token probe on ${name}/${modelId}…`)
  const r = await deepProbe(target, modelId)
  ctx.ui.setStatus("alfred-probe", undefined)
  await showText(ctx.ui, `Deep probe - ${name}/${modelId}`, [`${r.ok ? "✓" : "✗"} ${r.ok ? `responded in ${r.latencyMs}ms` : r.error}`])
}

// ---------------------------------------------------------------------------
// Add provider wizard

async function addProviderWizard(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  const presetChoice = await pick(
    ctx.ui,
    "New provider - pick a preset",
    [
      ...PROVIDER_PRESETS.map((p) => ({
        value: p.id,
        label: p.label,
        description: `${p.baseUrl}${p.note ? " - " + p.note : ""}`,
      })),
      { value: "custom", label: "Custom…", description: "enter everything by hand" },
      { value: "", label: "Cancel", description: "" },
    ],
  )
  if (!presetChoice) return
  const preset = presetChoice === "custom" ? undefined : findPreset(presetChoice)

  const name = await ctx.ui.input("Provider id (name in pi)", preset?.id ?? "my-provider")
  if (!name) return
  if (!isValidProviderId(name)) {
    await ctx.ui.notify("Provider id must be a simple identifier (letters, digits, dash, underscore)", "error")
    return
  }

  const baseUrl = await ctx.ui.input("Base URL", preset?.baseUrl ?? "https://api.example.com/v1")
  if (!baseUrl) return

  const apiChoice = await pick(
    ctx.ui,
    "API type",
    API_TYPES.map((a) => ({ value: a, label: a, description: "" })),
  )
  if (!apiChoice) return

  const keyDefault = preset?.keyEnv ? `$${preset.keyEnv}` : preset?.keyLiteral ?? ""
  const key = await ctx.ui.input(
    "API key (literal, $ENV_VAR, or empty for local)",
    keyDefault,
  )

  let credentialPolicy = preset?.credentialPolicy
  if (key && !credentialPolicyMatchesBaseUrl(credentialPolicy, baseUrl)) {
    credentialPolicy = await approveCredentialOrigin(ctx, baseUrl)
    if (!credentialPolicy) return
  }
  const provider: ProviderConfig = {
    baseUrl,
    api: apiChoice,
    ...(key ? { apiKey: key } : {}),
    ...(credentialPolicy ? { credentialPolicy } : {}),
  }
  if (preset?.compat) (provider as Record<string, unknown>).compat = preset.compat

  // Discovery
  const discovered = await discoverModels(probeTargetFromConfig(name, provider)!)
  let selectedIds: string[] = []
  if (discovered.models.length > 0) {
    const picked = await multiPick(
      ctx.ui,
      `Found ${discovered.models.length} models - pick the ones to add`,
      discovered.models.map((m) => ({ value: m.id, label: m.id, description: "" })),
    )
    selectedIds = picked ?? []
    const manual = await ctx.ui.input("Add another model id by hand (Esc to skip)")
    if (manual) selectedIds.push(manual)
  } else {
    const manual = await ctx.ui.input(discovered.error ? `Discovery failed (${discovered.error}) - model id to add (Esc for none)` : "No models discovered - model id to add (Esc for none)")
    if (manual) selectedIds.push(manual)
  }

  if (selectedIds.length > 0) {
    const enriched = await enrichWithCatalog(name, selectedIds.map((id) => ({ id })), await getCatalog())
    provider.models = enriched.models
    if (enriched.filledCount > 0) {
      await ctx.ui.notify(`models.dev autofilled ${enriched.filledCount} metadata field(s) (context, cost, capabilities)`, "info")
    }
  }

  const next = freshModels()
  next.providers[name] = provider
  const applied = await confirmAndApply(pi, ctx, { models: next })
  if (applied) {
    const setDefault = await ctx.ui.confirm(`Set ${name} as default provider?`, "Writes settings.json and switches the current session.")
    if (setDefault) await setDefaults(pi, ctx, name, provider.models?.[0]?.id)
  }
}

async function discoverFlow(pi: ExtensionAPI, ctx: Ctx, name: string): Promise<void> {
  const models = freshModels()
  const custom = models.providers[name]
  if (!custom?.baseUrl || !custom.api) {
    await ctx.ui.notify("Provider needs baseUrl + api first", "warning")
    return
  }
  ctx.ui.setStatus("alfred-probe", `discovering models on ${name}…`)
  const r = await discoverModels(probeTargetFromConfig(name, custom)!)
  ctx.ui.setStatus("alfred-probe", undefined)
  if (r.error) {
    await ctx.ui.notify(`Discovery failed: ${r.error}`, "error")
    return
  }
  const existing = new Set((custom.models ?? []).map((m) => m.id))
  const fresh = r.models.map((m) => m.id).filter((id) => !existing.has(id))
  if (fresh.length === 0) {
    await ctx.ui.notify("No new models found (existing entries are kept)", "info")
    return
  }
  const catalog = await getCatalog()
  const picked = await multiPick(
    ctx.ui,
    `Nuevos modelos en ${name}, elige una intención o modelos concretos`,
    [
      ...MODEL_INTENTIONS.map((intention) => ({
        value: `intent:${intention.value}`,
        label: `Intención: ${intention.label}`,
        description: intention.description,
      })),
      ...intentionEntries(name, fresh, custom, catalog).map((entry) => ({
        value: entry.id!,
        label: entry.id!,
        description: modelCard(entry),
      })),
    ],
  )
  const selected = await resolveDiscoveredSelection(ctx, name, fresh, custom, picked, catalog)
  if (!selected || selected.length === 0) return
  const enriched = await enrichWithCatalog(name, selected.map((id) => ({ id })), catalog)
  const next = freshModels()
  next.providers[name]!.models = [...(next.providers[name]!.models ?? []), ...enriched.models]
  await confirmAndApply(pi, ctx, { models: next })
  if (enriched.filledCount > 0) {
    await ctx.ui.notify(`models.dev autofilled ${enriched.filledCount} metadata field(s)`, "info")
  }
}

// ---------------------------------------------------------------------------
// Models editor

async function modelsEditor(pi: ExtensionAPI, ctx: Ctx, name: string): Promise<void> {
  while (true) {
    const models = freshModels()
    const custom = models.providers[name]
    if (!custom) return
    const list = custom.models ?? []

    const choice = await pick(
      ctx.ui,
      `Models - ${name} (${list.length})`,
      [
        ...list.map((m) => ({
          value: `model:${m.id}`,
          label: m.id,
          description: `${m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k ctx` : "128k ctx (default)"}${m.reasoning ? " · reasoning" : ""}${typeof m.maxTokens === "number" ? ` · ${m.maxTokens} max out` : ""}`,
        })),
        { value: "add", label: "+ Add model…", description: "manual entry or discovery" },
        { value: "back", label: "Back", description: "" },
      ],
    )
    if (!choice || choice === "back") return

    if (choice === "add") {
      const how = await pick(ctx.ui, "Add model", [
        { value: "discover", label: "Discover from endpoint", description: "GET /models" },
        { value: "manual", label: "Enter manually", description: "" },
      ])
      if (how === "discover") {
        await discoverFlow(pi, ctx, name)
      } else if (how === "manual") {
        const id = await ctx.ui.input("Model id")
        if (!id) continue
        const next = freshModels()
        next.providers[name]!.models = [...(next.providers[name]!.models ?? []), { id }]
        await confirmAndApply(pi, ctx, { models: next })
      }
      continue
    }

    const modelId = choice.slice("model:".length)
    const action = await pick(ctx.ui, `${name}/${modelId}`, [
      { value: "edit", label: "Edit (JSON)…", description: "contextWindow, maxTokens, cost, reasoning…" },
      { value: "probe", label: "Deep probe", description: "1-token completion" },
      { value: "remove", label: "Remove model", description: "" },
      { value: "back", label: "Back", description: "" },
    ])
    if (action === "edit") {
      const current = freshModels().providers[name]!.models!.find((m) => m.id === modelId)!
      const text = await ctx.ui.editor(`Edit model ${modelId}`, JSON.stringify(current, null, 2))
      if (text === undefined) continue
      try {
        const parsed = JSON.parse(text) as ModelConfig
        if (parsed.id !== modelId && freshModels().providers[name]!.models!.some((m) => m.id === parsed.id)) {
          await ctx.ui.notify(`A model with id "${parsed.id}" already exists`, "error")
          continue
        }
        const next = freshModels()
        const arr = next.providers[name]!.models!
        arr[arr.findIndex((m) => m.id === modelId)] = parsed
        await confirmAndApply(pi, ctx, { models: next })
      } catch (e) {
        await ctx.ui.notify(`Invalid JSON: ${(e as Error).message}`, "error")
      }
    } else if (action === "probe") {
      const p = freshModels().providers[name]!
      if (p.baseUrl && p.api) {
        ctx.ui.setStatus("alfred-probe", `probing ${modelId}…`)
        const r = await deepProbe(probeTargetFromConfig(name, p)!, modelId)
        ctx.ui.setStatus("alfred-probe", undefined)
        await showText(ctx.ui, `Deep probe - ${modelId}`, [`${r.ok ? "✓" : "✗"} ${r.ok ? `responded in ${r.latencyMs}ms` : r.error}`])
      }
    } else if (action === "remove") {
      const sure = await ctx.ui.confirm(`Remove model ${modelId}?`, "")
      if (!sure) continue
      const next = freshModels()
      next.providers[name]!.models = next.providers[name]!.models!.filter((m) => m.id !== modelId)
      await confirmAndApply(pi, ctx, { models: next })
    }
  }
}

// ---------------------------------------------------------------------------
// Keys

async function keysScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  const models = freshModels()
  const auth = freshAuth()
  const customIds = Object.keys(models.providers ?? {})
  const authIds = Object.keys(auth)
  const ids = [...new Set([...customIds, ...authIds])].sort()

  const name = await pick(
    ctx.ui,
    "Keys & auth - pick provider",
    ids.length > 0
      ? ids.map((id) => ({
          value: id,
          label: id,
          description: customIds.includes(id)
            ? `models.json apiKey: ${maskKey(models.providers[id]!.apiKey)}`
            : `auth.json: ${maskKey(auth[id]!.key)}`,
        }))
      : [{ value: "__none__", label: "(no providers with keys yet)", description: "" }],
  )
  if (!name || name === "__none__") return
  await setKeyFlow(pi, ctx, name, models.providers[name])
}

async function setKeyFlow(pi: ExtensionAPI, ctx: Ctx, name: string, custom: ProviderConfig | undefined): Promise<void> {
  while (true) {
    const auth = freshAuth()
    const models = freshModels()
    const currentCustom = models.providers[name]?.apiKey
    const currentAuth = auth[name]?.key
    const action = await pick(ctx.ui, `Key - ${name}`, [
      { value: "set", label: "Set key…", description: "literal or $ENV_VAR (a !command ref is rejected)" },
      { value: "check", label: "Check", description: "resolve the reference and validate" },
      ...(currentCustom || currentAuth ? [{ value: "remove", label: "Remove key", description: "" }] : []),
      { value: "back", label: "Back", description: "" },
    ])
    if (!action || action === "back") return

    if (action === "set") {
      const value = await ctx.ui.input("API key (literal or $ENV_VAR)", currentCustom ?? currentAuth ?? "")
      if (value === undefined) continue
      if (custom || models.providers[name]) {
        const next = freshModels()
        if (value === "") delete next.providers[name]!.apiKey
        else {
          const provider = next.providers[name]!
          if (provider.baseUrl && !credentialPolicyMatchesBaseUrl(provider.credentialPolicy, provider.baseUrl)) {
            const policy = await approveCredentialOrigin(ctx, provider.baseUrl)
            if (!policy) continue
            provider.credentialPolicy = policy
          }
          provider.apiKey = value
        }
        await confirmAndApply(pi, ctx, { models: next })
      } else {
        const nextAuth = freshAuth()
        if (value === "") delete nextAuth[name]
        else nextAuth[name] = { type: "api_key", key: value }
        await confirmAndApply(pi, ctx, { auth: nextAuth })
      }
      return
    }

    if (action === "check") {
      const ref = currentCustom ?? currentAuth
      if (!ref) {
        await ctx.ui.notify("No key configured for this provider", "warning")
        continue
      }
      const resolved = resolveKeyRef(ref)
      const lines = [`reference: ${maskKey(ref)}`, resolved.error ? `✗ ${resolved.error}` : `✓ resolves to ${maskKey(resolved.value)}`]
      await showText(ctx.ui, `Key check - ${name}`, lines)
      continue
    }

    if (action === "remove") {
      const sure = await ctx.ui.confirm(`Remove key for ${name}?`, "")
      if (!sure) continue
      if (currentCustom) {
        const next = freshModels()
        delete next.providers[name]!.apiKey
        await confirmAndApply(pi, ctx, { models: next })
      } else if (currentAuth) {
        const nextAuth = freshAuth()
        delete nextAuth[name]
        await confirmAndApply(pi, ctx, { auth: nextAuth })
      }
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Defaults

async function defaultsScreen(pi: ExtensionAPI, ctx: Ctx, focusProvider?: string): Promise<void> {
  const models = freshModels()
  const customIds = Object.keys(models.providers ?? {})
  const registryIds = new Set<string>()
  try {
    for (const m of ctx.modelRegistry.getAll()) registryIds.add(String((m as unknown as { provider: string }).provider))
  } catch {
    // ignore
  }
  const ids = [...new Set([...customIds, ...registryIds])].sort()
  const provider = focusProvider ?? (await pick(ctx.ui, "Default provider", ids.map((id) => ({ value: id, label: id, description: authBadge(ctx, id) }))))
  if (!provider) return

  let modelIds: string[] = models.providers[provider]?.models?.map((m) => m.id) ?? []
  if (modelIds.length === 0) {
    try {
      modelIds = ctx.modelRegistry
        .getAll()
        .filter((m) => (m as unknown as { provider: string }).provider === provider)
        .map((m) => String((m as unknown as { id: string }).id))
    } catch {
      // ignore
    }
  }
  if (modelIds.length === 0) {
    await ctx.ui.notify(`No models known for "${provider}" - add one first`, "warning")
    return
  }
  const model = await chooseModel(ctx, provider, modelIds, models.providers[provider])
  if (!model) return

  const thinking = await pick(ctx.ui, "Default thinking level (Esc keeps current)", THINKING_LEVELS.map((t) => ({ value: t, label: t, description: "" })))

  await setDefaults(pi, ctx, provider, model, thinking ?? undefined)
}

async function setDefaults(pi: ExtensionAPI, ctx: Ctx, provider: string, model: string | undefined, thinking?: string): Promise<void> {
  const next = freshSettings()
  next.defaultProvider = provider
  if (model) next.defaultModel = model
  if (thinking) next.defaultThinkingLevel = thinking
  const applied = await confirmAndApply(pi, ctx, { settings: next })
  if (!applied) return
  // Switch the live session too.
  if (model) {
    try {
      const m = ctx.modelRegistry.find(provider, model)
      if (m && (await pi.setModel(m))) {
        if (thinking) ctx.setThinkingLevel(thinking as (typeof THINKING_LEVELS)[number])
        await ctx.ui.notify(`Session switched to ${provider}/${model}${thinking ? ` (${thinking})` : ""}`, "info")
      } else {
        await ctx.ui.notify("Defaults saved; live switch skipped (model not found or no key)", "warning")
      }
    } catch {
      await ctx.ui.notify("Defaults saved; live switch failed", "warning")
    }
  }
}

// ---------------------------------------------------------------------------
// Doctor

export async function doctorScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  ctx.ui.setStatus("alfred-doctor", "running doctor…")
  try {
    const report = await runDoctor()
    ctx.ui.setStatus("alfred-doctor", undefined)
    await showText(ctx.ui, "Doctor", formatDoctorReport(report))
  } catch (e) {
    ctx.ui.setStatus("alfred-doctor", undefined)
    await ctx.ui.notify(`Doctor failed: ${(e as Error).message}`, "error")
  }
}

// ---------------------------------------------------------------------------
// Profiles

export async function profilesScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  const dataDir = getDataDir()
  while (true) {
    const paths = getPaths()
    const file = loadProfiles(paths)
    const fbState = loadFallbackState(dataDir)
    const choice = await pick(
      ctx.ui,
      "Profiles - model stacks",
      [
        ...file.profiles.map((p) => ({
          value: `profile:${p.name}`,
          label: `${fbState.activeProfile === p.name ? "fb: " : ""}${p.name}`,
          description: `${p.chain.map((s) => `${s.provider}/${s.model}`).join(" → ") || "empty"}${fbState.activeProfile === p.name ? " · auto-fallback ON" : ""}`,
        })),
        { value: "new", label: "+ New from current model", description: "creates a 1-step profile" },
        { value: "back", label: "Back", description: "" },
      ],
    )
    if (!choice || choice === "back") return

    if (choice === "new") {
      const current = ctx.model as unknown as { provider?: string; id?: string } | undefined
      const provider = current?.provider ?? freshSettings().defaultProvider
      const model = current?.id ?? freshSettings().defaultModel
      if (!provider || !model) {
        await ctx.ui.notify("No current or default model to snapshot", "warning")
        continue
      }
      const name = await ctx.ui.input("Profile name")
      if (!name) continue
      saveProfiles(upsertProfile(file, { name, chain: [{ provider, model }] }), paths)
      await ctx.ui.notify(`Profile "${name}" created`, "info")
      continue
    }

    const name = choice.slice("profile:".length)
    const profile = file.profiles.find((p) => p.name === name)!
    const isAuto = loadFallbackState(dataDir).activeProfile === name
    const action = await pick(ctx.ui, `Profile - ${name}`, [
      { value: "apply", label: "Apply now", description: "first resolvable step in the chain wins" },
      isAuto
        ? { value: "auto-off", label: "Disable auto-fallback", description: "stop switching on repeated provider failures" }
        : { value: "auto-on", label: "Set as auto-fallback", description: "after 2 consecutive failures, switch to the next healthy step" },
      { value: "edit", label: "Edit (JSON)…", description: "" },
      { value: "rename", label: "Rename…", description: "" },
      { value: "delete", label: "Delete", description: "" },
      { value: "back", label: "Back", description: "" },
    ])

    if (action === "apply") {
      await applyProfile(pi, ctx, profile)
    } else if (action === "auto-on") {
      const next = loadFallbackState(dataDir)
      next.activeProfile = name
      saveFallbackState(next, dataDir)
      await ctx.ui.notify(`"${name}" is now the auto-fallback chain`, "info")
    } else if (action === "auto-off") {
      const next = loadFallbackState(dataDir)
      delete next.activeProfile
      saveFallbackState(next, dataDir)
      await ctx.ui.notify("Auto-fallback disabled", "info")
    } else if (action === "edit") {
      const text = await ctx.ui.editor(`Edit profile ${name}`, JSON.stringify(profile, null, 2))
      if (text === undefined) continue
      try {
        const parsed = JSON.parse(text) as Profile
        if (!parsed.name || !Array.isArray(parsed.chain)) throw new Error("name and chain[] are required")
        saveProfiles(upsertProfile(loadProfiles(paths), parsed), paths)
      } catch (e) {
        await ctx.ui.notify(`Invalid profile: ${(e as Error).message}`, "error")
      }
    } else if (action === "rename") {
      const newName = await ctx.ui.input("New name", name)
      if (!newName || newName === name) continue
      const edited = { ...profile, name: newName }
      let next = deleteProfile(loadProfiles(paths), name)
      saveProfiles(upsertProfile(next, edited), paths)
    } else if (action === "delete") {
      const sure = await ctx.ui.confirm(`Delete profile "${name}"?`, "")
      if (sure) {
        saveProfiles(deleteProfile(loadProfiles(paths), name), paths)
        const fb = loadFallbackState(dataDir)
        if (fb.activeProfile === name) {
          delete fb.activeProfile
          saveFallbackState(fb, dataDir)
        }
      }
    }
  }
}

export async function applyProfile(pi: ExtensionAPI, ctx: Ctx, profile: Profile): Promise<void> {
  const result = pickStep(profile, (step) => {
    const m = ctx.modelRegistry.find(step.provider, step.model)
    if (!m) return { ok: false, reason: "model not found in registry" }
    if (!ctx.modelRegistry.hasConfiguredAuth(m)) return { ok: false, reason: "no key configured" }
    return { ok: true }
  })
  if ("error" in result) {
    await ctx.ui.notify(`Cannot apply "${profile.name}": ${result.error}`, "error")
    return
  }
  const m = ctx.modelRegistry.find(result.step.provider, result.step.model)
  const switched = await pi.setModel(m!)
  if (switched && result.step.thinkingLevel) {
    ctx.setThinkingLevel(result.step.thinkingLevel as (typeof THINKING_LEVELS)[number])
  }
  await ctx.ui.notify(
    switched ? `→ ${result.step.provider}/${result.step.model}${result.step.thinkingLevel ? ` (${result.step.thinkingLevel})` : ""}` : "Model found but switch failed (no usable key)",
    switched ? "info" : "warning",
  )
}

// ---------------------------------------------------------------------------
// Domains

export async function domainsScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  while (true) {
    const agentDir = getBaseDir()
    const dataDir = getDataDir()
    const state = loadDomainsState(dataDir)
    const domains = discoverDomains()
    if (domains.length === 0) {
      await ctx.ui.notify("No domain packs found in this installation", "warning")
      return
    }

    const choice = await pick(
      ctx.ui,
      "Domains - work-area packs",
      [
        ...domains.map((d) => {
          const rec = isDomainEnabled(state, d.manifest.id)
          return {
            value: `domain:${d.manifest.id}`,
            label: `${rec ? "●" : "○"} ${d.manifest.name}`,
            description: `${rec ? `enabled (${rec.scope})` : "disabled"} · ${d.skills.length} skills · ${d.prompts.length} prompts - ${d.manifest.description}`,
          }
        }),
        { value: "back", label: "Back", description: "" },
      ],
    )
    if (!choice || choice === "back") return

    const id = choice.slice("domain:".length)
    const domain = domains.find((d) => d.manifest.id === id)!
    const enabled = isDomainEnabled(state, id)
    const action = await pick(
      ctx.ui,
      `${domain.manifest.name} - ${domain.manifest.description}`,
      [
        ...(!enabled
          ? [
              { value: "enable-agent", label: "Enable globally (~/.pi/agent)", description: "skills + prompts visible in every project" },
              { value: "enable-project", label: "Enable for this project (.pi/)", description: "only this cwd" },
            ]
          : [{ value: "disable", label: "Disable", description: "removes only the symlinks created by Alfred-Pi" }]),
        { value: "context", label: "View context.md", description: "what gets injected into the system prompt" },
        { value: "skills", label: "List skills & prompts", description: "" },
        ...(domain.manifest.recommended?.model && domain.manifest.recommended?.provider
          ? [{ value: "profile", label: "Apply recommended model", description: `${domain.manifest.recommended.provider}/${domain.manifest.recommended.model}` }]
          : []),
        ...(domain.manifest.packages?.length
          ? [{ value: "packages", label: "Recommended packages", description: domain.manifest.packages.join(", ") }]
          : []),
        { value: "back", label: "Back", description: "" },
      ],
    )
    if (!action || action === "back") continue

    if (action === "enable-agent" || action === "enable-project") {
      const scope = action === "enable-agent" ? "agent" : "project"
      const r = enableDomain(domain, { scope, agentDir, cwd: ctx.cwd, dataDir, state })
      const lines = [
        r.linked.length > 0 ? `linked: ${r.linked.join(", ")}` : "",
        r.skipped.length > 0 ? `skipped: ${r.skipped.join(", ")}` : "",
        r.errors.length > 0 ? `errors: ${r.errors.join(", ")}` : "",
        "",
        scope === "project" ? "Project scope: run /reload or restart pi to pick up new skills." : "Run /reload or restart pi to pick up new skills.",
      ].filter((l) => l !== "")
      await showText(ctx.ui, `${domain.manifest.name} - enabled (${scope})`, lines)
    } else if (action === "disable") {
      const sure = await ctx.ui.confirm(`Disable ${domain.manifest.name}?`, "Only symlinks created by Alfred-Pi are removed.")
      if (!sure) continue
      const r = disableDomain(id, { agentDir, cwd: ctx.cwd, dataDir, state })
      await showText(ctx.ui, `${domain.manifest.name} - disabled`, [
        r.linked.length > 0 ? `removed: ${r.linked.join(", ")}` : "",
        r.skipped.length > 0 ? `kept (not ours): ${r.skipped.join(", ")}` : "",
        r.errors.length > 0 ? `errors: ${r.errors.join(", ")}` : "",
        "Run /reload to refresh skills.",
      ].filter((l) => l !== ""))
    } else if (action === "context") {
      await showText(ctx.ui, `${domain.manifest.name} - context.md`, (domain.contextMd ?? "(none)").split("\n"))
    } else if (action === "skills") {
      await showText(
        ctx.ui,
        `${domain.manifest.name} - contents`,
        [
          `skills: ${domain.skills.map((s) => s.name).join(", ") || "(none)"}`,
          `prompts: ${domain.prompts.map((p) => "/" + p.name).join(", ") || "(none)"}`,
        ],
      )
    } else if (action === "profile" && domain.manifest.recommended?.model && domain.manifest.recommended.provider) {
      const rec = domain.manifest.recommended
      await applyProfile(pi, ctx, {
        name: domain.manifest.id,
        chain: [{ provider: rec.provider ?? "", model: rec.model, ...(rec.thinkingLevel ? { thinkingLevel: rec.thinkingLevel } : {}) }],
      })
    } else if (action === "packages") {
      const recommended = await pick(
        ctx.ui,
        `Paquetes recomendados para ${domain.manifest.name}`,
        [
          ...domain.manifest.packages!.map((p) => ({
            value: p,
            label: p,
            description: "Usa el flujo de /packages: resuelve la versión, audita y pide confirmación.",
          })),
          { value: "", label: "Volver", description: "" },
        ],
        ["Elige un paquete para revisar sus fuentes antes de instalarlo."],
      )
      if (recommended) await auditAndInstallNpmPackage(pi, ctx, recommended)
    }
  }
}

// ---------------------------------------------------------------------------
// Essentials

function essentialCard(pkg: EssentialPackage, installed: boolean): string[] {
  return [
    `Paquete: ${pkg.label} (${pkg.id})`,
    `Categoría: ${pkg.category}`,
    `Estado local: ${installed ? "instalado" : "no instalado"}`,
    `Responsable editorial: ${pkg.curator}`,
    `Revisado el: ${pkg.reviewedAt.slice(0, 10)}`,
    "",
    `Finalidad declarada: ${pkg.description}`,
    "",
    "La auditoría de la versión disponible se ejecuta justo antes de instalar.",
  ]
}

async function showEssentialCard(ctx: Ctx, pkg: EssentialPackage, installed: boolean): Promise<void> {
  await showText(ctx.ui, `Ficha editorial, ${pkg.label}`, essentialCard(pkg, installed))
}

const ORCHESTRATION_REASONS = {
  base: "Motivo: empieza por una sola base de subagentes para evitar coordinadores que compitan entre sí.",
  advanced: "Motivo: crew y dynamic-workflows cubren coordinación avanzada y se eligen de forma expresa según el trabajo.",
} as const

async function essentialPackageScreen(pi: ExtensionAPI, ctx: Ctx, pkg: EssentialPackage): Promise<void> {
  const installed = isEssentialInstalled(freshSettings(), pkg)
  await showEssentialCard(ctx, pkg, installed)
  const action = await pick(ctx.ui, `${pkg.id} (${installed ? "instalado" : "no instalado"})`, [
    { value: "audit", label: "Revisar fuentes…", description: "Muestra el estado, la cobertura y los hallazgos." },
    ...(installed
      ? [{ value: "uninstall", label: "Desinstalar", description: "Ejecuta pi remove tras esta elección." }]
      : [{ value: "install", label: "Revisar e instalar", description: "Resuelve la versión, audita y pide confirmación." }]),
    { value: "back", label: "Volver", description: "" },
  ])
  if (!action || action === "back") return
  if (action === "audit") {
    const audit = await auditNpmForDisplay(ctx, pkg.id)
    await showText(ctx.ui, `Revisión de seguridad, ${pkg.id}`, formatAuditReport(audit))
  } else if (action === "install") {
    await auditAndInstallNpmPackage(pi, ctx, pkg.id)
  } else {
    ctx.ui.setStatus("alfred-pkg", `pi remove npm:${pkg.id}…`)
    try {
      const r = await pi.exec("pi", ["remove", `npm:${pkg.id}`], { timeout: 120000 })
      await ctx.ui.notify(
        r.code === 0 ? `Desinstalado ${pkg.id}` : `pi remove terminó con código ${r.code}: ${(r.stderr || r.stdout || "").slice(0, 200)}`,
        r.code === 0 ? "info" : "warning",
      )
    } catch (e) {
      await ctx.ui.notify(`No se pudo desinstalar: ${(e as Error).message}`, "error")
    } finally {
      ctx.ui.setStatus("alfred-pkg", undefined)
    }
  }
}

async function orchestrationTierScreen(
  pi: ExtensionAPI,
  ctx: Ctx,
  tier: "base" | "advanced",
  packages: EssentialPackage[],
): Promise<void> {
  const title = tier === "base" ? "Orquestación base" : "Orquestación avanzada"
  await showText(ctx.ui, title, [
    ORCHESTRATION_REASONS[tier],
    "",
    ...packages.map((pkg) => `${pkg.id}: ${pkg.description}`),
  ])
  while (true) {
    const choice = await pick(
      ctx.ui,
      title,
      [
        ...packages.map((pkg) => ({
          value: `pkg:${pkg.id}`,
          label: `${isEssentialInstalled(freshSettings(), pkg) ? "✓" : "○"} ${pkg.label}`,
          description: pkg.description,
        })),
        { value: "back", label: "Volver", description: "" },
      ],
      [ORCHESTRATION_REASONS[tier]],
    )
    if (!choice || choice === "back") return
    const pkg = packages.find((entry) => `pkg:${entry.id}` === choice)
    if (pkg) await essentialPackageScreen(pi, ctx, pkg)
  }
}

async function auditNpmForDisplay(ctx: Ctx, name: string): Promise<PackageAudit> {
  ctx.ui.setStatus("alfred-audit", `auditando ${name}…`)
  try {
    const detail = await packageDetail(name)
    const cached = detail ? loadAuditReceipt(getDataDir(), name, detail.version) : undefined
    if (cached) return cached
    const audit = await auditNpmPackage(name)
    if (audit.version !== "?") saveAuditReceipt(getDataDir(), audit)
    return audit
  } finally {
    ctx.ui.setStatus("alfred-audit", undefined)
  }
}

async function auditAndInstallNpmPackage(pi: ExtensionAPI, ctx: Ctx, name: string): Promise<boolean> {
  const audit = await auditNpmForDisplay(ctx, name)
  const status = auditStatus(audit)
  await showText(ctx.ui, `Revisión de seguridad, ${name}`, formatAuditReport(audit))

  if (status === "failed") {
    await ctx.ui.notify(`La revisión de ${name} ha fallado. No se instalará.`, "error")
    return false
  }

  const target = installTargetFromAudit(audit)
  if (!target) {
    await ctx.ui.notify(`La revisión de ${name} no resolvió una versión instalable. No se instalará.`, "error")
    return false
  }

  const high = auditHasHighFindings(audit)
  const proceed = await ctx.ui.confirm(
    status === "incomplete"
      ? `La revisión de ${target} está incompleta. ¿Instalar de todos modos?`
      : `¿Instalar ${target}?`,
    status === "incomplete"
      ? "No se pudieron revisar todas las fuentes seleccionadas. Consulta las omisiones del informe."
      : high
        ? "Hay hallazgos de riesgo alto. Continúa solo si confías en la fuente."
        : "La versión que se instalará coincide con la identidad auditada.",
  )
  if (!proceed) return false
  return installPackage(pi, ctx, target, name)
}

export async function essentialsScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  while (true) {
    const settings = freshSettings()
    const missing = missingEssentials(settings)
    const tiers = essentialOrchestrationTiers()
    const bulkMissing = missing.filter((pkg) => pkg.tier !== "advanced")
    const general = ESSENTIALS.filter((pkg) => pkg.tier === undefined)

    const choice = await pick(
      ctx.ui,
      "Esenciales, paquetes seleccionados para pi",
      [
        {
          value: "orchestration-base",
          label: `Orquestación base (${tiers.base.length})`,
          description: ORCHESTRATION_REASONS.base,
        },
        {
          value: "orchestration-advanced",
          label: `Orquestación avanzada (${tiers.advanced.length})`,
          description: ORCHESTRATION_REASONS.advanced,
        },
        ...general.map((p) => ({
          value: `pkg:${p.id}`,
          label: `${isEssentialInstalled(settings, p) ? "✓" : "○"} ${p.label}`,
          description: `[${p.category}] ${p.curator} · revisión ${p.reviewedAt.slice(0, 10)}`,
        })),
        ...(bulkMissing.length > 0
          ? [
              {
                value: "install-missing",
                label: `Revisar e instalar la base que falta (${bulkMissing.length})…`,
                description: "Excluye la orquestación avanzada; muestra la ficha, audita y confirma cada paquete.",
              },
            ]
          : []),
        { value: "back", label: "Volver", description: "" },
      ],
    )
    if (!choice || choice === "back") return
    if (choice === "orchestration-base") {
      await orchestrationTierScreen(pi, ctx, "base", tiers.base)
      continue
    }
    if (choice === "orchestration-advanced") {
      await orchestrationTierScreen(pi, ctx, "advanced", tiers.advanced)
      continue
    }
    if (choice === "install-missing") {
      let installedCount = 0
      for (const pkg of bulkMissing) {
        await showEssentialCard(ctx, pkg, false)
        if (await auditAndInstallNpmPackage(pi, ctx, pkg.id)) installedCount++
      }
      if (installedCount > 0) {
        await ctx.ui.notify(
          `Instalados ${installedCount} de ${bulkMissing.length} paquetes. Usa /reload para activarlos.`,
          "info",
        )
      }
      continue
    }
    if (choice.startsWith("pkg:")) {
      const id = choice.slice(4)
      const pkg = ESSENTIALS.find((p) => p.id === id)!
      if (pkg) await essentialPackageScreen(pi, ctx, pkg)
    }
  }
}

async function installPackage(pi: ExtensionAPI, ctx: Ctx, target: string, label: string): Promise<boolean> {
  ctx.ui.setStatus("alfred-pkg", `pi install ${target}…`)
  try {
    const r = await pi.exec("pi", ["install", target], { timeout: 300000 })
    const ok = r.code === 0
    const tail = (r.stdout || r.stderr || "").trim().split("\n").slice(-3).join(" · ").slice(0, 240)
    await ctx.ui.notify(ok ? `Instalado ${label} desde ${target}` : `pi install terminó con código ${r.code}: ${tail}`, ok ? "info" : "warning")
    return ok
  } catch (e) {
    await ctx.ui.notify(`No se pudo instalar: ${(e as Error).message}`, "error")
    return false
  } finally {
    ctx.ui.setStatus("alfred-pkg", undefined)
  }
}

// ---------------------------------------------------------------------------
// Usage

export async function usageScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  const dataDir = getDataDir()
  const budget = loadBudgetState(dataDir)
  const { records } = collectUsage(join(getBaseDir(), "sessions"), 1)
  const today = spendToday(records, freshModels())

  const range = await pick(
    ctx.ui,
    `Usage - period${budget.dailyMaxUsd ? ` · today $${today.toFixed(4)} of $${budget.dailyMaxUsd.toFixed(2)}` : ""}`,
    [
      { value: "7", label: "Last 7 days", description: "" },
      { value: "30", label: "Last 30 days", description: "" },
      { value: "all", label: "All time", description: "" },
      {
        value: "budget",
        label: `Daily budget: ${budget.dailyMaxUsd ? `$${budget.dailyMaxUsd.toFixed(2)}` : "unset"}`,
        description: "warn at 80% · frugality mode at 100% (statusline + prompt note)",
      },
    ],
  )
  if (!range) return

  if (range === "budget") {
    const raw = await ctx.ui.input("Max USD per day (empty to disable)", budget.dailyMaxUsd ? String(budget.dailyMaxUsd) : "5")
    if (raw === undefined) return
    const next = loadBudgetState(dataDir)
    if (raw.trim() === "") {
      delete next.dailyMaxUsd
      await ctx.ui.notify("Daily budget disabled", "info")
    } else {
      const value = Number(raw)
      if (Number.isNaN(value) || value <= 0) {
        await ctx.ui.notify("Enter a positive number", "error")
        return
      }
      next.dailyMaxUsd = value
      await ctx.ui.notify(`Daily budget set to $${value.toFixed(2)} - watch the budget statusline`, "info")
    }
    saveBudgetState(next, dataDir)
    return
  }

  const sinceDays = range === "all" ? undefined : Number(range)
  const paths = getPaths()
  const { records: allRecords, errors } = collectUsage(join(paths.agentDir, "sessions"), sinceDays)
  const report = aggregateUsage(allRecords, freshModels())
  report.errors.push(...errors)
  await showText(ctx.ui, "Usage & cost", formatUsageReport(report, range === "all" ? "all time" : `last ${range} days`))
}

// ---------------------------------------------------------------------------
// Ollama

export async function ollamaScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  while (true) {
    const models = freshModels()
    const base = ollamaBase(models)
    const registered = registeredOllamaModels(models)

    ctx.ui.setStatus("alfred-ollama", `asking ${base}…`)
    const [tags, ps] = await Promise.all([ollamaTags(base), ollamaPs(base)])
    ctx.ui.setStatus("alfred-ollama", undefined)

    if (tags.error) {
      await showText(ctx.ui, `Ollama - ${base}`, [
        `✗ server unreachable: ${tags.error}`,
        "",
        "Is ollama running? Try: ollama serve",
        "",
        `OpenAI-compatible endpoint for pi: ${base}/v1`,
      ])
      return
    }

    const running = new Set(ps.names)
    const choice = await pick(
      ctx.ui,
      `Ollama - ${base} (${tags.models.length} models, ${running.size} running)`,
      [
        ...tags.models.map((m) => ({
          value: `model:${m.name}`,
          label: `${registered.has(m.name) ? "★" : "○"} ${m.name}${running.has(m.name) ? " ▶" : ""}`,
          description: describeOllamaModel(m, registered.has(m.name), running.has(m.name)),
        })),
        { value: "pull", label: "+ Pull model…", description: "download from ollama.com (or add a :cloud model)" },
        { value: "back", label: "Back", description: "" },
      ],
    )
    if (!choice || choice === "back") return

    if (choice === "pull") {
      const name = await ctx.ui.input("Model to pull", "llama3.2")
      if (!name) continue
      ctx.ui.setStatus("alfred-ollama", `pulling ${name}…`)
      const r = await ollamaPull(base, name, (status) => ctx.ui.setStatus("alfred-ollama", `pulling ${name}: ${status}`))
      ctx.ui.setStatus("alfred-ollama", undefined)
      await ctx.ui.notify(r.ok ? `Pulled ${name}` : `Pull failed: ${r.error}`, r.ok ? "info" : "error")
      const register = r.ok ? await ctx.ui.confirm(`Register ${name} in pi (models.json)?`, "Makes it selectable via /model.") : false
      if (register) await registerOllamaModel(pi, ctx, name)
      continue
    }

    const name = choice.slice("model:".length)
    const isRegistered = registered.has(name)
    const action = await pick(ctx.ui, `${name} (${running.has(name) ? "running" : "loaded on demand"})`, [
      ...(!isRegistered
        ? [{ value: "register", label: "Register in pi", description: "adds it to models.json (cloud models get _launch)" }]
        : [
            { value: "unregister", label: "Unregister from pi", description: "removes the models.json entry" },
            { value: "default", label: "Set as default model", description: "" },
          ]),
      { value: "metadata", label: "Autofill metadata (models.dev)…", description: "context window, cost, capabilities" },
      { value: "remove", label: "Remove from server", description: "deletes local files (cloud models: just unregisters)" },
      { value: "back", label: "Back", description: "" },
    ])
    if (!action || action === "back") continue

    if (action === "register") {
      await registerOllamaModel(pi, ctx, name)
    } else if (action === "unregister") {
      const next = freshModels()
      const ollama = ensureOllamaProvider(next)
      ollama.models = (ollama.models ?? []).filter((m) => m.id !== name)
      await confirmAndApply(pi, ctx, { models: next })
    } else if (action === "default") {
      await setDefaults(pi, ctx, "ollama", name)
    } else if (action === "metadata") {
      const enriched = await enrichWithCatalog("ollama", [{ id: name }], await getCatalog())
      const meta = enriched.models[0]!
      const next = freshModels()
      const ollama = ensureOllamaProvider(next)
      const arr = ollama.models ?? []
      const idx = arr.findIndex((m) => m.id === name)
      if (idx >= 0) arr[idx] = meta
      else arr.push(meta)
      ollama.models = arr
      await confirmAndApply(pi, ctx, { models: next })
      await ctx.ui.notify(enriched.filledCount > 0 ? `Autofilled ${enriched.filledCount} field(s)` : "No models.dev metadata for this model", enriched.filledCount > 0 ? "info" : "warning")
    } else if (action === "remove") {
      const sure = await ctx.ui.confirm(`Remove ${name} from the ollama server?`, "Local model files are deleted. This cannot be undone.")
      if (!sure) continue
      if (registered.has(name)) {
        const next = freshModels()
        const ollama = ensureOllamaProvider(next)
        ollama.models = (ollama.models ?? []).filter((m) => m.id !== name)
        await confirmAndApply(pi, ctx, { models: next })
      }
      const r = await ollamaRm(base, name)
      await ctx.ui.notify(r.ok ? `Removed ${name}` : `Remove failed: ${r.error}`, r.ok ? "info" : "error")
    }
  }
}

async function registerOllamaModel(pi: ExtensionAPI, ctx: Ctx, name: string): Promise<void> {
  const enriched = await enrichWithCatalog("ollama", [toModelsEntry(name)], await getCatalog())
  const entry = enriched.models[0]!
  const next = freshModels()
  const ollama = ensureOllamaProvider(next)
  const arr = ollama.models ?? []
  if (!arr.some((m) => m.id === name)) arr.push(entry)
  ollama.models = arr
  const applied = await confirmAndApply(pi, ctx, { models: next })
  if (applied) await ctx.ui.notify(`${name} registered - pick it with /model`, "info")
}

// ---------------------------------------------------------------------------
// Package browser

function packageManifestText(manifest: PackageDetail["piManifest"]): string {
  if (!manifest) return "no declarado"
  const fields: string[] = []
  if (manifest.extensions?.length) fields.push(`extensions: ${manifest.extensions.join(", ")}`)
  if (manifest.skills?.length) fields.push(`skills: ${manifest.skills.join(", ")}`)
  if (manifest.prompts?.length) fields.push(`prompts: ${manifest.prompts.join(", ")}`)
  if (manifest.themes?.length) fields.push(`themes: ${manifest.themes.join(", ")}`)
  return fields.join("; ") || "no declarado"
}

function curationLabel(detail: PackageDetail, downloads: number | undefined): string {
  if (downloads === undefined || !detail.publishedAt) return "sin datos suficientes"
  const verdict = assessCuration({ downloads, publishedAt: detail.publishedAt })
  if (verdict === "alive") return "vivo"
  if (verdict === "dead") return "muerto"
  return "decae"
}

function packageTrustCard(
  detail: PackageDetail,
  downloads: number | undefined,
  receipt: PackageAudit | undefined,
): string[] {
  const networkScope = receipt
    ? receipt.domains.length > 0
      ? receipt.domains.join(", ")
      : "sin referencias detectadas en las fuentes revisadas"
    : "sin recibo de auditoría"
  return [
    `Paquete: ${detail.name}@${detail.version}`,
    `Editor: ${detail.editor ?? "sin declarar"}`,
    `Fecha de versión: ${detail.publishedAt?.slice(0, 10) ?? "sin datos"}`,
    `Licencia: ${detail.license ?? "sin declarar"}`,
    `Tipo: ${detail.type ?? "sin declarar"}`,
    `Tamaño desempaquetado: ${detail.unpackedSize === undefined ? "sin datos" : `${detail.unpackedSize.toLocaleString("es-ES")} B`}`,
    `Dependencias directas (${detail.dependencies.length}): ${detail.dependencies.join(", ") || "ninguna"}`,
    `Repositorio: ${detail.repository ? detail.repository.replace(/^git\+/, "") : "sin declarar"}`,
    `Manifiesto pi: ${packageManifestText(detail.piManifest)}`,
    `Alcance de red: ${networkScope}`,
    `Popularidad: ${downloads === undefined ? "sin datos" : `${downloads.toLocaleString("es-ES")} descargas en el último mes`}`,
    `Curaduría: ${curationLabel(detail, downloads)} (señal orientativa)`,
    "Las descargas expresan popularidad, no seguridad.",
    "Este paquete corre con tus permisos. Revisa la auditoría antes de instalar.",
  ]
}

async function toggleProjectMemory(ctx: Ctx): Promise<void> {
  const current = loadMemoryPolicy(ctx.cwd)
  const next = !current.allow
  const confirmed = await ctx.ui.confirm(
    next ? "¿Activar la memoria para este proyecto?" : "¿Desactivar la memoria para este proyecto?",
    next
      ? "Opt-in local: una memoria puede indexar secretos del proyecto. Esta opción no instala pi-memory."
      : "La política queda desactivada; no se desinstala ni borra ningún paquete.",
  )
  if (!confirmed) return
  saveMemoryPolicy({ projectRoot: ctx.cwd, allow: next })
  await ctx.ui.notify(`Memoria por proyecto ${next ? "activada" : "desactivada"}.`, "info")
}

async function localFirstScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  while (true) {
    const selected = await pick(
      ctx.ui,
      "Local-first, recomendados con aviso",
      [
        ...LOCAL_FIRST.map((entry) => ({ value: entry.id, label: entry.id, description: entry.warning })),
        { value: "back", label: "Volver", description: "" },
      ],
      ["Son recomendados, no esenciales. Nada se instala sin auditoría y confirmación."],
    )
    if (!selected || selected === "back") return
    const entry = LOCAL_FIRST.find((candidate) => candidate.id === selected)
    if (!entry) continue
    await showText(ctx.ui, `Local-first, ${entry.id}`, [
      entry.warning,
      "",
      "La instalación pasa por la misma revisión de fuentes que /packages.",
    ])
    const action = await pick(ctx.ui, entry.id, [
      { value: "install", label: "Revisar e instalar", description: "Audita la versión exacta y pide confirmación." },
      { value: "back", label: "Volver", description: "" },
    ])
    if (action === "install") await auditAndInstallNpmPackage(pi, ctx, entry.id)
  }
}

export async function packagesScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  while (true) {
    const memory = loadMemoryPolicy(ctx.cwd)
    const entry = await pick(ctx.ui, "Paquetes del ecosistema de pi", [
      { value: "search", label: "Buscar paquetes…", description: "Búsqueda libre en el registro de paquetes para pi." },
      { value: "git", label: "Revisar una fuente Git…", description: "Clona con profundidad uno, audita y pide confirmación." },
      { value: "local-first", label: "Local-first…", description: "Recomendados locales con su advertencia y auditoría." },
      {
        value: "memory",
        label: `Memoria por proyecto: ${memory.allow ? "activada" : "desactivada"}`,
        description: "Opt-in local con aviso de secretos; nunca instala pi-memory.",
      },
      { value: "back", label: "Volver", description: "" },
    ])
    if (!entry || entry === "back") return

    if (entry === "memory") {
      await toggleProjectMemory(ctx)
      continue
    }
    if (entry === "local-first") {
      await localFirstScreen(pi, ctx)
      continue
    }

    if (entry === "git") {
      const url = await ctx.ui.input("Fuente Git", "https://github.com/usuario/repositorio")
      if (!url) continue
      ctx.ui.setStatus("alfred-audit", "clonando con profundidad uno para auditar…")
      let audit: PackageAudit
      try {
        audit = await auditGitSource(url)
      } finally {
        ctx.ui.setStatus("alfred-audit", undefined)
      }
      const status = auditStatus(audit)
      await showText(ctx.ui, `Revisión de seguridad, ${url}`, formatAuditReport(audit))
      if (status === "failed") {
        await ctx.ui.notify(`La revisión de ${url} ha fallado. No se instalará.`, "error")
        continue
      }
      const sure = await ctx.ui.confirm(
        status === "incomplete"
          ? "La revisión de la fuente Git está incompleta. ¿Instalar de todos modos?"
          : `¿Instalar ${url}?`,
        status === "incomplete"
          ? "No se revisó toda la fuente. Consulta las omisiones del informe."
          : auditHasHighFindings(audit)
            ? "Hay hallazgos de riesgo alto. Continúa solo si confías en la fuente."
            : "La fuente Git revisada es la que se enviará a pi install.",
      )
      if (!sure) continue
      await installPackage(pi, ctx, url, url)
      continue
    }

    const query = await ctx.ui.input("Buscar paquetes para pi", "")
    if (query === undefined) continue
    ctx.ui.setStatus("alfred-pkg", "buscando en npm…")
    const results = await searchPiPackages(query)
    const withDownloads = await Promise.all(
      results.map(async (p) => ({ ...p, downloads: await packageDownloads(p.name) })),
    )
    ctx.ui.setStatus("alfred-pkg", undefined)
    if (withDownloads.length === 0) {
      await ctx.ui.notify("Ningún paquete de pi coincide con la búsqueda", "warning")
      continue
    }

    const installed = installedNpmPackages(freshSettings())

    const picked = await pick(
      ctx.ui,
      `Resultados para «${query}» (${withDownloads.length})`,
      [
        ...withDownloads.map((p) => ({
          value: p.name,
          label: `${installed.has(p.name) ? "✓" : "○"} ${p.name}`,
          description: `${p.downloads !== undefined ? `popularidad: ${p.downloads}/mes · ` : ""}${p.description ?? ""}`.slice(0, 90),
        })),
        { value: "", label: "Volver", description: "" },
      ],
    )
    if (!picked) continue
    await packageActions(pi, ctx, picked, withDownloads.find((pkg) => pkg.name === picked))
  }
}

async function packageActions(
  pi: ExtensionAPI,
  ctx: Ctx,
  name: string,
  searchResult?: RegistryPackage,
): Promise<void> {
  while (true) {
    const action = await pick(ctx.ui, `${name}`, [
      { value: "info", label: "Detalles…", description: "Versión, licencia y comienzo del archivo README." },
      { value: "audit", label: "Revisar fuentes…", description: "Muestra el estado, la cobertura y los hallazgos." },
      { value: "install", label: "Revisar e instalar", description: "Resuelve la versión, audita y pide confirmación." },
      { value: "back", label: "Volver", description: "" },
    ])
    if (!action || action === "back") return
    if (action === "info") {
      const d = await packageDetail(name)
      if (!d) {
        await showText(ctx.ui, `Tarjeta de confianza, ${name}`, ["Detalles no disponibles."])
      } else {
        const receipt = loadAuditReceipt(getDataDir(), d.name, d.version)
        await showText(ctx.ui, `Tarjeta de confianza, ${name}`, packageTrustCard(d, searchResult?.downloads, receipt))
      }
    } else if (action === "audit") {
      const audit = await auditNpmForDisplay(ctx, name)
      await showText(ctx.ui, `Revisión de seguridad, ${name}`, formatAuditReport(audit))
    } else if (action === "install") {
      await auditAndInstallNpmPackage(pi, ctx, name)
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Stack (control tower)

export async function stackScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  const model = ctx.model as unknown as { provider?: string; id?: string } | undefined
  let thinking = "?"
  try {
    thinking = String(pi.getThinkingLevel())
  } catch {
    // not available in this mode
  }
  const info = collectStack({ agentDir: getBaseDir(), model, thinking })
  await showText(ctx.ui, "Stack", formatStackText(info))
}

// ---------------------------------------------------------------------------
// Autopilot

export async function autopilotScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  const agentDir = getBaseDir()
  const dataDir = getDataDir()
  while (true) {
    const state = loadAutopilotState(dataDir)
    const domains = discoverDomains()
    const enabledPacks = domains.filter((d) => isDomainEnabled(loadDomainsState(dataDir), d.manifest.id))

    const choice = await pick(
      ctx.ui,
      `Autopilot - ${state.enabled ? "ON" : "OFF"} (${state.routing})`,
      [
        {
          value: "toggle",
          label: state.enabled ? "Turn autopilot OFF" : "Turn autopilot ON",
          description: state.enabled
            ? `currently: detects domain per turn, injects only its context${state.routing === "context+thinking" ? " + thinking level" : ""}`
            : "skills stay available always; each turn gets the focused context of the detected domain",
        },
        {
          value: "routing",
          label: `Routing mode: ${state.routing}`,
          description: state.routing === "context" ? "switch to context + recommended thinking level" : "switch to context only",
        },
        {
          value: "test",
          label: "Test detection…",
          description: "type a prompt, see which domain autopilot would pick",
        },
        {
          value: "enable-all",
          label: `${dealAllSalasLabel()} (${enabledPacks.length}/${domains.length} activas)`,
          description: "Enlaza las skills y los prompts; autopilot mantiene el contexto enfocado en una sala.",
        },
        { value: "back", label: "Back", description: "" },
      ],
    )
    if (!choice || choice === "back") return

    if (choice === "toggle") {
      const next = loadAutopilotState(dataDir)
      next.enabled = !next.enabled
      next.enabledAt = next.enabled ? new Date().toISOString() : undefined
      saveAutopilotState(next, dataDir)
      if (next.enabled && enabledPacks.length === 0 && domains.length > 0) {
        const deal = await ctx.ui.confirm(
          "¿Habilitar ahora las skills de todas las salas?",
          "Se crearán enlaces en ~/.pi/agent. Después, usa /reload.",
        )
        if (deal) await dealAllCards(ctx, dataDir)
      }
      await ctx.ui.notify(next.enabled ? "Autopilot ON - domains detected per turn" : "Autopilot off - manual /domains mode", "info")
    } else if (choice === "routing") {
      const next = loadAutopilotState(dataDir)
      next.routing = (next.routing === "context" ? "context+thinking" : "context") as AutopilotRouting
      saveAutopilotState(next, dataDir)
    } else if (choice === "test") {
      const sample = await ctx.ui.input("Prompt to test", "audita la seguridad de este repo")
      if (!sample) continue
      const match = detectDomain(sample, discoverDomains())
      await showText(
        ctx.ui,
        "Detection result",
        match
          ? [
              `${match.domain.manifest.name} (${match.domain.manifest.id})`,
              `score: ${match.score}`,
              `matched: ${match.matched.join(", ")}`,
              "",
              `context injected: ${(match.domain.contextMd ?? "").split("\n").length} lines`,
              `thinking: ${state.routing === "context+thinking" ? match.domain.manifest.recommended?.thinkingLevel ?? "default" : "unchanged"}`,
            ]
          : ["No domain matched - no extra context injected; plain pi with all skills still on the menu."],
      )
    } else if (choice === "enable-all") {
      await dealAllCards(ctx, dataDir)
    }
  }
}

async function dealAllCards(ctx: Ctx, dataDir: string): Promise<void> {
  const results = enableAllDomains({ agentDir: getBaseDir(), cwd: process.cwd(), dataDir })
  const lines = results.map((r) => `${r.ok ? "✓" : "✗"} ${r.domain}${r.linked.length > 0 ? ` (+${r.linked.length})` : ""}`)
  await ctx.ui.notify(lines.length > 0 ? lines.join(" · ") + " - run /reload" : "All packs already enabled", "info")
}

// ---------------------------------------------------------------------------
// Backups

async function backupsScreen(pi: ExtensionAPI, ctx: Ctx): Promise<void> {
  while (true) {
    const backups = listBackups()
    const choice = await pick(
      ctx.ui,
      "Backups - config snapshots",
      backups.length > 0
        ? [
            ...backups.map((b) => ({
              value: `backup:${b.id}`,
              label: `${b.createdAt.replace("T", " ").slice(0, 19)}${b.pinned ? " [pinned]" : ""}`,
              description: b.files.join(", "),
            })),
            { value: "back", label: "Back", description: "" },
          ]
        : [{ value: "back", label: "(no backups yet - taken on every write)", description: "" }],
    )
    if (!choice || choice === "back") return

    const id = choice.slice("backup:".length)
    const info = backups.find((b) => b.id === id)!
    const action = await pick(ctx.ui, `Backup ${id}`, [
      { value: "restore", label: "Restore", description: "current files are snapshotted first" },
      info.pinned
        ? { value: "unpin", label: "Unpin", description: "allow pruning again" }
        : { value: "pin", label: "Pin", description: "protect from automatic pruning" },
      { value: "back", label: "Back", description: "" },
    ])
    if (!action || action === "back") continue
    if (action === "restore") {
      const sure = await ctx.ui.confirm(`Restore backup from ${info.createdAt}?`, "A safety backup of the current files is taken first.")
      if (!sure) continue
      const r = restoreBackup(id)
      if (r.ok) {
        try {
          await ctx.modelRegistry.refresh()
        } catch {
          // best-effort
        }
        await ctx.ui.notify("Restored. Run /reload if prompts/skills changed.", "info")
      } else {
        await ctx.ui.notify(`Restore failed: ${r.error}`, "error")
      }
    } else if (action === "pin") {
      pinBackup(id)
      await ctx.ui.notify("Pinned", "info")
    } else if (action === "unpin") {
      unpinBackup(id)
      await ctx.ui.notify("Unpinned", "info")
    }
  }
}
