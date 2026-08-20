---
name: ci
description: Create or review the GitHub Actions CI for this repo - correct skeleton, security rules, caching, and optional release/publish path
argument-hint: <args>
origin: original
license: MIT
---

Set up or review CI for $@.

Apply the github-actions skill: detect the stack (lockfile, test runner,
build), then write `.github/workflows/ci.yml` following the skeleton and all
numbered rules (pinned actions, least-privilege permissions, concurrency,
timeouts, lockfile-keyed cache). If the project is publishable, add the
tag-gated trusted-publishing job (OIDC, no tokens). Reviewing instead? Flag
violations by rule number with the minimal fix, then apply what I approve.
