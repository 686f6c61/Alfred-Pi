---
description: Review repository code and configuration against the OWASP Top 10 with reachable, evidence-backed findings and minimal fixes. Use when the user asks for a defensive security review of code, APIs or endpoints.
origin: original
license: MIT
---

# OWASP Review

Produce a defensive code review that reports only reachable OWASP risks, each
anchored to `file:line`, an attack scenario and a minimal verification step.

## Procedure

1. **Set the review boundary.** Read the repository architecture, deployment
   config and route definitions. Use `rg --files` and framework manifests to
   identify entry points, authentication middleware, storage and outbound I/O.
2. **Map data flow.** For each route or consumer, trace untrusted input through
   validation, authorization, execution and output. Record the enforcement
   point rather than assuming a framework default.
3. **Hunt by category.** Use the surfaces below as leads, then inspect the
   actual call path before recording a finding.

| Category | Repository surfaces to inspect | Proof required |
|---|---|---|
| A01 Access control | Route guards, object lookups, tenant filters | A user can reach an object or action without the required policy |
| A02 Cryptography | Password hashing, TLS config, secrets at rest | Weak or absent protection on sensitive data |
| A03 Injection | SQL, shell, template, deserialization, LLM tools | Untrusted data reaches an interpreter without a safe API |
| A04 Insecure design | Rate limits, abuse cases, privilege boundaries | A realistic abuse path lacks a design control |
| A05 Misconfiguration | CORS, debug, defaults, headers, error handlers | Deployed config exposes the unsafe state |
| A06 Components | Lockfiles, runtime image, advisories | Vulnerable code is present and reachable |
| A07 Authentication | Sessions, reset flows, MFA gates, token checks | An attacker can bypass or retain authentication |
| A08 Integrity | Webhooks, CI actions, updates, artifact provenance | Untrusted content can be accepted as trusted |
| A09 Logging | Privileged events, secret filters, alert paths | Security-relevant activity is lost or sensitive data is logged |
| A10 SSRF | URL fetchers, redirects, DNS and protocol checks | User influence reaches a server-side request outside policy |

4. **Validate reachability.** Confirm the input source, missing or bypassable
   control, vulnerable sink and impact. Search for compensating controls and
   tests before assigning severity.
5. **Assign severity.** Use critical or high only for a credible path with
   material impact; medium for conditional exploitation; low for a concrete
   defense-in-depth gap. Record uncertainty instead of inflating it.
6. **Recommend the smallest fix.** Patch the enforcement point, add a focused
   regression test and state the command that verifies it. Do not change code
   unless the user requested remediation.

## Output format

```markdown
## [high] OWASP-01: <short title>
- Category: A0X <name>
- Location: <file:line>
- Scenario: <attacker capability, action and impact>
- Evidence: <reachable source -> missing control -> sink>
- Minimal fix: <specific change>
- Verify: <existing test command or focused check>
```

End with counts by severity, reviewed surfaces, explicit blind spots and a
verdict: `block`, `fix soon` or `no verified OWASP findings`.

## What not to do

- Do not report a regex hit without proving the data path and impact.
- Do not treat every missing header or outdated package as an exploitable bug.
- Do not paste secrets, tokens or sensitive request bodies into the report.
- Do not provide weaponized payloads when an inert proof or code trace suffices.

## Limits and handoffs

This review is not a penetration test, compliance certificate or authorization
to probe a live system. Stop before offensive validation or destructive changes
unless the user supplies explicit scope and approval.

Use `frontend-security` for the browser-specific sink, CSP and token-storage
pass; use `dependency-audit` for advisory and maintenance triage; use
`threat-modeling` when the missing control is architectural. This skill owns the
broad OWASP code pass and does not duplicate those deeper workflows.
