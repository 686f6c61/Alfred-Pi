---
description: A/B testing discipline - one-variable hypotheses, sample size and duration math, guardrails, honest analysis without peeking or p-hacking. Use when proposing or running A/B tests, split tests or landing experiments.
origin: original
license: MIT
---

# A/B Testing

## Hypothesis discipline

One variable, one mechanism, written before the test:
"We believe [change] will move [metric] because [mechanism], and we will
decide with [primary metric] at [power]". Testing two headlines that also
differ in layout tests nothing.

## The math you cannot skip

- **Baseline and MDE**: measure the current conversion rate; choose the
  minimum detectable effect worth acting on (a 10% relative lift at 3%
  baseline needs far more traffic than at 30%).
- **Sample size**: two-proportions power calc (80% power, 95% confidence
  are the floor). If the required traffic exceeds what the landing gets
  in a quarter, the test is dead on arrival: pick a bigger swing or a
  higher-baseline page.
- **Duration in whole weeks** (traffic mixes by weekday; stopping on a
  Tuesday because it looks good is how fiction ships).
- **Randomization**: 50/50, sticky per user, assigned before any page
  render decision.

## Running it honestly

- **Pre-register the primary metric**; secondaries are diagnostics, not
  victories.
- **No peeking**: interim looks multiply false positives; if you must,
  use sequential testing properly, not vibes.
- **Guardrails**: track bounce, rage clicks and load time; a variant that
  wins conversion by breaking the page is a loss.
- **Novelty and regression to the mean**: effects shrink after week one;
  that is physics, not a bug.

## Deciding

- Significant lift: ship, then verify the lift survives in full traffic
  (a post-ship holdback catches instrumentation lies).
- Flat: keep the simpler variant and record the learning ("X does not
  move Y here") in the experiment log; null results are results.
- Never average a won and a lost test over the same hypothesis family
  without correcting; three peeks at five variants is not one experiment.

## Report

Hypothesis, dates and traffic, split check, primary metric with interval,
guardrails, decision, and the one-line learning for the log.
