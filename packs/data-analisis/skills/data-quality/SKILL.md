---
description: Data quality profiling with reproducible checks for completeness, uniqueness, validity, freshness and reconciliation. Use when deciding whether a dataset is fit for analysis, reporting or a pipeline hand-off.
origin: original
license: MIT
---

# Data Quality

Produce a reproducible quality report with measured evidence, an intended-use
verdict, blocking defects and the smallest owner-assigned remediation.

## Procedure

1. **Declare the contract.** Record the dataset, intended use, row grain,
   business key, load window, timezone, expected volume and authoritative
   source. Distinguish null, not applicable and not yet loaded before counting.
2. **Choose the repository's runner.** Inspect SQL, dbt models, notebooks and
   pipeline checks with `rg -n "unique|not_null|accepted_values|freshness" .`.
   Use a read-only query, `dbt test --select <model>` or a pandas check already
   supported by the project; do not install a new tool silently.
3. **Profile completeness and uniqueness.** Measure null rates per column and
   per row, then duplicate counts on the declared key and on normalized keys.
   Compare rates over time so a recent load regression is not hidden by history.
4. **Test validity and referential integrity.** Check domain ranges, formats,
   enums, impossible date orderings and missing parents. Keep domain rules
   separate from statistical outlier rules and cite the source of each rule.
5. **Measure freshness and consistency.** Compare the newest event and load
   timestamps with the service-level expectation. Reconcile counts and totals
   against the authoritative system at the same grain, filters and cutoff.
6. **Classify and gate.** For each failure, state impact on the intended use,
   owner, bounded fix and rerun command. Stop downstream analysis only for a
   named blocking rule; preserve warnings and their caveats in every output.

## Concrete checks

Adapt identifiers and filters to the real schema, then preserve the query next
to the pipeline or in the repository's existing quality suite:

```sql
SELECT COUNT(*) AS rows,
       SUM(CASE WHEN business_key IS NULL THEN 1 ELSE 0 END) AS missing_keys
FROM target_table;

SELECT business_key, COUNT(*) AS occurrences
FROM target_table
GROUP BY business_key
HAVING COUNT(*) > 1;
```

For pandas, record `df.shape`, `df.isna().mean()`,
`df.duplicated(subset=["business_key"]).sum()` and the maximum load timestamp.
For dbt, prefer explicit `not_null`, `unique`, `relationships`,
`accepted_values` and source freshness rules over an unrecorded chat result.

## Output format

| Status | Dimension and rule | Dataset or model | Measured evidence | Impact on intended use | Owner and smallest fix | Rerun |
|---|---|---|---|---|---|---|
| pass/warn/fail | freshness <= 24 h | model or `file:line` | value, denominator, cutoff | usable or blocked for X | owner plus bounded action | exact query or command |

Finish with `Verdict: fit | fit with caveats | not fit for <use>` and list the
blocking rules separately from warnings.

## Anti-patterns

- Do not use a null percentage without its count, denominator and time window.
- Do not call rows duplicates until the business key and grain are declared.
- Do not blanket-drop outliers, nulls or failed rows to make a check pass.
- Do not reconcile sources with different filters, cutoffs or aggregation grain.
- Do not turn a one-off profile into a green production gate without an owner.

## Boundaries and hand-offs

This skill decides fitness, not business meaning or query performance. Use
`pandas-analysis` for exploration, `sql-optimization` for slow checks and
`dashboard-design` only after critical rules pass. Run read-only checks first;
never expose raw personal data, credentials or tokens in evidence. Confirm any
repair, backfill, deletion or production write, and stop for the data owner
when a rule or source of truth cannot be established.
