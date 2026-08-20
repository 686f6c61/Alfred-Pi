import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scanSources, auditNpmPackage, auditGitSource } from "../lib/pkg-audit.ts"
import { ollamaRm, ollamaPull } from "../lib/ollama.ts"

// Line-coverage companions for lib/pkg-audit.ts and lib/ollama.ts: spawn
// findings next to network code, the unpkg meta shapes and failure modes,
// the git-source allowlist edges (no clone ever happens) and the fetch-throw
// branches of the ollama client. All network access is a counting mock.

const realFetch = globalThis.fetch
let fetchLog: string[] = []

interface MockRes {
  ok: boolean
  status: number
  text: () => Promise<string>
}

/** fetch mock keyed by URL substring; unmatched requests fail the test. */
function mockFetch(routes: Array<[string, () => MockRes | Promise<MockRes>]>): void {
  fetchLog = []
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    fetchLog.push(url)
    for (const [needle, make] of routes) {
      if (url.includes(needle)) return (await make()) as unknown as Response
    }
    throw new Error(`unexpected fetch in test: ${url}`)
  }) as unknown as typeof fetch
}

const okText = (body: string): MockRes => ({ ok: true, status: 200, text: async () => body })
const notFound = (): MockRes => ({ ok: false, status: 404, text: async () => "" })

beforeEach(() => {
  fetchLog = []
})
afterEach(() => {
  globalThis.fetch = realFetch
})

test("scanSources separates risky from safe spawns next to network code", () => {
  const risky = scanSources({
    "risky.ts": `import { execSync } from "node:child_process"
const cfg = await fetch("https://x.example/cfg")
execSync("python payload.py")
`,
  })
  expect(risky.findings.some((f) => f.severity === "high" && f.reason.includes("spawns processes"))).toBe(true)

  const safe = scanSources({
    "safe.ts": `import { execSync } from "node:child_process"
const cfg = await fetch("https://x.example/cfg")
execSync("git")
`,
  })
  expect(safe.findings.some((f) => f.severity === "info" && f.reason.includes("process-inspection"))).toBe(true)
})

test("auditNpmPackage walks nested unpkg meta trees", async () => {
  mockFetch([
    ["registry.npmjs.org/nested", () => okText(JSON.stringify({ version: "2.0.0", dist: { integrity: "sha512-n" } }))],
    ["?meta", () =>
      okText(
        JSON.stringify({
          version: "2.0.0",
          files: [{ path: "/dist", type: "directory", files: [{ path: "/dist/index.ts", size: 30 }] }],
        }),
      )],
    ["/package.json", () => okText(JSON.stringify({ name: "nested", version: "2.0.0" }))],
    ["unpkg.com/nested@2.0.0/dist/index.ts", () => okText("export const fine = 1\n")],
  ])
  const r = await auditNpmPackage("nested")
  expect(r.ok).toBe(true)
  expect(r.filesScanned).toBe(2)
})

test("auditNpmPackage reports identity and unpkg failures", async () => {
  // Registry answers 200 with a non-JSON body: identity parsing throws.
  mockFetch([["registry.npmjs.org/badjson", () => okText("totally not json")]])
  const badJson = await auditNpmPackage("badjson")
  expect(badJson.error).toBe("package identity could not be resolved")

  // unpkg meta 404: package not reachable.
  mockFetch([
    ["registry.npmjs.org/ghost", () => okText(JSON.stringify({ version: "1.0.0", dist: { integrity: "sha512-g" } }))],
    ["?meta", notFound],
  ])
  const ghost = await auditNpmPackage("ghost")
  expect(ghost.error).toContain("package not reachable on unpkg")

  // unpkg meta 200 with a non-JSON payload.
  mockFetch([
    ["registry.npmjs.org/weird", () => okText(JSON.stringify({ version: "1.0.0", dist: { integrity: "sha512-w" } }))],
    ["?meta", () => okText("<html>nope</html>")],
  ])
  const weird = await auditNpmPackage("weird")
  expect(weird.error).toBe("unpkg returned an unexpected payload")
})

test("auditNpmPackage skips oversized files and odd package.json bodies", async () => {
  // Declared file size beyond MAX_BYTES: the source is skipped before fetch.
  mockFetch([
    ["registry.npmjs.org/chunky", () => okText(JSON.stringify({ version: "1.0.0", dist: { integrity: "sha512-c" } }))],
    ["?meta", () => okText(JSON.stringify({ version: "1.0.0", files: [{ path: "/big.ts", size: 2_000_000 }] }))],
    ["/package.json", () => okText(JSON.stringify({ version: "1.0.0" }))],
  ])
  const chunky = await auditNpmPackage("chunky")
  expect(chunky.filesSkipped).toContain("big.ts")
  expect(fetchLog.some((u) => u.includes("/big.ts"))).toBe(false)

  // package.json valid JSON but not an object.
  mockFetch([
    ["registry.npmjs.org/scalar", () => okText(JSON.stringify({ version: "1.0.0", dist: { integrity: "sha512-s" } }))],
    ["?meta", () => okText(JSON.stringify({ version: "1.0.0", files: [{ path: "/index.ts", size: 20 }] }))],
    ["unpkg.com/scalar@1.0.0/index.ts", () => okText("export const a = 1\n")],
    ["/package.json", () => okText('"just-a-string"')],
  ])
  const scalar = await auditNpmPackage("scalar")
  expect(scalar.filesSkipped).toContain("package.json")

  // package.json invalid JSON.
  mockFetch([
    ["registry.npmjs.org/broken", () => okText(JSON.stringify({ version: "1.0.0", dist: { integrity: "sha512-b" } }))],
    ["?meta", () => okText(JSON.stringify({ version: "1.0.0", files: [{ path: "/index.ts", size: 20 }] }))],
    ["unpkg.com/broken@1.0.0/index.ts", () => okText("export const a = 1\n")],
    ["/package.json", () => okText("{ nope")],
  ])
  const broken = await auditNpmPackage("broken")
  expect(broken.filesSkipped).toContain("package.json")
})

test("auditGitSource accepts only well-formed remote urls (no clone here)", async () => {
  // "ssh:///x" parses but has no hostname; "https://" does not parse at
  // all. Both fall out of the allowlist before any git subprocess runs.
  const hostless = await auditGitSource("ssh:///x")
  expect(hostless.error).toBe("unsupported git source")
  const unparseable = await auditGitSource("https://")
  expect(unparseable.error).toBe("unsupported git source")
})

test("auditGitSource tolerates unreadable subdirectories and missing package.json", async () => {
  const repo = mkdtempSync(join(tmpdir(), "pi686-git-locked-"))
  try {
    mkdirSync(join(repo, "lib"), { recursive: true })
    writeFileSync(join(repo, "lib", "index.ts"), "export const fine = 1\n")
    // Locked subdirectory: the file walk records nothing for it but keeps
    // scanning the rest of the tree.
    mkdirSync(join(repo, "locked"), { recursive: true })
    writeFileSync(join(repo, "locked", "secret.ts"), "export const s = 1\n")
    chmodSync(join(repo, "locked"), 0o000)
    // No package.json on purpose: the version falls back to "git".

    const audit = await auditGitSource(repo)
    expect(audit.ok).toBe(true)
    expect(audit.version).toBe("git")
    expect(audit.filesScanned).toBe(1)
  } finally {
    chmodSync(join(repo, "locked"), 0o755)
    rmSync(repo, { recursive: true, force: true })
  }
})

test("ollama client maps fetch rejections to error results", async () => {
  globalThis.fetch = (async () => {
    throw new Error("connection refused")
  }) as unknown as typeof fetch

  const rm = await ollamaRm("http://127.0.0.1:11434", "llama3.2")
  expect(rm.ok).toBe(false)
  expect(rm.error).toBe("connection refused")

  const pull = await ollamaPull("http://127.0.0.1:11434", "llama3.2", () => {})
  expect(pull.ok).toBe(false)
  expect(pull.error).toBe("connection refused")
})
