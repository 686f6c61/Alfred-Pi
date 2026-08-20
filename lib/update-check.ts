/**
 * Update channel: fetch the version manifest from pi.686f6c61.dev, cache it
 * for 24h and compare against the installed version. Pure Node.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { atomicWriteJson } from "./config-io.ts"

export interface ReleaseManifest {
  name?: string
  latest: string
  notes?: string
  versions?: { version: string; date?: string; gitTag?: string; notes?: string }[]
}

export interface UpdateState {
  current: string
  latest?: string
  updateAvailable: boolean
  checkedAt: string
  error?: string
}

export const DEFAULT_MANIFEST_URL = "https://pi.686f6c61.dev/manifest.json"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FAILURE_BACKOFF_MS = 60 * 60 * 1000

function cachePath(dataDir: string): string {
  return join(dataDir, "update-cache.json")
}

/** Read our own package.json version. */
export function installedVersion(repoRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as { version?: string }
    return pkg.version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split("-")[0]!.split(".").map(Number)
  const pb = b.replace(/^v/, "").split("-")[0]!.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da < db ? -1 : 1
  }
  return 0
}

/**
 * Check for updates, honoring the 24h cache. `force` bypasses the cache.
 * `manifestUrl` and network failures never throw - worst case: error string.
 */
export async function checkForUpdate(
  opts: { dataDir: string; repoRoot: string; manifestUrl?: string; force?: boolean },
): Promise<UpdateState> {
  const current = installedVersion(opts.repoRoot)
  const cacheFile = cachePath(opts.dataDir)

  if (!opts.force && existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, "utf-8")) as UpdateState
      const ttl = cached.error ? FAILURE_BACKOFF_MS : CACHE_TTL_MS
      if (Date.now() - new Date(cached.checkedAt).getTime() < ttl) {
        return { ...cached, current }
      }
    } catch {
      // fall through to a fresh check
    }
  }

  const url = opts.manifestUrl ?? DEFAULT_MANIFEST_URL
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const manifest = (await res.json()) as ReleaseManifest
    const latest = manifest.latest
    if (!latest) throw new Error("manifest missing latest")
    const state: UpdateState = {
      current,
      latest,
      updateAvailable: compareVersions(current, latest) < 0,
      checkedAt: new Date().toISOString(),
    }
    try {
      mkdirSync(opts.dataDir, { recursive: true })
      atomicWriteJson(cacheFile, state)
    } catch {
      // cache write is best-effort
    }
    return state
  } catch (e) {
    const state: UpdateState = {
      current,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e),
    }
    try {
      mkdirSync(opts.dataDir, { recursive: true })
      atomicWriteJson(cacheFile, state)
    } catch {
      // cache write is best-effort
    }
    return state
  }
}
