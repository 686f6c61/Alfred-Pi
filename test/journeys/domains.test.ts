import { test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"
import { discoverDomains } from "../../lib/domains.ts"

// Human journeys over the domains screen with the packs of the real repo
// (discoverDomains resolves the repo root from the extension dir, not from
// ctx.cwd). Every write stays inside the temp agent dir: agent-scope
// symlinks and domains.json. Zero network, zero shell.

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

function readDomainsState(): { enabled: Record<string, { scope?: string }> } {
  const file = join(agent.dataDir, "domains.json")
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf-8")) as { enabled: Record<string, { scope?: string }> }) : { enabled: {} }
}

test("domains: Back and Esc leave without touching anything", async () => {
  const { domainsScreen } = await loadScreens()
  for (const escape of ["back", undefined]) {
    const scripted = new ScriptedUi({ picks: [escape] })
    const fakePi = makeFakePi()
    const ctx = makeJourneyCtx({ ui: scripted.ui })
    await domainsScreen(fakePi.pi as never, ctx as never)
    expect(scripted.customCalls).toBe(1)
    expect(fakePi.execCalls).toEqual([])
    expect(readDomainsState().enabled).toEqual({})
  }
})

test("domains: enable a real repo pack globally, then Esc out", async () => {
  const { domainsScreen } = await loadScreens()
  const domains = discoverDomains()
  expect(domains.length).toBeGreaterThan(0)
  const id = domains[0]!.manifest.id

  const scripted = new ScriptedUi({ picks: [`domain:${id}`, "enable-agent", undefined, "back"] })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })
  await domainsScreen(fakePi.pi as never, ctx as never)

  // menu, action, enabled-viewer, menu again
  expect(scripted.customCalls).toBe(4)
  // The pack is recorded as enabled with agent scope in the sandbox.
  expect(readDomainsState().enabled[id]?.scope).toBe("agent")
  expect(fakePi.execCalls).toEqual([])
})

test("domains: disable with confirm false keeps the pack enabled", async () => {
  const { domainsScreen } = await loadScreens()
  const id = discoverDomains()[0]!.manifest.id

  const scripted = new ScriptedUi({
    picks: [`domain:${id}`, "enable-agent", undefined, `domain:${id}`, "disable", "back"],
    confirms: [false],
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })
  await domainsScreen(fakePi.pi as never, ctx as never)

  expect(readDomainsState().enabled[id]?.scope).toBe("agent")
  expect(fakePi.execCalls).toEqual([])
})

test("domains: disable with confirm true removes the record", async () => {
  const { domainsScreen } = await loadScreens()
  const id = discoverDomains()[0]!.manifest.id

  const scripted = new ScriptedUi({
    picks: [`domain:${id}`, "enable-agent", undefined, `domain:${id}`, "disable", undefined, "back"],
    confirms: [true],
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })
  await domainsScreen(fakePi.pi as never, ctx as never)

  // The disabled-viewer ran and the record is gone.
  expect(scripted.customCalls).toBe(7)
  expect(readDomainsState().enabled[id]).toBeUndefined()
  expect(fakePi.execCalls).toEqual([])
})
