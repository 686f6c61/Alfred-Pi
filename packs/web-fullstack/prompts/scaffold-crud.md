---
name: scaffold-crud
description: Scaffold a resource end-to-end - data model, migration, API routes with validation, and frontend list/detail views, following the repo's existing patterns
argument-hint: <args>
origin: original
license: MIT
---

Scaffold the resource $@ end-to-end.

0. Detect the runtime: Python (FastAPI/Django + Alembic), C# (ASP.NET +
   EF), Node (Express/Fastify/Nest + Prisma/Knex), or Astro. Do not assume
   `src/pages`.
1. Read the repo's patterns first: stack, ORM, validation, routing,
   component style, test setup. Match them exactly.
2. Design the entity + relations; write the product migration with
   app-persistence, not a live-server dump.
3. API: public contract per api-design; handlers per http-service.
4. Frontend: list view (loading/empty/error states) + detail/form.
5. Tests at the layer the repo tests (at minimum: API validation + one journey).
6. Run lint/typecheck/tests; report what you ran.

Deliver a summary of files created/modified and any follow-ups you noticed.
