import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

test("sonarqube_skill_uses_correct_endpoint", () => {
  const skill = readFileSync(
    join(import.meta.dir, "../packs/security/skills/sonarqube-audit/SKILL.md"),
    "utf8",
  )
  // The 404-prone api/user_tokens/login endpoint must not be used; token
  // generation goes through api/user_tokens/generate.
  expect(skill).toContain("api/user_tokens/generate")
  expect(skill).not.toContain("api/user_tokens/login")
})
