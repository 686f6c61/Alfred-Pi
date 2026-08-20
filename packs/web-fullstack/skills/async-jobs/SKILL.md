---
description: Design or fix product job queues (Celery, RQ, Hangfire, MassTransit, BullMQ) with retries, idempotency and a declared failure policy. Use when the user asks to enqueue, retry or drain application jobs, not to run pi background tasks or triage a down service.
origin: original
license: MIT
---

# Async jobs

Produce a queue change that is safe to retry: idempotent handlers, a
visible retry budget and a named policy for poison messages.

## Procedure

1. **Detect the queue.** Celery/RQ (`celery`, `Retry(`, Redis/Rabbit
   broker), Hangfire (`[AutomaticRetry]`, dashboard), MassTransit,
   BullMQ (`Queue`, `Worker`, `attempts`). Do not invent a DLQ that
   the library does not ship.
2. **Delivery is at-least-once.** Celery acks on success unless
   `acks_late=True`; then a crash mid-task redelivers. BullMQ keeps
   failed jobs in the `failed` set with retention, not a native
   dead-letter queue. Hangfire retries ten times by default
   (`AutomaticRetryAttribute`) and then sits in `Failed` for a manual
   retry. RQ uses `FailedJobRegistry`. Name the project's policy.
3. **Idempotency.** Keys scoped to actor plus operation. Emails,
   charges and webhooks must tolerate a second run. Pass identifiers,
   not whole entities (Hangfire serializes arguments to JSON).
4. **Between commit and publish.** If the row must exist before the
   message is seen, declare outbox, compensation or reconciliation.
   "Hope the broker is up" is not a strategy.
5. **Verify with the project's worker.** Run the existing worker or
   a focused job test. Do not install Redis, RabbitMQ or Hangfire
   Server in silence.

## Output format

```markdown
| Job | Queue | Retry | Idempotent | Failure policy | Evidence |
|---|---|---|---|---|---|
| send_invoice | celery invoices | max 3 + backoff | payment_id key | broker DLX | tasks.py:88 |

## Finding JOB-01: <short title>
- Severity: <high | medium | low>
- Location: <file:line>
- Evidence: <retry config or missing key>
- Fix: <specific option or outbox step>
- Verify: <worker or test command>
```

## What not to do

- Do not promise a "Celery dead-letter queue"; configure it on the
  broker (`x-dead-letter-exchange`) if that is the policy.
- Do not treat BullMQ `failed` as a discard queue without retention
  and a drain runbook.
- Do not enqueue from a request and write the row after, without
  outbox or a compensating path.
- Do not start workers, purge queues or retry all failed jobs without
  authorization.

## Limits and handoffs

This skill owns product queues. `pi-background-tasks` is the pi
essential for agent-side jobs, not invoices. A service that does not
answer is `incident-triage`. HTTP handlers stay in `http-service`.
Persist the business row with `app-persistence` before arguing about
the message.
