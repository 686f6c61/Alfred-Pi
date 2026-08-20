---
description: Inventory and fix live HTTP handlers (FastAPI, Django, ASP.NET, Express, Fastify, Nest) with effective path, auth and file:line. Use when the user asks to implement, repair or list server endpoints, not to redesign the public contract.
origin: original
license: MIT
---

# HTTP service

Produce a handler inventory of the running server and the smallest code
change that makes auth and errors match what the route actually does.

## Procedure

1. **Detect the runtime.** Look for `FastAPI(`, `APIRouter`, `urlpatterns`,
   `WebApplication.CreateBuilder`, `app.MapGet`, `[ApiController]`,
   `express()`, `fastify(`, `@Controller`, `nest-cli.json`. Name it before
   editing. Do not assume `src/pages`.
2. **Rebuild the effective path.** FastAPI composes `include_router` prefix
   plus `APIRouter` prefix plus the decorator. Django follows `include()`
   in `urlpatterns`. ASP.NET composes `[Route]` plus `[HttpGet]` or
   `MapGroup` plus `MapGet`. Nest composes controller path plus method.
   Publishing the decorator path alone is a false inventory.
3. **Find where auth actually runs.** FastAPI dependencies on the app,
   router, decorator and `Depends(...)` parameters run in that order. A
   route with no visible `Depends` may still be protected. In ASP.NET,
   `UseAuthentication` and `UseAuthorization` are added automatically when
   the services exist; missing `app.UseAuthorization()` is not proof that
   authorization is off. Look for `[Authorize]`, `RequireAuthorization()`,
   `AddAuthentication`. Django: `@login_required`, mixins, `MIDDLEWARE`.
4. **Map errors.** FastAPI `HTTPException` and `status_code=`. ASP.NET
   `Results.Problem`, `IExceptionHandler`. Express/Nest filters and
   `next(err)`. Do not treat a missing `try/catch` as a missing contract.
5. **Fill the table, then change code.** Cite `file:line`. Run the
   repository's existing handler or route tests. Do not install a
   framework or rewrite the public resource model.

## Output format

```markdown
| Method | Effective path | Handler | Auth | Middleware | Status map | Idempotent | Evidence |
|---|---|---|---|---|---|---|---|
| GET | /admin/items/{id} | items.py:41 | router Depends | none | 200/401/404 | yes | items.py:41 |

## Finding HTTP-01: <short title>
- Severity: <high | medium | low>
- Handler: <file:line>
- Evidence: <decorator, middleware or missing auth layer>
- Fix: <smallest code change>
- Verify: <existing test command>
```

## What not to do

- Do not publish the decorator path while ignoring router prefixes.
- Do not report "no auth" because `Program.cs` omits `UseAuthorization`.
- Do not copy the public-contract table from `api-design`.
- Do not invent FastAPI, Django or Nest structure from another runtime.
- Do not install frameworks or change a published OpenAPI document here.

## Limits and handoffs

This skill owns handler implementation. The public contract (resources,
pagination, compatibility, OpenAPI) is `api-design`. Browser XSS, CSP and
token storage are `frontend-security`. Broad OWASP hunting is
`owasp-review`. Product ORM work is `app-persistence`. Background queues
are `async-jobs`.
