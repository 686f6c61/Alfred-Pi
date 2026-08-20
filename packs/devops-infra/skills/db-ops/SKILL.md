---
description: Database operations for postgres/mysql/mariadb - lock-aware changes on a running server, backups with restore drills, slow queries, connection problems, data volumes. Use when the task touches a live database server, not the application ORM.
origin: original
license: MIT
---

# DB Ops

Application ORM migrations (Alembic, EF Core, Prisma, Knex) belong to
the web-fullstack skill `app-persistence`. This skill starts when the
change is lock, backup, restore or a query on the live server.

## Migrations that do not take you down

- **Zero-downtime shape**: add nullable column -> backfill in batches ->
  enforce not null + deploy code that uses it -> (much later) drop old.
  Each step reversible; never a big-bang table rewrite in one migration.
- **Lock awareness** (postgres): ALTERs that rewrite the table take
  ACCESS EXCLUSIVE; adding a column with a default is metadata-only in
  modern pg, adding a volatile default is not; index with CONCURRENTLY
  (outside a transaction) for live tables; mysql: instant vs copy
  algorithms differ per version - check before shipping.
- **Ordering**: migrations run before/after code per direction (expand
  before deploy, contract after). CI runs them on every PR against a
  fresh database; a migration that only works on the dev's machine is a
  reverting experience.
- Always write the down path or the documented escape hatch.

## Backups: they do not exist until restored

pg_dump is not a backup strategy; **restore drills** are. Nightly dump
(compressed, off-server, encrypted) + WAL archiving/point-in-time when the
data justifies it. Schedule the restore test (staging, monthly): time it,
verify row counts and the app actually boots on it. Backup the schema
objects' definitions too (jobs, extensions, permissions).

## Slow queries

`EXPLAIN (ANALYZE, BUFFERS)` (postgres) / `EXPLAIN ANALYZE` (mysql):
read the plan bottom-up; the classic four - sequential scan on a filtered
big table (index candidate in the WHERE/ORDER BY columns), wrong index
chosen (statistics stale: ANALYZE), N+1 from the app side (query count
tells), and rows-estimated vs rows-actual divergence (statistics or
skew). An index per real query shape; indexes are not toppings.

## Connections and data volumes

- **Connection refused / too many**: pool sizing at the app (small pools
  win), check pg_hba/list_addresses and mysql binds for the
  "works from localhost only" classic.
- **Volumes in compose/k8s**: named volumes for data, backups of those
  volumes tested, migration of volume across hosts documented.
- Healthchecks gating "ready" on `SELECT 1` (see docker-workflow's
  depends_on condition).

## Report format

```markdown
| Finding | Severity | Database evidence | Operational risk | Minimal action | Verification |
|---|---|---|---|---|---|
| DB-01 | blocker/high/medium/low | <query, plan or backup artifact> | <lock, loss, latency or outage> | <bounded change> | <command and expected result> |

Recovery point: <last usable backup and timestamp>
Restore drill: <date, duration and evidence path, or missing>
Change order: <expand, deploy, backfill, contract>
Stop condition: <lock, missing backup, irreversible step or approval>
```
