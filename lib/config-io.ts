/**
 * Safe read/write layer over pi's config files (models.json, auth.json,
 * settings.json): atomic writes, timestamped backups with retention + pin,
 * restore, and unified-diff previews. Pure Node, no pi imports.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
  renameSync,
  chmodSync,
  rmSync,
} from "node:fs"
import { join, basename, dirname, parse, resolve } from "node:path"
import { getBaseDir, getDataDir } from "./paths.ts"
import { unifiedDiff } from "./diff.ts"

export type ApiType =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"

export interface ModelConfig {
  id: string
  name?: string
  reasoning?: boolean
  input?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
  [k: string]: unknown
}

export interface CredentialPolicy {
  authorizedOrigin: string
  allowInsecureLoopback?: boolean
}

export interface ProviderConfig {
  baseUrl?: string
  api?: string
  apiKey?: string
  headers?: Record<string, string>
  credentialPolicy?: CredentialPolicy
  models?: ModelConfig[]
  modelOverrides?: Record<string, ModelConfig>
  [k: string]: unknown
}

export interface ModelsFile {
  providers: Record<string, ProviderConfig>
}

export interface AuthCredential {
  type?: string
  key?: string
  [k: string]: unknown
}

export type AuthFile = Record<string, AuthCredential>
export type SettingsFile = Record<string, unknown>

export interface FilePaths {
  agentDir: string
  models: string
  auth: string
  settings: string
  dataDir: string
  backupsDir: string
}

export function getPaths(baseDir = getBaseDir()): FilePaths {
  const dataDir = getDataDir(baseDir)
  return {
    agentDir: baseDir,
    models: join(baseDir, "models.json"),
    auth: join(baseDir, "auth.json"),
    settings: join(baseDir, "settings.json"),
    dataDir,
    backupsDir: join(dataDir, "backups"),
  }
}

// ---------------------------------------------------------------------------
// Reading

export interface LoadedFile<T> {
  data: T
  existed: boolean
  error?: string
}

export function readJsonFile<T>(path: string, fallback: T): LoadedFile<T> {
  if (!existsSync(path)) return { data: fallback, existed: false }
  try {
    return { data: JSON.parse(readFileSync(path, "utf-8")) as T, existed: true }
  } catch (e) {
    return { data: fallback, existed: true, error: `invalid JSON: ${(e as Error).message}` }
  }
}

export function loadModels(paths: FilePaths = getPaths()): LoadedFile<ModelsFile> {
  return readJsonFile<ModelsFile>(paths.models, { providers: {} })
}

export function loadAuth(paths: FilePaths = getPaths()): LoadedFile<AuthFile> {
  return readJsonFile<AuthFile>(paths.auth, {})
}

export function loadSettings(paths: FilePaths = getPaths()): LoadedFile<SettingsFile> {
  return readJsonFile<SettingsFile>(paths.settings, {})
}

// ---------------------------------------------------------------------------
// Writing (atomic + backup)

export function stringifyJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n"
}

const AUTH_MODE = 0o600

/** Write via temp file + rename so a crash never leaves a truncated config. */
export function atomicWriteText(path: string, content: string, mode?: number): void {
  const tmp = path + ".tmp-" + Date.now()
  writeFileSync(tmp, content, mode !== undefined ? { mode } : undefined)
  try {
    // Preserve the original permissions when no explicit mode is required.
    if (existsSync(path)) {
      const prevMode = statSync(path).mode & 0o777
      if (mode === undefined) chmodSync(tmp, prevMode)
    }
  } catch {
    // chmod is best-effort
  }
  try {
    renameSync(tmp, path)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch {
      // ignore
    }
    throw e
  }
}

export function atomicWriteJson(path: string, data: unknown, mode?: number): void {
  atomicWriteText(path, stringifyJson(data), mode)
}

/** Write the credential store atomically with owner-only permissions. */
function writeAuth(data: string, paths = getPaths()): void {
  atomicWriteText(paths.auth, data, AUTH_MODE)
}

// ---------------------------------------------------------------------------
// Backups

export interface BackupInfo {
  id: string
  createdAt: string
  pinned: boolean
  files: string[]
}

const RETENTION = 10
const BACKUP_DIR_MODE = 0o700
const BACKUP_FILE_MODE = 0o600

function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: BACKUP_DIR_MODE })
  chmodSync(dir, BACKUP_DIR_MODE)
}

function writePrivateBackupFile(path: string, content: string | Uint8Array): void {
  writeFileSync(path, content, { mode: BACKUP_FILE_MODE })
  chmodSync(path, BACKUP_FILE_MODE)
}

function backupDirForId(id: string, paths: FilePaths): string | undefined {
  if (id === "" || id === "." || id === ".." || id.includes("\\") || id.includes("\0") || basename(id) !== id) return undefined
  const root = resolve(paths.backupsDir)
  if (root === parse(root).root) return undefined
  const dir = resolve(root, id)
  return dirname(dir) === root ? dir : undefined
}

function removeBackupDir(id: string, paths: FilePaths): boolean {
  const dir = backupDirForId(id, paths)
  if (!dir || !existsSync(dir)) return false
  try {
    rmSync(dir, { recursive: true, force: true })
    return !existsSync(dir)
  } catch {
    return false
  }
}

/** Snapshot the given config files into dataDir/backups/<timestamp>/. */
let backupCounter = 0
export function backupFiles(filePaths: string[], paths = getPaths()): BackupInfo | undefined {
  const existing = filePaths.filter((p) => existsSync(p))
  if (existing.length === 0) return undefined
  // Same-millisecond writes are common (backup + immediate re-backup), so ids
  // carry a monotonic suffix to never collide.
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${String(backupCounter++).padStart(3, "0")}`
  const dir = join(paths.backupsDir, id)
  ensurePrivateDir(paths.backupsDir)
  ensurePrivateDir(dir)
  for (const p of existing) writePrivateBackupFile(join(dir, basename(p)), readFileSync(p))
  const info: BackupInfo = { id, createdAt: new Date().toISOString(), pinned: false, files: existing.map((p) => basename(p)) }
  writePrivateBackupFile(join(dir, "backup.json"), stringifyJson(info))
  pruneBackups(paths)
  return info
}

export function listBackups(paths = getPaths()): BackupInfo[] {
  if (!existsSync(paths.backupsDir)) return []
  const out: BackupInfo[] = []
  for (const entry of readdirSync(paths.backupsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const metaPath = join(paths.backupsDir, entry.name, "backup.json")
    if (!existsSync(metaPath)) continue
    try {
      const info = JSON.parse(readFileSync(metaPath, "utf-8")) as BackupInfo
      out.push({ ...info, id: entry.name })
    } catch {
      // skip unreadable entries
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

function setPinned(id: string, pinned: boolean, paths = getPaths()): boolean {
  const dir = backupDirForId(id, paths)
  if (!dir) return false
  const metaPath = join(dir, "backup.json")
  if (!existsSync(metaPath)) return false
  const info = JSON.parse(readFileSync(metaPath, "utf-8")) as BackupInfo
  info.id = id
  info.pinned = pinned
  writePrivateBackupFile(metaPath, stringifyJson(info))
  return true
}

export const pinBackup = (id: string, paths = getPaths()) => setPinned(id, true, paths)
export const unpinBackup = (id: string, paths = getPaths()) => setPinned(id, false, paths)

/** Keep the newest RETENTION backups; pinned ones are never removed. */
export function pruneBackups(paths = getPaths()): number {
  const all = listBackups(paths)
  const removable = all.filter((b) => !b.pinned).slice(RETENTION)
  let removed = 0
  for (const b of removable) if (removeBackupDir(b.id, paths)) removed++
  return removed
}

export function deleteBackup(id: string, paths = getPaths()): boolean {
  return removeBackupDir(id, paths)
}

/**
 * Restore a backup: snapshots current files first, then copies backup files
 * back into the agent dir. Returns the fresh safety backup id.
 */
export function restoreBackup(id: string, paths = getPaths()): { ok: boolean; safetyBackup?: BackupInfo; error?: string } {
  const dir = join(paths.backupsDir, id)
  if (!existsSync(dir)) return { ok: false, error: `backup ${id} not found` }
  const targets = [paths.models, paths.auth, paths.settings]
  const safety = backupFiles(targets, paths)
  let restored = 0
  for (const t of targets) {
    const src = join(dir, basename(t))
    if (existsSync(src)) {
      if (t === paths.auth) writeAuth(readFileSync(src, "utf-8"), paths)
      else copyFileSync(src, t)
      restored++
    }
  }
  if (restored === 0) return { ok: false, error: "backup contains no known config files", safetyBackup: safety }
  return { ok: true, safetyBackup: safety }
}

// ---------------------------------------------------------------------------
// Planned writes with diff preview

export type ConfigKind = "models" | "auth" | "settings"

export interface PlannedWrite {
  kind: ConfigKind
  path: string
  /** Opaque current payload. Never render or log; `diff` is the only view. */
  before: string
  /** Opaque next payload consumed by applyPlan. Never render or log. */
  after: string
  /** Redacted and safe-to-render preview. */
  diff: string
  mode?: number
}

type JsonObject = Record<string, unknown>

const REDACTED = "***"
const REDACTED_UPDATED = "*** (updated)"
const SENSITIVE_HEADERS = new Set(["authorization", "x-api-key", "api-key"])

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined
}

function hasOwn(object: JsonObject | undefined, key: string): object is JsonObject {
  return object !== undefined && Object.prototype.hasOwnProperty.call(object, key)
}

function isEnvironmentRef(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("$")
}

function isOpaqueSecret(value: unknown): boolean {
  return value !== undefined && !isEnvironmentRef(value)
}

function redactField(before: JsonObject | undefined, after: JsonObject | undefined, key: string): void {
  const hadBefore = hasOwn(before, key)
  const hasAfter = hasOwn(after, key)
  const beforeValue = hadBefore ? before[key] : undefined
  const afterValue = hasAfter ? after[key] : undefined

  if (hadBefore && isOpaqueSecret(beforeValue)) before[key] = REDACTED
  if (hasAfter && isOpaqueSecret(afterValue)) {
    after[key] = hadBefore && !Object.is(beforeValue, afterValue) ? REDACTED_UPDATED : REDACTED
  }
}

function redactHeaders(before: JsonObject | undefined, after: JsonObject | undefined): void {
  const previous = new Map<string, unknown[]>()
  for (const [name, value] of Object.entries(before ?? {})) {
    const normalized = name.toLowerCase()
    if (!SENSITIVE_HEADERS.has(normalized)) continue
    const values = previous.get(normalized) ?? []
    values.push(value)
    previous.set(normalized, values)
    if (isOpaqueSecret(value)) before![name] = REDACTED
  }
  for (const [name, value] of Object.entries(after ?? {})) {
    const normalized = name.toLowerCase()
    if (!SENSITIVE_HEADERS.has(normalized) || !isOpaqueSecret(value)) continue
    const oldValues = previous.get(normalized)
    after![name] = oldValues?.length && !oldValues.some((old) => Object.is(old, value)) ? REDACTED_UPDATED : REDACTED
  }
}

/** Clone config trees and redact only the preview copies. */
function redactPreviewPair(kind: ConfigKind, beforeData: unknown, afterData: unknown): { before: unknown; after: unknown } {
  const before = structuredClone(beforeData)
  const after = structuredClone(afterData)
  const beforeRoot = asObject(before)
  const afterRoot = asObject(after)

  if (kind === "auth") {
    const ids = new Set([...Object.keys(beforeRoot ?? {}), ...Object.keys(afterRoot ?? {})])
    for (const id of ids) redactField(asObject(beforeRoot?.[id]), asObject(afterRoot?.[id]), "key")
  } else if (kind === "models") {
    const beforeProviders = asObject(beforeRoot?.providers)
    const afterProviders = asObject(afterRoot?.providers)
    const ids = new Set([...Object.keys(beforeProviders ?? {}), ...Object.keys(afterProviders ?? {})])
    for (const id of ids) {
      const beforeProvider = asObject(beforeProviders?.[id])
      const afterProvider = asObject(afterProviders?.[id])
      redactField(beforeProvider, afterProvider, "apiKey")
      redactHeaders(asObject(beforeProvider?.headers), asObject(afterProvider?.headers))
    }
  }

  return { before, after }
}

function modelsContainLiteralCredential(models: ModelsFile): boolean {
  return Object.values(models.providers).some((provider) => {
    if (isOpaqueSecret(provider.apiKey)) return true
    return Object.entries(provider.headers ?? {}).some(([name, value]) => SENSITIVE_HEADERS.has(name.toLowerCase()) && isOpaqueSecret(value))
  })
}

function plannedMode(kind: ConfigKind, next: ModelsFile | AuthFile | SettingsFile): number | undefined {
  if (kind === "models" && modelsContainLiteralCredential(next as ModelsFile)) return 0o600
  return undefined
}

/** Build a preview of everything that would change before committing. */
export function planWrites(
  changes: { models?: ModelsFile; auth?: AuthFile; settings?: SettingsFile },
  paths = getPaths(),
): PlannedWrite[] {
  const plan: PlannedWrite[] = []
  const current = {
    models: loadModels(paths),
    auth: loadAuth(paths),
    settings: loadSettings(paths),
  }
  for (const kind of ["models", "auth", "settings"] as ConfigKind[]) {
    const next = changes[kind]
    if (next === undefined) continue
    const loaded = current[kind]
    const before = loaded.existed ? stringifyJsonPreserving(loaded.data) : ""
    const after = stringifyJson(next)
    if (before === after) continue
    const preview = redactPreviewPair(kind, loaded.data, next)
    const previewBefore = stringifyJsonPreserving(preview.before)
    const previewAfter = stringifyJson(preview.after)
    plan.push({
      kind,
      path: kind === "models" ? paths.models : kind === "auth" ? paths.auth : paths.settings,
      before,
      after,
      diff: loaded.existed ? unifiedDiff(previewBefore, previewAfter, `${kind}.json (current)`, `${kind}.json (new)`) : `+++ ${kind}.json (new file)\n` + previewAfter,
      mode: plannedMode(kind, next),
    })
  }
  return plan
}

function stringifyJsonPreserving(data: unknown): string {
  // Re-serialize loaded data so formatting matches our writes; the first
  // managed write may reformat the file, which the diff will show honestly.
  return stringifyJson(data)
}

/** Apply planned writes: backup originals, then write atomically. */
export function applyPlan(plan: PlannedWrite[], paths = getPaths()): BackupInfo | undefined {
  const backup = backupFiles(
    plan.map((p) => p.path),
    paths,
  )
  for (const p of plan) {
    if (p.kind === "auth") writeAuth(p.after, paths)
    else atomicWriteText(p.path, p.after, p.mode)
  }
  return backup
}
