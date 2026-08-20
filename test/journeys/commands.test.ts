import { test, expect, beforeEach, afterEach } from "bun:test"
import { ScriptedUi, makeJourneyCtx, makeFakePi, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Command-contract journey: every command registered by index.ts gets its
// handler invoked. With a scripted ui the person leaves right away (Esc on
// the first menu or viewer); without a ui every handler must return
// quietly; print mode reports go to stdout. No network, no pi exec.

type CommandDef = { description: string; handler: (args: string, ctx: unknown) => Promise<void> }
type IndexModule = typeof import("../../index.ts")

let indexMod: IndexModule | undefined
async function loadIndex(): Promise<IndexModule> {
  indexMod ??= await import("../../index.ts")
  return indexMod
}

const COMMANDS = [
  "providers",
  "providers:doctor",
  "profile",
  "domains",
  "essentials",
  "usage",
  "ollama",
  "autopilot",
  "packages",
  "stack",
  "persona",
] as const

let agent: ReturnType<typeof useTempAgentDir>
const realFetch = globalThis.fetch
const realStdoutWrite = process.stdout.write.bind(process.stdout)

beforeEach(() => {
  agent = useTempAgentDir()
  // Offline for everything: doctor probes, ollama's local server and the
  // update check all degrade gracefully instead of reaching the network.
  globalThis.fetch = (async () => {
    throw new Error("no network in tests")
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  agent.restore()
})

/** Register the plugin and return the handlers by command name. */
async function registeredCommands(): Promise<{ commands: Record<string, CommandDef>; fakePi: ReturnType<typeof makeFakePi> }> {
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
  return { commands, fakePi }
}

test("commands: all 11 registered, each handler runs and lets the person leave", async () => {
  const { commands, fakePi } = await registeredCommands()
  expect(Object.keys(commands).filter((c) => COMMANDS.includes(c as (typeof COMMANDS)[number]))).toHaveLength(11)

  // Leaving script per command: the first ui.custom/select answer is the
  // exit (Esc on the menu, close on the viewer, undefined on the select).
  const leaveScripts: Record<string, ScriptedUi> = {
    providers: new ScriptedUi({ picks: [undefined] }),
    "providers:doctor": new ScriptedUi({ picks: [undefined] }),
    profile: new ScriptedUi({ picks: [undefined] }),
    domains: new ScriptedUi({ picks: [undefined] }),
    essentials: new ScriptedUi({ picks: [undefined] }),
    usage: new ScriptedUi({ picks: [undefined] }),
    ollama: new ScriptedUi({ picks: [undefined] }),
    autopilot: new ScriptedUi({ picks: [undefined] }),
    packages: new ScriptedUi({ picks: [undefined] }),
    stack: new ScriptedUi({ picks: [undefined] }),
    persona: new ScriptedUi({ selects: [undefined] }),
  }

  for (const name of COMMANDS) {
    const scripted = leaveScripts[name]!
    const ctx = makeJourneyCtx({ ui: scripted.ui, mode: "tui" })
    // Must resolve without throwing even when backend calls fail offline.
    await commands[name]!.handler("", ctx)
  }

  // The whole sweep ran zero real installs and zero model switches.
  expect(fakePi.execCalls).toEqual([])
  expect(fakePi.setModelCalls).toEqual([])
})

test("commands: without ctx.ui every handler returns quietly", async () => {
  const { commands } = await registeredCommands()
  for (const name of COMMANDS) {
    // tui mode without ui: the guards must short-circuit, never throw.
    await commands[name]!.handler("", { mode: "tui" })
  }
})

test("commands: print mode reports for providers:doctor and usage", async () => {
  const { commands, fakePi } = await registeredCommands()

  for (const name of ["providers:doctor", "usage"] as const) {
    const chunks: string[] = []
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as unknown as typeof process.stdout.write
    try {
      await commands[name]!.handler("", { mode: "print" })
    } finally {
      process.stdout.write = realStdoutWrite
    }
    const out = chunks.join("")
    expect(out).toContain(name === "usage" ? "Alfred-Pi usage" : "Alfred-Pi doctor")
    expect(fakePi.execCalls).toEqual([])
  }
})
