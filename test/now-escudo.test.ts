import { test, expect } from "bun:test"
import { installTargetFromAudit, auditStatus, type PackageAudit } from "../lib/pkg-audit.ts"

// N-ESC-01 (P-03 y P-04, núcleo): lo que se instala tiene que salir de la
// auditoría (installSpec casado con nombre@versión, nunca latest) y el
// estado de la revisión distingue completa, incompleta y fallida.

/** Auditoría mínima y sana; cada test tumba solo los campos que interpela. */
function audit(overrides: Partial<PackageAudit>): PackageAudit {
  return {
    name: "foo",
    version: "1.2.3",
    installSpec: "foo@1.2.3",
    ok: true,
    complete: true,
    filesSelected: 3,
    filesFetched: 3,
    filesSkipped: [],
    filesScanned: 3,
    bytesScanned: 120,
    findings: [],
    domains: [],
    ...overrides,
  }
}

test("installTargetFromAudit instala exactamente el installSpec auditado: npm:nombre@versión", () => {
  expect(installTargetFromAudit(audit({ installSpec: "foo@1.2.3" }))).toBe("npm:foo@1.2.3")
})

test("installTargetFromAudit conserva los nombres con scope", () => {
  expect(installTargetFromAudit(audit({ installSpec: "@juicesharp/rpiv-todo@2.0.0" }))).toBe("npm:@juicesharp/rpiv-todo@2.0.0")
})

test("installTargetFromAudit devuelve undefined sin installSpec: el llamador no instala", () => {
  expect(installTargetFromAudit(audit({ installSpec: undefined }))).toBeUndefined()
})

test("auditStatus dice complete solo si la revisión cubrió todo y sin error", () => {
  expect(auditStatus(audit({ complete: true, ok: true, error: undefined }))).toBe("complete")
})

test("auditStatus dice incomplete cuando hay omisiones pero sí archivos seleccionados", () => {
  const withOmissions = audit({
    ok: false,
    complete: false,
    filesSelected: 5,
    filesFetched: 3,
    filesSkipped: ["dist/big.js"],
    error: "incomplete audit: fetched 3/5",
  })
  // Una revisión con omisiones no es una revisión fallida: es parcial.
  expect(auditStatus(withOmissions)).toBe("incomplete")
})

test("auditStatus dice failed cuando no se llegó a seleccionar ningún archivo", () => {
  const neverRan = audit({
    version: "?",
    ok: false,
    complete: false,
    filesSelected: 0,
    filesFetched: 0,
    filesScanned: 0,
    error: "package identity could not be resolved",
  })
  expect(auditStatus(neverRan)).toBe("failed")
})
