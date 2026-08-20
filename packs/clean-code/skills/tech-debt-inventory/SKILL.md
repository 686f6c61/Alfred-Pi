---
description: Technical debt inventory with an anchored discovery recipe, a priced line per item and ranking by interest, not annoyance. Use when asked to audit, list or prioritize technical debt.
origin: original
license: MIT
---

# Tech Debt Inventory

Produce a priced, ranked list of debt the team can schedule, written to a
file the team can see. Debt is not shame; unlisted debt is.

## Discovery recipe (run these, in order)

1. **Markers**: `grep -rn "TODO\|FIXME\|HACK\|XXX" --exclude-dir=node_modules .`
   Each hit older than a release is a candidate line.
2. **Churn**: `git log --format=format: --name-only | sort | uniq -c | sort -rn | head -20`
   Files that change every week and still hurt are debt with interest.
3. **Incidents**: read postmortems and on-call notes; every incident that
   traces to a workaround is an item with compound interest.
4. **Suite pain**: tests everyone restarts, quarantined suites, builds that
   need a second run.
5. **Drift**: the dependency one major behind, config divergence between
   environments, the deploy step only one person knows.

## What counts as debt

Workarounds with a comment, duplicated logic that already diverged once,
the module nobody touches without sacrifice, config drift, the TODO older
than the repo's coffee. If it slows the next feature or wakes someone up,
it is debt.

## The inventory line

For each item:
- **Location**: file/module/service (be exact; "everywhere" is not a line).
- **Symptom**: what it costs today (dev velocity, incident risk, cognitive
  load, performance).
- **Principal**: the proper fix, in one sentence.
- **Estimate**: S/M/L (hours-ish, no false precision).
- **Interest**: how often it hurts (every change / monthly / during
  incidents) and whether it compounds.

## Prioritization: interest rate, not amount

Rank by `interest x frequency x blast radius`, not by size of fix. A small
fix hurting every PR beats a big rewrite hurting once a year.

Write the ranked list to `docs/tech-debt.md`, or to the repo's existing
debt file if it has one (reuse before creating). Debt work gets scheduled
like features, or paid opportunistically when its neighborhood is already
open: the boy-scout rule works on listed debt, not random refactors.

## What not to do

- Do not turn the inventory into a guilt list or a style wishlist.
- Do not estimate with false precision (no "3.5 days"); S/M/L is enough.
- Do not list "rewrite X" as an item: debt lines name the pain, not a
  project.
- Do not keep stale items: older than two quarters with zero paid interest,
  delete or escalate; stale inventory is worse than none.

## Limits and handoff

- The inventory is not a refactor license: fixes ship in reviewable,
  behavior-preserving steps (refactoring-patterns skill).
- Not an architecture review: boundary pain goes to ddd-architecture or
  solid-review first, then lands here priced.
- Every incident that traces to a listed item marks it up; that is the
  compounding signal.
