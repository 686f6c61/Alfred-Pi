/**
 * Doctor: static config checks, cross-file reconciliation and provider
 * liveness sweeps with a JSONL health history. Pure Node.
 */
import { chmodSync, existsSync, readFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import {
  type ModelsFile,
  type AuthFile,
  type SettingsFile,
  type FilePaths,
  getPaths,
  loadModels,
  loadAuth,
  loadSettings,
  atomicWriteText,
} from "./config-io.ts"
import { probeLiveness, probeSystemRoleSupport, resolveKeyRef, type ProbeTarget, type LivenessResult } from "./prober.ts"

export interface DoctorIssue {
  severity: "error" | "warn" | "info"
  provider?: string
  message: string
  hint?: string
}

export interface DoctorReport {
  issues: DoctorIssue[]
  liveness: LivenessResult[]
  checkedAt: string
}

// Keep provider ids and env names aligned with pi's effective auth contract.
// This is provider recognition and diagnosis data, not a duplicate preset catalog.
const BUILTIN_KEY_ENV: Readonly<Record<string, readonly string[]>> = {
  anthropic: ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
  "ant-ling": ["ANT_LING_API_KEY"],
  "qwen-token-plan": ["QWEN_TOKEN_PLAN_API_KEY"],
  "qwen-token-plan-individual": ["QWEN_TOKEN_PLAN_API_KEY"],
  "qwen-token-plan-cn": ["QWEN_TOKEN_PLAN_CN_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  "openai-codex": [],
  "azure-openai-responses": ["AZURE_OPENAI_API_KEY"],
  nvidia: ["NVIDIA_API_KEY"],
  google: ["GEMINI_API_KEY"],
  "google-vertex": ["GOOGLE_CLOUD_API_KEY"],
  "amazon-bedrock": ["AWS_BEARER_TOKEN_BEDROCK"],
  "github-copilot": ["COPILOT_GITHUB_TOKEN"],
  "llama.cpp": ["LLAMA_BASE_URL"],
  deepseek: ["DEEPSEEK_API_KEY"],
  xai: ["XAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  radius: ["RADIUS_API_KEY"],
  groq: ["GROQ_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  fireworks: ["FIREWORKS_API_KEY"],
  huggingface: ["HF_TOKEN"],
  baseten: ["BASETEN_API_KEY"],
  "vercel-ai-gateway": ["AI_GATEWAY_API_KEY"],
  zai: ["ZAI_API_KEY"],
  "zai-coding-cn": ["ZAI_CODING_CN_API_KEY"],
  opencode: ["OPENCODE_API_KEY"],
  "opencode-go": ["OPENCODE_API_KEY"],
  "kimi-coding": ["KIMI_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  "minimax-cn": ["MINIMAX_CN_API_KEY"],
  moonshotai: ["MOONSHOT_API_KEY"],
  "moonshotai-cn": ["MOONSHOT_API_KEY"],
  "cloudflare-workers-ai": ["CLOUDFLARE_API_KEY"],
  "cloudflare-ai-gateway": ["CLOUDFLARE_API_KEY"],
  xiaomi: ["XIAOMI_API_KEY"],
  "xiaomi-token-plan-cn": ["XIAOMI_TOKEN_PLAN_CN_API_KEY"],
  "xiaomi-token-plan-ams": ["XIAOMI_TOKEN_PLAN_AMS_API_KEY"],
  "xiaomi-token-plan-sgp": ["XIAOMI_TOKEN_PLAN_SGP_API_KEY"],
}

const BUILTIN_OAUTH = new Set(["anthropic", "github-copilot", "kimi-coding", "openai-codex", "openrouter", "radius", "xai"])

function isBuiltinProvider(provider: string): boolean {
  return Object.hasOwn(BUILTIN_KEY_ENV, provider)
}

function effectiveEnv(credential: AuthFile[string] | undefined, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env }
  const scoped = credential?.env
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) return out
  for (const [name, value] of Object.entries(scoped)) {
    // pi gives non-empty provider-scoped values precedence over process env.
    if (typeof value === "string" && value) out[name] = value
  }
  return out
}

function hasStructuredOAuth(credential: AuthFile[string]): boolean {
  return (
    credential.type === "oauth" &&
    typeof credential.access === "string" &&
    credential.access.length > 0 &&
    typeof credential.refresh === "string" &&
    typeof credential.expires === "number" &&
    Number.isFinite(credential.expires)
  )
}

function hasEffectiveBuiltinCredential(provider: string, auth: AuthFile, env: NodeJS.ProcessEnv): boolean {
  const credential = auth[provider]
  const providerEnv = effectiveEnv(credential, env)

  if (credential?.type === "oauth") {
    return BUILTIN_OAUTH.has(provider) && hasStructuredOAuth(credential)
  }

  if (provider === "llama.cpp") {
    // The optional API key is useless until pi knows which router to contact.
    return Boolean(providerEnv.LLAMA_BASE_URL)
  }

  if (credential?.key && (BUILTIN_KEY_ENV[provider]?.length ?? 0) > 0) {
    const resolved = resolveKeyRef(credential.key, providerEnv)
    if (resolved.value) return true
  }

  if (provider === "amazon-bedrock") {
    return Boolean(
      providerEnv.AWS_PROFILE ||
        (providerEnv.AWS_ACCESS_KEY_ID && providerEnv.AWS_SECRET_ACCESS_KEY) ||
        providerEnv.AWS_BEARER_TOKEN_BEDROCK ||
        providerEnv.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
        providerEnv.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
        providerEnv.AWS_WEB_IDENTITY_TOKEN_FILE,
    )
  }

  return (BUILTIN_KEY_ENV[provider] ?? []).some((name) => Boolean(providerEnv[name]))
}

function builtinCredentialHint(provider: string): string {
  if (provider === "amazon-bedrock") {
    return "configura /login amazon-bedrock, AWS_PROFILE, el par AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY, un token de Bedrock o una identidad de tarea"
  }
  if (provider === "llama.cpp") {
    return "configura /login llama.cpp o LLAMA_BASE_URL; LLAMA_API_KEY por sí sola no identifica el servidor"
  }
  const envNames = BUILTIN_KEY_ENV[provider] ?? []
  const envHint = envNames.length > 0 ? envNames.join(" o ") : undefined
  return envHint ? `configura /login ${provider} o ${envHint}` : `configura /login ${provider}`
}

/**
 * Static checks over the three config files. Providers resolved here are
 * custom ones (models.json) plus built-ins referenced by settings/auth.
 */
export function checkConfigs(input: {
  models: ModelsFile
  auth: AuthFile
  settings: SettingsFile
  env?: NodeJS.ProcessEnv
}): DoctorIssue[] {
  const env = input.env ?? process.env
  const issues: DoctorIssue[] = []
  const { models, auth, settings } = input

  const defaultProvider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : undefined
  const defaultModel = typeof settings.defaultModel === "string" ? settings.defaultModel : undefined

  for (const [name, cfg] of Object.entries(models.providers ?? {})) {
    if (!cfg.baseUrl) {
      issues.push({ severity: "error", provider: name, message: "custom provider has no baseUrl" })
      continue
    }
    if (/{|}/.test(cfg.baseUrl) === false && /\s/.test(cfg.baseUrl)) {
      issues.push({ severity: "error", provider: name, message: `baseUrl contains whitespace: ${cfg.baseUrl}` })
    }
    if (cfg.baseUrl.endsWith("/")) {
      issues.push({ severity: "warn", provider: name, message: "baseUrl ends with '/'", hint: "usually harmless, but drop it to match pi conventions" })
    }
    if (!cfg.api) {
      issues.push({ severity: "error", provider: name, message: "custom provider has no `api` type", hint: "one of: openai-completions, openai-responses, anthropic-messages, google-generative-ai" })
    }
    if (cfg.api === "anthropic-messages" && !cfg.baseUrl.includes("/v1") && !/api\.anthropic\.com/.test(cfg.baseUrl)) {
      issues.push({ severity: "info", provider: name, message: "anthropic-style baseUrl without /v1", hint: "most Anthropic-compatible gateways expect the /v1 suffix" })
    }
    const keyRef = cfg.apiKey
    if (keyRef?.startsWith("$")) {
      const resolved = resolveKeyRef(keyRef, env)
      if (resolved.error) issues.push({ severity: "warn", provider: name, message: resolved.error })
    } else if (keyRef?.startsWith("!")) {
      const resolved = resolveKeyRef(keyRef, env)
      if (resolved.error) issues.push({ severity: "warn", provider: name, message: resolved.error })
    } else if (!keyRef && !auth[name]?.key) {
      // No key anywhere - fine for local backends, warn for remote ones.
      if (!/127\.0\.0\.1|localhost/.test(cfg.baseUrl)) {
        issues.push({ severity: "warn", provider: name, message: "no API key configured (no models.json apiKey, no auth.json entry)", hint: "remote endpoint will likely reject requests" })
      }
    }
    const ids = (cfg.models ?? []).map((m) => m.id)
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dupes.length > 0) {
      issues.push({ severity: "warn", provider: name, message: `duplicate model ids: ${[...new Set(dupes)].join(", ")}` })
    }
    for (const m of cfg.models ?? []) {
      if (m.contextWindow === undefined) {
        issues.push({ severity: "info", provider: name, message: `model ${m.id} has no contextWindow`, hint: "defaults to 128000" })
      }
    }
  }

  // Reconciliation: default model must exist.
  if (defaultProvider || defaultModel) {
    const custom = defaultProvider ? models.providers?.[defaultProvider] : undefined
    const customIds = custom?.models?.map((m) => m.id) ?? []
    const modelMissingInCustom = custom && defaultModel && !customIds.includes(defaultModel)
    const unknownProvider = defaultProvider && !custom && !isBuiltinProvider(defaultProvider) && !auth[defaultProvider]
    if (modelMissingInCustom) {
      issues.push({
        severity: "error",
        provider: defaultProvider,
        message: `defaultModel "${defaultModel}" is not in models.json for "${defaultProvider}"`,
        hint: "set a valid default in Defaults or remove the stale setting",
      })
    }
    if (unknownProvider) {
      issues.push({
        severity: "error",
        provider: defaultProvider,
        message: `defaultProvider "${defaultProvider}" is neither a built-in nor a models.json provider`,
      })
    }
    if (defaultProvider && !custom && isBuiltinProvider(defaultProvider) && !hasEffectiveBuiltinCredential(defaultProvider, auth, env)) {
      issues.push({
        severity: "warn",
        provider: defaultProvider,
        message: `no hay una credencial efectiva para el proveedor nativo "${defaultProvider}"`,
        hint: builtinCredentialHint(defaultProvider),
      })
    }
  }

  // Built-ins referenced in auth.json with a $ENV that's missing.
  for (const [name, cred] of Object.entries(auth)) {
    if (cred.key?.startsWith("$")) {
      const resolved = resolveKeyRef(cred.key, effectiveEnv(cred, env))
      if (resolved.error) issues.push({ severity: "warn", provider: name, message: `auth.json: ${resolved.error}` })
    }
  }

  return issues
}

/** Build probe targets for every custom provider that has a baseUrl. */
export function probeTargets(models: ModelsFile, env: NodeJS.ProcessEnv = process.env): ProbeTarget[] {
  const out: ProbeTarget[] = []
  for (const [name, cfg] of Object.entries(models.providers ?? {})) {
    if (!cfg.baseUrl || !cfg.api) continue
    const resolved = resolveKeyRef(cfg.apiKey, env)
    out.push({
      provider: name,
      baseUrl: cfg.baseUrl,
      api: cfg.api as ProbeTarget["api"],
      apiKey: resolved.value,
      headers: cfg.headers,
      credentialPolicy: cfg.credentialPolicy,
    })
  }
  return out
}

export async function runDoctor(paths: FilePaths = getPaths(), opts?: { liveness?: boolean }): Promise<DoctorReport> {
  const modelsR = loadModels(paths)
  const authR = loadAuth(paths)
  const settingsR = loadSettings(paths)
  const issues: DoctorIssue[] = []

  for (const [label, r] of [["models.json", modelsR], ["auth.json", authR], ["settings.json", settingsR]] as const) {
    if (r.error) issues.push({ severity: "error", message: `${label}: ${r.error}` })
  }

  issues.push(
    ...checkConfigs({
      models: modelsR.data,
      auth: authR.data,
      settings: settingsR.data,
    }),
  )

  let liveness: LivenessResult[] = []
  if (opts?.liveness !== false) {
    const targets = probeTargets(modelsR.data)
    liveness = await Promise.all(targets.map((t) => probeLiveness(t)))
    appendHealth(
      liveness.map((l) => ({ provider: l.provider, ok: l.ok, latencyMs: l.latencyMs ?? null, error: l.error ?? null })),
      paths,
    )

    // System-role probe: reasoning models behind OpenAI-compatible servers
    // that ignore the "developer" role silently lose the whole system prompt.
    // Only probe providers that would be affected (reasoning models, no
    // explicit compat flag); costs two ~10-token completions each.
    for (const [name, cfg] of Object.entries(modelsR.data.providers ?? {})) {
      if (cfg.api !== "openai-completions" || !cfg.baseUrl) continue
      const affected = (cfg.models ?? []).some(
        (m) => m.reasoning === true && (m as { compat?: { supportsDeveloperRole?: boolean } }).compat?.supportsDeveloperRole !== false && (cfg.compat as { supportsDeveloperRole?: boolean } | undefined)?.supportsDeveloperRole !== false,
      )
      if (!affected) continue
      const target = targets.find((t) => t.provider === name)
      const modelId = (cfg.models ?? []).find((m) => m.reasoning === true)?.id
      if (!target || !modelId) continue
      const r = await probeSystemRoleSupport(target, modelId)
      if (r.systemHonored && !r.developerHonored) {
        issues.push({
          severity: "warn",
          provider: name,
          message: `backend ignores the "developer" role: pi's system prompt is being discarded for reasoning model ${modelId}`,
          hint: `set compat.supportsDeveloperRole=false on the provider (or model) in models.json`,
        })
      }
    }
  }

  return { issues, liveness, checkedAt: new Date().toISOString() }
}

// ---------------------------------------------------------------------------
// Health history

export interface HealthEntry {
  at: string
  provider: string
  ok: boolean
  latencyMs: number | null
  error: string | null
}

const HEALTH_HISTORY_LIMIT = 2_000
const HEALTH_FILE_MODE = 0o600
const SECRET_ASSIGNMENT = /((?:[a-z0-9_.-]*(?:api[-_]?key|access[-_]?token|token|password|secret)|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,\s;&}\]]+)/gi

export function appendHealth(entries: Omit<HealthEntry, "at">[], paths = getPaths()): void {
  if (entries.length === 0) return
  mkdirSync(paths.dataDir, { recursive: true })
  const at = new Date().toISOString()
  const file = join(paths.dataDir, "health.jsonl")
  const previous = existsSync(file) ? readFileSync(file, "utf-8").split("\n").filter(Boolean) : []
  const appended = entries.map((e) => stringifyHealth({ ...e, at }))
  const retained = [...previous, ...appended].slice(-HEALTH_HISTORY_LIMIT)
  atomicWriteText(file, retained.join("\n") + "\n", HEALTH_FILE_MODE)
  chmodSync(file, HEALTH_FILE_MODE)
}

function stringifyHealth(e: HealthEntry): string {
  return JSON.stringify({ ...e, error: redactHealthError(e.error) })
}

function redactHealthError(error: string | null): string | null {
  if (error === null) return null
  return error
    .replace(/\b(Bearer|Basic)\s+[^\s"'},;]+/gi, "$1 [redacted]")
    .replace(SECRET_ASSIGNMENT, "$1[redacted]")
    .replace(/(https?:\/\/[^:/\s]+:)[^@\s/]+@/gi, "$1[redacted]@")
}

export function loadRecentHealth(limit = 200, paths = getPaths()): HealthEntry[] {
  const file = join(paths.dataDir, "health.jsonl")
  if (!existsSync(file)) return []
  const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean)
  return lines
    .slice(-limit)
    .map((l) => {
      try {
        return JSON.parse(l) as HealthEntry
      } catch {
        return null
      }
    })
    .filter((e): e is HealthEntry => e !== null)
}

export interface ProviderHealthSummary {
  provider: string
  ok: boolean
  avgLatencyMs?: number
  successRate: number
  samples: number
  lastError?: string
}

/** Aggregate recent history per provider for the TUI dashboard. */
export function summarizeHealth(entries: HealthEntry[]): ProviderHealthSummary[] {
  const byProvider = new Map<string, HealthEntry[]>()
  for (const e of entries) {
    const list = byProvider.get(e.provider) ?? []
    list.push(e)
    byProvider.set(e.provider, list)
  }
  const out: ProviderHealthSummary[] = []
  for (const [provider, list] of byProvider) {
    const oks = list.filter((e) => e.ok)
    const latencies = oks.map((e) => e.latencyMs).filter((l): l is number => l !== null)
    const last = list[list.length - 1]!
    out.push({
      provider,
      ok: last.ok,
      avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : undefined,
      successRate: list.length > 0 ? oks.length / list.length : 0,
      samples: list.length,
      lastError: last.error ?? undefined,
    })
  }
  return out.sort((a, b) => a.provider.localeCompare(b.provider))
}

// ---------------------------------------------------------------------------
// Report formatting (headless + TUI reuse)

export function formatDoctorReport(report: DoctorReport): string[] {
  const lines: string[] = []
  lines.push(`Alfred-Pi doctor - ${report.checkedAt}`)
  lines.push("")
  const errors = report.issues.filter((i) => i.severity === "error")
  const warns = report.issues.filter((i) => i.severity === "warn")
  const infos = report.issues.filter((i) => i.severity === "info")
  lines.push(`config: ${errors.length} errors, ${warns.length} warnings, ${infos.length} info`)
  for (const i of [...errors, ...warns, ...infos]) {
    const tag = i.severity === "error" ? "✗" : i.severity === "warn" ? "!" : "·"
    lines.push(`  ${tag} ${i.provider ? `[${i.provider}] ` : ""}${i.message}${i.hint ? ` - ${i.hint}` : ""}`)
  }
  if (report.issues.length === 0) lines.push("  ✓ no config issues found")
  lines.push("")
  if (report.liveness.length > 0) {
    lines.push("providers:")
    for (const l of report.liveness) {
      const status = l.ok ? `${l.latencyMs}ms` : `${l.error}`
      const count = l.models ? ` (${l.models.length} models)` : ""
      lines.push(`  ${l.ok ? "✓" : "✗"} ${l.provider}: ${status}${count}`)
    }
  } else {
    lines.push("providers: none with probeable baseUrl/api in models.json")
  }
  return lines
}
