import { test, expect } from "bun:test"
import { ESSENTIALS, missingEssentials } from "../lib/essentials.ts"
import type { SettingsFile } from "../lib/config-io.ts"

// N-ESS-01 (P-05 y P-06): la curaduría declara quién avala cada pieza y
// cuándo se revisó, y el catálogo cubre las dos piezas humanas que faltan:
// preguntar al usuario y las tareas de fondo.

// Ficha editorial que P-05 exige; hoy EssentialPackage aún no la declara.
type ConFicha = { id: string; label: string; description: string; category: string; curator?: string; reviewedAt?: string }
const conFicha = (e: (typeof ESSENTIALS)[number]): ConFicha => e as ConFicha

test("ESSENTIALS incluye preguntar al usuario: @juicesharp/rpiv-ask-user-question", () => {
  const ask = ESSENTIALS.find((p) => p.id === "@juicesharp/rpiv-ask-user-question")
  expect(ask).toBeDefined()
  expect(ask?.category).toBe("Human")
  expect(ask?.label.length ?? 0).toBeGreaterThan(0)
  expect(ask?.description.length ?? 0).toBeGreaterThan(0)
})

test("ESSENTIALS incluye tareas de fondo: pi-background-tasks", () => {
  const bg = ESSENTIALS.find((p) => p.id === "pi-background-tasks")
  expect(bg).toBeDefined()
  expect(bg?.category).toBe("Tasks")
  expect(bg?.label.length ?? 0).toBeGreaterThan(0)
  expect(bg?.description.length ?? 0).toBeGreaterThan(0)
})

test("cada esencial trae ficha editorial: curator y reviewedAt en ISO", () => {
  expect(ESSENTIALS.length).toBeGreaterThanOrEqual(10)
  for (const e of ESSENTIALS) {
    const f = conFicha(e)
    expect(typeof f.curator, `curator de ${e.id}`).toBe("string")
    expect((f.curator ?? "").length, `curator de ${e.id}`).toBeGreaterThan(0)
    expect(typeof f.reviewedAt, `reviewedAt de ${e.id}`).toBe("string")
    expect(Number.isNaN(Date.parse(f.reviewedAt ?? "")), `reviewedAt de ${e.id}`).toBe(false)
  }
})

test("missingEssentials ofrece los dos nuevos cuando no hay nada instalado", () => {
  const settings: SettingsFile = { packages: [] }
  const missing = missingEssentials(settings).map((m) => m.id)
  expect(missing).toContain("@juicesharp/rpiv-ask-user-question")
  expect(missing).toContain("pi-background-tasks")
})
