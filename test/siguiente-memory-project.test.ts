import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// P-31 (cubo Siguiente). Contrato rojo de la memoria por proyecto: opt-in
// siempre, nunca en silencio. La política se persiste dentro del proyecto y
// el módulo no instala ni ejecuta nada.

const memoryPolicy = await import("../lib/memory-policy.ts").catch(() => undefined)

const MODULE_PATH = join(import.meta.dir, "..", "lib", "memory-policy.ts")

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "pi686-memory-"))
})

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true })
})

test("lib/memory-policy.ts exists and exports the policy functions", () => {
  expect(memoryPolicy, "módulo ausente: lib/memory-policy.ts").toBeDefined()
  expect(typeof memoryPolicy?.loadMemoryPolicy, "API ausente: loadMemoryPolicy").toBe("function")
  expect(typeof memoryPolicy?.saveMemoryPolicy, "API ausente: saveMemoryPolicy").toBe("function")
})

test("loadMemoryPolicy denies by default in a fresh project", () => {
  const policy = memoryPolicy?.loadMemoryPolicy?.(projectRoot)
  expect(policy).toBeDefined()
  expect(policy?.allow, "la memoria es opt-in: por defecto no permite").toBe(false)
})

test("saveMemoryPolicy persists an explicit opt-in for the project", async () => {
  await Promise.resolve(memoryPolicy?.saveMemoryPolicy?.({ projectRoot, allow: true }))
  const policy = memoryPolicy?.loadMemoryPolicy?.(projectRoot)
  expect(policy?.allow).toBe(true)
})

test("the memory policy module never installs or executes anything", () => {
  // Gobernar no es instalar: la política se lee y se escribe, y punto.
  expect(existsSync(MODULE_PATH), "módulo ausente: lib/memory-policy.ts").toBe(true)
  const src = readFileSync(MODULE_PATH, "utf8")
  expect(src).not.toMatch(/pi\s+install/)
  expect(src).not.toMatch(/child_process|execFile|execSync|spawnSync|spawn\s*\(|exec\s*\(/)
})
