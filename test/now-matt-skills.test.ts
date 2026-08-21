import { test, expect } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { detectDomain } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"

const REPO = new URL("..", import.meta.url).pathname
const PACKS = join(REPO, "packs")

function walkPackFiles(): { skills: string[]; prompts: string[] } {
  const skills: string[] = []
  const prompts: string[] = []
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name === "SKILL.md") skills.push(path)
      else if (dir.endsWith("prompts") && entry.name.endsWith(".md")) prompts.push(path)
    }
  }
  visit(PACKS)
  return { skills, prompts }
}

function read(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8")
}

test("now_matt_tree_has_bug_repro_loop_and_implement_prompt", () => {
  const { skills, prompts } = walkPackFiles()
  expect(skills.length, "53 SKILL.md after bug-repro-loop").toBe(53)
  expect(prompts.length, "27 prompts after /implement").toBe(27)
  expect(skills.some((p) => p.endsWith("/bug-repro-loop/SKILL.md"))).toBe(true)
  expect(prompts.some((p) => p.endsWith("/ai-agents/prompts/implement.md"))).toBe(true)
})

test("now_matt_radar_routes_diagnosis_and_ticket_graph", () => {
  const domains = discoverDomains(REPO)
  expect(detectDomain("este bug no se reproduce, hay que diagnosticar la causa", domains)?.domain.manifest.id).toBe(
    "qa-testing",
  )
  expect(detectDomain("reproduce the bug and find the root cause", domains)?.domain.manifest.id).toBe("qa-testing")
  expect(detectDomain("el test falla a veces en CI", domains)?.domain.manifest.id).toBe("qa-testing")
  expect(detectDomain("el servicio da 502 en producción", domains)?.domain.manifest.id).toBe("devops-infra")
  expect(
    detectDomain("implementa este grafo de tickets con agentes en worktrees", domains)?.domain.manifest.id,
  ).toBe("ai-agents")
  expect(detectDomain("revisa este PR", domains)?.domain.manifest.id).toBe("clean-code")
  expect(detectDomain("cuanto presupuesto queda hoy", domains)?.domain.manifest.id ?? "none").not.toBe("ai-agents")
})

test("now_matt_bug_repro_loop_meets_cold_bar", () => {
  const text = read("packs/qa-testing/skills/bug-repro-loop/SKILL.md")
  expect(text).toMatch(/^origin: adapted$/m)
  expect(text).toMatch(/^license: MIT$/m)
  expect(text).toMatch(/^description: .*\bUse when\b.*$/m)
  expect(text).toMatch(/^## /m)
  expect(text).toMatch(/incident-triage/)
  expect(text).toMatch(/flaky-hunting/)
  expect(text.toLowerCase()).toMatch(/anti-pattern/)
  expect(text).not.toContain("\u2014")
})

test("now_matt_implement_prompt_and_dag_row", () => {
  const prompt = read("packs/ai-agents/prompts/implement.md")
  expect(prompt).toMatch(/^origin: adapted$/m)
  expect(prompt).toMatch(/^argument-hint:/m)
  expect(prompt).toContain("/stack")
  expect(prompt).toContain("/usage")
  const orch = read("packs/ai-agents/skills/agent-orchestration/SKILL.md")
  expect(orch).toMatch(/\bDAG\b/)
  expect(orch.toLowerCase()).toMatch(/frontier/)
})

test("now_matt_pr_review_has_spec_axis", () => {
  const text = read("packs/clean-code/skills/pr-review-checklist/SKILL.md")
  expect(text).toMatch(/\bSpec\b/)
  expect(text.toLowerCase()).toMatch(/scope creep|fidelity to the request/)
})
