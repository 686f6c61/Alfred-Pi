---
description: Audit dependencies for known CVEs, risky and unmaintained packages from lockfiles and manifests; triage by exploitability, plan upgrades. Use when the user asks about vulnerable, outdated or unmaintained dependencies or supply-chain risk.
origin: original
license: MIT
---

# Dependency Audit

## Inputs

Lockfiles first (`bun.lock`, `package-lock.json`, `yarn.lock`, `poetry`,
`Cargo.lock`, `go.sum`): the lockfile is the truth; manifests lie about
what actually ships. Read the lockfile, resolve the installed versions,
then map to advisories (OSV.dev is the open aggregator; npm audit for JS
when network is allowed).

## Triage: severity is not risk

Exploitability beats CVSS. For each advisory ask: is the vulnerable code
path reachable? A 9.8 in a transitive devDependency you never call in
production is noise; a 6.5 in your request path is fire.

Report: `[reachable | unreachable | dev-only] CVE - package@installed ->
fixed-in - path - action`.

## Beyond CVEs

- **Unmaintained**: no commits or releases in 1-2 years, issues piling,
  archived repo. Maintenance risk compounds silently.
- **Typosquatting and look-alikes** in newly added deps: check the name
  twice against the real one.
- **Install scripts** (`postinstall`) in the lockfile: the supply-chain
  classic; justify each.
- **License conflicts** only if the product distributes (hand off to the
  compliance pack's license-compliance skill then).

## Upgrade plan

1. Group findings: patch/minor safe bumps first (semver-respectful), then
   the majors with migration notes, then the unmaintained replacements.
2. One logical group per PR; run the test suite per group; note lockfile
   churn for reviewers.
3. When no fixed version exists: document the reachable-path mitigation
   (pin below, wrap, or feature-flag off) and revisit date.
