import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { onboardingFlow } from "../lib/onboarding-flow.ts"
import { PROVIDER_PRESETS } from "../lib/presets.ts"

// Line-coverage companions for approveCredentialOrigin inside
// lib/onboarding-flow.ts, driven through the real wizard. The only stock
// preset without a credentialPolicy is custom-openai (http loopback), so
// these journeys cover the loopback approval and its decline. fetch stays
// mocked; nothing touches the network.

const realFetch = globalThis.fetch
let agentDir: string

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi686-origins-"))
  globalThis.fetch = (async (): Promise<Response> => {
    return { ok: true, status: 200, json: async () => ({ data: [{ id: "m1" }] }) } as unknown as Response
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  rmSync(agentDir, { recursive: true, force: true })
})

function scriptedUi(script: { select: number[]; input: string[]; confirm: boolean[] }): { ui: unknown; notifications: string[] } {
  const queues = { select: [...script.select], input: [...script.input], confirm: [...script.confirm] }
  const notifications: string[] = []
  const take = <T>(q: T[], what: string): T => {
    if (q.length === 0) throw new Error(`unexpected ${what} dialog`)
    return q.shift() as T
  }
  return {
    notifications,
    ui: {
      select: async () => take(queues.select, "select"),
      input: async () => take(queues.input, "input"),
      confirm: async () => take(queues.confirm, "confirm"),
      notify: async (message: string) => {
        notifications.push(message)
      },
      setStatus: async () => {},
    },
  }
}

const CUSTOM_OPENAI = PROVIDER_PRESETS.findIndex((p) => p.id === "custom-openai")

async function run(ui: unknown): Promise<void> {
  await onboardingFlow(undefined as never, { ui } as never, { agentDir, repoRoot: agentDir })
}

test("approveCredentialOrigin_approves_http_loopback_and_writes_policy", async () => {
  expect(CUSTOM_OPENAI).toBeGreaterThanOrEqual(0)
  // Approve the loopback origin, then accept the config write (and decline
  // autopilot + budget): the written models.json must carry the
  // allowInsecureLoopback policy for the exact localhost origin.
  const { ui } = scriptedUi({ select: [2, 2], input: ["sk-lab"], confirm: [true, true, false, false] })
  await run(ui)

  const models = JSON.parse(await Bun.file(join(agentDir, "models.json")).text()) as {
    providers: Record<string, { credentialPolicy?: { authorizedOrigin: string; allowInsecureLoopback?: boolean } }>
  }
  expect(models.providers["custom-openai"]!.credentialPolicy).toEqual({
    authorizedOrigin: "http://localhost:8000",
    allowInsecureLoopback: true,
  })
})

test("approveCredentialOrigin_declined_stops_the_flow_before_writing", async () => {
  const { ui, notifications } = scriptedUi({ select: [2, 2], input: ["sk-lab"], confirm: [false] })
  await run(ui)
  expect(notifications).toContain("Asistente diferido; no se autorizó ni se escribió la credencial.")
  expect(existsSync(join(agentDir, "models.json"))).toBe(false)
  expect(existsSync(join(agentDir, "auth.json"))).toBe(false)
})

test("approveCredentialOrigin_rejects_hostile_base_urls", async () => {
  // The stock presets never carry a hostile baseUrl, so the guard branches
  // (invalid URL, embedded userinfo, plain http origin) are exercised by
  // pointing the real in-memory preset at hostile values and restoring it.
  const preset = PROVIDER_PRESETS[CUSTOM_OPENAI]!
  const realBaseUrl = preset.baseUrl
  const cases: Array<[string, RegExp]> = [
    ["not a url at all", /La URL base no es válida/],
    ["https://user:secret@api.example.com/v1", /La URL base no puede contener credenciales/],
    ["http://api.example.com/v1", /Las credenciales requieren HTTPS o un loopback HTTP aprobado expresamente/],
  ]
  try {
    for (const [hostile, message] of cases) {
      preset.baseUrl = hostile
      const { ui, notifications } = scriptedUi({ select: [2, 2], input: ["sk-lab"], confirm: [] })
      await run(ui)
      expect(notifications.some((n) => message.test(n))).toBe(true)
      expect(existsSync(join(agentDir, "models.json"))).toBe(false)
    }
  } finally {
    preset.baseUrl = realBaseUrl
  }
})
