---
name: review-clean
description: Quality review of changed code or a path - bugs first, then design pain (SOLID), then test gaps; smallest-diff suggestions
argument-hint: <args>
origin: original
license: MIT
---

Review $@ for quality.

Use the solid-review skill's lens, but order findings by what hurts:

1. **Bugs** (behavior that will bite): off-by-one, null paths, race conditions,
   error swallowing, resource leaks.
2. **Design pain**: duplication drifting apart, hidden coupling, misleading names,
   functions doing three jobs.
3. **Test gaps**: behaviors with no safety net.

Per finding: `file:line - issue - why it hurts - smallest fix`.
No style commentary; assume a formatter exists. End with the 3 changes
that most improve this code.
