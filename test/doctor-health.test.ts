import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getPaths, type ModelsFile } from "../lib/config-io.ts"
import { summarizeHealth, loadRecentHealth, appendHealth, runDoctor, probeTargets, type HealthEntry } from "../lib/doctor.ts"

// Doctor health-history coverage: pure aggregation and parsing as green
// characterization, plus the 0600 + retention contract for health.jsonl
// that is red until the implementation lands.

let dir: string
const realFetch = globalThis.fetch

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi686-health-"))
})

afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(dir, { recursive: true, force: true })
})

test("summarizeHealth_uses_only_ok_samples", () => {
  const entries: HealthEntry[] = [
    { at: "t1", provider: "p", ok: true, latencyMs: 100, error: null },
    { at: "t2", provider: "p", ok: true, latencyMs: 200, error: null },
    { at: "t3", provider: "p", ok: false, latencyMs: null, error: "boom" },
  ]
  const s = summarizeHealth(entries)
  expect(s).toHaveLength(1)
  expect(s[0]!.samples).toBe(3)
  expect(s[0]!.successRate).toBeCloseTo(2 / 3)
  // Latency averaging ignores failed probes and null latencies.
  expect(s[0]!.avgLatencyMs).toBe(150)
  expect(s[0]!.ok).toBe(false)
  expect(s[0]!.lastError).toBe("boom")
})

test("loadRecentHealth_ignores_corrupt_lines", () => {
  const paths = getPaths(dir)
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(
    join(paths.dataDir, "health.jsonl"),
    [
      "{not json",
      JSON.stringify({ at: "t1", provider: "p", ok: true, latencyMs: 5, error: null }),
      "",
      JSON.stringify({ at: "t2", provider: "q", ok: false, latencyMs: null, error: "x" }),
    ].join("\n") + "\n",
  )
  const entries = loadRecentHealth(200, paths)
  expect(entries).toHaveLength(2)
  expect(entries[0]!.provider).toBe("p")
  expect(entries[1]!.provider).toBe("q")
})

test("runDoctor_offline_no_io", async () => {
  const paths = getPaths(dir)
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls++
    throw new Error("no network in tests")
  }) as unknown as typeof fetch

  const report = await runDoctor(paths, { liveness: false })

  // Static-only sweep: no network, no liveness results, no health file.
  expect(fetchCalls).toBe(0)
  expect(report.checkedAt).toBeTruthy()
  expect(report.liveness).toEqual([])
  expect(existsSync(join(paths.dataDir, "health.jsonl"))).toBe(false)
})

test("probeTargets_filters_without_baseUrl", () => {
  const models: ModelsFile = {
    providers: {
      full: { baseUrl: "https://full.example/v1", api: "openai-completions", apiKey: "k" },
      nobase: { api: "openai-completions" },
      noapi: { baseUrl: "https://noapi.example/v1" },
    },
  }
  const targets = probeTargets(models, {})
  expect(targets.map((t) => t.provider)).toEqual(["full"])
  expect(targets[0]!.apiKey).toBe("k")
  expect(targets[0]!.baseUrl).toBe("https://full.example/v1")
})

test("health_jsonl_0600_and_retention", () => {
  const paths = getPaths(dir)
  appendHealth([{ provider: "p", ok: true, latencyMs: 12, error: null }], paths)
  const file = join(paths.dataDir, "health.jsonl")
  expect(existsSync(file)).toBe(true)
  // Health history holds provider names and error text: owner-only mode.
  expect(statSync(file).mode & 0o777).toBe(0o600)

  // Retention: repeated sweeps must keep the file bounded (audit D7-H03
  // showed every append staying forever) while the newest samples survive.
  const entry = { provider: "p", ok: true, latencyMs: 5, error: null }
  for (let i = 0; i < 40; i++) {
    appendHealth(
      Array.from({ length: 50 }, () => ({ ...entry })),
      paths,
    )
  }
  appendHealth([{ provider: "newest", ok: true, latencyMs: 1, error: null }], paths)

  const lines = readFileSync(file, "utf-8").split("\n").filter(Boolean)
  expect(lines.length).toBeLessThanOrEqual(2000)
  expect(loadRecentHealth(1, paths)[0]!.provider).toBe("newest")
})
