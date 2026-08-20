import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"

// P-29 (cubo Siguiente). Contrato rojo del sitio de documentación estático:
// se genera desde los docs públicos (index, instalacion) como HTML y jamás
// copia docs/auditoria. Una sola fuente de verdad, sin tocar a mano.

const docsSite = await import("../lib/docs-site.ts").catch(() => undefined)

let docsDir: string
let outDir: string

beforeEach(() => {
  docsDir = mkdtempSync(join(tmpdir(), "pi686-docs-"))
  outDir = mkdtempSync(join(tmpdir(), "pi686-site-"))
  mkdirSync(join(docsDir, "auditoria"), { recursive: true })
  writeFileSync(join(docsDir, "index.md"), "# Inicio\n\nBienvenido al centro de control. MARCADOR-INDEX-7F3A\n")
  writeFileSync(join(docsDir, "instalacion.md"), "# Instalación\n\nPasos para instalar. MARCADOR-INSTALA-9B2C\n")
  writeFileSync(join(docsDir, "auditoria", "informe-interno.md"), "## Nota interna\n\nSECRETO-AUDITORIA-4D1E\n")
})

afterEach(() => {
  rmSync(docsDir, { recursive: true, force: true })
  rmSync(outDir, { recursive: true, force: true })
})

function walkFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full, base))
    } else {
      out.push(relative(base, full))
    }
  }
  return out
}

test("lib/docs-site.ts exists and exports generateDocsSite", () => {
  expect(docsSite, "módulo ausente: lib/docs-site.ts").toBeDefined()
  expect(typeof docsSite?.generateDocsSite, "API ausente: generateDocsSite").toBe("function")
})

test("generateDocsSite writes HTML pages from the public docs", async () => {
  await Promise.resolve(docsSite?.generateDocsSite?.({ docsDir, outDir }))
  const indexHtml = join(outDir, "index.html")
  const instalacionHtml = join(outDir, "instalacion.html")
  expect(existsSync(indexHtml), "falta index.html").toBe(true)
  expect(existsSync(instalacionHtml), "falta instalacion.html").toBe(true)
  const index = readFileSync(indexHtml, "utf8").toLowerCase()
  const instalacion = readFileSync(instalacionHtml, "utf8").toLowerCase()
  expect(index).toContain("<body")
  expect(index).toContain("marcador-index-7f3a")
  expect(instalacion).toContain("<body")
  expect(instalacion).toContain("marcador-instala-9b2c")
})

test("generateDocsSite writes extra pages and rewrites contributing links", async () => {
  writeFileSync(join(docsDir, "index.md"), "# Inicio\n\nLee [CONTRIBUTING](../CONTRIBUTING.md).\n")
  const extra = join(docsDir, "CONTRIBUTING.md")
  writeFileSync(extra, "# Contributing\n\nGracias.\n")
  const written = await Promise.resolve(
    docsSite?.generateDocsSite?.({
      docsDir,
      outDir,
      extraPages: [{ sourcePath: extra, outputName: "CONTRIBUTING.html" }],
    }),
  )
  expect(written, "debe incluir el extra").toContain("CONTRIBUTING.html")
  const index = readFileSync(join(outDir, "index.html"), "utf8")
  expect(index).toContain('href="CONTRIBUTING.html"')
  expect(index).not.toContain("../CONTRIBUTING.html")
  expect(existsSync(join(outDir, "CONTRIBUTING.html"))).toBe(true)
})

test("generateDocsSite never copies the auditoria folder", async () => {
  await Promise.resolve(docsSite?.generateDocsSite?.({ docsDir, outDir }))
  const files = existsSync(outDir) ? walkFiles(outDir) : []
  for (const rel of files) {
    expect(rel.toLowerCase(), `${rel} no debe existir en el sitio`).not.toContain("auditoria")
  }
  for (const rel of files) {
    const content = readFileSync(join(outDir, rel), "utf8")
    expect(content.includes("SECRETO-AUDITORIA-4D1E"), `${rel} filtra contenido de auditoria`).toBe(false)
  }
})
