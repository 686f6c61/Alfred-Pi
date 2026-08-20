---
description: Reproducible data exploration with pandas - load and profile, clean with auditable steps, aggregate and visualize with conclusions. Use when exploring or cleaning CSV/Excel/dataframes.
origin: original
license: MIT
---

# Pandas Analysis

## Reproducibility contract

The notebook runs top-to-bottom on a fresh kernel or it does not exist.
Raw data is read-only; every transformation is a cell; the final figure
re-derives from the source with one Run All. Randomness seeded; paths and
credentials from env, not hardcoded.

## Load and profile first

- Inspect before believing: `shape`, `dtypes`, `head`, `describe`,
  `isna().sum()`, `nunique`, duplicated subsets. Write down what a row
  MEANS (grain) in a markdown cell; wrong grain is the root of most bad
  analyses.
- Types with intent: dates parsed with format, ids as strings (leading
  zeros, the classic), categoricals where cardinality wants them.

## Clean in auditable steps

- **Nulls**: quantify, decide per column (drop, impute, or flag) and say
  why in one line; silent `fillna` is how lies ship.
- **Duplicates**: define the key first; `drop_duplicates()` without a key
  is deleting data with style.
- **Outliers**: detect (quantiles, z-score, domain rules), investigate
  before removing; they are often the finding.
- Chain, do not mutate in place mid-thought: `assign`/masks that read as
  sentences; intermediate checks printed, not assumed.

## Aggregate and conclude

- One question per aggregation; group by the grain you declared; watch
  averages of ratios vs ratios of sums (Simpson waits in the group-bys).
- Merge hygiene: validate (`one_to_one`...), suffixes explicit, and check
  row counts before/after (a silent inner join eating 30% of rows is a
  classic).
- Visualization to reveal (distributions before summaries, time with real
  time axis); annotate the takeaway on the chart itself.

## Deliverable

Findings with numbers and units, the caveats (nulls, windows, grain), the
one cell that regenerates each figure, and the honest "what this data
cannot answer".

## Review gate, limits and hand-offs

1. Execute the notebook with the repository's runner or
   `jupyter nbconvert --to notebook --execute <notebook.ipynb> --output-dir <new-temp-dir>`;
   do not install a missing dependency silently or treat stale cell output as evidence.
2. Record the result literally as `Source and grain`, `Execution command`,
   `Findings with units`, `Quality caveats` and `Cannot answer`.
3. Reject delivery if it blanket-drops nulls or outliers, mutates hidden state,
   merges without cardinality validation or reports a chart without its source cell.
4. Stop when access, grain or business meaning is unresolved. Keep raw data
   read-only, secrets in environment references and personal rows out of the report.
5. Hand reusable fitness gates to `data-quality`, slow database work to
   `sql-optimization` and presentation decisions to `dashboard-design`; this
   skill owns exploratory computation, not production pipelines or causal claims.
