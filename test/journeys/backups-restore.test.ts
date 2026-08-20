import { test, expect, beforeEach, afterEach } from "bun:test"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getPaths, backupFiles } from "../../lib/config-io.ts"
import { ScriptedUi, makeJourneyCtx, makeFakePi, loadScreens, useTempAgentDir } from "../helpers/scripted-ui.ts"

// Backups journey: a snapshot exists in the temp dir, the live file drifts,
// the person restores and the original bytes come back. All inside the
// sandbox; the registry refresh is the fake one from the harness.

let agent: ReturnType<typeof useTempAgentDir>

const ORIGINAL = JSON.stringify({ providers: { p: { baseUrl: "https://p.example/v1", api: "openai-completions" } } }, null, 2) + "\n"

beforeEach(() => {
  agent = useTempAgentDir()
})

afterEach(() => {
  agent.restore()
})

test("backups: restore a snapshot after the live file drifted", async () => {
  const paths = getPaths(agent.agentDir)
  writeFileSync(paths.models, ORIGINAL)
  const backup = backupFiles([paths.models], paths)!
  const backupId = readdirSync(paths.backupsDir).find((id) => id !== ".gitkeep") ?? backup.id

  // The live file drifts away from the snapshot.
  writeFileSync(paths.models, JSON.stringify({ providers: { other: { baseUrl: "https://x", api: "openai-completions" } } }))

  const { providersDashboard } = await loadScreens()
  const scripted = new ScriptedUi({
    picks: [
      "action:backups", // dashboard: backups submenu
      `backup:${backupId}`, // backups menu: the snapshot
      "restore", // snapshot menu: restore
      undefined, // backups menu: Esc out of the submenu
      undefined, // dashboard: Esc to leave
    ],
    confirms: [true], // accept the restore
  })
  const fakePi = makeFakePi()
  const ctx = makeJourneyCtx({ ui: scripted.ui })

  await providersDashboard(fakePi.pi as never, ctx as never)

  expect(scripted.notifications.some((n) => n.message.includes("Restored"))).toBe(true)
  expect(readFileSync(paths.models, "utf-8")).toBe(ORIGINAL)
})
