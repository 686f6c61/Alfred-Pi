---
name: diagnose-502
description: Triage a 502/503/504 on a deployed service - localize the failing layer with concrete checks, then fix
argument-hint: <args>
origin: original
license: MIT
---

The service $@ is returning a 5xx or not responding. Diagnose it.

Follow the incident-triage skill: stabilize first if a rollback is obviously
right, otherwise localize layer by layer (DNS → edge → origin → app → deps)
running the actual checks (dig, curl with Host header, docker ps/logs, df).
Ask me for anything you can't reach yourself.

Deliver: failing layer with evidence, the proposed fix, and prevention
follow-ups. Present the fix and apply only what I approve; for anything not
approved, give the exact command I must run.
