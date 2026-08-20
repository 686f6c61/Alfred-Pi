/**
 * Path resolution for Alfred-Pi.
 *
 * Pure Node (no pi imports) so every module stays testable outside the agent.
 */
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname, resolve } from "node:path"

declare const __dirname: string | undefined

export const PACKAGE_NAME = "alfred-pi"
export const LEGACY_PACKAGE_NAME = "pi-harness-moe"

/** pi's agent config dir (~/.pi/agent), honoring pi's PI_CODING_AGENT_DIR override. */
export function getBaseDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR
  if (envDir) return resolve(envDir.replace(/^~(?=\/|$)/, homedir()))
  return join(homedir(), ".pi", "agent")
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Directory for Alfred-Pi's own data (profiles, health history, backups).
 * Prefers alfred-pi/. If only the 0.2.x directory exists, copies it once
 * and leaves the origin in place so a 0.2 install still finds its files.
 */
export function getDataDir(baseDir = getBaseDir()): string {
  const next = join(baseDir, PACKAGE_NAME)
  if (isDir(next)) return next
  const legacy = join(baseDir, LEGACY_PACKAGE_NAME)
  if (!isDir(legacy)) return next
  mkdirSync(next, { recursive: true })
  cpSync(legacy, next, { recursive: true })
  writeFileSync(
    join(next, "migrated-from.json"),
    `${JSON.stringify({ from: LEGACY_PACKAGE_NAME, at: new Date().toISOString() })}\n`,
  )
  return next
}

/** The extension's own directory (works under jiti/CJS and plain Node). */
export function extensionDir(): string {
  if (typeof __dirname !== "undefined") return __dirname
  return process.cwd()
}

/**
 * Repository root containing packs/ and package.json. Walks up from the
 * extension location so it works from a dev symlink, a git install or a copy.
 */
export function findRepoRoot(start = extensionDir()): string {
  let dir = resolve(start)
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "packs")) && existsSync(join(dir, "package.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(start)
}
