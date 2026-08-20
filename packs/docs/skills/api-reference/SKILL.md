---
description: Generate and maintain API reference docs from OpenAPI specs, type exports or route handlers - dry endpoint tables, parameters, errors and runnable examples. Use when documenting an API or endpoints.
origin: original
license: MIT
---

# API Reference

Reference mode only (Diátaxis): dry, complete, navigable. No teaching, no
persuasion; a tutorial or how-to that appears here is a finding.

## Source of truth, in order

1. **OpenAPI/Swagger spec** (`openapi.json`, swagger config): generate,
   do not hand-write. Every operation gets: method+path, auth required,
   params (name, in, type, required, default), request body schema,
   responses with schemas, and one example per 2xx.
2. **Types or route handlers** (tRPC, Zod schemas, Express/Fastify/Hono
   routes, framework decorators): extract the contract mechanically;
   where types are loose, say so instead of inventing precision.
3. **No spec exists**: propose generating one (zod-to-openapi, fastify
   swagger) as a side effect; hand-maintained references rot.

## Shape

```
## POST /invoices

Create an invoice. Auth: bearer (editor role).

| Param | In | Type | Required | Notes |
|---|---|---|---|---|
| currency | body | string | no | default EUR |

Responses:
- 201 Invoice - example
- 400 ValidationError - shape
- 403 Forbidden (editor role required)
```

Rules: one page per resource, not per method; anchors for deep linking;
status codes listed even the boring ones; errors documented with their
machine code if the API has one. Examples must be runnable against a real
base URL with the documented auth.

## Maintenance contract

The reference regenerates from the spec; anything hand-added (notes,
gotchas) lives in clearly marked blocks so regeneration does not destroy
them. If the spec and the code disagree, that is a bug report, not a doc
choice.
