# Contributing to Alfred-Pi

Thanks for helping! This is a [pi](https://pi.dev) extension suite - reading
the [technical docs](docs/) first will save you a round trip:
they explain why things are shaped the way they are.

## Setup

```sh
git clone https://github.com/686f6c61/Alfred-Pi
cd Alfred-Pi
ln -sfn "$PWD" ~/.pi/agent/extensions/alfred-pi   # dev symlink
bun test                                           # 80+ unit tests, no pi needed
```

`main` is the harness. The public Astro site is the `landing` branch
(locally the `www/` tree). Do not mix workshop notes (`docs/auditoria/`)
into either branch.

CI: `.github/workflows/ci.yml` on `main` (`bun test` plus a headless pi
smoke on Ubuntu, macOS and Windows). The site workflow lives at
`www/.github/workflows/ci.yml` and becomes `.github/workflows/ci.yml`
when `landing` is the Astro root (`bun install`, `check`, `build`).

## Ground rules

- **Zero runtime dependencies.** `lib/` is pure Node (`node:fs`, native
  `fetch`) with no pi imports, except `screens.ts` and `onboarding-flow.ts`.
  `index.ts` is the adapter. Keep that boundary: it is what makes the suite
  runnable outside the agent. Developer how-tos: [docs/extender.md](docs/extender.md)
  and [docs/probar.md](docs/probar.md).
- **Safe writes only.** Anything that touches `models.json`, `auth.json` or
  `settings.json` goes through plan → diff → confirm → backup → atomic
  write.
- **Never install anything silently.** Package installs run the security
  audit first and always ask.
- Tests for every `lib/` change: `bun test` must stay green. New pure logic
  deserves new tests. TUI screens are driven by scripted journeys in
  `test/journeys/` (fake ui, never a live `pi install`); `bun test --coverage`
  is the net for `lib/` and `index.ts`.

## Adding a domain pack

Full contract and the ten-point skill bar: [docs/extender.md](docs/extender.md).

1. `packs/<id>/` with `domain.json` (id, name, description, `triggers` ES/EN,
   optional `repoHints`, `packages`), `context.md` (what gets injected - keep
   it under ~15 lines), `skills/<name>/SKILL.md` (frontmatter `description`
   written as a trigger: "Use when…"), `prompts/<name>.md`.
2. Every `SKILL.md` and prompt frontmatter must declare `origin`
   (`original` or `adapted`) and an SPDX `license` aligned with
   `package.json` (`MIT`) unless the file states another.
3. Triggers are routing data - curate them like code, avoid words that
   collide with other packs.
4. Update the README pack table, [docs/dominios.md](docs/dominios.md) and CHANGELOG.

## Adding a provider preset or essentials entry

- `lib/presets.ts`: keys are `$ENV` refs, never literals; verify the endpoint
  live (curl status) before committing.
- `lib/essentials.ts`: describe what the user gets (commands added), and
  keep the category accurate.

## Releases

`scripts/release.sh <version> "notes"` bumps `package.json`, regenerates
`site/manifest.json` and prints the tag/push steps. Commits land on `main`;
tags are `vX.Y.Z`.

## Reporting a security issue

See [SECURITY.md](SECURITY.md) - please don't open public issues for
vulnerabilities.
