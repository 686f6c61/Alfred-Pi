---
description: Documentation structure and writing - Diátaxis (tutorial/how-to/reference/explanation), docstrings that explain why, READMEs and changelogs. Use when writing or restructuring project documentation.
origin: original
license: MIT
---

# Documentation (Diátaxis)

## The four modes - one per page, never mixed

| Mode | Reader's question | Shape |
|---|---|---|
| **Tutorial** | "Teach me" | Linear path, guaranteed steps, one outcome. No options, no detours. |
| **How-to** | "How do I do X?" | Problem → steps → result. Assumes basics; prerequisites stated up front. |
| **Reference** | "What is/are …?" | Dry, complete, navigable. Facts only; no teaching, no persuasion. |
| **Explanation** | "Why? Trade-offs?" | Background, design decisions, alternatives considered. No steps. |

Common rot: a tutorial that branches into options (→ split into how-to);
reference that explains (→ move to explanation); README that tries to be all
four (→ keep it: what/why + install + links to the rest).

## In-code documentation

- Docstrings on exported symbols: purpose in one line, then only the
  surprising things - args that can be undefined, side effects, failure
  modes, units. No `@param` noise restating names/types.
- Comments carry the WHY (constraint, decision, workaround) with a link to
  the ADR when one exists. Delete comments that narrate the WHAT.
- The test suite is executable documentation: name tests as behaviors
  ("rejects scoped names split on @").

## README skeleton (OSS)

One-paragraph promise → install (2 ways max) → minimal working example →
features (table, link to docs) → development (setup, test, release) →
license. Cut everything a contributor doesn't need on day one.

## Changelog hygiene

Grouped by user impact (Added/Changed/Fixed/Removed), entries describe
behavior not commits ("fallback switches models after 2 failures", not
"fix: fallback"), breaking changes lead with **BREAKING** and the migration.
Release-tooling keeps versions and manifests in sync - regenerate, don't
hand-edit.

## Visual how-tos of a web flow

If the reader needs one screenshot per step of a product UI, hand off to
the web-fullstack skill `visual-guides` (and `/guide`). This skill keeps
Diátaxis prose without captures: tutorials, how-tos, reference and
explanation. Do not clone a screenshot pipeline here.

## Audit pass (for /docs-audit)

1. Inventory pages/files by mode - many docs have none (that's a finding).
2. Flag mixed-mode pages, dead links, snippets that can't run, versions
   mentioned in prose, and orphan docs nothing links to.
3. Report: table (doc → mode → verdict), the 3 fixes with most reader value.
