import { test, expect } from "bun:test"

// P-27 y P-32 (cubo Siguiente). Contrato rojo de la lengua de la casa en el
// pie, /stack y el relevo: ni «dom:», ni «budget N% of», ni «deal all cards».
// El módulo lib/house-copy.ts aún no existe; el import dinámico con catch
// convierte la ausencia en un fallo de aserción, no en un error de enlace.

const houseCopy = await import("../lib/house-copy.ts").catch(() => undefined)

test("lib/house-copy.ts exists and exports the four copy helpers", () => {
  expect(houseCopy, "módulo ausente: lib/house-copy.ts").toBeDefined()
  expect(typeof houseCopy?.salaStatus, "API ausente: salaStatus").toBe("function")
  expect(typeof houseCopy?.presupuestoStatus, "API ausente: presupuestoStatus").toBe("function")
  expect(typeof houseCopy?.relevoAviso, "API ausente: relevoAviso").toBe("function")
  expect(typeof houseCopy?.dealAllSalasLabel, "API ausente: dealAllSalasLabel").toBe("function")
})

test("salaStatus names the room without the dom: prefix", () => {
  const status = houseCopy?.salaStatus?.("security") ?? ""
  expect(status.length).toBeGreaterThan(0)
  expect(status).toContain("security")
  expect(status).not.toContain("dom:")
})

test("presupuestoStatus speaks Spanish about the budget, not budget 80% of", () => {
  const status = houseCopy?.presupuestoStatus?.(80, 5) ?? ""
  const lower = status.toLowerCase()
  expect(lower).toContain("presupuesto")
  expect(lower).toContain("80")
  expect(lower).not.toContain("budget")
  expect(lower).not.toMatch(/%\s*of\b/)
})

test("relevoAviso tells the user it steps down to their reserve model", () => {
  const aviso = houseCopy?.relevoAviso?.("grok-4", "glm-5.3") ?? ""
  expect(aviso).toContain("paso a tu reserva")
})

test("dealAllSalasLabel drops the casino jargon and talks about salas", () => {
  const label = houseCopy?.dealAllSalasLabel?.() ?? ""
  const lower = label.toLowerCase()
  expect(label.length).toBeGreaterThan(0)
  expect(lower).not.toContain("deal")
  expect(lower).not.toContain("cards")
  expect(lower).toContain("sala")
})
