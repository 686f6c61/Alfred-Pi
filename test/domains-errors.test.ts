import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  discoverDomains,
  loadDomain,
  loadDomainsState,
  enabledDomainsContext,
  type DomainsState,
} from "../lib/domains.ts"

// Characterization tests for A-TST-04: malformed packs are silently skipped
// by discoverDomains today. The follow-up API discoverDomainsReport will
// surface them in an errors list without changing discoverDomains itself.

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pi686-domerr-"))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writePack(id: string, manifest: unknown): void {
  mkdirSync(join(root, "packs", id), { recursive: true })
  const body = typeof manifest === "string" ? manifest : JSON.stringify(manifest)
  writeFileSync(join(root, "packs", id, "domain.json"), body)
}

test("loadDomain_skips_invalid_json", () => {
  writePack("bad", '{ a medias')
  const ids = discoverDomains(root).map((d) => d.manifest.id)
  expect(ids).not.toContain("bad")
})

test("loadDomain_skips_no_description", () => {
  writePack("nodesc", { id: "nodesc", name: "No description" })
  expect(loadDomain(join(root, "packs", "nodesc"))).toBeUndefined()
  expect(discoverDomains(root).map((d) => d.manifest.id)).not.toContain("nodesc")
})

test("discoverDomains_skips_skill_without_SKILL_md", () => {
  writePack("sk", { id: "sk", name: "Sk", description: "skills pack" })
  mkdirSync(join(root, "packs", "sk", "skills", "withmd"), { recursive: true })
  writeFileSync(join(root, "packs", "sk", "skills", "withmd", "SKILL.md"), "# withmd")
  mkdirSync(join(root, "packs", "sk", "skills", "nomd"), { recursive: true })
  const domain = discoverDomains(root).find((d) => d.manifest.id === "sk")
  expect(domain?.skills.map((s) => s.name)).toEqual(["withmd"])
})

test("loadDomainsState_resets_corrupt", () => {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, "domains.json"), '{"enabled": { "x": ')
  expect(loadDomainsState(root)).toEqual({ enabled: {} })
})

test("enabledDomainsContext_empty_context", () => {
  writePack("blank", { id: "blank", name: "Blank", description: "empty context pack" })
  writeFileSync(join(root, "packs", "blank", "context.md"), "   \n\t\n")
  const state = {
    enabled: {
      blank: { scope: "agent", repoRoot: root, skills: [], prompts: [], enabledAt: "now" },
    },
  } as DomainsState
  expect(enabledDomainsContext(state, root)).toBe("")
})

test("discoverDomains_returns_errors", async () => {
  writePack("good", { id: "good", name: "Good", description: "valid pack" })
  writePack("broken", '{ a medias')
  // Dynamic import: the module does not export discoverDomainsReport yet,
  // and only this test (not the characterization ones above) may go red.
  const mod = (await import("../lib/domains.ts")) as unknown as Record<string, unknown>
  const report = mod["discoverDomainsReport"] as
    | ((repoRoot: string) => { domains: unknown[]; errors: { pack: string; error: string }[] })
    | undefined
  expect(typeof report).toBe("function")
  const r = report!(root)
  expect(r.domains.map((d) => (d as { manifest: { id: string } }).manifest.id)).toEqual(["good"])
  expect(r.errors.length).toBe(1)
  expect(r.errors[0]!.pack).toContain("broken")
  expect(r.errors[0]!.error.length).toBeGreaterThan(0)
})
