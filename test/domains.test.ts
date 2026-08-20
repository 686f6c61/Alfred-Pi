import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, symlinkSync, lstatSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { discoverDomains, enableDomain, disableDomain, enableAllDomains, loadDomainsState, enabledDomainsContext } from "../lib/domains.ts"

let root: string
let agentDir: string
let dataDir: string

function fixturePack(): void {
  const dir = join(root, "packs", "demo")
  mkdirSync(join(dir, "skills", "demo-skill"), { recursive: true })
  writeFileSync(
    join(dir, "skills", "demo-skill", "SKILL.md"),
    "---\ndescription: A demo skill for testing\n---\n# Demo\n",
  )
  mkdirSync(join(dir, "prompts"), { recursive: true })
  writeFileSync(join(dir, "prompts", "demo-prompt.md"), "---\nname: demo-prompt\ndescription: test\n---\nbody\n")
  writeFileSync(join(dir, "context.md"), "You are testing domains.")
  writeFileSync(
    join(dir, "domain.json"),
    JSON.stringify({ id: "demo", name: "Demo", description: "test pack" }),
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pi686-dom-"))
  agentDir = join(root, "agent")
  dataDir = join(agentDir, "alfred-pi")
  mkdirSync(agentDir, { recursive: true })
  fixturePack()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test("discoverDomains finds packs with valid manifests", () => {
  const domains = discoverDomains(root)
  expect(domains).toHaveLength(1)
  expect(domains[0]!.manifest.id).toBe("demo")
  expect(domains[0]!.skills.map((s) => s.name)).toEqual(["demo-skill"])
  expect(domains[0]!.prompts.map((p) => p.name)).toEqual(["demo-prompt"])
})

test("enable links skills+prompts (agent scope) and records ownership", () => {
  const state = loadDomainsState(dataDir)
  const domain = discoverDomains(root)[0]!
  const r = enableDomain(domain, { scope: "agent", agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root })
  expect(r.ok).toBe(true)
  expect(existsSync(join(agentDir, "skills", "demo-skill"))).toBe(true)
  expect(existsSync(join(agentDir, "prompts", "demo-prompt.md"))).toBe(true)
  expect(loadDomainsState(dataDir).enabled.demo.scope).toBe("agent")
})

test("enableDomain_reenable_keeps_owned_links", () => {
  const state = loadDomainsState(dataDir)
  const domain = discoverDomains(root)[0]!
  const opts = { scope: "agent" as const, agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root }

  expect(enableDomain(domain, opts).ok).toBe(true)
  expect(enableDomain(domain, opts).ok).toBe(true)
  expect(disableDomain("demo", { agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root }).ok).toBe(true)

  expect(existsSync(join(agentDir, "skills", "demo-skill"))).toBe(false)
  expect(existsSync(join(agentDir, "prompts", "demo-prompt.md"))).toBe(false)
  expect(loadDomainsState(dataDir).enabled.demo).toBeUndefined()
})

test("disable removes only owned symlinks; foreign files are kept", () => {
  const state = loadDomainsState(dataDir)
  const domain = discoverDomains(root)[0]!
  enableDomain(domain, { scope: "agent", agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root })

  // Simulate a user-created (non-symlink) skill with the same name pattern.
  mkdirSync(join(agentDir, "skills", "user-skill"), { recursive: true })
  writeFileSync(join(agentDir, "skills", "user-skill", "SKILL.md"), "---\ndescription: user\n---\n")
  // Overwrite our skill link with a user symlink pointing OUTSIDE the repo.
  rmSync(join(agentDir, "skills", "demo-skill"), { recursive: true })
  symlinkSync(join(tmpdir(), "foreign-place"), join(agentDir, "skills", "demo-skill"))

  const r = disableDomain("demo", { agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root })
  // our prompt link is removed
  expect(existsSync(join(agentDir, "prompts", "demo-prompt.md"))).toBe(false)
  // the foreign symlink is NOT removed (broken link target - check the link itself)
  expect(lstatSync(join(agentDir, "skills", "demo-skill")).isSymbolicLink()).toBe(true)
  // state cleared
  expect(loadDomainsState(dataDir).enabled.demo).toBeUndefined()
})

test("enabledDomainsContext injects context only when enabled", () => {
  const state = loadDomainsState(dataDir)
  expect(enabledDomainsContext(state, root)).toBe("")
  state.enabled.demo = { scope: "agent", repoRoot: root, skills: [], prompts: [], enabledAt: "now" }
  const ctx = enabledDomainsContext(state, root)
  expect(ctx).toContain("You are testing domains.")
  expect(ctx).toContain("<domain-packs>")
})

test("packs without manifest are skipped", () => {
  mkdirSync(join(root, "packs", "broken"), { recursive: true })
  expect(discoverDomains(root).map((d) => d.manifest.id)).toEqual(["demo"])
})

test("enableDomain_does_not_claim_foreign_links", () => {
  // A destination inside repoRoot but outside packs/demo, plus a pre-existing
  // link to it at the skill name: not ours, so enable must skip it and the
  // ownership record must not claim that name.
  const foreignDest = join(root, "foreign-dest")
  mkdirSync(foreignDest, { recursive: true })
  writeFileSync(join(foreignDest, "SKILL.md"), "---\ndescription: user-owned\n---\n")
  mkdirSync(join(agentDir, "skills"), { recursive: true })
  symlinkSync(foreignDest, join(agentDir, "skills", "demo-skill"))

  const state = loadDomainsState(dataDir)
  const domain = discoverDomains(root)[0]!
  const r = enableDomain(domain, { scope: "agent", agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root })

  expect(r.ok).toBe(true)
  expect(r.skipped.some((s) => s.includes("demo-skill"))).toBe(true)
  expect(loadDomainsState(dataDir).enabled.demo!.skills.map((s) => s.name)).not.toContain("demo-skill")

  // And disable must leave the foreign link exactly where it was.
  const r2 = disableDomain("demo", { agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root })
  expect(r2.ok).toBe(true)
  expect(lstatSync(join(agentDir, "skills", "demo-skill")).isSymbolicLink()).toBe(true)
})

test("disableDomain_preserves_foreign_links", () => {
  const state = loadDomainsState(dataDir)
  const domain = discoverDomains(root)[0]!
  enableDomain(domain, { scope: "agent", agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root })

  // Retarget one created link to a different destination inside repoRoot:
  // still "inside repoRoot", but no longer the link we made.
  const otherDest = join(root, "elsewhere")
  mkdirSync(otherDest, { recursive: true })
  writeFileSync(join(otherDest, "SKILL.md"), "---\ndescription: moved\n---\n")
  rmSync(join(agentDir, "skills", "demo-skill"), { recursive: true })
  symlinkSync(otherDest, join(agentDir, "skills", "demo-skill"))

  const r = disableDomain("demo", { agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root })
  expect(r.ok).toBe(true)
  // The retargeted link survives; the untouched prompt link is cleaned up.
  expect(lstatSync(join(agentDir, "skills", "demo-skill")).isSymbolicLink()).toBe(true)
  expect(existsSync(join(agentDir, "prompts", "demo-prompt.md"))).toBe(false)
  expect(loadDomainsState(dataDir).enabled.demo).toBeUndefined()
})

test("enableAllDomains_respects_already_enabled", () => {
  // A second pack so the deal has something to add beyond the enabled one.
  const dir = join(root, "packs", "otro")
  mkdirSync(join(dir, "skills", "otro-skill"), { recursive: true })
  writeFileSync(join(dir, "skills", "otro-skill", "SKILL.md"), "---\ndescription: otro\n---\n# Otro\n")
  writeFileSync(join(dir, "domain.json"), JSON.stringify({ id: "otro", name: "Otro", description: "test pack" }))

  // demo is already enabled; its record must survive the deal untouched.
  const state = loadDomainsState(dataDir)
  enableDomain(discoverDomains(root).find((d) => d.manifest.id === "demo")!, {
    scope: "agent", agentDir, cwd: join(root, "proj"), dataDir, state, repoRoot: root,
  })
  const before = loadDomainsState(dataDir).enabled.demo!

  const results = enableAllDomains({ agentDir, cwd: join(root, "proj"), dataDir, repoRoot: root })
  // Only the not-yet-enabled pack is dealt.
  expect(results.map((r) => r.domain)).toEqual(["otro"])

  const after = loadDomainsState(dataDir)
  expect(Object.keys(after.enabled).sort()).toEqual(["demo", "otro"])
  expect(after.enabled.demo).toEqual(before)

  // Dealing again adds nothing and keeps every record as it was.
  expect(enableAllDomains({ agentDir, cwd: join(root, "proj"), dataDir, repoRoot: root })).toHaveLength(0)
  expect(loadDomainsState(dataDir).enabled.demo).toEqual(before)
})

test("enableAllDomains_accumulates_errors", () => {
  // A pack whose folder name does not match manifest.id has its skill
  // target outside packs/<id>, so enableDomain records an error. The
  // deal must still enable the healthy pack instead of aborting.
  const badDir = join(root, "packs", "mismatch")
  mkdirSync(join(badDir, "skills", "mismatch-skill"), { recursive: true })
  writeFileSync(join(badDir, "skills", "mismatch-skill", "SKILL.md"), "---\ndescription: mismatch\n---\n# Mismatch\n")
  writeFileSync(join(badDir, "domain.json"), JSON.stringify({ id: "other-id", name: "Mismatch", description: "id does not match folder" }))

  const okDir = join(root, "packs", "okpack")
  mkdirSync(join(okDir, "skills", "ok-skill"), { recursive: true })
  writeFileSync(join(okDir, "skills", "ok-skill", "SKILL.md"), "---\ndescription: ok\n---\n# Ok\n")
  writeFileSync(join(okDir, "domain.json"), JSON.stringify({ id: "okpack", name: "Okpack", description: "healthy pack" }))

  const results = enableAllDomains({ agentDir, cwd: join(root, "proj"), dataDir, repoRoot: root })
  const byDomain = Object.fromEntries(results.map((r) => [r.domain, r]))
  expect(byDomain["other-id"]?.ok).toBe(false)
  expect(byDomain["other-id"]?.errors.length).toBeGreaterThan(0)
  expect(byDomain.okpack?.ok).toBe(true)
  expect(loadDomainsState(dataDir).enabled.okpack).toBeDefined()
})
