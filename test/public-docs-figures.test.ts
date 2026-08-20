import { test, expect } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PROVIDER_PRESETS } from "../lib/presets.ts"

// N-DOC-02 / P-01 + P-15: las cifras públicas salen del árbol, no de un 91
// copiado. En público se dice pack, no sótano para el local.

const ROOT = join(import.meta.dir, "..")

const PUBLIC_DOCS = [
  "README.md",
  "README.en.md",
  "CHANGELOG.md",
  "docs/index.md",
  "docs/instalacion.md",
  "docs/arquitectura.md",
  "docs/modulos.md",
  "docs/comandos.md",
  "docs/extender.md",
  "docs/probar.md",
  "docs/dominios.md",
  "docs/datos-y-config.md",
  "docs/pi.md",
] as const

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
}

function countPacks(): number {
  return readdirSync(join(ROOT, "packs"), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).length
}

function walkPackFiles(): { skills: number; prompts: number } {
  let skills = 0
  let prompts = 0
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name === "SKILL.md") skills += 1
      else if (dir.endsWith("prompts") && entry.name.endsWith(".md")) prompts += 1
    }
  }
  visit(join(ROOT, "packs"))
  return { skills, prompts }
}

function countTests(): number {
  let n = 0
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name.endsWith(".ts")) {
        n += [...readFileSync(path, "utf8").matchAll(/^\s*test\s*\(/gm)].length
      }
    }
  }
  visit(join(ROOT, "test"))
  return n
}

test("public_docs_do_not_claim_91_tests_or_nine_packs", () => {
  for (const rel of PUBLIC_DOCS) {
    const text = read(rel)
    expect(text, rel).not.toMatch(/\b91 tests\b/i)
    expect(text, rel).not.toMatch(/\b9 domains\b/i)
    expect(text, rel).not.toMatch(/\b9 dominios\b/i)
  }
})

test("readme_figures_match_the_tree", () => {
  const packs = countPacks()
  const { skills, prompts } = walkPackFiles()
  const presets = PROVIDER_PRESETS.length
  const tests = countTests()
  expect(packs).toBeGreaterThanOrEqual(11)
  expect(skills).toBeGreaterThan(0)
  expect(prompts).toBeGreaterThan(0)
  expect(presets).toBeGreaterThan(0)
  expect(tests).toBeGreaterThan(91)

  for (const rel of ["README.md", "README.en.md"] as const) {
    const text = read(rel)
    // El total de tests cambia cada átomo: no se copia un número. Sí bun test.
    expect(text, `${rel} bun test`).toMatch(/bun test/)
    expect(text, `${rel} no hardcoded test total`).not.toMatch(/\b\d+ tests\b/i)
    expect(text, `${rel} packs`).toContain(`${packs} pack`)
    expect(text, `${rel} skills`).toContain(`${skills} skill`)
    expect(text, `${rel} prompts`).toContain(`${prompts} prompt`)
    expect(text, `${rel} presets`).toContain(`${presets} preset`)
  }
})

test("public_readme_does_not_call_providers_or_local_sotano", () => {
  expect(read("README.md")).not.toMatch(/sótano/i)
  expect(read("README.en.md")).not.toMatch(/\bbasement\b/i)
})

test("index_and_glossary_say_pack_not_user_facing_dominio", () => {
  expect(read("docs/index.md")).toMatch(/11 packs/)
  expect(read("docs/index.md")).not.toMatch(/11 dominios/)
  const glossary = read("docs/arquitectura.md")
  expect(glossary).toMatch(/\*\*pack\*\*:/)
  expect(glossary).toMatch(/\*\*paquete\*\*:/)
  expect(glossary).toMatch(/\*\*turno\*\*:/)
  expect(glossary).toMatch(/\*\*presupuesto\*\*:/)
  expect(glossary).toMatch(/\*\*relevo\*\*:/)
  expect(glossary).toMatch(/\*\*clave\*\*:/)
  expect(glossary).toMatch(/\*\*perfil\*\*:/)
})

test("packages_search_is_not_claimed_as_always_audited", () => {
  const es = read("README.md")
  const en = read("README.en.md")
  expect(es).toMatch(/Auditoría en esenciales/)
  expect(en).toMatch(/Audit on essentials/)
  expect(es).not.toMatch(/\/packages` \| Navegador del ecosistema pi con auditoría/)
})

test("readme_first_minutes_point_to_the_assistant", () => {
  const es = read("README.md")
  const en = read("README.en.md")
  expect(es).toMatch(/asistente de primer arranque/)
  expect(en).toMatch(/first-run assistant/)
  expect(es.match(/lee tus sesiones locales y te avisa/gi)?.length).toBeGreaterThanOrEqual(2)
  expect(es.match(/no te corta\s+ni/g)?.length).toBeGreaterThanOrEqual(2)
  expect(en.match(/reads your local sessions and warns you/g)?.length).toBeGreaterThanOrEqual(2)
  expect(en.match(/sends data anywhere/g)?.length).toBeGreaterThanOrEqual(2)
})

test("modulos_md_aligns_with_public_language", () => {
  const text = read("docs/modulos.md")
  expect(text).not.toMatch(/Tests:\s*91\b/)
  expect(text).not.toMatch(/\b91 tests\b/i)
  expect(text).not.toMatch(/\bnueve packs\b/i)
  expect(text).not.toMatch(/\b9 packs\b/i)
  expect(text).toMatch(/Once packs|11 packs/)
  expect(text).toMatch(/\bpack\b/)
  expect(text).toMatch(/curate-turn\.ts/)
  expect(text).toMatch(/house-copy\.ts/)
  expect(text).toMatch(/memory-policy\.ts/)
})

test("developer_docs_are_linked_from_the_index", () => {
  const index = read("docs/index.md")
  expect(index).toMatch(/comandos\.md/)
  expect(index).toMatch(/extender\.md/)
  expect(index).toMatch(/probar\.md/)
  expect(index).toMatch(/11 packs/)
})

test("instalacion_rejects_bang_command_keys", () => {
  const text = read("docs/instalacion.md")
  expect(text).toMatch(/prefijo `!` se\s+rechaza/)
  expect(text).not.toMatch(/\$ENV_VAR` \(recomendado\) o `!comando/)
})

test("dominios_md_is_titled_as_packs", () => {
  const text = read("docs/dominios.md")
  expect(text).toMatch(/^# Packs de trabajo del harness/m)
  expect(text).not.toMatch(/^# Dominios de trabajo/m)
  expect(text).toMatch(/Casos de uso:/)
})

test("arquitectura_documents_curate_turn", () => {
  const text = read("docs/arquitectura.md")
  expect(text).toMatch(/curateTurn/)
  expect(text).toMatch(/\*\*sala\*\*:/)
  expect(text).toMatch(/\*\*intención\*\*:/)
})
