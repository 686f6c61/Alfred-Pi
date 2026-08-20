---
description: Deterministic test data with factories, builders, controlled time and isolated cleanup. Use when creating test data or repairing tests coupled through shared fixtures and leftovers.
origin: original
license: MIT
---

# Fixtures and Factories

Produce a focused factory or fixture change, its verification command and a
report of state, nondeterminism and cleanup decisions.

## Procedure

1. **Find the house convention.** Locate existing factories, builders,
   fixtures and setup hooks with
   `rg --files | rg '(factor(y|ies)|fixture|builder|test-data|conftest)'`.
   Reuse their directory and naming before adding another abstraction.
2. **Read the entity contract.** Inspect constructors, schemas, migrations and
   validation rules. List required fields, uniqueness constraints and derived
   values so the default object is valid for the same reason production is.
3. **Build the smallest factory.** Give it stable valid defaults and explicit
   overrides. Compute derived totals from their inputs, generate uniqueness per
   test and provide a loudly named path for intentional invalid states.
4. **Control nondeterminism.** Inject or fake the clock, seed random values and
   print the seed on failure. Replace sleeps with a wait on observable state;
   fail if an HTTP, queue or filesystem boundary escapes its intended fake.
5. **Isolate persistent state.** Prefer a transaction rollback, ephemeral
   database or per-test namespace. Make teardown explicit and verify it after a
   failed test as well as a passing one; production data is never a fixture.
6. **Run the narrow test, then its neighbors.** Copy the exact command from the
   repository manifest, run the changed test first and then the containing
   suite. Report both commands and results instead of claiming a global pass.

## Complete example

```ts
export function createUserFactory() {
  let sequence = 0
  return (overrides: Partial<User> = {}): User => {
    sequence += 1
    return {
      id: `user-${sequence}`,
      email: `user-${sequence}@example.test`,
      role: "viewer",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      ...overrides,
    }
  }
}
```

Create the factory inside each test or test setup so its sequence cannot leak
between cases. If a test needs an invalid email, expose a named invalid
builder or override it in that test; do not weaken every default.

## Output format

| Factory or fixture | Location | Invariants encoded | Time/randomness control | Isolation and teardown | Verification |
|---|---|---|---|---|---|
| user | `test/factories/user.ts` | unique id, valid email | fixed clock, sequence | transaction rollback | exact command and result |

End with `Residual coupling: none | <files and reason>` and list any cleanup
that still requires explicit authorization.

## Anti-patterns

- Do not share a kitchen-sink object or mutable database across unrelated tests.
- Do not hide scenario intent behind random defaults or dozens of unused fields.
- Do not use wall-clock time, unseeded randomness or fixed sleeps.
- Do not call a network service when a boundary fake is part of the test contract.
- Do not delete shared data or reset a broad database to clean one test.

## Boundaries and hand-offs

This skill owns test-data construction and isolation, not suite prioritization.
Use `test-strategy` for risk allocation, `contract-testing` for wire schemas and
`flaky-hunting` when nondeterminism remains after data isolation. Keep secrets
and personal production records out of fixtures and logs. Confirm destructive
cleanup, and stop when the only available environment is shared or production.
