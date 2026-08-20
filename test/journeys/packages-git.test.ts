import { test, expect, beforeEach, afterEach } from "bun:test"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Jornada Git de /packages: una fuente hostil falla antes de clonar. El
// estado fallido se muestra y nunca llega a pi install.

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch

beforeEach(() => {
  agent = useTempAgentDir()
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

test("packages: una auditoría Git fallida no instala", async () => {
  const { packagesScreen } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "git", // browser menu: install from git
      undefined, // close the audit viewer
      "back", // leave
    ],
    inputs: ["--upload-pack=evil"], // rejected by the auditor before cloning
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await packagesScreen(fakePi.pi as never, ctx as never)

  expect(fakePi.execCalls).toEqual([])
  expect(scripted.notifications.some((n) => n.kind === "error" && n.message.includes("No se instalará"))).toBe(true)
  expect(scripted.statuses.at(-1)).toEqual({ key: "alfred-audit", value: undefined })
})
