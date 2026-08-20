---
name: audit
description: Security audit of the current repo or a path - OWASP pass, dependency risks, config issues, ranked findings
argument-hint: <args>
origin: original
license: MIT
---

Perform a security audit of $@.

Use the owasp-review skill as your methodology. Then:

1. Map the attack surface: entrypoints, auth boundaries, data stores, outbound calls.
2. Review each entrypoint for the OWASP categories that apply.
3. Check config and dependencies (lockfile) for known-risk items.
4. Produce findings as: `[SEVERITY] A0X - file:line - issue - fix`.

End with a verdict: deployable / fix-first list (max 5 items, ordered by risk reduction).
