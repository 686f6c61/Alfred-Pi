---
description: Pull request review with a fixed order (spec fidelity, correctness, design, tests, hidden effects, readability), diff-fetching mechanics and verdict discipline. Use when reviewing a PR, diff or merge request before merging.
origin: original
license: MIT
---

# PR Review Checklist

Produce a verdict you would sign: approve, or numbered change requests
anchored in the diff. Correctness first; style never blocks.

## Get the diff in front of you

1. Fetch the real diff, not the description: `git fetch origin <branch>` and
   `git diff main...<branch>`, or `gh pr diff <n>` plus `gh pr view <n>` on
   GitHub. The `@narumitw/pi-github-pr` package integrates this fetch into
   pi if the user has it installed.
2. Read title and description first: the PR states its intent or it bounces
   on that alone. Then the diff stats: over ~400 changed lines, ask for a
   split or budget a slow read; size is a reviewability bug.

## The checklist, in order of what hurts

0. **Spec / fidelity to the request**: does the diff do what the PR
   description, issue or spoken request asked, and no more? Report
   missing, partial, or scope creep in its **own** section. If there is
   no spec, say so and do not block on that alone. Never mix Spec
   findings with correctness.
1. **Correctness**: does it do what it claims, and what breaks when it does
   not? Trace the changed paths with a hostile eye: edge cases, error
   paths, concurrency, empty/null inputs, off-by-ones. Bugs beat style.
2. **Design**: right layer, right abstraction, no coupling that hurts the
   next change. Ask what the NEXT diff of this feature looks like; if it is
   painful, the seam is wrong.
3. **Tests**: new behavior covered at the level the repo tests; failure
   paths too, not just the happy one. Coverage of the delta, not the badge.
4. **Hidden effects**: logs, migrations, env vars, API contracts, feature
   flags, security-sensitive paths (auth, secrets, injection surfaces:
   bring the security pack in when touched).
5. **Readability**: names that say what it does, no cleverness tax.
   Formatting noise belongs to a linter, not the review.

## Output format

- Verdict first: `approve` or `request changes`.
- Spec: `missing | partial | scope creep`, with a diff anchor, in its
  own section, before numbered change requests.
- Each request numbered and anchored: `1. file:line - what breaks - the
  change that fixes it`.
- Nitpicks labeled `nit:` and never blocking.

## Verdict discipline

- **Approve** means you would sign it with your name in prod tonight.
- **Request changes** only with actionable items, each mapped to a diff
  anchor; no drive-by "consider maybe" items that block.
- Re-review after pushes on the changed lines only; full re-reads punish
  iteration.

## What not to do (reviewer anti-patterns)

- Reviewing the author instead of the diff.
- `LGTM` without reading the changed paths.
- Blocking on taste (naming preferences, brace style) dressed as defects.
- Commenting top to bottom line by line and missing the design question.
- Demanding tests for glue code while ignoring an untested failure path.
- Mixing Spec / fidelity findings into the correctness list so scope
  creep hides as a "bug".

## Limits

- This is a human-style review, not a linter: formatting, import order and
  rule-enforceable style are CI's job; if the review repeats the linter,
  the linter is misconfigured.
- Not a security audit: when the diff touches auth, secrets or injection
  surfaces, hand off to the security pack instead of eyeballing it here.
