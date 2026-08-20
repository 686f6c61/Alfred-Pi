---
description: Review browser code for XSS sinks, unsafe URLs, CSP gaps, token exposure, CSRF and postMessage trust failures. Use when the user asks to secure a frontend, sanitize user content or review browser-side session controls.
origin: original
license: MIT
---

# Frontend Security

Produce an evidence-backed browser security review with reachable attack paths,
minimal fixes and focused verification for each finding.

## Procedure

1. **Map browser inputs and trust.** Find pages, components, client stores,
   service workers and third-party scripts with `rg --files`. Trace URL data,
   API responses, storage and cross-window messages into rendered output.
2. **Hunt injection sinks.** Run a focused search such as
   `rg -n 'innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML|eval\(' src`.
   Inspect framework escape bypasses, templates and sanitizer configuration.
3. **Review URL handling.** Trace user-controlled values into `href`, `src`,
   redirects and `window.open`. Require parsing plus a protocol allowlist and
   account for encoded or relative values.
4. **Review session material.** Prefer server-set `httpOnly`, `Secure` and
   appropriate `SameSite` cookies. If a bearer token must reach JavaScript,
   keep it in memory, narrow its scope and expiry, and verify refresh behavior.
5. **Review cross-origin controls.** For cookie-authenticated writes, confirm a
   CSRF defense at the server boundary. For `postMessage`, require an exact
   `targetOrigin` and validate `event.origin` plus message shape on receipt.
6. **Review CSP and supply chain.** Inspect response or proxy headers, start
   from `default-src 'self'`, prefer script nonces and enumerate every external
   origin. Treat each third-party script as code executing with page trust.
7. **Validate reachability.** Prove the attacker-controlled source, missing or
   bypassable control, sink and impact. Use inert test strings and existing
   browser tests; do not execute weaponized payloads on live systems.
8. **Report and verify.** State the smallest fix and a regression check. Keep
   tokens, personal data and captured user content out of logs and artifacts.

## Output format

```markdown
## [high] FE-01: <short title>
- Location: <file:line>
- Source: <attacker-controlled value>
- Sink/control gap: <browser API or policy>
- Scenario: <action and user impact>
- Minimal fix: <specific safe API or policy change>
- Verify: <focused test or header command>
```

End with reviewed surfaces, findings by severity and explicit blind spots.

## What not to do

- Do not recommend regex as an HTML sanitizer or assume framework escaping
  covers an explicit escape bypass.
- Do not store session tokens in `localStorage` for convenience.
- Do not call a CSP effective while it relies on broad wildcards or
  `unsafe-inline` scripts without a documented exception.
- Do not paste real tokens, payloads or private messages into evidence.

## Limits and handoffs

This skill owns browser-specific controls. Use `owasp-review` for the broader
server and API pass, `dependency-audit` for vulnerable libraries, and
`release-gate` to verify deployed headers and TLS. It is not a penetration test
or permission to target users or third parties; stop when validation would
cross the authorized environment or require destructive state.
