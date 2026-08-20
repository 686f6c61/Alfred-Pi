import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Characterization tests for A-TST-18: a helper that stores the SonarQube
// token in an env-style file. It must write atomically with mode 0600 even
// under a permissive umask, never persist SONAR_PASS, and refuse to touch
// an existing file whose mode is more permissive than 0600. The helper does
// not exist yet, so these three tests are red until lib/sonar-env.ts lands.

type WriteSonarEnv = (path: string, vars: { token: string; url: string }) => Promise<void> | void

let dir: string
let previousUmask: number

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-senv-"))
})
afterEach(() => {
  try {
    process.umask(previousUmask)
  } catch {
    // umask already restored
  }
  rmSync(dir, { recursive: true, force: true })
})

/** Fresh import per test: a missing module fails this test, not the file. */
async function loadHelper(): Promise<WriteSonarEnv> {
  const mod = (await import("../lib/sonar-env.ts")) as { writeSonarEnv?: WriteSonarEnv }
  if (typeof mod.writeSonarEnv !== "function") throw new Error("writeSonarEnv is not exported by lib/sonar-env.ts")
  return mod.writeSonarEnv
}

test("sonar_env_helper_0600", async () => {
  const writeSonarEnv = await loadHelper()
  previousUmask = process.umask(0o022)
  const file = join(dir, "sonar.env")
  await writeSonarEnv(file, { token: "squ_tok", url: "https://sonar.example" })
  expect(readFileSync(file, "utf8")).toContain("squ_tok")
  // 0600 despite umask 022: the helper must chmod explicitly after write
  expect(statSync(file).mode & 0o777).toBe(0o600)
})

test("sonar_env_helper_removes_password", async () => {
  const writeSonarEnv = await loadHelper()
  const file = join(dir, "sonar.env")
  process.env["SONAR_PASS"] = "super-secret"
  try {
    await writeSonarEnv(file, { token: "squ_tok", url: "https://sonar.example" })
  } finally {
    delete process.env["SONAR_PASS"]
  }
  const body = readFileSync(file, "utf8")
  expect(body).not.toContain("SONAR_PASS")
  expect(body).not.toContain("super-secret")
})

test("sonar_env_helper_rejects_permissive_file", async () => {
  const writeSonarEnv = await loadHelper()
  const file = join(dir, "sonar.env")
  writeFileSync(file, "SONAR_TOKEN=old\n")
  chmodSync(file, 0o644)
  await expect(writeSonarEnv(file, { token: "squ_tok", url: "https://sonar.example" })).rejects.toThrow()
  // rejected writes leave the existing file untouched
  expect(readFileSync(file, "utf8")).toBe("SONAR_TOKEN=old\n")
})

test("sonar_env_helper_overwrites_an_existing_0600_file", async () => {
  const writeSonarEnv = await loadHelper()
  const file = join(dir, "sonar.env")
  await writeSonarEnv(file, { token: "first", url: "https://sonar.example" })
  // A second write over an already owner-only file is the normal refresh
  // path: it must succeed and keep the 0600 mode.
  await writeSonarEnv(file, { token: "second", url: "https://sonar.example" })
  const body = readFileSync(file, "utf8")
  expect(body).toContain("SONAR_TOKEN=second")
  expect(body).not.toContain("first")
  expect(statSync(file).mode & 0o777).toBe(0o600)
})
