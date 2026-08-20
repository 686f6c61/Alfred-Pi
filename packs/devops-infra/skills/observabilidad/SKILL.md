---
description: Observability engineering - structured logs, RED/USE metrics, alert thresholds with SLOs, traces, dashboards that answer questions. Use when adding logging/metrics/tracing (Prometheus, Grafana, Loki) or designing alerts and dashboards.
origin: original
license: MIT
---

# Observability

Telemetry is a product for your on-call self. Design it like one: queries
you will actually run, alerts you will actually act on.

## Logs

- **Structured (JSON) by default**: level, time, service, version,
  trace_id, and the event's nouns (user_id, request_id, order_id). Grepping
  prose is archaeology.
- Levels with discipline: warn means someone should look eventually,
  error means business impact or data risk; no error-spam at normal
  operation (alert fatigue is self-inflicted).
- No PII or secrets in logs (the compliance pack owns the why); retention
  explicit (Loki with tiers beats "keep forever on disk").

## Metrics: RED and USE

- **Services (RED)**: rate, errors, duration per endpoint/queue.
- **Resources (USE)**: utilization, saturation, errors per CPU, memory,
  pool, disk.
- Naming: `service_entity_what_unit` (`api_requests_duration_seconds`);
  counters monotonic, histograms for durations (avg hides the pain, P95+
  tells it), labels low-cardinality (no user_id as label).
- Prometheus patterns: recording rules for the hot aggregations; alert on
  symptoms (error ratio, latency burn) not causes (CPU at 80%).

## Cold verification

Validate rule syntax with `promtool check rules <rules-file>`, then run the
queries against the target time window. For HTTP services, start with:

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
clamp_min(sum(rate(http_requests_total[5m])), 1)

histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

Record the query, time range and observed value. A dashboard screenshot without
the underlying query or a green rule file without live series is not evidence.

## Alerts that survive on-call

Thresholds from **SLOs**: error budget burn (fast-burn page, slow-burn
ticket) beats fixed magic numbers. Every alert carries: what is broken,
for whom, and the runbook link. If a page cannot say that, it is a
dashboard, not an alert. Symptomless "informational" pages get silenced
by week two.

## Traces

Trace at the boundaries (HTTP in, queue in/out, DB span per meaningful
query) with trace_id propagating into logs. Sample smart: head-based
default plus tail-based keep-the-errors. The payoff is answering "where
did these 800 ms go" without printf-archaeology.

## Dashboards

One dashboard answers one audience's one question: service health (RED +
slo burn), resource health (USE), and per-incident temporary boards.
Annotate deploys on every graph: a line without deploy marks is gossip.
