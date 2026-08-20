---
description: Flaky test hunting - classify the instability (time, order, async, environment, concurrency), reproduce deterministically, fix the cause, and prevent with CI quarantine policy. Use when tests fail intermittently or "only on CI".
origin: original
license: MIT
---

# Flaky Hunting

A flaky test is two bugs in one: the code's hidden instability AND the
suite's lost trust. Rerun-until-green hides both.

## Step 1: quantify

Mine CI history: failure rate per test (rerun marks, quarantine logs).
Everything else prioritizes by that number; a test failing 1 in 300 runs
is a different problem than one failing 1 in 4.

## Step 2: classify the cause

| Smell | Typical evidence | Fix direction |
|---|---|---|
| **Waiting on time** | sleeps, "works locally", fails under load | wait on STATE (poll condition), never on clock |
| **Test order coupling** | passes solo, fails in suite; green on shuffle-off | per-test data/setup isolation; shared mutable state out |
| **Async races** | unawaited promises, fake timers half-applied | await everything; flush microtasks; fake the clock consistently |
| **Environment drift** | only on CI / only Monday / only after deploy | env parity (same node, TZ UTC, seeded random, real ports closed); inject env instead of sniffing |
| **Concurrency in the SUT** | deadlocks/heisenbugs under parallelism | the flake is product code: extract the race into a deterministic test (barriers, controlled interleavings) and fix it |
| **Leftover world** | fails after certain suites | teardown discipline, ephemeral stores (fixtures-factories skill) |

## Step 3: reproduce deterministically

Stress the dimension the smell points at: shuffle order (seed printed),
run with clock faked to edge values (midnight, month end, DST), force
GC/network jitter harnesses, run the single test in a loop. A flake you
cannot reproduce on demand is a hypothesis, not a diagnosis; keep mining
until it reproduces.

## Step 4: fix and prevent

Fix the CAUSE (the wait, the shared state, the race in product code);
deleting the test or wrapping it in retries is admitting the product is
flaky in prod too. Prevention: quarantine lane with owner+expiry (quarantine
is a waiting room, not a graveyard), flake rate surfaced per PR, and
order-randomized CI as a standing smoke detector.

## Report format

`test - failure rate - class of cause - reproduction recipe - fix - PR`,
one flake per line; the suite's flake rate is the health metric that
trend-watches.
