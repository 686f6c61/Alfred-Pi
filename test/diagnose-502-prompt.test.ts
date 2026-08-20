import { test, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

test("diagnose502_prompt_requires_approval_gate", () => {
  const prompt = readFileSync(
    join(import.meta.dir, "../packs/devops-infra/prompts/diagnose-502.md"),
    "utf8",
  )
  // Same gate as ci.md: the fix must be presented first and applied only
  // after approval, never silently.
  expect(prompt).toMatch(/present[\s\S]*apply only what (i|you) approve/i)
})
