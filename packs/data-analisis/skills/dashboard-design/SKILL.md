---
description: Dashboard design and review with traceable questions, metric contracts, honest charts and actionable evidence. Use when designing or auditing a Grafana, Metabase, Looker or custom dashboard.
origin: original
license: MIT
---

# Dashboard Design

Produce a dashboard brief or review that ties every tile to a decision, defines
each metric, records visual defects and names the smallest verifiable change.

## Procedure

1. **Locate the real surface.** Open the saved dashboard, exported JSON,
   LookML or application view. In a repository, start with
   `rg -n "dashboard|metric|kpi|grafana|metabase|lookml" .`; record the file,
   dashboard URL, active filters, time range and viewport used for review.
2. **Name audience and decision.** Write the one audience, operating cadence
   and decision the dashboard must support. List its questions before looking
   for chart types; remove any proposed tile that answers none of them.
3. **Write each metric contract.** Record numerator, denominator, grain,
   window, exclusions, timezone, source and owner. Show both counts beside a
   ratio, and use cohorts when the outcome has a lag.
4. **Audit tiles in reading order.** Check that the title states the takeaway,
   the chart type matches the question, axes and units are honest, and color
   has one stable meaning. Compare neighboring tiles for inconsistent filters
   or scales.
5. **Exercise the dashboard.** Change the time range and one material filter,
   inspect empty, loading and error states, and compare one displayed value
   with its source query. Record refresh time and whether permissions hide or
   expose data incorrectly.
6. **Write the artifact.** Reuse the repository's dashboard review document;
   otherwise write `docs/dashboard-review.md`. Separate blocking metric errors
   from visual improvements and include the evidence needed to verify each fix.

## Tile decisions

- Trend: line chart on a real time axis, with any non-zero baseline disclosed.
- Category comparison: sorted bars starting at zero; use horizontal bars for
  long labels.
- Distribution: histogram, box plot or quantiles, not an average alone.
- Relationship: scatter plot with units and sample size; do not imply causality.
- Part to whole: stacked bars for few stable categories; avoid unreadable pies.

Use one accent for the series that matters, neutral colors for context and a
colorblind-safe palette. Global filters stay visible and every tile states its
unit, window and last refresh time.

## Output format

| Priority | Question and decision | Tile or file | Evidence | Metric or visual defect | Smallest fix | Verification |
|---|---|---|---|---|---|---|
| blocker/high/medium/low | who decides what | URL, tile id or `file:line` | query, value or capture | exact mismatch | bounded change | filter, query or capture to repeat |

Finish with `Verdict: usable | usable with caveats | not usable`, followed by
the blocking conditions and the three highest-value changes.

## Anti-patterns

- Do not fill empty space with vanity counts or duplicate views of one metric.
- Do not choose a chart before defining the question and metric grain.
- Do not truncate bar axes or compare tiles with hidden window differences.
- Do not infer causality from correlation or hide small denominators behind a percentage.
- Do not edit production dashboards without an approved change and rollback path.

## Boundaries and hand-offs

This skill owns the analytical and visual decision layer. Use `data-quality`
when source trust is unknown, `pandas-analysis` for exploratory computation and
the compliance pack's `a11y-audit` for a formal accessibility pass. Stop when a
metric cannot be traced to a query or owner and report that gap instead of
inventing a definition. Keep datasource tokens, customer identifiers and raw
rows out of screenshots and reports; confirm any destructive or production
change before applying it.
