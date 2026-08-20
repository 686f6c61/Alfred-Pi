/**
 * Scripted journey harness: drives the real TUI screens with a scripted
 * fake ui and a fake pi, so tests read like a person walking the menus.
 *
 * The pi runtime packages (@earendil-works/pi-tui and
 * @earendil-works/pi-coding-agent) only exist inside the pi agent, so this
 * module registers module mocks at load time. Import this helper BEFORE
 * importing lib/screens.ts (loadScreens() below does it dynamically and
 * in the right order).
 *
 * Journey contract: ui.custom NEVER invokes the component factory. The
 * factory builds a real SelectList/TextView; a journey just wants the value
 * a human would have picked, so custom returns the next scripted value.
 */
import { mock } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

mock.module("@earendil-works/pi-tui", () => ({
  SelectList: class SelectList {
    onSelect: ((item: { value: string }) => void) | undefined
    onCancel: (() => void) | undefined
    render(): string[] {
      return []
    }
    handleInput(_data: string): void {}
    invalidate(): void {}
  },
}))

mock.module("@earendil-works/pi-coding-agent", () => ({
  getSelectListTheme: () => ({}),
}))

/** Load lib/screens.ts once, after the module mocks are in place. */
type ScreensModule = typeof import("../../lib/screens.ts")
let screensMod: ScreensModule | undefined
export async function loadScreens(): Promise<ScreensModule> {
  screensMod ??= await import("../../lib/screens.ts")
  return screensMod
}

/**
 * Point PI_CODING_AGENT_DIR at a fresh temp dir so every config read and
 * write of the journey stays inside the sandbox. Call restore() when done.
 */
export function useTempAgentDir(): { agentDir: string; dataDir: string; restore(): void } {
  const agentDir = mkdtempSync(join(tmpdir(), "pi686-journey-"))
  const prev = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = agentDir
  return {
    agentDir,
    dataDir: join(agentDir, "alfred-pi"),
    restore(): void {
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR
      else process.env.PI_CODING_AGENT_DIR = prev
      rmSync(agentDir, { recursive: true, force: true })
    },
  }
}

// ---------------------------------------------------------------------------
// Scripted ui

export interface ScriptedUiScript {
  /** Values returned by ui.custom: menu pick, string[] multi-select, Esc. */
  picks?: (string | string[] | undefined)[]
  /** Answers to ui.confirm. */
  confirms?: boolean[]
  /** Answers to ui.input. */
  inputs?: string[]
  /** Answers to ui.select (index or undefined). */
  selects?: (number | undefined)[]
  /** Answers to ui.editor (edited text or undefined). */
  editors?: (string | undefined)[]
  /**
   * When true, ui.custom invokes the real component factory with stub
   * tui/theme/kb/done, renders it once and drives handleInput with the
   * scripted keys (Esc when exhausted). Off by default: journeys get the
   * scripted pick value without touching the component.
   */
  invokeFactory?: boolean
  /** Keys fed to each invoked component, in order; Esc closes anything. */
  keys?: string[]
}

export interface ScriptedNotification {
  message: string
  kind: string
}

export interface ScriptedStatus {
  key: string
  value: string | undefined
}

export class ScriptedUi {
  readonly pickQueue: (string | string[] | undefined)[]
  private readonly confirmQueue: boolean[]
  private readonly inputQueue: string[]
  private readonly selectQueue: (number | undefined)[]
  private readonly editorQueue: (string | undefined)[]
  private readonly keysQueue: string[]
  private readonly invokeFactory: boolean
  readonly notifications: ScriptedNotification[] = []
  readonly statuses: ScriptedStatus[] = []
  /** How many component factories arrived at ui.custom. */
  customCalls = 0

  constructor(script: ScriptedUiScript = {}) {
    this.pickQueue = [...(script.picks ?? [])]
    this.confirmQueue = [...(script.confirms ?? [])]
    this.inputQueue = [...(script.inputs ?? [])]
    this.selectQueue = [...(script.selects ?? [])]
    this.editorQueue = [...(script.editors ?? [])]
    this.keysQueue = [...(script.keys ?? [])]
    this.invokeFactory = script.invokeFactory ?? false
  }

  private shiftFrom<T>(queue: T[], what: string): T {
    if (queue.length === 0) throw new Error(`ScriptedUi: ${what} queue exhausted; the screen asked for more input than the script provided`)
    return queue.shift() as T
  }

  /** The ui object handed to screens. Types stay loose on purpose. */
  readonly ui = {
    custom: async (factory: unknown): Promise<unknown> => {
      this.customCalls++
      // A scripted answer (even undefined = Esc) wins; with invokeFactory
      // the real component only runs when the queue is empty, so one
      // journey can script the menu picks and still drive a component.
      if (this.pickQueue.length > 0) return this.shiftFrom(this.pickQueue, "pick/custom")
      if (!this.invokeFactory) return this.shiftFrom(this.pickQueue, "pick/custom")
      // Drive the real component: render once, then feed keys until the
      // component resolves done (Esc always does).
      return await new Promise((resolve) => {
        let settled = false
        const done = (value?: unknown): void => {
          if (!settled) {
            settled = true
            resolve(value)
          }
        }
        const component = (
          factory as (
            tui: unknown,
            theme: unknown,
            kb: unknown,
            done: (value?: unknown) => void,
          ) => { render?(width: number): string[]; handleInput(data: string): void } | undefined
        )({}, {}, {}, done)
        try {
          component?.render?.(80)
        } catch {
          // rendering must never break a journey
        }
        while (!settled) {
          const key = this.keysQueue.length > 0 ? (this.keysQueue.shift() as string) : "\x1b"
          component?.handleInput?.(key)
          if (key === "\x1b") break
        }
      })
    },
    confirm: async (_title: string, _subtitle?: string): Promise<boolean> => this.shiftFrom(this.confirmQueue, "confirm"),
    input: async (_title: string, _defaultValue?: string): Promise<string> => this.shiftFrom(this.inputQueue, "input"),
    select: async (_title: string, _items: string[]): Promise<number | undefined> => this.shiftFrom(this.selectQueue, "select"),
    editor: async (_title: string, _initial?: string): Promise<string | undefined> => this.shiftFrom(this.editorQueue, "editor"),
    notify: async (message: string, kind = "info"): Promise<void> => {
      this.notifications.push({ message, kind })
    },
    setStatus: async (key: string, value: string | undefined): Promise<void> => {
      this.statuses.push({ key, value })
    },
  }
}

// ---------------------------------------------------------------------------
// Fake ctx and pi

export interface RegistryModelStub {
  provider: string
  id: string
}

export interface JourneyCtxOptions {
  ui: ScriptedUi["ui"]
  cwd?: string
  mode?: string
  model?: { provider?: string; id?: string }
  registryModels?: RegistryModelStub[]
  /** Providers the registry reports as having auth configured. */
  authConfigured?: string[]
}

/**
 * Build a ctx compatible with the screens: a recording modelRegistry with
 * getAll/getProviderAuthStatus/find/hasConfiguredAuth/refresh.
 */
export function makeJourneyCtx(opts: JourneyCtxOptions): Record<string, unknown> {
  const registryModels = opts.registryModels ?? []
  const authConfigured = new Set(opts.authConfigured ?? [])
  const modelRegistry = {
    getAll: () => registryModels,
    getProviderAuthStatus: (provider: string) => ({ configured: authConfigured.has(provider) }),
    find: (provider: string, model: string) => ({ provider, id: model }),
    hasConfiguredAuth: (m: { provider?: string }) => authConfigured.has(String(m?.provider)),
    refresh: async () => {},
  }
  return {
    ui: opts.ui,
    mode: opts.mode ?? "tui",
    cwd: opts.cwd ?? process.cwd(),
    model: opts.model,
    modelRegistry,
  }
}

export interface FakePiExecCall {
  cmd: string
  args: string[]
}

export interface FakePi {
  /** The pi object to hand to screens. */
  pi: Record<string, unknown>
  execCalls: FakePiExecCall[]
  setModelCalls: unknown[]
  thinkingLevel: string
}

/**
 * Build a fake pi. exec records every invocation and never runs anything
 * for real; setModel records and returns true.
 */
export function makeFakePi(): FakePi {
  const execCalls: FakePiExecCall[] = []
  const setModelCalls: unknown[] = []
  const state = { thinkingLevel: "medium" }
  const pi = {
    exec: async (cmd: string, args: string[] = []) => {
      execCalls.push({ cmd, args })
      return { code: 0, stdout: "", stderr: "" }
    },
    setModel: async (m: unknown) => {
      setModelCalls.push(m)
      return true
    },
    getThinkingLevel: () => state.thinkingLevel,
    setThinkingLevel: (_level: string) => {},
    getFlag: (_name: string) => undefined,
    registerCommand: () => {},
    registerFlag: () => {},
    on: () => {},
  }
  return { pi, execCalls, setModelCalls, thinkingLevel: state.thinkingLevel }
}
