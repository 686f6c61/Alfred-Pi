/**
 * Domain packs: themed bundles (skills, prompt templates, injected context,
 * recommended model profile) that turn pi into a specialist for a work area.
 *
 * Enabling a pack symlinks its skills/prompts into pi's discovery dirs
 * (agent-level or project-level) and records ownership so disabling only ever
 * removes links this extension created.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  readlinkSync,
  lstatSync,
} from "node:fs"
import { join, resolve, relative, basename, dirname, isAbsolute, sep } from "node:path"
import { atomicWriteJson } from "./config-io.ts"
import { findRepoRoot } from "./paths.ts"

export interface DomainManifest {
  id: string
  name: string
  description: string
  version?: string
  /** Community pi packages this domain recommends (informational in v1). */
  packages?: string[]
  /** Recommended model/thinking level, applied on demand. */
  recommended?: { provider?: string; model?: string; thinkingLevel?: string }
  /** Prompt keywords (ES/EN) that signal this domain - used by autopilot. */
  triggers?: string[]
  /** Files/dirs in the repo that hint at this domain - autopilot fallback. */
  repoHints?: string[]
}

export interface DomainSkill {
  /** Skill name (directory name under skills/). */
  name: string
  dir: string
}

export interface DomainPrompt {
  /** File name under prompts/ (without .md extension). */
  name: string
  file: string
}

export interface Domain {
  manifest: DomainManifest
  dir: string
  contextMd?: string
  skills: DomainSkill[]
  prompts: DomainPrompt[]
  profile: Record<string, unknown> | undefined
}

export interface DomainDiscoveryError {
  pack: string
  error: string
}

export interface DomainDiscoveryReport {
  domains: Domain[]
  errors: DomainDiscoveryError[]
}

/** Scan packs/ and retain an error for each pack that cannot be loaded. */
export function discoverDomainsReport(repoRoot = findRepoRoot()): DomainDiscoveryReport {
  const packsDir = join(repoRoot, "packs")
  if (!existsSync(packsDir)) return { domains: [], errors: [] }
  const domains: Domain[] = []
  const errors: DomainDiscoveryError[] = []
  for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue
    const dir = join(packsDir, entry.name)
    try {
      const domain = loadDomain(dir)
      if (domain) domains.push(domain)
    } catch (error) {
      errors.push({ pack: entry.name, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { domains: domains.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)), errors }
}

/** Scan packs/ in the repository root, omitting malformed packs. */
export function discoverDomains(repoRoot = findRepoRoot()): Domain[] {
  return discoverDomainsReport(repoRoot).domains
}

export function loadDomain(dir: string): Domain | undefined {
  const manifestPath = join(dir, "domain.json")
  if (!existsSync(manifestPath)) return undefined
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as DomainManifest
  if (!manifest.id || !manifest.name || !manifest.description) return undefined

  const skillsDir = join(dir, "skills")
  const skills: DomainSkill[] = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md")))
        .map((e) => ({ name: e.name, dir: join(skillsDir, e.name) }))
    : []

  const promptsDir = join(dir, "prompts")
  const prompts: DomainPrompt[] = existsSync(promptsDir)
    ? readdirSync(promptsDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => ({ name: e.name.replace(/\.md$/, ""), file: join(promptsDir, e.name) }))
    : []

  const contextPath = join(dir, "context.md")
  const profilePath = join(dir, "profile.json")

  return {
    manifest,
    dir,
    contextMd: existsSync(contextPath) ? readFileSync(contextPath, "utf-8") : undefined,
    skills,
    prompts,
    profile: existsSync(profilePath) ? (JSON.parse(readFileSync(profilePath, "utf-8")) as Record<string, unknown>) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Enable/disable state

export interface DomainOwnedLink {
  name: string
  target: string
}

export interface DomainEnableRecord {
  scope: "agent" | "project"
  repoRoot: string
  skills: DomainOwnedLink[]
  prompts: DomainOwnedLink[]
  enabledAt: string
}

export interface DomainsState {
  enabled: Record<string, DomainEnableRecord>
}

export function statePath(dataDir: string): string {
  return join(dataDir, "domains.json")
}

export function loadDomainsState(dataDir: string): DomainsState {
  const file = statePath(dataDir)
  if (!existsSync(file)) return { enabled: {} }
  try {
    const data = JSON.parse(readFileSync(file, "utf-8")) as DomainsState
    return data.enabled ? data : { enabled: {} }
  } catch {
    return { enabled: {} }
  }
}

export function saveDomainsState(state: DomainsState, dataDir: string): void {
  mkdirSync(dataDir, { recursive: true })
  atomicWriteJson(statePath(dataDir), state)
}

export function isDomainEnabled(state: DomainsState, domainId: string): DomainEnableRecord | undefined {
  return state.enabled[domainId]
}

// ---------------------------------------------------------------------------
// Symlink management with ownership checks

function targetsFor(scope: "agent" | "project", agentDir: string, cwd: string): { skills: string; prompts: string } {
  const base = scope === "agent" ? agentDir : join(cwd, ".pi")
  return { skills: join(base, "skills"), prompts: join(base, "prompts") }
}

function isInsidePack(target: string, packRoot: string): boolean {
  if (!isAbsolute(target)) return false
  const rel = relative(packRoot, target)
  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`)
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** Only remove a link when its current target exactly matches our record. */
function isOwnedSymlink(linkPath: string, target: string, packRoot: string): boolean {
  if (!isInsidePack(target, packRoot)) return false
  try {
    const st = lstatSync(linkPath)
    if (!st.isSymbolicLink()) return false
    const currentTarget = resolve(dirname(linkPath), readlinkSync(linkPath))
    return currentTarget === target
  } catch {
    return false
  }
}

function asOwnedLink(value: DomainOwnedLink | string): DomainOwnedLink | undefined {
  if (typeof value === "string" || !value) return undefined
  return typeof value.name === "string" && typeof value.target === "string" ? value : undefined
}

function retainedOwnedLinks(
  values: Array<DomainOwnedLink | string>,
  linksDir: string,
  packRoot: string,
): DomainOwnedLink[] {
  const retained: DomainOwnedLink[] = []
  for (const value of values) {
    const owned = asOwnedLink(value)
    if (owned && isOwnedSymlink(join(linksDir, owned.name), owned.target, packRoot)) {
      retained.push(owned)
    }
  }
  return retained
}

export interface EnableResult {
  ok: boolean
  domain: string
  linked: string[]
  skipped: string[]
  errors: string[]
}

/** Enable a domain: symlink skills + prompts into the chosen scope. */
export function enableDomain(
  domain: Domain,
  opts: { scope: "agent" | "project"; agentDir: string; cwd: string; dataDir: string; state: DomainsState; repoRoot?: string },
): EnableResult {
  const repoRoot = resolve(opts.repoRoot ?? findRepoRoot())
  const packRoot = resolve(repoRoot, "packs", domain.manifest.id)
  const dirs = targetsFor(opts.scope, opts.agentDir, opts.cwd)
  const result: EnableResult = { ok: true, domain: domain.manifest.id, linked: [], skipped: [], errors: [] }
  const previous = opts.state.enabled[domain.manifest.id]
  const ownedSkills = previous?.scope === opts.scope
    ? retainedOwnedLinks(previous.skills as Array<DomainOwnedLink | string>, dirs.skills, packRoot)
    : []
  const ownedPrompts = previous?.scope === opts.scope
    ? retainedOwnedLinks(previous.prompts as Array<DomainOwnedLink | string>, dirs.prompts, packRoot)
    : []

  mkdirSync(dirs.skills, { recursive: true })
  mkdirSync(dirs.prompts, { recursive: true })

  for (const skill of domain.skills) {
    const link = join(dirs.skills, skill.name)
    const target = resolve(skill.dir)
    try {
      if (!isInsidePack(target, packRoot)) {
        result.errors.push(`skills/${skill.name}: target is outside packs/${domain.manifest.id}`)
        continue
      }
      if (pathEntryExists(link)) {
        result.skipped.push(`skills/${skill.name} (already exists)`)
        continue
      }
      symlinkSync(target, link)
      ownedSkills.push({ name: skill.name, target })
      result.linked.push(`skills/${skill.name}`)
    } catch (e) {
      result.errors.push(`skills/${skill.name}: ${(e as Error).message}`)
    }
  }

  for (const prompt of domain.prompts) {
    const link = join(dirs.prompts, basename(prompt.file))
    const target = resolve(prompt.file)
    try {
      if (!isInsidePack(target, packRoot)) {
        result.errors.push(`prompts/${prompt.name}: target is outside packs/${domain.manifest.id}`)
        continue
      }
      if (pathEntryExists(link)) {
        result.skipped.push(`prompts/${prompt.name} (already exists)`)
        continue
      }
      symlinkSync(target, link)
      ownedPrompts.push({ name: basename(prompt.file), target })
      result.linked.push(`prompts/${prompt.name}`)
    } catch (e) {
      result.errors.push(`prompts/${prompt.name}: ${(e as Error).message}`)
    }
  }

  opts.state.enabled[domain.manifest.id] = {
    scope: opts.scope,
    repoRoot,
    skills: ownedSkills,
    prompts: ownedPrompts,
    enabledAt: new Date().toISOString(),
  }
  saveDomainsState(opts.state, opts.dataDir)

  result.ok = result.errors.length === 0
  return result
}

/** Disable a domain: remove only symlinks we own; keep everything else. */
export function disableDomain(
  domainId: string,
  opts: { agentDir: string; cwd: string; dataDir: string; state: DomainsState; repoRoot?: string },
): EnableResult {
  const record = opts.state.enabled[domainId]
  const result: EnableResult = { ok: true, domain: domainId, linked: [], skipped: [], errors: [] }
  if (!record) {
    // Not recorded as enabled by us: nothing to remove.
    result.ok = false
    result.errors.push("not enabled (no ownership record)")
    return result
  }
  const repoRoot = resolve(opts.repoRoot ?? record.repoRoot ?? findRepoRoot())
  const packRoot = resolve(repoRoot, "packs", domainId)
  const dirs = targetsFor(record.scope, opts.agentDir, opts.cwd)

  for (const value of record.skills as Array<DomainOwnedLink | string>) {
    const skill = asOwnedLink(value)
    const name = typeof value === "string" ? value : value.name
    const link = join(dirs.skills, name)
    if (skill && isOwnedSymlink(link, skill.target, packRoot)) {
      try {
        unlinkSync(link)
        result.linked.push(`-skills/${name}`)
      } catch (e) {
        result.errors.push(`skills/${name}: ${(e as Error).message}`)
      }
    } else if (pathEntryExists(link)) {
      result.skipped.push(`skills/${name} (not ours, kept)`)
    }
  }

  for (const value of record.prompts as Array<DomainOwnedLink | string>) {
    const prompt = asOwnedLink(value)
    const name = typeof value === "string" ? value : value.name
    const link = join(dirs.prompts, name)
    if (prompt && isOwnedSymlink(link, prompt.target, packRoot)) {
      try {
        unlinkSync(link)
        result.linked.push(`-prompts/${name.replace(/\.md$/, "")}`)
      } catch (e) {
        result.errors.push(`prompts/${name}: ${(e as Error).message}`)
      }
    } else if (pathEntryExists(link)) {
      result.skipped.push(`prompts/${name} (not ours, kept)`)
    }
  }

  delete opts.state.enabled[domainId]
  saveDomainsState(opts.state, opts.dataDir)
  result.ok = result.errors.length === 0
  return result
}

/**
 * Deal all cards: enable every discovered pack that is not already enabled.
 * Shared by the autopilot screen and the onboarding flow; records and links
 * of packs already enabled are left untouched (no duplicates, no overwrite).
 */
export function enableAllDomains(opts: { agentDir: string; cwd: string; dataDir: string; repoRoot?: string }): EnableResult[] {
  const state = loadDomainsState(opts.dataDir)
  const results: EnableResult[] = []
  for (const domain of discoverDomains(opts.repoRoot)) {
    if (isDomainEnabled(state, domain.manifest.id)) continue
    results.push(
      enableDomain(domain, { scope: "agent", agentDir: opts.agentDir, cwd: opts.cwd, dataDir: opts.dataDir, state, repoRoot: opts.repoRoot }),
    )
  }
  return results
}

/**
 * Context to inject into the system prompt: the concatenated context.md of
 * every enabled domain. Loaded fresh so /reload picks up pack edits.
 */
export function enabledDomainsContext(state: DomainsState, repoRoot = findRepoRoot()): string {
  const domains = discoverDomains(repoRoot)
  const parts: string[] = []
  for (const d of domains) {
    if (!state.enabled[d.manifest.id]) continue
    if (d.contextMd && d.contextMd.trim()) {
      parts.push(`# ${d.manifest.name}\n\n${d.contextMd.trim()}`)
    }
  }
  if (parts.length === 0) return ""
  return [`<domain-packs>`, ...parts, `</domain-packs>`].join("\n\n")
}
