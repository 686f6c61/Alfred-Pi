---
name: docs-audit
description: Audit a repo's documentation against Diátaxis - classify pages by mode, flag mixed modes, stale snippets and orphans, top-3 fixes
argument-hint: <args>
origin: original
license: MIT
---

Audit the documentation of $@.

Apply the documentation skill's audit pass:
1. Inventory every doc surface (README, docs/, docstrings on exported
   symbols, changelog, comments quality) and classify by Diátaxis mode
   or "none".
2. Flag: mixed-mode pages, code snippets that couldn't run today, versions
   or paths mentioned in prose, orphan docs nothing links to, exported
   symbols without docstrings (spot-check the 10 most-used files).
3. Deliver: the table, then the 3 fixes with the most reader value, then a
   proposed docs/ structure if the repo has none.
