---
description: Hard-bug diagnosis loop - build a red command that fails on the symptom, minimise, rank falsifiable hypotheses, probe one variable, then regress. Use when a bug resists a first read, the cause is unknown, or before proposing any fix.
origin: adapted
license: MIT
---

# Bug repro loop

A hard bug is not a 502 and not a flake. Produce a **red command** that
fails on the user's symptom, then a cause with a regression test. Do not
theorise first.

## Step 1: build the red command

Pick one loop that goes red on this symptom: `bun test` (or the repo's
test runner) for a failing case, `curl` for an HTTP contract, a headless
browser script, `git bisect run`, or a captured trace replay. Bisect only
on a clean tree and `git bisect reset` when you stop. Write the exact
command in the report and **run it once**. A hypothesis without that
command is not a diagnosis.

Tighten it: seconds, deterministic, assertion on the **exact** symptom
(status, message, pixel, log line). If it only fails sometimes, stop and
use **flaky-hunting**.

## Step 2: reproduce and minimise

Cut one element at a time (input, flag, fixture, neighbour test) until
the command is the smallest that still goes red. Print the seed if order
matters. If you cannot reproduce on demand, keep mining; do not guess.

## Step 3: hypotheses before probes

List three to five **falsifiable** hypotheses, ranked, **before** editing
product code. Show them. Each names one mechanism (wrong bound, stale
cache, off-by-one, bad timezone, lost await).

## Step 4: one probe

One variable per probe. Tag logs `[DEBUG-xxxx]` with a unique prefix.
Redact secrets before pasting output. Confirm or kill one hypothesis per
run of the red command.

## Step 5: regress, fix, clean

Add or extend a test at the right seam that fails on the red command's
assertion, then fix. Re-run the **original** red command; if it is still
red, the fix is wrong. Grep the prefix out. Commit message states the
confirmed hypothesis.

## Report format

`symptom | red command (already run) | hypotheses discarded | cause | regression test`

## Anti-patterns

- Theorising without a red command.
- Logging everything and grepping later.
- Calling it fixed without re-running the original command.
- Wrapping the failure in retries (that is flaky-hunting's trap, and it
  hides the product bug).
- Instrumenting without a tagged prefix, then shipping the probes.

## Limits

- Service down, 502/503, DNS, edge, origin: **incident-triage**
  (`devops-infra`), not this loop.
- Test that fails only on CI, only in suite, only sometimes:
  **flaky-hunting**.
- If the right seam for the regression test does not exist, that is the
  finding: hand to **solid-review** or **tdd-workflow**, do not invent a
  god-test.
