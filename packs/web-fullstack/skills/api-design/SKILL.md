---
description: Design or review HTTP APIs against real routes or an OpenAPI contract, covering resources, errors, pagination, authorization and compatibility. Use when the user asks to create, change or assess an HTTP API.
origin: original
license: MIT
---

# API Design

Produce an implementation-ready API contract or review, with every route tied
to the repository, compatibility risks ranked and verification stated.

## Procedure

1. **Find the source of truth.** Locate `openapi*.yaml`, `openapi*.json` or
   route handlers with `rg --files | rg '(openapi|swagger|routes?|controllers?)'`.
   Read framework config and existing tests before proposing a new pattern.
2. **Inventory the surface.** Record method, path, resource, authentication,
   authorization rule, request schema, success response and documented errors.
   If code and OpenAPI disagree, report the drift explicitly.
3. **Check the resource model.** Prefer nouns, stable identifiers and nesting
   only for true ownership. Cap nesting at two levels and model state-changing
   actions as subresources when ordinary CRUD cannot express them.
4. **Check HTTP semantics.** Verify safe and idempotent behavior, `201` plus
   `Location` for creation, `204` for empty success, and distinct `400`, `401`,
   `403`, `404`, `409`, `422` and `429` contracts where applicable.
5. **Check contracts.** Require machine-readable error codes, validation at the
   edge, bounded pagination and stable ordering. Use cursor pagination for
   mutable lists and document limits, filters and retry behavior.
6. **Check trust boundaries.** Enforce authorization on every object access,
   scope idempotency keys to the actor and operation, and avoid secrets or
   internal stack details in responses and examples.
7. **Assess compatibility.** Classify removals, renames, type narrowing and
   changed defaults as breaking. Prefer additive evolution; version a public
   contract only when compatibility cannot be preserved.
8. **Verify against the repo.** Run the existing contract or route tests and an
   already-configured OpenAPI validator. Do not install tooling, regenerate
   clients or change a public contract silently.

## Output format

```markdown
| Method | Path | Authn | Authz | Request | Success | Errors | Pagination | Evidence |
|---|---|---|---|---|---|---|---|---|
| GET | /v1/invoices/{id} | session | invoice:read | path id | 200 Invoice | 401/404 | n.a. | src/routes/invoices.ts:24 |

## Finding API-01: <short title>
- Severity: <breaking | high | medium | low>
- Route: <METHOD /path>
- Evidence: <file:line or OpenAPI pointer>
- Impact: <client or security failure>
- Minimal change: <specific contract or implementation fix>
- Verify: <existing test command>
```

## What not to do

- Do not invent routes from naming preferences when the repository has an
  established contract style.
- Do not return `500` for expected domain failures or overload `200` with error
  payloads.
- Do not expose persistence entities directly or trust a client-side ownership
  check.
- Do not make a breaking migration, delete data or overwrite generated clients
  without an explicit plan and approval.

## Limits and handoffs

This skill owns the published HTTP surface, not internal domain boundaries or a
full vulnerability audit. Implementing, repairing or listing live handlers,
middleware and server auth is `http-service`; do not copy that skill's table.
Use `ddd-architecture` for bounded-context design, `owasp-review` for broad
security findings and `release-gate` for production readiness. If the task
requires legal retention rules or a destructive data migration, stop and
involve the appropriate owner.
