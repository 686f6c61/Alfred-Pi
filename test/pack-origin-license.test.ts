import { test, expect } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

// A-DOC-13: every pack SKILL.md and prompt declares origin and license in
// its frontmatter, so provenance and licensing stay explicit per file.
const root = join(import.meta.dir, "..", "packs")

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else if (entry.name === "SKILL.md") out.push(path)
    else if (dir.endsWith("prompts") && entry.name.endsWith(".md")) out.push(path)
  }
  return out
}

function frontmatter(path: string): string {
  const content = readFileSync(path, "utf8")
  const end = content.indexOf("\n---", 4)
  expect(content.startsWith("---\n"), `${path}: missing frontmatter block`).toBe(true)
  expect(end, `${path}: unterminated frontmatter block`).toBeGreaterThan(-1)
  return content.slice(4, end)
}

test("pack_files_declare_origin_and_license", () => {
  const files = walk(root).sort()
  expect(files.length, "expected 53 SKILL.md + 27 prompts under packs/").toBe(80)
  for (const file of files) {
    const fm = frontmatter(file)
    const name = relative(root, file)
    expect(fm, `${name}: missing origin`).toMatch(/^origin: (original|adapted)$/m)
    expect(fm, `${name}: missing license`).toMatch(/^license: [A-Za-z0-9.+-]+$/m)
  }
})

test("wave_one_skill_descriptions_use_trigger_form", () => {
  const packRoots = [join(root, "security"), join(root, "web-fullstack")]
  const files = walk(root)
    .filter((file) => file.endsWith("SKILL.md"))
    .filter((file) => packRoots.some((packRoot) => file.startsWith(packRoot)))
    .sort()

  expect(files.length, "expected 17 skills in security + web-fullstack").toBe(17)
  for (const file of files) {
    const fm = frontmatter(file)
    const name = relative(root, file)
    expect(fm, `${name}: description must include Use when or Use al`).toMatch(
      /^description: .*\bUse (when|al)\b.*$/m,
    )
  }
})

test("wave_three_skill_descriptions_use_trigger_form", () => {
  const packRoots = [join(root, "landing-design"), join(root, "devops-infra")]
  const files = walk(root)
    .filter((file) => file.endsWith("SKILL.md"))
    .filter((file) => packRoots.some((packRoot) => file.startsWith(packRoot)))
    .sort()

  expect(files.length, "expected 12 skills in the two S-SKL-W3 packs").toBe(12)
  for (const file of files) {
    const fm = frontmatter(file)
    const name = relative(root, file)
    expect(fm, `${name}: description must include Use when or Use al`).toMatch(
      /^description: .*\bUse (when|al)\b.*$/m,
    )
  }
})

test("web_profundizar_skill_descriptions_use_trigger_form", () => {
  const names = ["http-service", "app-persistence", "async-jobs", "browser-improve"]
  for (const name of names) {
    const fm = frontmatter(join(root, "web-fullstack", "skills", name, "SKILL.md"))
    expect(fm, `${name}: description must include Use when`).toMatch(/^description: .*\bUse when\b.*$/m)
  }
})

test("wave_three_skill_bodies_reject_dead_packages", () => {
  const dead = ["@realvendex/pi-ci", "@gerdloos/npm-trusts-github-skill"]
  const packRoots = [join(root, "landing-design"), join(root, "devops-infra")]
  const files = walk(root)
    .filter((file) => file.endsWith("SKILL.md"))
    .filter((file) => packRoots.some((packRoot) => file.startsWith(packRoot)))

  for (const file of files) {
    const content = readFileSync(file, "utf8")
    for (const gone of dead) {
      expect(content, `${file}: ${gone} resucitó en la skill`).not.toContain(gone)
    }
  }
})
