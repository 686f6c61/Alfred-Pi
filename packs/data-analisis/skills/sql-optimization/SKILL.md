---
description: SQL query optimization - EXPLAIN reading, index design, join and aggregation tuning, N+1 detection. Use when a query is slow, an index is debated, or the database is the bottleneck.
origin: original
license: MIT
---

# SQL Optimization

## Read the plan before touching anything

Postgres: `EXPLAIN (ANALYZE, BUFFERS)`; MySQL: `EXPLAIN ANALYZE`. Read
bottom-up, hunting four smells:

1. **Seq Scan over a filtered big table**: index candidate in the
   WHERE/JOIN/ORDER BY columns; verify selectivity first (an index on a
   boolean that matches 40% of rows helps nobody).
2. **Rows estimated wildly off rows actual**: stale statistics ->
   `ANALYZE`, or data skew the planner cannot model (rewritten query or
   partitioning, not more indexes).
3. **Nested Loop with a huge inner**: missing join index, or the join
   order is fighting you; check the join condition types match (text vs
   uuid casts kill index use).
4. **Sort/Spill to disk**: work_mem too low for the operation, or sort on
   an expression without a matching index.

## Index design

One index per real query shape, composite ordered by selectivity with
equality columns first and range/order last; INCLUDE covering columns to
make the index the whole answer. Every index is a write tax: drops need
the same justification as adds. Partial and expression indexes are the
precision tools people forget.

## Query shape fixes (before hardware)

- Filter and aggregate early; `SELECT *` in a subquery is a smell.
- Batch key lookups instead of N+1 from the app (the query count is the
  tell; one query with 10k round-trips loses to one IN-list or a join).
- Pagination by keyset (`WHERE id > $last ORDER BY id LIMIT n`), never
  OFFSET into the deep pages.
- DISTINCT and GROUP BY to repair a fan-out join: fix the join, not the
  symptom; the wrong counts under the dedup are the real bug.
- CTEs as documentation, knowing materialization semantics per engine.

## Report format

`[smell] plan evidence (line of the plan) - fix - expected effect`, and
always re-measure with the same EXPLAIN after: a claim without a
before/after plan is an opinion.
