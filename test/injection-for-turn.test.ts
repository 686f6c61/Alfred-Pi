import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { injectionForTurn } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"

// injectionForTurn: the pure per-turn context service. Autopilot mode
// injects at most the one detected pack; manual mode injects every
// enabled pack. RED until the export lands in lib/autopilot.ts.

const REPO = new URL("..", import.meta.url).pathname

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "pi686-inject-"))
  mkdirSync(cwd, { recursive: true })
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

test("injectionForTurn_one_pack_in_autopilot_mode", () => {
  const domains = discoverDomains(REPO)
  const enabled = {
    enabled: {
      security: { scope: "agent", repoRoot: REPO, skills: [], prompts: [], enabledAt: "now" },
      "clean-code": { scope: "agent", repoRoot: REPO, skills: [], prompts: [], enabledAt: "now" },
    },
  }
  const injection = injectionForTurn({
    autopilot: { enabled: true, routing: "context" },
    prompt: "audita la seguridad de este repo y dime vulnerabilidades",
    cwd,
    enabled,
    domains,
  })
  // One pack only: the focused security context, wrapped exactly once.
  expect(injection).toContain("<domain-packs>")
  expect(injection.split("</domain-packs>").length - 1).toBe(1)
  expect(injection).toContain("# Security")
  expect(injection).not.toContain("# Clean Code")
})

test("injectionForTurn_all_packs_in_manual_mode", () => {
  const domains = discoverDomains(REPO)
  const enabled = {
    enabled: {
      security: { scope: "agent", repoRoot: REPO, skills: [], prompts: [], enabledAt: "now" },
      "clean-code": { scope: "agent", repoRoot: REPO, skills: [], prompts: [], enabledAt: "now" },
    },
  }
  const injection = injectionForTurn({
    autopilot: { enabled: false, routing: "context" },
    prompt: "audita la seguridad de este repo",
    cwd,
    enabled,
    domains,
  })
  // Manual mode stacks every enabled pack, not just the detected one.
  expect(injection).toContain("<domain-packs>")
  expect(injection).toContain("# Security")
  expect(injection).toContain("# Clean Code")
})
