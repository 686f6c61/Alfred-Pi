import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fetchCatalog, lookupCatalog, applyCatalogToModel, parseForTest } from "../lib/catalog.ts"
import { ollamaBase, ollamaTags, ollamaPs, ollamaPull, ollamaRm, isCloudModel, toModelsEntry, registeredOllamaModels, describeOllamaModel, ensureOllamaProvider } from "../lib/ollama.ts"
import type { ModelsFile } from "../lib/config-io.ts"

const realFetch = globalThis.fetch

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-cat-"))
})
afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Catalog

test("lookupCatalog resolves provider aliases and direct ids", () => {
  const catalog = parseForTest({
    zai: { models: { "glm-5.2": { limit: { context: 200000, output: 32768 }, cost: { input: 1, output: 2 } } } },
    anthropic: { models: { "claude-x": { reasoning: true, attachment: true } } },
  })!
  expect(catalog).not.toBeNull()
  expect(lookupCatalog(catalog, "zai", "glm-5.2")?.contextWindow).toBe(200000)
  expect(lookupCatalog(catalog, "zai-glm", "glm-5.2")?.cost?.input).toBe(1)
  expect(lookupCatalog(catalog, "anthropic", "claude-x")?.vision).toBe(true)
  expect(lookupCatalog(catalog, "unknown", "glm-5.2")).toBeUndefined()
})

test("applyCatalogToModel fills only missing fields", () => {
  const meta = {
    contextWindow: 200000,
    maxTokens: 32768,
    reasoning: true,
    vision: true,
    cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 },
  }
  const { model, filled } = applyCatalogToModel({ id: "m", contextWindow: 64000 }, meta)
  expect(model.contextWindow).toBe(64000) // user value wins
  expect(model.maxTokens).toBe(32768)
  expect(model.reasoning).toBe(true)
  expect(model.input).toEqual(["text", "image"])
  expect(model.cost).toEqual(meta.cost)
  expect(filled).toContain("maxTokens")
  expect(filled).not.toContain("contextWindow")
})

test("fetchCatalog caches and survives failures", async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response(JSON.stringify({ zai: { models: { "glm-5.2": { limit: { context: 1 } } } } }), { status: 200 })
  }) as typeof fetch

  const c1 = await fetchCatalog({ dataDir: dir })
  expect(c1?.zai?.["glm-5.2"]?.contextWindow).toBe(1)
  const c2 = await fetchCatalog({ dataDir: dir })
  expect(calls).toBe(1) // served from cache

  // Network failure returns null, doesn't throw, keeps cache intact.
  globalThis.fetch = (async () => {
    throw new Error("down")
  }) as typeof fetch
  const c3 = await fetchCatalog({ dataDir: join(dir, "other") })
  expect(c3).toBeNull()
  const c4 = await fetchCatalog({ dataDir: dir })
  expect(c4?.zai?.["glm-5.2"]?.contextWindow).toBe(1)
})

// ---------------------------------------------------------------------------
// Ollama

function mockFetchJson(handler: (url: string, init?: RequestInit) => { status: number; body: string } | Response): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = handler(String(input), init)
    if (r instanceof Response) return r
    return new Response(r.body, { status: r.status })
  }) as typeof fetch
}

test("ollamaBase strips /v1 and trailing slashes", () => {
  const models = { providers: { ollama: { baseUrl: "http://127.0.0.1:11434/v1/" } } } as unknown as ModelsFile
  expect(ollamaBase(models)).toBe("http://127.0.0.1:11434")
  expect(ollamaBase({ providers: {} })).toBe("http://127.0.0.1:11434")
})

test("ollamaTags parses /api/tags", async () => {
  mockFetchJson((url) => {
    expect(url).toBe("http://127.0.0.1:11434/api/tags")
    return {
      status: 200,
      body: JSON.stringify({
        models: [
          { name: "glm-5.2:cloud", size: 1234, details: { parameter_size: "?" } },
          { name: "llama3.2:3b", size: 2_000_000_000, details: { parameter_size: "3B", quantization_level: "Q4_K_M", family: "llama" } },
          { broken: true },
        ],
      }),
    }
  })
  const { models, error } = await ollamaTags("http://127.0.0.1:11434")
  expect(error).toBeUndefined()
  expect(models.map((m) => m.name)).toEqual(["glm-5.2:cloud", "llama3.2:3b"])
  expect(models[1]!.quantization).toBe("Q4_K_M")
})

test("ollamaRm sends DELETE /api/delete with model body", async () => {
  let captured: { url: string; method?: string; body?: string } | undefined
  mockFetchJson((url, init) => {
    captured = { url, method: init?.method, body: String(init?.body) }
    return { status: 200, body: "" }
  })
  const r = await ollamaRm("http://127.0.0.1:11434", "llama3.2:3b")
  expect(r.ok).toBe(true)
  expect(captured!.url).toBe("http://127.0.0.1:11434/api/delete")
  expect(captured!.method).toBe("DELETE")
  expect(JSON.parse(captured!.body!)).toEqual({ model: "llama3.2:3b" })
})

test("cloud models get _launch; registered set works", () => {
  expect(isCloudModel("glm-5.2:cloud")).toBe(true)
  expect(isCloudModel("llama3.2:3b")).toBe(false)
  const cloud = toModelsEntry("glm-5.2:cloud") as Record<string, unknown>
  expect(cloud._launch).toBe(true)
  const local = toModelsEntry("llama3.2:3b") as Record<string, unknown>
  expect(local._launch).toBeUndefined()
  const models = { providers: { ollama: { models: [{ id: "a" }] } } } as unknown as ModelsFile
  expect(registeredOllamaModels(models)).toEqual(new Set(["a"]))
})

test("describeOllamaModel composes badges", () => {
  const line = describeOllamaModel({ name: "llama3.2:3b", sizeBytes: 2 * 1024 ** 3, parameterSize: "3B" }, true, true)
  expect(line).toContain("local")
  expect(line).toContain("3B")
  expect(line).toContain("2.0GB")
  expect(line).toContain("registered in pi")
  expect(line).toContain("running")
})

// ---------------------------------------------------------------------------
// A-TST-11: ollama server API characterization (mocked fetch).

test("ollamaPs_parses_models", async () => {
  let seenUrl = ""
  mockFetchJson((url) => {
    seenUrl = url
    return {
      status: 200,
      body: JSON.stringify({ models: [{ name: "glm-5.2:cloud" }, { name: "llama3.2:3b" }, { broken: true }, { name: "" }] }),
    }
  })
  const { names, error } = await ollamaPs("http://127.0.0.1:11434")
  expect(seenUrl).toBe("http://127.0.0.1:11434/api/ps")
  expect(error).toBeUndefined()
  // Blank and missing names are filtered out, order preserved.
  expect(names).toEqual(["glm-5.2:cloud", "llama3.2:3b"])
})

test("ollamaPull_server_error", async () => {
  mockFetchJson(() => ({ status: 500, body: "internal server error" }))
  const statuses: string[] = []
  const r = await ollamaPull("http://127.0.0.1:11434", "llama3.2:3b", (s) => statuses.push(s))
  expect(r.ok).toBe(false)
  expect(r.error).toBe("HTTP 500")
  expect(statuses).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// A-TST-19: parser validation. The catalog parser must reject (drop the
// field or the whole model, never throw) negative or extreme costs and
// limit pairs where maxTokens exceeds contextWindow. These stay RED until
// parseCatalog validates numbers instead of accepting any number.

function mockCatalog(json: unknown): void {
  globalThis.fetch = (async () => new Response(JSON.stringify(json), { status: 200 })) as typeof fetch
}

test("catalog_rejects_negative_costs", async () => {
  mockCatalog({
    zai: {
      models: {
        "clean-model": { limit: { context: 1000 } },
        "negative-cost": { cost: { input: -5, output: -0.5, cache_read: -1 } },
      },
    },
  })
  const catalog = await fetchCatalog({ dataDir: dir, force: true })
  expect(catalog).not.toBeNull()
  // The parser must keep healthy models...
  expect(catalog!.zai!["clean-model"]).toBeDefined()
  // ...and drop negative costs (field or model), not pass them through.
  const bad = catalog!.zai!["negative-cost"]
  const negatives = Object.values(bad?.cost ?? {}).filter((v) => v !== undefined && v < 0)
  expect(negatives).toHaveLength(0)
})

test("catalog_rejects_incoherent_limits", async () => {
  mockCatalog({
    zai: {
      models: {
        "sane-limits": { limit: { context: 200000, output: 32768 } },
        "inverted-limits": { limit: { context: 1000, output: 2000 } },
      },
    },
  })
  const catalog = await fetchCatalog({ dataDir: dir, force: true })
  expect(catalog).not.toBeNull()
  // Sane pairs (context > output) survive untouched...
  expect(catalog!.zai!["sane-limits"]?.contextWindow).toBe(200000)
  expect(catalog!.zai!["sane-limits"]?.maxTokens).toBe(32768)
  // ...but maxTokens greater than contextWindow is incoherent and must not
  // be accepted as a pair.
  const bad = catalog!.zai!["inverted-limits"]
  const bothAccepted = bad?.contextWindow === 1000 && bad?.maxTokens === 2000
  expect(bothAccepted).toBe(false)
})

test("catalog_rejects_extreme_costs", async () => {
  mockCatalog({
    zai: {
      models: {
        "priced-model": { cost: { input: 3, output: 15 } },
        "extreme-cost": { cost: { input: 5000, output: 99000 } },
      },
    },
  })
  const catalog = await fetchCatalog({ dataDir: dir, force: true })
  expect(catalog).not.toBeNull()
  // Normal pricing is kept...
  expect(catalog!.zai!["priced-model"]?.cost?.input).toBe(3)
  // ...but absurd USD/MTok values (here > 1000) are dropped, not stored.
  const bad = catalog!.zai!["extreme-cost"]
  const extremes = Object.values(bad?.cost ?? {}).filter((v) => v !== undefined && v > 1000)
  expect(extremes).toHaveLength(0)
})

test("ollamaProviderEntry_format", () => {
  // A-TST-07: the TUI no longer builds the ollama provider inline. The
  // extracted helper (ensureOllamaProvider; the ficha named it
  // ollamaProviderEntry) must create the exact models.json shape.
  const models: ModelsFile = { providers: {} }
  const entry = ensureOllamaProvider(models)
  expect(entry).toEqual({
    baseUrl: "http://127.0.0.1:11434/v1",
    api: "openai-completions",
    apiKey: "ollama",
    compat: { supportsDeveloperRole: false },
  })
  expect(models.providers.ollama).toBe(entry)
  // A second call must return the same object, not a replacement.
  expect(ensureOllamaProvider(models)).toBe(entry)
})
