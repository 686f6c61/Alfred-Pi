import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkConfigs, formatDoctorReport } from "../lib/doctor.ts"
import { pickStep, upsertProfile, deleteProfile, loadProfiles, saveProfiles } from "../lib/profiles.ts"
import { getPaths } from "../lib/config-io.ts"

test("checkConfigs flags trailing slash, missing api, bad default model", () => {
  const issues = checkConfigs({
    models: {
      providers: {
        sloppy: { baseUrl: "https://sloppy.example/v1/", models: [{ id: "m1" }] },
        noapi: { baseUrl: "https://noapi.example/v1", apiKey: "k" },
      },
    },
    auth: {},
    settings: { defaultProvider: "sloppy", defaultModel: "missing-model" },
    env: {},
  })

  const msgs = issues.map((i) => i.message).join(" | ")
  expect(msgs).toContain("baseUrl ends with '/'")
  expect(msgs).toContain("no `api` type")
  expect(msgs).toContain('defaultModel "missing-model" is not in models.json')
})

test("checkConfigs flags missing $ENV and unset !command keys", () => {
  const issues = checkConfigs({
    models: {
      providers: {
        envkey: { baseUrl: "https://e.example/v1", api: "openai-completions", apiKey: "$NOPE_NOT_SET_VAR" },
      },
    },
    auth: {},
    settings: {},
    env: {},
  })
  expect(issues.some((i) => i.message.includes("NOPE_NOT_SET_VAR"))).toBe(true)
})

test("checkConfigs clean config produces no issues", () => {
  const issues = checkConfigs({
    models: {
      providers: {
        good: { baseUrl: "https://good.example/v1", api: "openai-completions", apiKey: "k", models: [{ id: "m1", contextWindow: 128000 }] },
      },
    },
    auth: {},
    settings: { defaultProvider: "good", defaultModel: "m1" },
    env: {},
  })
  expect(issues).toHaveLength(0)
})

test("formatDoctorReport renders sections", () => {
  const text = formatDoctorReport({
    issues: [{ severity: "error", provider: "x", message: "boom" }],
    liveness: [{ provider: "x", ok: true, latencyMs: 42, models: ["a", "b"] }],
    checkedAt: "2026-08-15T00:00:00Z",
  }).join("\n")
  expect(text).toContain("1 errors")
  expect(text).toContain("[x] boom")
  expect(text).toContain("✓ x: 42ms (2 models)")
})

test("pickStep tries the chain in order", () => {
  const profile = { name: "p", chain: [{ provider: "a", model: "1" }, { provider: "b", model: "2" }] }
  const first = pickStep(profile, (s) => (s.provider === "a" ? { ok: false, reason: "no key" } : { ok: true }))
  expect("step" in first && first.step.provider).toBe("b")
  const none = pickStep(profile, () => ({ ok: false, reason: "down" }))
  expect("error" in none && none.error).toContain("down")
})

test("profile upsert and delete", () => {
  let file = { profiles: [] as { name: string; chain: { provider: string; model: string }[] }[] }
  file = upsertProfile(file, { name: "work", chain: [{ provider: "p", model: "m" }] })
  file = upsertProfile(file, { name: "work", chain: [{ provider: "p2", model: "m2" }] })
  expect(file.profiles).toHaveLength(1)
  expect(file.profiles[0]!.chain[0]!.provider).toBe("p2")
  file = deleteProfile(file, "work")
  expect(file.profiles).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Corrupt profiles.json must surface as an error, never as an empty list,
// and must never be overwritten by a save. Temp dirs only.
// ---------------------------------------------------------------------------

// Truncated JSON with a recognizable sentinel tail; also the exact bytes a
// failed save must leave untouched.
const CORRUPT = `{"profiles": [{"name": "SENTINEL-corrupt-0123456789`
const PROFILES_AS_OBJECT = `{"profiles": {"0": {"name": "SENTINEL-not-an-array"}}}`

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-profiles-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function seedProfilesFile(raw: string): ReturnType<typeof getPaths> {
  const paths = getPaths(dir)
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(join(paths.dataDir, "profiles.json"), raw)
  return paths
}

test("loadProfiles_propagates_corrupt_error", () => {
  const paths = seedProfilesFile(CORRUPT)
  expect(() => loadProfiles(paths)).toThrow(/invalid JSON/i)
  // Reading must never mutate the file.
  expect(readFileSync(join(paths.dataDir, "profiles.json"), "utf-8")).toBe(CORRUPT)
})

test("saveProfiles_does_not_overwrite_corrupt", () => {
  const paths = seedProfilesFile(CORRUPT)
  expect(() => saveProfiles({ profiles: [{ name: "fresh", chain: [{ provider: "p", model: "m" }] }] }, paths)).toThrow(/invalid JSON/i)
  // Bytes untouched and no temp file left behind.
  expect(readFileSync(join(paths.dataDir, "profiles.json"), "utf-8")).toBe(CORRUPT)
  expect(readdirSync(paths.dataDir).filter((f) => f.includes(".tmp-"))).toEqual([])
})

test("loadProfiles_rejects_profiles_not_array", () => {
  const paths = seedProfilesFile(PROFILES_AS_OBJECT)
  expect(() => loadProfiles(paths)).toThrow()
  expect(() => saveProfiles({ profiles: [] }, paths)).toThrow()
  expect(readFileSync(join(paths.dataDir, "profiles.json"), "utf-8")).toBe(PROFILES_AS_OBJECT)
})
