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

test("scan_skips_entries_without_key_or_with_unusable_url", () => {
  const home = fakeHome({
    auth: JSON.stringify({
      "nvidia-free": { type: "api", key: "nv-key-123456789" },   // sin baseURL utilizable
      "empty": { type: "api", key: "" },                          // sin clave
    }),
    config: JSON.stringify({ provider: { "nvidia-free": { options: { baseURL: "notaurl" } } } }),
  })
  try {
    expect(scanOpencodeSources(home)).toHaveLength(0)
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
