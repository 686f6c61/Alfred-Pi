---
description: GitHub Actions workflows - writing, securing and debugging them, running pi itself in CI, and npm trusted publishing (OIDC). Use when creating or reviewing .github/workflows or CI pipelines.
origin: original
license: MIT
---

# GitHub Actions

## Skeleton (the boring, correct start)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read # least privilege by default; widen per-job only

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
```

## Rules (flag violations by number when reviewing)

1. **Pin third-party actions to a full commit SHA** - tags are mutable
   (`uses: owner/action@<40-char-sha> # v2.3.1`). First-party `actions/*` at
   major tag is acceptable.
2. **`permissions` always explicit**, minimum viable; `contents: read` is the
   default you narrow from - never blanket `write-all`.
3. Secrets arrive via `env:` from `secrets.*`, never inline, never echoed;
   prefer **OIDC** (`id-token: write` + cloud's `role-to-assume`) over stored
   long-lived cloud keys.
4. `concurrency` with `cancel-in-progress` on PRs; `timeout-minutes` on every
   job (hung jobs burn minutes for 6h otherwise).
5. Cache keyed on the lockfile hash (`cache: npm` does it; manual keys need
   `${{ hashFiles('bun.lockb') }}` style), with a restore-key fallback.
6. Matrices: `fail-fast: false` when you want the full picture; keep them
   small (axes multiply).
7. Artifacts with `retention-days` set; releases via the provenance-friendly
   paths (see trusted publishing below).
8. Reusable: shared job shapes go into a `workflow_call` workflow with typed
   inputs/secrets instead of copy-paste.

## Running pi itself in Actions

```yaml
- run: npm install -g --ignore-scripts @earendil-works/pi-coding-agent
- run: pi -e ./index.ts --alfred-pi=doctor --no-session -p "ok" | tee out.txt
  # tolerate the model-call exit code; grep the report instead:
- run: grep -q "Alfred-Pi doctor" out.txt
```

Print mode runs extensions before the prompt; any provider-less environment
still executes session_start hooks - perfect for smoke tests. Build the workflow
from the repository's actual scripts and lockfile rather than a generic
generator.

## npm trusted publishing (OIDC - no npm tokens in CI)

1. npm side: link the package to the GitHub repo/statement (npm ≥ 11.5).
2. Workflow: `permissions: { id-token: write, contents: read }`, then
   `JS-DevTools/npm-publish` or `npm publish --provenance` from the runner
   npm exchanges the Actions OIDC token for a one-shot publish right.
3. Gate on a tag (`if: startsWith(github.ref, 'refs/tags/v')`) and never
   publish from PRs.

## Debugging

- Failing step? Read the log from the TOP of the failing section, not the
  tail; check `actions/setup-*` versions first when "it worked yesterday".
- Push a `[ci skip]`-free trivial change or use `workflow_dispatch` to
  re-run; `act` (nektos/act) approximates locally - differences: no OIDC,
  no GITHUB_TOKEN scopes, docker-in-docker quirks.
- Missing-permission failures look like 403/`Resource not accessible` - fix
  the `permissions` block, don't paste a PAT.

## Boundary

This skill is for GitHub Actions, not GitLab CI. If the repository uses
`.gitlab-ci.yml`, preserve the observed jobs and hand the implementation to its
native pipeline guidance instead of translating events, permissions or OIDC
claims one for one. Do not publish a package or change repository permissions
without explicit authorization.
