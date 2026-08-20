---
description: Red-green-refactor TDD loop with a worked example, pragmatic scope rules and a characterization recipe for legacy code. Use when writing features test-first, adding coverage, or changing untested code that matters.
origin: original
license: MIT
---

# TDD Workflow

Produce behavior pinned by tests before the implementation settles. The
loop: **red** (a failing test that states the behavior) -> **green** (the
simplest code that passes) -> **refactor** (improve structure, tests stay
green).

## Worked example (one full loop)

Behavior: a cart applies a 10% discount over 100.

Red - write the failing test first; the name states the behavior:

```ts
test("applies 10% discount when the total exceeds 100", () => {
  expect(totalWithDiscount([{ price: 60 }, { price: 60 }])).toBe(108)
})
```

Green - the simplest code that passes, no more:

```ts
const totalWithDiscount = (items) => {
  const total = items.reduce((sum, i) => sum + i.price, 0)
  return total > 100 ? total * 0.9 : total
}
```

Refactor - extract the threshold, rename, rerun the suite; it stays green
or the step is undone.

## Scope rules

1. Test first: domain logic, edge cases, contracts, anything that has
   regressed before.
2. Test after or never: glue code, trivial CRUD, prototypes, IO wrappers
   with no branching, framework and config wiring.
3. Prefer the real thing when fast and deterministic (in-memory db, fake
   clock) over a mock.

## Test doubles

- Mock only what you own (a port/adapter interface), never a third-party
  client directly; wrap the client, mock the wrapper.
- One behavior per test; arrange-act-assert; no shared mutable fixtures.

## Legacy code with no tests (characterization recipe)

1. Pick one critical path and pin its CURRENT behavior with tests, even
   when it looks wrong: the test documents what is, not what should be.
2. Open a seam with a behavior-preserving move (extract function, inject
   dependency) so the code you must change becomes testable.
3. Only then change behavior, red-green-refactor as above.

## Definition of done

One sentence: every test name reads as a spec line of the behavior, and
each failure points at exactly one cause.

Report back in this shape: tests added (names as spec lines), behaviors
deliberately left untested with the scope rule that exempts them, and any
seam the code still needs.

## What not to do

- Do not write the implementation first and retrofit assertions: that pins
  the code you wrote, not the behavior you need.
- Do not test private methods; test through the public surface, or the unit
  is doing too much.
- Do not assert implementation details (call counts, internal state) that
  break on every refactor.
- Do not chase a coverage percentage; cover the delta and the risk.

## Limits and handoff

- This is the loop for unit-level behavior, not suite design: levels,
  budgets and what-not-to-test policy belong to the test-strategy skill
  (qa-testing pack).
- Flaky tests are a bug in the suite, not in this loop; hand off to
  flaky-hunting (qa-testing pack).
- If a change is hard to test, stop and say what design shift would make it
  easy instead of torturing the test.
