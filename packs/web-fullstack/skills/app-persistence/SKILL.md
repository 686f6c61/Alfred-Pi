---
description: Review and change product-database access in the app ORM (Alembic, EF Core, Prisma, Knex, TypeORM) covering transactions, migrations and N+1. Use when the user asks to migrate schema or fix queries inside the application, not to operate a live server backup.
origin: original
license: MIT
---

# App persistence

Produce a schema or query change that the application owns, with the
migration reviewed by hand and N+1 made explicit.

## Procedure

1. **Detect the ORM.** Alembic (`alembic.ini`, `versions/`), Django
   (`manage.py`, `migrations/`), EF Core (`Migrations/`, `DbContext`),
   Prisma (`prisma/schema.prisma`, `prisma.config.ts`), Knex
   (`knexfile.js` or `knexfile.ts`), TypeORM. Follow that tool's
   commands; do not mix them.
2. **Transactions.** Keep one unit of work per use case. Do not open a
   transaction around HTTP that can wait on a user. Name the isolation
   level only when the repository already uses one.
3. **Generate, then read.** Alembic `alembic revision --autogenerate`
   does not detect renames: a renamed column looks like drop plus add.
   EF `dotnet ef migrations add` can emit a cartesian explosion from
   sibling `Include` collections; prefer `AsSplitQuery` with its
   consistency cost stated. Prisma and Knex still need a human reading
   the SQL. Never apply autogenerate output unread.
4. **N+1 in the app.** SQLAlchemy `selectinload` / `joinedload` /
   `raiseload`. Django `select_related` / `prefetch_related`. EF
   `Include` / `ThenInclude` / `AsNoTracking`. Prisma `include` vs
   batched queries. Prove with a query count or a log, not a guess.
5. **Migrate with the project's command.** `alembic upgrade head`,
   `dotnet ef database update` (local only; production prefers a
   script or bundle), `prisma migrate dev`. Do not run
   `Database.MigrateAsync()` on every replica as the release plan
   unless the project already does and EF 9+ locking is understood.

## Output format

```markdown
| Change | ORM | Files | Risk | Rollback | Evidence |
|---|---|---|---|---|---|
| rename invoices.total | Alembic | versions/00xx | drop+add if unread | downgrade | versions/00xx.py:12 |

## Finding ORM-01: <short title>
- Severity: <high | medium | low>
- Location: <file:line or migration revision>
- Evidence: <query count, plan or generated SQL>
- Fix: <specific ORM call or migration edit>
- Verify: <existing test or explain command>
```

## What not to do

- Do not accept autogenerate as a rename.
- Do not add an index "just in case" without a query shape.
- Do not take ACCESS EXCLUSIVE in a product migration when a
  expand/backfill/contract sequence exists.
- Do not dump or restore the live cluster from this skill.

## Limits and handoffs

This skill owns application ORM work. Lock-aware operations on a
running postgres/mysql, backups and restore drills are `db-ops`.
Column profiling and source-to-source consistency are `data-quality`.
N+1 seen only in a live `EXPLAIN` of production is ops, not this
skill. HTTP handlers stay in `http-service`.
