import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as pkgAudit from "../lib/pkg-audit.ts"
import type { PackageAudit } from "../lib/pkg-audit.ts"

// P-25 (cubo Siguiente). Contrato rojo del recibo de auditoría cacheado por
// nombre@versión: el público audita paquetes sin volver a bajar el árbol cada
// vez, otra versión no reutiliza el recibo y un fallo jamás se disfraza de
// auditoría completa. Las funciones nuevas se leen por namespace para que el
// rojo sea de aserción y no de enlace del módulo.

const api = pkgAudit as unknown as Record<string, unknown>

let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "pi686-receipt-"))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

function makeAudit(over: Partial<PackageAudit>): PackageAudit {
  return {
    name: "pi-ejemplo",
    version: "1.0.0",
    ok: true,
    complete: true,
    filesSelected: 3,
    filesFetched: 3,
    filesSkipped: [],
    filesScanned: 3,
    bytesScanned: 900,
    findings: [],
    domains: [],
    ...over,
  }
}

test("saveAuditReceipt and loadAuditReceipt exist as functions", () => {
  expect(typeof api.saveAuditReceipt, "API ausente: saveAuditReceipt").toBe("function")
  expect(typeof api.loadAuditReceipt, "API ausente: loadAuditReceipt").toBe("function")
})

test("a receipt saved by name@version loads back from the dataDir", async () => {
  const save = api.saveAuditReceipt as (dir: string, a: PackageAudit) => unknown
  const load = api.loadAuditReceipt as (dir: string, name: string, version: string) => PackageAudit | undefined
  await Promise.resolve(save(dataDir, makeAudit({})))
  const loaded = load(dataDir, "pi-ejemplo", "1.0.0")
  expect(loaded).toBeDefined()
  expect(loaded?.name).toBe("pi-ejemplo")
  expect(loaded?.version).toBe("1.0.0")
  expect(loaded?.ok).toBe(true)
  expect(loaded?.complete).toBe(true)
})

test("a different version does not reuse the receipt", async () => {
  const save = api.saveAuditReceipt as (dir: string, a: PackageAudit) => unknown
  const load = api.loadAuditReceipt as (dir: string, name: string, version: string) => PackageAudit | undefined
  await Promise.resolve(save(dataDir, makeAudit({})))
  expect(load(dataDir, "pi-ejemplo", "2.0.0")).toBeUndefined()
  expect(load(dataDir, "otro-paquete", "1.0.0")).toBeUndefined()
})

test("a failed audit is never presented back as complete", async () => {
  const save = api.saveAuditReceipt as (dir: string, a: PackageAudit) => unknown
  const load = api.loadAuditReceipt as (dir: string, name: string, version: string) => PackageAudit | undefined
  await Promise.resolve(
    save(dataDir, makeAudit({ ok: false, complete: false, error: "clone failed: red no disponible" })),
  )
  const loaded = load(dataDir, "pi-ejemplo", "1.0.0")
  expect(loaded).toBeDefined()
  expect(loaded?.complete, "un fallo no es una auditoría completa").toBe(false)
  expect(loaded?.ok).toBe(false)
  expect(loaded?.error).toBe("clone failed: red no disponible")
})
