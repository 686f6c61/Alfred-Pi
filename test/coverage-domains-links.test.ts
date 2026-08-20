import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, lstatSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { enableDomain, disableDomain, loadDomainsState, type Domain, type DomainsState } from "../lib/domains.ts"

// Line-coverage companions for the ownership-aware link layer of
// lib/domains.ts: symlink failures on read-only target dirs, prompts outside
// the pack, missing ownership records, failing unlinks and links that are
// no longer ours. Everything happens inside a temp pack tree.

let root: string
let agentDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pi686-dom-links-"))
  agentDir = join(root, "agent")
  mkdirSync(join(root, "packs", "p1", "skills", "s1"), { recursive: true })
  mkdirSync(join(root, "packs", "p1", "prompts"), { recursive: true })
  writeFileSync(join(root, "packs", "p1", "skills", "s1", "SKILL.md"), "# s1")
  writeFileSync(join(root, "packs", "p1", "prompts", "a.md"), "# a")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function fakeDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    manifest: { id: "p1", name: "P1", description: "test pack" },
    dir: join(root, "packs", "p1"),
    skills: [{ name: "s1", dir: join(root, "packs", "p1", "skills", "s1") }],
    prompts: [{ name: "a", file: join(root, "packs", "p1", "prompts", "a.md") }],
    profile: undefined,
    ...overrides,
  }
}

function opts(state: DomainsState) {
  return { scope: "agent" as const, agentDir, cwd: root, dataDir: join(agentDir, "data"), state, repoRoot: root }
}

test("enableDomain records a ghost link as not owned (lstat throws)", () => {
  // Previous record points at a skill link that no longer exists: the
  // lstatSync inside isOwnedSymlink throws and the link is simply dropped.
  const state: DomainsState = {
    enabled: {
      p1: {
        scope: "agent",
        repoRoot: root,
        skills: [{ name: "ghost", target: join(root, "packs", "p1", "skills", "ghost") }],
        prompts: [],
        enabledAt: "now",
      },
    },
  }
  const r = enableDomain(fakeDomain(), opts(state))
  expect(r.ok).toBe(true)
  expect(r.linked).toContain("skills/s1")
  expect(r.linked).toContain("prompts/a")
})

test("enableDomain_symlink_failures_and_outside_targets", () => {
  // A prompt file outside the pack root is refused; read-only link
  // directories make symlinkSync throw for skills and prompts alike.
  const skillsDir = join(agentDir, "skills")
  const promptsDir = join(agentDir, "prompts")
  mkdirSync(skillsDir, { recursive: true })
  mkdirSync(promptsDir, { recursive: true })
  chmodSync(skillsDir, 0o555)
  chmodSync(promptsDir, 0o555)
  try {
    const mixed = fakeDomain({
      prompts: [
        { name: "a", file: join(root, "packs", "p1", "prompts", "a.md") },
        { name: "evil", file: "/etc/passwd.md" },
      ],
    })
    const r = enableDomain(mixed, opts({ enabled: {} }))
    expect(r.errors.some((e) => e.startsWith("skills/s1:"))).toBe(true)
    // The legit prompt hit the read-only directory (symlink failure) and
    // the outside one was refused before any symlink attempt.
    expect(r.errors.some((e) => e.startsWith("prompts/a:"))).toBe(true)
    expect(r.errors.some((e) => e.startsWith("prompts/evil: target is outside"))).toBe(true)
    expect(r.ok).toBe(false)
  } finally {
    chmodSync(skillsDir, 0o755)
    chmodSync(promptsDir, 0o755)
  }
})

test("disableDomain without an ownership record refuses", () => {
  const r = disableDomain("p1", opts({ enabled: {} }))
  expect(r.ok).toBe(false)
  expect(r.errors).toContain("not enabled (no ownership record)")
})

test("disableDomain keeps foreign prompt links and reports failing unlinks", () => {
  // Owned links are created for real, then the link directories go
  // read-only so unlinkSync fails; a foreign regular file at the prompt
  // link path must be kept with a "not ours" skip.
  const state: DomainsState = { enabled: {} }
  const enable = enableDomain(fakeDomain(), opts(state))
  expect(enable.ok).toBe(true)

  const skillsDir = join(agentDir, "skills")
  const promptsDir = join(agentDir, "prompts")
  // Replace the owned prompt link with a foreign regular file.
  rmSync(join(promptsDir, "a.md"))
  writeFileSync(join(promptsDir, "a.md"), "user file")

  chmodSync(skillsDir, 0o555)
  chmodSync(promptsDir, 0o555)
  try {
    const r = disableDomain("p1", opts(loadDomainsState(join(agentDir, "data"))))
    expect(r.errors.some((e) => e.startsWith("skills/s1:"))).toBe(true)
    expect(r.skipped).toContain("prompts/a.md (not ours, kept)")
    expect(r.ok).toBe(false)
    expect(statSync(join(promptsDir, "a.md")).isFile()).toBe(true)
  } finally {
    chmodSync(skillsDir, 0o755)
    chmodSync(promptsDir, 0o755)
  }
})

test("disableDomain_unlink_of_prompts_can_fail_too", () => {
  const state: DomainsState = { enabled: {} }
  enableDomain(fakeDomain(), opts(state))
  // Only the prompts directory is locked: the skill unlink succeeds while
  // the prompt unlink fails, isolating the prompts catch branch.
  const promptsDir = join(agentDir, "prompts")
  chmodSync(promptsDir, 0o555)
  try {
    const r = disableDomain("p1", opts(loadDomainsState(join(agentDir, "data"))))
    expect(r.linked).toEqual(["-skills/s1"])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]!.startsWith("prompts/a.md:")).toBe(true)
    expect(r.ok).toBe(false)
  } finally {
    chmodSync(promptsDir, 0o755)
  }
})

test("owned prompt symlink roundtrip is clean", () => {
  const state: DomainsState = { enabled: {} }
  enableDomain(fakeDomain(), opts(state))
  const before = lstatSync(join(agentDir, "prompts", "a.md"))
  expect(before.isSymbolicLink()).toBe(true)
  const r = disableDomain("p1", opts(loadDomainsState(join(agentDir, "data"))))
  expect(r.ok).toBe(true)
  expect(r.linked).toEqual(["-skills/s1", "-prompts/a"])
})

test("symlinkSync_direct_call_keeps_the_fixture_honest", () => {
  // Sanity for the harness itself: a symlink to the pack target resolves
  // exactly to it, which is what the ownership check compares.
  const target = join(root, "packs", "p1", "skills", "s1")
  const link = join(root, "alias")
  symlinkSync(target, link)
  expect(lstatSync(link).isSymbolicLink()).toBe(true)
  expect(statSync(link).isDirectory()).toBe(true)
})
