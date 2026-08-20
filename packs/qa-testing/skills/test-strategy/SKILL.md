---
description: Risk-based test strategy with evidence from the repository, level selection, suite budgets and release exit criteria. Use when planning tests for a feature, release or product.
origin: original
license: MIT
---

# Test Strategy

Produce or update a test strategy artifact that maps concrete product risks to
test levels, assertions, owners, commands and explicit exit criteria.

## Procedure

1. **Inventory the real suite.** Read the test scripts in `package.json`,
   `pyproject.toml`, `Makefile` or the equivalent, plus CI workflows and test
   directories. Start with
   `rg --files | rg '(^|/)(test|tests|e2e|__tests__)(/|$)|playwright|cypress'`.
2. **List risks before tests.** For each journey, invariant, integration seam
   and non-functional constraint, write the failure scenario and impact on
   money, data, trust, operations or compliance. Score likelihood and impact
   on a stated scale; do not rank from intuition alone.
3. **Choose the cheapest level that proves the behavior.** Put business rules
   in unit tests, real module seams in integration tests, service schemas in
   contract tests and only critical user journeys in end-to-end tests. Name
   the assertion that fails, not merely the code to execute.
4. **Set the suite budget.** Record target runtime, parallelism limits,
   environment needs and the maximum justified end-to-end journeys. Give every
   skipped or quarantined test an owner, reason, issue and expiry date.
5. **Anchor execution.** Copy the exact local and CI commands from the repo and
   identify required services or fixtures. Run the narrowest representative
   command when execution is in scope; never invent `npm test` or claim green
   from a different runner.
6. **Write exit criteria.** Define the rows that block merge or release, the
   acceptable residual risks and the evidence required to close each row.
   Reuse the existing strategy path or write `docs/test-strategy.md`.

## Risk matrix template

| Risk and scenario | Likelihood x impact | Test level | Assertion | Test or target file | Exact command | Owner | Exit state |
|---|---|---|---|---|---|---|---|
| payment replay duplicates charge | 2 x 3 | integration | one charge per idempotency key | `test/payments/...` | repo command | team | required |

After the matrix, record:

```text
Suite budget: <runtime, E2E count, required services>
Release blockers: <matrix rows or none>
Accepted residual risk: <risk, owner, review date>
Verdict: ready | ready with accepted risk | not ready
```

## Anti-patterns

- Do not use coverage percentage as a substitute for risk or assertion quality.
- Do not test private calls when an observable behavior gives a stable contract.
- Do not push every scenario into end-to-end tests when a lower level proves it.
- Do not retry flaky tests into silence or leave skips without owner and expiry.
- Do not claim a release gate passed when the recorded CI command was not run.

## Boundaries and hand-offs

This skill plans the suite; it does not design test data or service contracts.
Use `fixtures-factories` for deterministic data, `contract-testing` for
consumer-provider compatibility and `flaky-hunting` for nondeterministic
failures. Send performance, accessibility and security validation to their
specialist packs. Never run destructive tests against production, disclose
test credentials or copy personal production data; stop and request an
approved environment when safe execution cannot be demonstrated.
