---
description: Architecture Decision Records - capturing the why behind design decisions with context, options and consequences. Use when making or documenting a significant technical decision.
origin: original
license: MIT
---

# Architecture Decision Records

An ADR is a short, immutable document: one decision, its context, and its
consequences. They let future maintainers (and agents) understand WHY the
code is shaped this way without reverse-engineering it.

## Format

```markdown
# NNN. Title (imperative, e.g. "Fall back between turns, never mid-stream")

- Status: proposed | accepted | superseded by NNN
- Date: YYYY-MM-DD

## Context
The forces at play: requirements, constraints, what broke or risks being
broken. Facts, not opinions.

## Decision
What we will do - one or two sentences, active voice ("We switch models
between turns").

## Alternatives considered
Option → why rejected (one line each). This section is the payload: it stops
the same debate from reopening.

## Consequences
What becomes easier, what becomes harder, what we now must do (tests,
docs, migrations).
```

## Rules

- Adopt ADRs only if the project keeps its decisions in the repo: some
  projects record them elsewhere (wiki, issue tracker, internal notes).
  Check for an existing convention first and follow it; otherwise create
  `docs/adr/` with the first record.
- One file per decision, numbered `NNNN-slug.md`. Never edit an accepted
  ADR: a changed decision gets a new ADR that supersedes it.
- Bounded-context and context-map decisions are prime ADR material; write
  them with the ddd-architecture skill (clean-code pack) as the method.
- Record decisions that are hard to reverse or that a reader would question;
  skip taste and trivial choices.
- Write it BEFORE implementing when possible: the alternatives section is
  honest before you're invested.
- Link from the code: a comment near the affected logic pointing to the
  record (for example `// See ADR 0005 for why fallback happens between
  turns, never mid-stream`).
