---
description: Design, write or review stable end-to-end browser tests around critical user journeys, repository fixtures and Playwright evidence. Use when the user asks to write, extend or stabilize a Playwright (or equivalent) end-to-end suite, a critical user journey spec, or a flaky E2E diagnosis.
origin: original
license: MIT
---

# E2E Testing

Produce a small, runnable browser suite for critical journeys, with deterministic
state, failure artifacts, a flake policy and an explicit runtime budget.

## Procedure

1. **Inspect the existing harness.** Find `playwright.config.*`, `e2e/`,
   `tests/` and package scripts with `rg --files`. Reuse the repository's
   server lifecycle, fixtures, naming and CI command.
2. **Choose journeys by risk.** Cover business-critical paths such as signup,
   checkout, authentication and core CRUD. Push validation permutations and
   pure business logic down to integration or unit tests.
3. **Design deterministic state.** Give each test isolated data, controlled
   time and a documented cleanup path. Reuse existing factories and seed APIs;
   never depend on test order or shared production accounts.
4. **Write one journey per test.** Keep the user goal visible in the assertions.
   Select by role or label first, use `data-testid` only when semantics cannot
   identify the element, and keep assertions in the test rather than helpers.
5. **Wait on observable state.** Use `expect(...).toBeVisible()` or a network
   response instead of sleeps. Mock only third parties or failure modes; keep
   the application boundary real for the journey under test.
6. **Capture diagnostic evidence.** Configure screenshots, trace and video on
   failure or first retry. Scrub credentials and personal data before retaining
   or publishing artifacts.
7. **Enforce flake and time budgets.** One CI retry may gather evidence, but a
   repeat failure needs an owner and root-cause fix. Keep the PR suite under ten
   minutes or move lower-value cases down the test pyramid.
8. **Run the focused command.** Use the repository script or
   `npx playwright test <path>` only when Playwright is already installed, then
   report the exact command, result and remaining untested risks.

## Output format

```markdown
| Journey | Risk | Preconditions | Assertions | Test file | Runtime |
|---|---|---|---|---|---|
| Checkout | payment loss | seeded cart | order id and receipt | e2e/checkout.spec.ts | 18 s |

## Flake E2E-01: <test name>
- Symptom: <failure and frequency>
- Evidence: <trace/screenshot/log location>
- Root cause: <time, order, async, environment or concurrency>
- Fix: <specific synchronization or isolation change>
- Verify: <repeat command and count>
```

## What not to do

- Do not test every input permutation through the browser.
- Do not use `waitForTimeout`, XPath or CSS structure as a default selector.
- Do not hide a persistent flake behind retries or a permanent quarantine.
- Do not run destructive journeys against production or leak secrets through
  traces, screenshots, URLs or fixtures.

## Limits and handoffs

This skill owns browser journeys and their Playwright implementation. Driving
Chrome to measure console, network or LCP and propose a product fix is
`browser-improve`; do not add specs when the user asked to improve a live
page. A human how-to with one screenshot per step is `visual-guides`. Use the
QA pack's `test-strategy` for whole-product coverage decisions and
`fixtures-factories` for a deep test-data redesign. Ask before resetting shared
environments, deleting data or installing browsers; prefer reusable local
state and a documented teardown.
