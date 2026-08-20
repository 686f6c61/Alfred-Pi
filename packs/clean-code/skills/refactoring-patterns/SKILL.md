---
description: Behavior-preserving refactoring moves with their safety nets, a worked diff and a hard stop criterion. Use when improving structure without changing behavior.
origin: original
license: MIT
---

# Refactoring Patterns

Produce a sequence of small, verifiable moves that improve structure while
behavior stays pinned. For each move: the smell that triggers it, the
mechanics, and the safety net that makes it safe.

## The moves

- **Extract Function** - long function, or a chunk you would comment.
  Mechanics: copy the chunk, pass locals as parameters, replace, run tests.
  Net: the surrounding suite; if none, pin behavior first.
- **Introduce Parameter Object** - the same 4+ arguments traveling together.
  Mechanics: define the record/struct, migrate call sites one at a time.
  Net: type checker plus tests at the call sites.
- **Replace Conditional with Polymorphism** - the same switch on type
  repeated across files. Mechanics: add one subtype with the behavior,
  migrate one case at a time, delete the switch when empty.
  Net: tests per migrated case, green between cases.
- **Move Function** - feature envy: the function uses another module's data
  more than its own. Mechanics: move, leave an alias, migrate callers,
  delete the alias. Net: tests of both modules.
- **Inline Function** - indirection that adds nothing (a wrapper that only
  renames). Mechanics: inline all call sites, delete. Net: compiler, suite.
- **Rename** - the name lies about the behavior. Cheapest, highest-value
  move. Net: rename across the repo in one commit, never mixed with logic.
- **Characterization Tests** - no tests exist and the code matters.
  Mechanics: pin current observed behavior before any move (recipe in
  tdd-workflow).

## Example step

Extract the discount rule out of checkout:

```diff
 function checkoutTotal(items) {
   const total = items.reduce((s, i) => s + i.price, 0)
-  return total > 100 ? total * 0.9 : total
+  return applyDiscount(total)
 }
+
+function applyDiscount(total) {
+  return total > 100 ? total * 0.9 : total
+}
```

Behavior identical, one move, suite green. Naming the threshold constant is
the NEXT step, not this one.

## Rules

1. One move per commit-sized step; the suite is green between steps.
2. Never mix refactor and behavior change in one diff; if the move needs a
   behavior change, split it into two commits.
3. No tests and the code matters: write characterization tests first, or
   say plainly that the net is missing before moving.

## Stop criterion

Stop and open an ADR (adr skill, docs pack) instead of another move when
the next step would change an invariant, cross a module boundary, touch
more files than you can review in one sitting, or when you cannot name the
safety net for it. A refactor that needs an argument is a design change.

## What not to do

- Do not "improve" style, naming or formatting inside a structural move.
- Do not batch five moves into one diff because each felt small.
- Do not rename a public API without an alias or a caller migration plan.
- Do not refactor code you do not understand yet: read, pin, then move.

## Limits and handoff

- This skill moves code; it does not choose the destination. Boundary and
  context decisions belong to ddd-architecture, pain triage to
  solid-review, scheduling to tech-debt-inventory.
