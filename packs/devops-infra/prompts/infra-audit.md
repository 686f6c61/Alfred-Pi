---
name: infra-audit
description: Audit a deployment setup - compose files, deploy config, TLS posture, secrets hygiene, backup story; ranked risks with fixes
argument-hint: <args>
origin: original
license: MIT
---

Audit the infrastructure of $@.

Read the actual files (compose, Dockerfiles, deploy configs, CI, proxies).
Apply the runtime-hardening section of `docker-workflow` plus:
- Secrets: anything sensitive committed or logged?
- TLS/edge: how are domains + certificates handled? (HTTPS enforced, HSTS, valid origin certs)
- Data: volumes backed up? restore tested?
- Access: exposed ports, root containers, missing auth on admin surfaces.

Output: inventory (what runs where), risks as `[high|med|low] - location - fix`,
and the 3 changes that most reduce operational risk.
