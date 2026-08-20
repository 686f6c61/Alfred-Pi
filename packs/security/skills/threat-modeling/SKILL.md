---
description: Build an evidence-backed threat model for a feature, service or repository, with assets, trust boundaries, abuse paths and prioritized mitigations. Use when the user asks to threat model a system, assess an attack surface, or define security review scope.
origin: original
license: MIT
---

# Threat Modeling

Produce an engineering threat model that ties realistic abuse paths to the
repository and ends with three prioritized, verifiable risk reductions.

## Procedure

1. **Bound the scope.** Name the feature, actors, deployed components and
   excluded systems. Use `rg --files` and the repository architecture docs to
   find the real entry points before drawing a boundary.
2. **Inventory assets.** Record data, credentials, money, control planes and
   availability commitments. State who owns each asset and the consequence of
   loss, disclosure or corruption.
3. **Trace trust boundaries.** Follow input from edge to storage and cite the
   implementation as `file:line`. Include browser to API, service to database,
   webhook to queue, CI to registry and user content to an LLM when present.
4. **Write abuse paths.** For every boundary, combine an attacker capability,
   an action and an impact. Cover web abuse such as IDOR, injection, SSRF and
   replay; for LLM systems also cover prompt injection, tool overreach, data
   exfiltration and poisoned retrieval content.
5. **Verify existing controls.** Locate authentication, authorization,
   validation, rate limits, isolation and audit logging in code or config.
   Credit a mitigation only when its enforcement point is visible.
6. **Rank the gaps.** Judge reachability, required privilege, impact and the
   strength of current controls. Prefer the smallest mitigation at the
   boundary where untrusted data first becomes trusted.
7. **Close with three actions.** Give an owner, concrete change and verification
   for the three fixes that reduce the most risk. Split the model when the
   scope cannot fit in one concise artifact.

## Output format

```markdown
# Threat model: <scope>
Scope: <included systems>; excluded: <explicit exclusions>

| Asset | Owner | Loss scenario | Evidence |
|---|---|---|---|
| <asset> | <actor/team> | <impact> | <file:line or config> |

| Boundary | Data crossing | Existing control | Evidence |
|---|---|---|---|
| <source -> destination> | <data> | <control or none> | <file:line> |

| Risk | Abuse path | Likelihood | Impact | Mitigation | Verification |
|---|---|---|---|---|---|
| TM-01 | <capability -> action -> impact> | <L/M/H> | <L/M/H> | <minimal fix> | <test or command> |

Top three: <TM-id, owner, next action>
```

## What not to do

- Do not list STRIDE labels without a repository-specific abuse path.
- Do not invent infrastructure, controls or attacker access not supported by
  evidence; mark unknowns as assumptions.
- Do not score every hypothetical as high or bury the top risks in a catalogue.
- Do not prescribe a rewrite when a boundary check or narrower permission fixes
  the risk.

## Limits and handoffs

This is design analysis, not a penetration test. Do not execute exploit code,
probe third-party systems or expand scope without explicit authorization. Keep
credentials and sensitive payloads out of the artifact and logs, and require
confirmation before any destructive validation.

Use `owasp-review` for a broad code-level vulnerability pass,
`frontend-security` for browser-only sinks and session handling, and
`dependency-audit` for vulnerable components. Reuse verified controls before
proposing new ones, and hand legal or regulatory conclusions to the relevant
professional.
