import { test, expect } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const packsDir = join(import.meta.dir, "../packs")

function allSkillFiles(): string[] {
  const files: string[] = []
  for (const pack of readdirSync(packsDir)) {
    const skillsDir = join(packsDir, pack, "skills")
    let skillNames: string[] = []
    try {
      skillNames = readdirSync(skillsDir)
    } catch {
      continue
    }
    for (const name of skillNames) {
      const file = join(skillsDir, name, "SKILL.md")
      try {
        readFileSync(file)
        files.push(file)
      } catch {
        // not a skill directory
      }
    }
  }
  return files
}

test("all_skills_have_clean_templates", () => {
  const files = allSkillFiles()
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const content = readFileSync(file, "utf8")

    // Complete frontmatter: opening fence, closing fence, non-empty description.
    const fm = content.match(/^---\n([\s\S]*?)\n---\n/)
    expect(fm, `${file}: missing or unterminated frontmatter`).not.toBeNull()
    expect(
      fm![1].match(/^description:\s*\S/m),
      `${file}: frontmatter without description`,
    ).not.toBeNull()

    // No leftover template arguments or unfilled placeholders.
    expect(content, `${file}: literal $1; template residue`).not.toContain("$1;")
    expect(
      /(?<![\w-])--(?![\w-])/.test(content),
      `${file}: standalone -- placeholder`,
    ).toBe(false)

    // No bullets fused onto the end of the previous sentence (same line).
    expect(
      /\S\.[ \t]+-[ \t]+\S/.test(content),
      `${file}: fused bullet`,
    ).toBe(false)
  }

  // The design-systems frontmatter must name every system of its catalog.
  const designSystems = readFileSync(
    join(packsDir, "landing-design/skills/design-systems/SKILL.md"),
    "utf8",
  )
  const frontmatter = designSystems.match(/^---\n([\s\S]*?)\n---\n/)![1]
  expect(frontmatter).toContain("Mantine")
})
