/**
 * Model profiles: named stacks with an ordered preference chain. The first
 * step that resolves to an available model wins when applying.
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { stringifyJson, atomicWriteJson, getPaths, readJsonFile, type FilePaths, type LoadedFile } from "./config-io.ts"

export interface ProfileStep {
  provider: string
  model: string
  thinkingLevel?: string
}

export interface Profile {
  name: string
  description?: string
  chain: ProfileStep[]
}

export interface ProfilesFile {
  profiles: Profile[]
}

function profilesPath(paths: FilePaths): string {
  return join(paths.dataDir, "profiles.json")
}

function readProfilesFile(paths: FilePaths): LoadedFile<ProfilesFile> {
  const loaded = readJsonFile<ProfilesFile>(profilesPath(paths), { profiles: [] })
  if (loaded.error) return { ...loaded, error: "invalid JSON" }
  if (
    loaded.existed &&
    (loaded.data === null || typeof loaded.data !== "object" || !Array.isArray(loaded.data.profiles))
  ) {
    return { ...loaded, error: "invalid profiles.json: profiles must be an array" }
  }
  return loaded
}

export function loadProfiles(paths: FilePaths = getPaths()): ProfilesFile {
  const loaded = readProfilesFile(paths)
  if (loaded.error) throw new Error(`profiles.json: ${loaded.error}`)
  return loaded.data
}

export function saveProfiles(file: ProfilesFile, paths: FilePaths = getPaths()): void {
  const loaded = readProfilesFile(paths)
  if (loaded.existed && loaded.error) throw new Error(`profiles.json: ${loaded.error}`)
  mkdirSync(paths.dataDir, { recursive: true })
  atomicWriteJson(profilesPath(paths), file)
}

export function upsertProfile(file: ProfilesFile, profile: Profile): ProfilesFile {
  const next = file.profiles.filter((p) => p.name !== profile.name)
  next.push(profile)
  next.sort((a, b) => a.name.localeCompare(b.name))
  return { profiles: next }
}

export function deleteProfile(file: ProfilesFile, name: string): ProfilesFile {
  return { profiles: file.profiles.filter((p) => p.name !== name) }
}

/**
 * Pick the first chain step that resolves. `resolve` is injected so this
 * stays testable without pi (in the extension it calls modelRegistry.find +
 * hasConfiguredAuth).
 */
export function pickStep(
  profile: Profile,
  resolve: (step: ProfileStep) => { ok: true } | { ok: false; reason: string },
): { step: ProfileStep } | { error: string } {
  const failures: string[] = []
  for (const step of profile.chain) {
    const r = resolve(step)
    if (r.ok) return { step }
    failures.push(`${step.provider}/${step.model}: ${r.reason}`)
  }
  return { error: failures.length > 0 ? failures.join("; ") : "empty chain" }
}

/** Export/import helpers (shareable as JSON). */
export function exportProfiles(file: ProfilesFile): string {
  return stringifyJson(file)
}
