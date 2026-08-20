import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { curateTurn } from "../lib/curate-turn.ts"
import { getPaths } from "../lib/config-io.ts"
import { salaStatus } from "../lib/house-copy.ts"

// Line-coverage companion for lib/curate-turn.ts routing "context+thinking":
// a matched domain with a recommended thinking level must patch the turn
// when autopilot runs in that mode (and only when nothing healed before).

const REPO = new URL("..", import.meta.url).pathname

let agentDir: string

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi686-curate-think-"))
})
afterEach(() => {
  rmSync(agentDir, { recursive: true, force: true })
})

test("curateTurn_context_plus_thinking_applies_domain_level", () => {
  const dataDir = join(agentDir, "alfred-pi")
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, "autopilot.json"), JSON.stringify({ enabled: true, routing: "context+thinking" }))

  // The security prompt matches the security pack, whose manifest carries a
  // recommended thinking level.
  const patch = curateTurn({
    paths: getPaths(agentDir),
    repoRoot: REPO,
    prompt: "audita la seguridad de este repo y dime vulnerabilidades",
    systemPrompt: "base",
  })
  expect(patch.domainStatus).toBe(salaStatus("security"))
  expect(patch.domainStatus).not.toContain("dom:")
  expect(patch.thinkingLevel).toBeTruthy()
  expect(patch.systemPrompt ?? "").toContain("# Security")
})
