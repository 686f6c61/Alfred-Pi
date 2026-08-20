import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A-PCK-11: the RAE pack must not teach incorrect Spanish.
const files = [
  "packs/escritura-es/skills/traduccion-en-es/SKILL.md",
  "packs/escritura-es/skills/rae-normas/SKILL.md",
  "docs/dominios.md",
]

const forbidden = ["libreria", "manana", "boton", "en sito"]

test("rae_skills_do_not_contain_forbidden_strings", () => {
  for (const file of files) {
    const content = readFileSync(join(import.meta.dir, "..", file), "utf8")
    for (const word of forbidden) {
      expect(content, `${file}: forbidden string "${word}"`).not.toContain(word)
    }
  }
})
