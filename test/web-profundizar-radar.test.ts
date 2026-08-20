import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectDomain, detectDomainFull } from "../lib/autopilot.ts"
import { discoverDomains } from "../lib/domains.ts"

const root = join(import.meta.dir, "..")

function domains() {
  return discoverDomains(root)
}

test("eleven_packs_remain", () => {
  expect(domains().map((d) => d.manifest.id).sort()).toHaveLength(11)
})

test("runtime_prompts_land_on_web_fullstack", () => {
  const d = domains()
  expect(detectDomain("revisa los handlers de fastapi", d)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("el job de celery reintenta sin idempotencia", d)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("arregla el endpoint de asp.net core", d)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("revisa el controller de C#", d)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("migra con entity framework", d)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("mide el LCP con chrome devtools", d)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("usa cdp para ver la consola", d)?.domain.manifest.id).toBe("web-fullstack")
  expect(detectDomain("haz capturas de pantalla del flujo de alta", d)?.domain.manifest.id).toBe("web-fullstack")
})

test("documented_tie_hangfire_produccion_stays_devops", () => {
  const hit = detectDomain("hangfire falla en producción", domains())
  expect(hit?.domain.manifest.id).toBe("devops-infra")
  expect(hit?.score).toBe(2)
})

test("landing_hero_captura_does_not_move_to_web", () => {
  expect(detectDomain("haz una captura del hero", domains())?.domain.manifest.id).toBe("landing-design")
})

test("seo_stays_on_landing_design", () => {
  expect(detectDomain("arregla el seo de la landing", domains())?.domain.manifest.id).toBe("landing-design")
})

test("capital_letters_still_not_web", () => {
  expect(detectDomain("capital letters test", domains())?.domain.manifest.id).not.toBe("web-fullstack")
})

test("astro_prompt_still_web", () => {
  expect(detectDomain("islas de astro y content collections", domains())?.domain.manifest.id).toBe("web-fullstack")
})

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "pi686-web-hints-"))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

test("hint_pyproject_and_csproj_and_slnx_select_web", () => {
  const d = domains()
  writeFileSync(join(cwd, "pyproject.toml"), "[project]\nname='x'\n")
  expect(detectDomainFull("hello there", d, { cwd })?.domain.manifest.id).toBe("web-fullstack")
})

test("hint_slnx_selects_web", () => {
  writeFileSync(join(cwd, "App.slnx"), "<Solution></Solution>\n")
  expect(detectDomainFull("hello there", domains(), { cwd })?.domain.manifest.id).toBe("web-fullstack")
})

test("hint_src_csproj_selects_web", () => {
  mkdirSync(join(cwd, "src"))
  writeFileSync(join(cwd, "src", "Api.csproj"), "<Project></Project>\n")
  expect(detectDomainFull("hello there", domains(), { cwd })?.domain.manifest.id).toBe("web-fullstack")
})

test("playwright_config_hint_stays_qa_not_web", () => {
  writeFileSync(join(cwd, "playwright.config.ts"), "export default {}\n")
  expect(detectDomainFull("hello there", domains(), { cwd })?.domain.manifest.id).toBe("qa-testing")
})
