import { test, expect, beforeEach, afterEach } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { ScriptedUi, makeJourneyCtx, makeFakePi, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Human journey: /persona through the real command registered by index.ts.
// The select handler compares the returned value as a string starting with
// the persona name (current behavior), so the script feeds "Neutral…"/
// "Alfred…" labels rather than indexes.

type CommandDef = { description: string; handler: (args: string, ctx: unknown) => Promise<void> }
type IndexModule = typeof import("../../index.ts")

let indexMod: IndexModule | undefined
async function loadIndex(): Promise<IndexModule> {
  indexMod ??= await import("../../index.ts")
  return indexMod
}

let agent: ReturnType<typeof useTempAgentDir>

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

async function runPersonaJourney(label: string): Promise<ScriptedUi> {
  const mod = await loadIndex()
  const commands: Record<string, CommandDef> = {}
  const fakePi = makeFakePi()
  const pi = {
    ...fakePi.pi,
    registerCommand: (name: string, def: CommandDef) => {
      commands[name] = def
    },
  }
  mod.default(pi as never)

  const scripted = new ScriptedUi({ selects: [label as unknown as number] })
  const ctx = makeJourneyCtx({ ui: scripted.ui })
  await commands["persona"]!.handler("", ctx)
  return scripted
}

test("persona: switch to Neutral and persist it", async () => {
  const scripted = await runPersonaJourney("Neutral - plain and direct")

  expect(scripted.notifications).toHaveLength(1)
  expect(scripted.notifications[0]!.message).toContain("Neutral")
  expect(scripted.notifications[0]!.message).not.toContain("señor")
  const state = JSON.parse(readFileSync(join(agent.dataDir, "persona.json"), "utf-8")) as { persona: string }
  expect(state.persona).toBe("none")
})

test("persona: back to Alfred, with the butler line", async () => {
  const scripted = await runPersonaJourney("Alfred - the butler")

  expect(scripted.notifications[0]!.message).toContain("Alfred")
  expect(scripted.notifications[0]!.message).toContain("Muy bien, señor.")
  const state = JSON.parse(readFileSync(join(agent.dataDir, "persona.json"), "utf-8")) as { persona: string }
  expect(state.persona).toBe("alfred")
  // Nothing else appeared in the agent dir.
  expect(existsSync(join(agent.agentDir, "models.json"))).toBe(false)
})
