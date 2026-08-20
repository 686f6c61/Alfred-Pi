import { test, expect } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

// P-30 (cubo Siguiente). Contrato rojo del vigilante de curaduría: un
// semáforo advisory (vivo, decae, muerto) calculado solo con datos públicos
// que ya están en memoria, sin red y sin borrar paquetes. Umbrales del PO:
// dead exige descargas <100 y publicación >90 días; alive exige >=100
// descargas y publicación dentro de 90 días; el resto decae.

const watchdog = await import("../lib/curation-watchdog.ts").catch(() => undefined)

const MODULE_PATH = join(import.meta.dir, "..", "lib", "curation-watchdog.ts")

const NOW = new Date("2026-08-19T00:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

interface CurationSignals {
  downloads: number
  publishedAt: string
}

type CurationVerdict = "alive" | "decaying" | "dead"

function assess(signals: CurationSignals): CurationVerdict | undefined {
  const fn = watchdog?.assessCuration as ((s: CurationSignals, now?: Date) => CurationVerdict) | undefined
  return fn?.(signals, NOW)
}

function publishedDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

test("lib/curation-watchdog.ts exists and exports assessCuration", () => {
  expect(watchdog, "módulo ausente: lib/curation-watchdog.ts").toBeDefined()
  expect(typeof watchdog?.assessCuration, "API ausente: assessCuration").toBe("function")
})

test("assessCuration marks dead when downloads <100 and published >90 days ago", () => {
  expect(assess({ downloads: 42, publishedAt: publishedDaysAgo(120) })).toBe("dead")
})

test("assessCuration marks decaying when it is not dead but traction is weak", () => {
  // Pocas descargas aunque la publicación sea reciente.
  expect(assess({ downloads: 42, publishedAt: publishedDaysAgo(10) })).toBe("decaying")
  // Publicación vieja aunque conserve tracción.
  expect(assess({ downloads: 900, publishedAt: publishedDaysAgo(120) })).toBe("decaying")
})

test("assessCuration marks alive with >=100 downloads published within 90 days", () => {
  expect(assess({ downloads: 900, publishedAt: publishedDaysAgo(10) })).toBe("alive")
  expect(assess({ downloads: 150, publishedAt: publishedDaysAgo(30) })).toBe("alive")
})

test("the watchdog module never touches the network or deletes packages", () => {
  // Semáforo advisory: evalúa señales que ya están en memoria. La fuente del
  // módulo no puede contener llamadas de red ni borrado de archivos.
  expect(existsSync(MODULE_PATH), "módulo ausente: lib/curation-watchdog.ts").toBe(true)
  const src = readFileSync(MODULE_PATH, "utf8")
  expect(src).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//)
  expect(src).not.toMatch(/unlink|rmSync|\brm\s+-|execFile|execSync|spawnSync|spawn\s*\(|exec\s*\(/)
})
