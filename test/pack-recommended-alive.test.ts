import { test, expect } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// S-REC-02: los seis recomendados retirados por muertos en N-PCK-01 no pueden
// reaparecer en ningún pack, y los añadidos de P-24 (plannotator en
// clean-code, pi-memory en ai-agents) deben estar donde el contrato manda.
const root = join(import.meta.dir, "..", "packs")

const dead = [
  "@realvendex/pi-ci",
  "@gerdloos/npm-trusts-github-skill",
  "@artale/pi-doc",
  "@wdalhaj/pi-astro-mcp",
  "pi-sonar",
  "@testzugang/pi-dependency-audit",
]

// Memorias descartadas por el contrato de P-24: solo pi-memory entra.
const rejectedMemory = ["pi-hermes-memory", "@remnic/plugin-pi"]

function packPackages(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifest = join(root, entry.name, "domain.json")
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
      packages?: unknown
    }
    out.set(entry.name, Array.isArray(parsed.packages) ? parsed.packages.map(String) : [])
  }
  return out
}

function skillFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...skillFiles(path))
    else if (entry.name === "SKILL.md") files.push(path)
  }
  return files
}

test("dead_recommended_packages_stay_gone", () => {
  const packs = packPackages()
  expect(packs.size, "expected the 11 packs under packs/").toBe(11)
  for (const [pack, packages] of packs) {
    for (const gone of dead) {
      expect(packages, `${pack}: ${gone} resucitó en packages`).not.toContain(gone)
    }
  }
})

test("wave_one_skill_bodies_reject_dead_packages", () => {
  const files = ["security", "web-fullstack"]
    .flatMap((pack) => skillFiles(join(root, pack, "skills")))
    .sort()

  expect(files.length, "expected 17 skills in security + web-fullstack").toBe(17)
  for (const file of files) {
    const content = readFileSync(file, "utf8")
    for (const gone of dead) {
      expect(content, `${file}: ${gone} resucitó en el cuerpo de la skill`).not.toContain(gone)
    }
  }
})

test("rejected_memory_packages_stay_out", () => {
  for (const [pack, packages] of packPackages()) {
    for (const rejected of rejectedMemory) {
      expect(packages, `${pack}: ${rejected} no debe entrar`).not.toContain(rejected)
    }
  }
})

test("plannotator_is_recommended_by_clean_code", () => {
  const packs = packPackages()
  expect(packs.get("clean-code") ?? []).toContain("@plannotator/pi-extension")
})

test("pi_memory_is_recommended_by_ai_agents", () => {
  const packs = packPackages()
  expect(packs.get("ai-agents") ?? []).toContain("pi-memory")
})
