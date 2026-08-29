import { test, expect } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { locateOpencode, maskKey, scanOpencodeSources } from "../lib/import-sources.ts"

// N-ONB-IMP: las claves ya viven en el disco (OpenCode). El escáner las
// encuentra, las casa con presets cuando existen y ofrece custom con su
// baseURL. Sin clave o sin URL utilizable: no se ofrece. Nunca lanza.

function fakeHome(files: { auth?: string; config?: string }): string {
  const home = join(tmpdir(), `pi686-imp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(home, ".local", "share", "opencode"), { recursive: true })
  mkdirSync(join(home, ".config", "opencode"), { recursive: true })
  if (files.auth !== undefined) writeFileSync(join(home, ".local", "share", "opencode", "auth.json"), files.auth)
  if (files.config !== undefined) writeFileSync(join(home, ".config", "opencode", "opencode.json"), files.config)
  return home
}

function cleanup(home: string): void {
  rmSync(home, { recursive: true, force: true })
}

test("maskKey_shows_prefix_and_length", () => {
  expect(maskKey("sk-1234567890abcdef")).toBe("sk-1234… (19 chars)")
  expect(maskKey("")).toBe("(vacía)")
})

test("scan_maps_known_providers_to_presets", () => {
  const home = fakeHome({
    auth: JSON.stringify({
      "zai-coding-plan": { type: "api", key: "zl-key-1234567890" },
      "kimi-for-coding": { type: "api", key: "sk-kimi-abcdefg" },
      "ollama-cloud": { type: "api", key: "oc-key-9876543210" },
    }),
    config: "{}",
  })
  try {
    const items = scanOpencodeSources(home)
    const byId = new Map(items.map((i) => [i.sourceId, i]))
    expect(byId.get("zai-coding-plan")?.kind).toBe("preset")
    expect(byId.get("zai-coding-plan")?.presetId).toBe("zai-coding")
    expect(byId.get("zai-coding-plan")?.baseUrl).toContain("api.z.ai/api/coding")
    expect(byId.get("kimi-for-coding")?.presetId).toBe("moonshot-kimi-anthropic")
    expect(byId.get("ollama-cloud")?.presetId).toBe("ollama-cloud")
    expect(byId.get("ollama-cloud")?.baseUrl).toBe("https://ollama.com/v1")
  } finally {
    cleanup(home)
  }
})

test("scan_offers_unknown_providers_as_custom_with_their_base_url", () => {
  const home = fakeHome({
    auth: JSON.stringify({ "nan": { type: "api", key: "sk-fIqv-source-9" } }),
    config: JSON.stringify({ provider: { nan: { options: { baseURL: "https://api.nan.builders/v1" } } } }),
  })
  try {
    const items = scanOpencodeSources(home)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe("custom")
    expect(items[0].baseUrl).toBe("https://api.nan.builders/v1")
    expect(items[0].keyMasked).toContain("…")
  } finally {
    cleanup(home)
  }
})

test("scan_offers_unknown_without_url_with_a_guided_suggestion", () => {
  const home = fakeHome({
    auth: JSON.stringify({
      "opencode-go": { type: "api", key: "sk-zen-1234567890" },  // sin baseURL: se pide, con sugerencia
      "empty": { type: "api", key: "" },                          // sin clave: no se ofrece
    }),
    config: "{}",
  })
  try {
    const items = scanOpencodeSources(home)
    expect(items).toHaveLength(1)
    expect(items[0].sourceId).toBe("opencode-go")
    expect(items[0].baseUrl).toBeUndefined()
    expect(items[0].suggestedUrl).toBe("https://opencode.ai/zen/v1")
  } finally {
    cleanup(home)
  }
})

test("scan_tolerates_broken_or_missing_files", () => {
  const missing = fakeHome({})
  try {
    expect(scanOpencodeSources(missing)).toEqual([])
  } finally {
    cleanup(missing)
  }
  const broken = fakeHome({ auth: "{not json", config: "]]]" })
  try {
    expect(scanOpencodeSources(broken)).toEqual([])
  } finally {
    cleanup(broken)
  }
})

test("locate_paths_are_the_canonical_opencode_ones", () => {
  const { auth, config } = locateOpencode("/home/test")
  expect(auth).toBe(join("/home/test", ".local", "share", "opencode", "auth.json"))
  expect(config).toBe(join("/home/test", ".config", "opencode", "opencode.json"))
})

test("scan_find_the_windows_layout_appdata_roaming", () => {
  // En Windows OpenCode puede vivir bajo AppData/Roaming, no en XDG.
  const home = join(tmpdir(), `pi686-imp-win-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(home, "AppData", "Roaming", "opencode"), { recursive: true })
  writeFileSync(join(home, "AppData", "Roaming", "opencode", "auth.json"), JSON.stringify({ "zai-coding-plan": { type: "api", key: "zl-win-123456789" } }))
  try {
    const items = scanOpencodeSources(home)
    expect(items).toHaveLength(1)
    expect(items[0].presetId).toBe("zai-coding")
    expect(items[0].keyMasked).toContain("…")
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("scan_merges_split_locations_auth_in_xdg_baseurl_in_appdata", () => {
  // Instalación mixta: la clave quedó en XDG y la baseURL vive en AppData.
  const home = join(tmpdir(), `pi686-imp-mix-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(home, ".local", "share", "opencode"), { recursive: true })
  mkdirSync(join(home, "AppData", "Roaming", "opencode"), { recursive: true })
  writeFileSync(join(home, ".local", "share", "opencode", "auth.json"), JSON.stringify({ "nan": { type: "api", key: "sk-nan-key-777" } }))
  writeFileSync(join(home, "AppData", "Roaming", "opencode", "opencode.json"), JSON.stringify({ provider: { "nan": { options: { baseURL: "https://api.nan.builders/v1" } } } }))
  try {
    const items = scanOpencodeSources(home)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe("custom")
    expect(items[0].baseUrl).toBe("https://api.nan.builders/v1")
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
