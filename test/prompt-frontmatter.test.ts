import { test, expect } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// Characterization test for A-PCK-05: pi expects the frontmatter key
// "argument-hint", but prompts carry camelCase "argumentHint" copies, and
// prompts interpolating "$@" must declare a hint. Only the pack prompt
// files should change, never this allowlist.

const REPO = new URL("..", import.meta.url).pathname
const ALLOWED = ["name", "description", "argument-hint", "origin", "license"] as const

const packsRoot = join(REPO, "packs")
const prompts: { path: string; frontmatter: string; body: string }[] = []
for (const pack of readdirSync(packsRoot)) {
  const dir = join(packsRoot, pack, "prompts")
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    continue
  }
  for (const f of files.filter((f) => f.endsWith(".md"))) {
    const raw = readFileSync(join(dir, f), "utf8")
    const end = raw.indexOf("---", 3)
    const frontmatter = end === -1 ? "" : raw.slice(3, end)
    prompts.push({ path: `${pack}/prompts/${f}`, frontmatter, body: raw.slice(end + 3) })
  }
}

test("all_prompts_use_valid_frontmatter_keys", () => {
  expect(prompts.length).toBe(26)

  const invalid: string[] = []
  const missingHint: string[] = []
  for (const p of prompts) {
    const keys = p.frontmatter
      .split("\n")
      .map((l) => l.split(":")[0]!.trim())
      .filter((k) => k.length > 0)
    for (const key of keys) {
      if (!ALLOWED.includes(key as (typeof ALLOWED)[number])) {
        invalid.push(`${p.path}: ${key}`)
      }
    }
    if (keys.includes("argumentHint")) {
      invalid.push(`${p.path}: argumentHint (expected argument-hint)`)
    }
    if (p.body.includes("$@") && !keys.includes("argument-hint")) {
      missingHint.push(p.path)
    }
  }
  expect(invalid).toEqual([])
  expect(missingHint).toEqual([])
})
