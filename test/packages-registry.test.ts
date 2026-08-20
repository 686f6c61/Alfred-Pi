import { test, expect, afterEach } from "bun:test"
import { packageDetail, packageDownloads } from "../lib/packages-registry.ts"

// A-TST-11 characterization of the npm registry access layer: repository
// resolution shapes and network-failure behavior. All fetches are mocked;
// no network is touched.

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function mockFetchJson(handler: (url: string, init?: RequestInit) => { status: number; body: string }): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = handler(String(input), init)
    return new Response(r.body, { status: r.status })
  }) as typeof fetch
}

test("packageDetail_resolves_repository", async () => {
  let seenUrl = ""
  mockFetchJson((url) => {
    seenUrl = url
    return {
      status: 200,
      body: JSON.stringify({
        "dist-tags": { latest: "2.0.0" },
        versions: {
          "2.0.0": {
            description: "a pi package",
            homepage: "https://example.com",
            repository: { url: "git+https://github.com/user/pkg.git" },
            license: "MIT",
          },
        },
        readme: "<h1>hello</h1><p>world</p>",
      }),
    }
  })
  const d = await packageDetail("example-pkg")
  expect(seenUrl).toContain("registry.npmjs.org/example-pkg")
  expect(d?.version).toBe("2.0.0")
  // Repository as { url } must resolve to the url string.
  expect(d?.repository).toBe("git+https://github.com/user/pkg.git")
  expect(d?.license).toBe("MIT")
  // Plain-string repositories resolve as-is.
  mockFetchJson(() => ({
    status: 200,
    body: JSON.stringify({
      "dist-tags": { latest: "1.0.0" },
      versions: { "1.0.0": { repository: "https://github.com/user/plain" } },
    }),
  }))
  const d2 = await packageDetail("plain-pkg")
  expect(d2?.repository).toBe("https://github.com/user/plain")
})

test("packageDownloads_network_failure", async () => {
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED weird pipe")
  }) as typeof fetch
  // Must resolve to undefined, never throw.
  const n = await packageDownloads("example-pkg")
  expect(n).toBeUndefined()
})
