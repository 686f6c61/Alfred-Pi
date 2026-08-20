import { test, expect } from "bun:test"
import { ESSENTIALS } from "../lib/essentials.ts"

// P-33 (cubo Siguiente). Contrato rojo del selector local-first:
// compresión de contexto, pi-task, navegador y voz entran como recomendados
// con su advertencia, nunca como esenciales. LOCAL_FIRST es una lista propia,
// no un rebautizo de ESSENTIALS.

const localFirst = await import("../lib/local-first.ts").catch(() => undefined)

interface LocalFirstEntry {
  id: string
  warning: string
}

function entries(): LocalFirstEntry[] {
  return (localFirst?.LOCAL_FIRST ?? []) as LocalFirstEntry[]
}

test("lib/local-first.ts exists and exports a LOCAL_FIRST list", () => {
  expect(localFirst, "módulo ausente: lib/local-first.ts").toBeDefined()
  expect(Array.isArray(localFirst?.LOCAL_FIRST), "LOCAL_FIRST debe ser una lista").toBe(true)
  expect(entries().length).toBeGreaterThan(0)
})

test("LOCAL_FIRST includes pi-task and voice and stays away from orchestration essentials", () => {
  const ids = entries().map((e) => e.id)
  expect(ids).toContain("@mjasnikovs/pi-task")
  expect(ids).toContain("@juicesharp/rpiv-voice")
  expect(ids).not.toContain("pi-subagents")
  expect(ids).not.toContain("pi-mcp-adapter")
})

test("every LOCAL_FIRST entry carries a non-empty warning", () => {
  // Cada pieza local-first entra con su advertencia visible (P-33).
  for (const entry of entries()) {
    expect(typeof entry.id, `id de ${entry.id}`).toBe("string")
    expect(entry.id.length, "id no vacío").toBeGreaterThan(0)
    expect(typeof entry.warning, `warning de ${entry.id}`).toBe("string")
    expect(entry.warning.length, `warning no vacío de ${entry.id}`).toBeGreaterThan(0)
  }
})

test("no LOCAL_FIRST entry is also an essential by id", () => {
  const essentialIds = new Set(ESSENTIALS.map((e) => e.id))
  for (const entry of entries()) {
    expect(essentialIds.has(entry.id), `${entry.id} no puede ser esencial y local-first`).toBe(false)
  }
})
