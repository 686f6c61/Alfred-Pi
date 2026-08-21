import { describe, test, expect } from "bun:test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const WWW = join(ROOT, "www")
// www/ is the landing branch. On main it is gitignored, so GitHub CI
// must not import Astro sources that are not in that tree.
const HAS_WWW = existsSync(join(WWW, "src"))

describe.skipIf(!HAS_WWW)("www site", () => {
test("markdown doc links rewrite to site routes", async () => {
  const { rewriteDocHref } = await import("../www/src/lib/rehype-docs.ts")
  expect(rewriteDocHref("instalacion.md")).toBe("/docs/instalacion")
  expect(rewriteDocHref("comandos.md#flag")).toBe("/docs/comandos#flag")
  expect(rewriteDocHref("../CONTRIBUTING.md")).toBe(
    "https://github.com/686f6c61/Alfred-Pi/blob/main/CONTRIBUTING.md",
  )
  expect(rewriteDocHref("https://pi.dev")).toBe("https://pi.dev")
})

test("astro collection glob stays at docs/*.md so auditoria never publishes", () => {
  const src = readFileSync(join(WWW, "src/content.config.ts"), "utf8")
  expect(src).toContain('pattern: "*.md"')
  expect(src).not.toMatch(/\*\*\/\*\.md/)
})

test("product pages do not ship architecture diagrams", () => {
  expect(existsSync(join(WWW, "src/components/figures"))).toBe(false)
})

test("home ledger matches pack tree skill and prompt counts", () => {
  const packs = join(ROOT, "packs")
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
  visit(packs)
  const es = readFileSync(join(WWW, "src/pages/index.astro"), "utf8")
  const en = readFileSync(join(WWW, "src/pages/en/index.astro"), "utf8")
  const caption = `${skills} SKILLS · ${prompts} PROMPTS`
  expect(es).toContain(caption)
  expect(en).toContain(caption)
  expect(es).toContain(`ledger-value">${skills}<`)
  expect(es).toContain(`ledger-value">${prompts}<`)
  expect(en).toContain(`ledger-value">${skills}<`)
  expect(en).toContain(`ledger-value">${prompts}<`)
})

test("home puts Alfred Pi on one line next to a copyable install", () => {
  const src = readFileSync(join(WWW, "src/pages/index.astro"), "utf8")
  expect(src).toContain("ALFRED <span class=\"red\">PI</span>")
  expect(src).not.toContain("ALFRED<br />PI")
  expect(src).toContain("CopyInstall")
  const cmd = readFileSync(join(WWW, "src/lib/install.ts"), "utf8")
  expect(cmd).toContain("pi install git:github.com/686f6c61/Alfred-Pi")
  expect(cmd).not.toContain("pi-harness-moe")
  expect(existsSync(join(WWW, "public/js/copy.js"))).toBe(true)
})

test("public github urls point at 686f6c61/Alfred-Pi, not the old repo name", () => {
  const surfaces = [
    join(WWW, "src/lib/install.ts"),
    join(WWW, "src/layouts/Base.astro"),
    join(ROOT, "README.md"),
    join(ROOT, "README.en.md"),
    join(ROOT, "docs/instalacion.md"),
    join(ROOT, "package.json"),
  ]
  for (const file of surfaces) {
    const src = readFileSync(file, "utf8")
    expect(src.includes("github.com/686f6c61/pi-harness-moe")).toBe(false)
  }
  const install = readFileSync(join(WWW, "src/lib/install.ts"), "utf8")
  expect(install).toContain("686f6c61/Alfred-Pi")
  expect(readFileSync(join(ROOT, "README.md"), "utf8")).toContain("686f6c61/Alfred-Pi")
  expect(readFileSync(join(ROOT, "package.json"), "utf8")).toContain("686f6c61/Alfred-Pi")
})

test("gutter stamps are signed and are not architecture diagrams", () => {
  const dir = join(WWW, "public/svg")
  for (const name of ["gutter-ap.svg", "gutter-house.svg", "gutter-radar.svg", "gutter-gates.svg", "gutter-steps.svg"]) {
    const svg = readFileSync(join(dir, name), "utf8")
    expect(svg).toContain("686f6c61")
    expect(svg).not.toMatch(/<(script|foreignObject)/i)
    expect(svg).not.toMatch(/arrow|flowchart|pipeline/i)
    expect(svg).not.toContain("NO MEZCLAR")
    expect(svg).not.toContain("CASA, NO KERNEL")
  }
  const gutter = readFileSync(join(WWW, "src/components/Gutter.astro"), "utf8")
  expect(gutter).toContain("gutter-svg")
  const css = readFileSync(join(WWW, "src/styles/global.css"), "utf8")
  expect(css).toContain(".block.has-gutter")
  expect(css).not.toContain("background-size: contain")
})

test("built dist has no auditoria route", () => {
  const dist = join(WWW, "dist")
  if (!existsSync(dist)) return
  expect(existsSync(join(dist, "auditoria"))).toBe(false)
  expect(existsSync(join(dist, "docs", "auditoria"))).toBe(false)
})

test("sitemap lists each loc once and does not invent english docs", async () => {
  const { sitemapXml, robotsTxt, SITE_ORIGIN } = await import("../www/src/lib/seo.ts")
  const xml = sitemapXml(SITE_ORIGIN, ["index", "instalacion", "comandos"])
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  expect(new Set(locs).size).toBe(locs.length)
  expect(locs).toContain(`${SITE_ORIGIN}/`)
  expect(locs).toContain(`${SITE_ORIGIN}/en/`)
  expect(locs).toContain(`${SITE_ORIGIN}/docs/instalacion`)
  expect(locs.filter((l) => l === `${SITE_ORIGIN}/en/docs`).length).toBe(1)
  expect(locs.some((l) => l.includes("/en/docs/instalacion"))).toBe(false)
  expect(xml).toContain('hreflang="es"')
  expect(xml).toContain("lastmod>2026-08-21")
  const robots = robotsTxt(SITE_ORIGIN)
  expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)
  // The 404 page guards itself with noindex; blocking it in robots would
  // stop the crawler from ever reading that tag.
  expect(robots).not.toContain("Disallow: /404")
})

test("og share images are 1200 by 630 png", () => {
  for (const name of ["og.png", "og-en.png"]) {
    const buf = readFileSync(join(WWW, "public", name))
    expect(buf[1]).toBe(0x50)
    expect(buf.readUInt32BE(16)).toBe(1200)
    expect(buf.readUInt32BE(20)).toBe(630)
  }
  expect(existsSync(join(WWW, "public", "llms.txt"))).toBe(true)
  expect(existsSync(join(WWW, "public", "llms.es.txt"))).toBe(true)
  expect(existsSync(join(WWW, "public", ".well-known", "security.txt"))).toBe(true)
})

test("404 is noindex and does not canonical to home", () => {
  const src = readFileSync(join(WWW, "src/pages/404.astro"), "utf8")
  expect(src).toContain('robots="noindex, follow"')
  expect(src).toContain('canonicalPath="/404"')
})

test("technical docs do not invent an english hreflang twin", () => {
  const src = readFileSync(join(WWW, "src/pages/docs/[slug].astro"), "utf8")
  expect(src).toContain("bilingual={false}")
})

test("json-ld home includes SoftwareApplication; faq includes FAQPage", async () => {
  const { jsonLd, SITE_ORIGIN } = await import("../www/src/lib/seo.ts")
  const home = jsonLd({
    locale: "es",
    title: "Alfred-Pi",
    description: "extensión",
    canonical: `${SITE_ORIGIN}/`,
    routeKey: "home",
  })
  expect(home).toContain("SoftwareApplication")
  expect(home).toContain("BreadcrumbList")
  const faq = jsonLd({
    locale: "es",
    title: "FAQ",
    description: "preguntas",
    canonical: `${SITE_ORIGIN}/faq`,
    routeKey: "faq",
  })
  expect(faq).toContain("FAQPage")
  const hidden = jsonLd({
    locale: "es",
    title: "404",
    description: "no",
    canonical: `${SITE_ORIGIN}/404`,
    routeKey: "home",
    indexable: false,
  })
  expect(hidden).toBe("")
})

test("markdown descriptions skip headings and fences", async () => {
  const { descriptionFromMarkdown } = await import("../www/src/lib/seo.ts")
  const d = descriptionFromMarkdown(
    "# Título\n\nGuía exhaustiva: requisitos, vías de instalación y qué toca cada una.\n\n## Más\n",
    "fallback",
  )
  expect(d.startsWith("Guía exhaustiva")).toBe(true)
  expect(d.includes("#")).toBe(false)
})

test("probar.md counts the real tree: 80 (53 skills + 27 prompts)", () => {
  for (const file of [join(ROOT, "docs", "probar.md"), join(WWW, "docs", "probar.md")]) {
    const src = readFileSync(file, "utf8")
    expect(src).toContain("Recuento actual 80 (53+27)")
    expect(src).not.toContain("74 (48+26)")
  }
})

test("base layout: skip link, main#contenido and locale-aware llms alternate", () => {
  const src = readFileSync(join(WWW, "src", "layouts", "Base.astro"), "utf8")
  expect(src).toContain('href="#contenido"')
  expect(src).toContain('<main id="contenido">')
  expect(src).toContain('locale === "es" ? "/llms.es.txt" : "/llms.txt"')
  // The skip link is the first focusable element, before the header.
  expect(src.indexOf('class="skip-link"')).toBeLessThan(src.indexOf('class="site-header"'))
})

test("docs rewriting lives in the Markdown processor, not a client script", () => {
  const slug = readFileSync(join(WWW, "src", "pages", "docs", "[slug].astro"), "utf8")
  expect(slug).not.toContain("<script>")
  const cfg = readFileSync(join(WWW, "astro.config.mjs"), "utf8")
  expect(cfg).toContain("satteri")
  expect(cfg).toContain("hastPlugins")
})

test("structured faq comes from lib/faq.ts and does not drift from the pages", async () => {
  const { faqEntries } = await import("../www/src/lib/faq.ts")
  const es = readFileSync(join(WWW, "src", "pages", "faq.astro"), "utf8")
  const en = readFileSync(join(WWW, "src", "pages", "en", "faq.astro"), "utf8")
  expect(faqEntries.length).toBe(11)
  for (const entry of faqEntries) {
    expect(es).toContain(`<h2>${entry.qEs}</h2>`)
    expect(en).toContain(`<h2>${entry.qEn}</h2>`)
  }
  const seo = readFileSync(join(WWW, "src", "lib", "seo.ts"), "utf8")
  expect(seo).not.toContain("FAQ_ES")
  expect(seo).not.toContain("FAQ_EN")
})

test("dist: docs without relative .md hrefs, wrapped tables and per-locale llms alternate", () => {
  const dist = join(WWW, "dist")
  if (!existsSync(dist)) return
  const docsDir = join(dist, "docs")
  if (existsSync(docsDir)) {
    // Doc pages live at dist/docs/<slug>/index.html.
    const htmlFiles = readdirSync(docsDir, { recursive: true })
      .map((f) => join(docsDir, String(f)))
      .filter((f) => f.endsWith(".html"))
    expect(htmlFiles.length).toBeGreaterThan(0)
    for (const file of htmlFiles) {
      const src = readFileSync(file, "utf8")
      // External GitHub .md links are fine; relative ones are not.
      expect(src).not.toMatch(/href="(?!https?:)[^"]*\.md/)
    }
    const probar = join(docsDir, "probar", "index.html")
    if (existsSync(probar)) {
      expect(readFileSync(probar, "utf8")).toContain("table-scroll")
    }
  }
  const esHome = join(dist, "index.html")
  if (existsSync(esHome)) {
    const src = readFileSync(esHome, "utf8")
    expect(src).toContain('href="/llms.es.txt"')
    expect(src).not.toContain('href="/llms.txt"')
  }
  const enHome = join(dist, "en", "index.html")
  if (existsSync(enHome)) {
    const src = readFileSync(enHome, "utf8")
    expect(src).toContain('href="/llms.txt"')
    expect(src).not.toContain('href="/llms.es.txt"')
  }
})

// Los dos briefs para modelos declaran cifras y rutas del producto. Si el
// árbol crece y el brief no, un modelo cita un catálogo que ya no existe:
// este guardián ata las cifras al árbol y las salas a rooms.ts.
test("llms briefs quote the real tree, the eleven rooms and both alternates", async () => {
  const { rooms } = await import("../www/src/lib/rooms.ts")
  const { PROVIDER_PRESETS } = await import("../lib/presets.ts")

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
  const packs = readdirSync(join(ROOT, "packs"), { withFileTypes: true }).filter(
    (e) => e.isDirectory() && !e.name.startsWith("."),
  ).length

  for (const [name, roomPrefix, other] of [
    ["llms.es.txt", "/salas/", "/llms.txt"],
    ["llms.txt", "/en/rooms/", "/llms.es.txt"],
  ] as const) {
    const brief = readFileSync(join(WWW, "public", name), "utf8")
    // La cifra se ata al árbol, la redacción queda libre: "22 presets" y
    // "22 provider presets" valen igual, un 21 obsoleto no.
    const quotes = (n: number, noun: string) => new RegExp(`\\b${n} (?:\\w+ ){0,2}${noun}\\b`)
    expect(brief, `${name}: packs`).toMatch(quotes(packs, "packs"))
    expect(brief, `${name}: skills`).toMatch(quotes(skills, "skills"))
    expect(brief, `${name}: prompts`).toMatch(quotes(prompts, "prompts"))
    expect(brief, `${name}: presets`).toMatch(quotes(PROVIDER_PRESETS.length, "presets"))
    // Cada sala aparece con su ruta real, la que genera getStaticPaths.
    for (const room of rooms) expect(brief, `${name}: ${room.id}`).toContain(`${roomPrefix}${room.id}`)
    // Cada brief remite al otro idioma y ninguno promete npm todavía.
    expect(brief, name).toContain(other)
    expect(brief, name).not.toContain("—")
  }
})
})
