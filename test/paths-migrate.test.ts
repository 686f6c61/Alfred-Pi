import { test, expect, afterEach } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getDataDir, PACKAGE_NAME, LEGACY_PACKAGE_NAME } from "../lib/paths.ts"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "alfred-pi-data-"))
  dirs.push(dir)
  return dir
}

test("getDataDir prefers alfred-pi when the new directory exists", () => {
  const base = scratch()
  mkdirSync(join(base, PACKAGE_NAME))
  mkdirSync(join(base, LEGACY_PACKAGE_NAME))
  writeFileSync(join(base, PACKAGE_NAME, "mark.json"), '{"who":"new"}')
  writeFileSync(join(base, LEGACY_PACKAGE_NAME, "mark.json"), '{"who":"old"}')
  expect(getDataDir(base)).toBe(join(base, PACKAGE_NAME))
  expect(JSON.parse(readFileSync(join(getDataDir(base), "mark.json"), "utf8"))).toEqual({ who: "new" })
})

test("getDataDir copies the legacy directory once and leaves it in place", () => {
  const base = scratch()
  const legacy = join(base, LEGACY_PACKAGE_NAME)
  mkdirSync(legacy)
  writeFileSync(join(legacy, "profiles.json"), '{"ok":true}')
  const next = getDataDir(base)
  expect(next).toBe(join(base, PACKAGE_NAME))
  expect(existsSync(join(next, "profiles.json"))).toBe(true)
  expect(JSON.parse(readFileSync(join(next, "migrated-from.json"), "utf8")).from).toBe(LEGACY_PACKAGE_NAME)
  expect(existsSync(join(legacy, "profiles.json"))).toBe(true)
  writeFileSync(join(legacy, "only-old.json"), "{}")
  expect(existsSync(join(getDataDir(base), "only-old.json"))).toBe(false)
})

test("getDataDir does not copy when the legacy path is a file", () => {
  const base = scratch()
  writeFileSync(join(base, LEGACY_PACKAGE_NAME), "not a dir")
  const next = getDataDir(base)
  expect(next).toBe(join(base, PACKAGE_NAME))
  expect(existsSync(next)).toBe(false)
})

test("getDataDir returns the new path when nothing exists yet", () => {
  const base = scratch()
  expect(getDataDir(base)).toBe(join(base, PACKAGE_NAME))
  expect(existsSync(join(base, PACKAGE_NAME))).toBe(false)
})
