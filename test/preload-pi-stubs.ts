import { mock } from "bun:test"

// index.ts pulls lib/screens.ts at load time. screens.ts value-imports the
// pi TUI packages, which exist only inside the agent runtime. Contract
// tests of the orchestrator never render a screen, so we stub the two
// runtime modules here (bunfig.toml [test] preload) instead of adding
// them as dependencies of this zero-runtime-dep package.

mock.module("@earendil-works/pi-tui", () => ({
  SelectList: class SelectList {},
}))

mock.module("@earendil-works/pi-coding-agent", () => ({
  getSelectListTheme: () => ({}),
}))
