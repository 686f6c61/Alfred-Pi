---
description: Contract testing between services - consumer-driven contracts, schema evolution, provider verification and breaking-change protocol. Use when services talk to each other and deploys surprise each other.
origin: original
license: MIT
---

# Contract Testing

## The problem it solves

Integration tests replicate the world (slow, brittle); contract tests
verify the agreement: consumer states what it needs, provider proves it
provides it, and both run in their own CI without the other being up.

## Consumer side

Write the interactions you actually depend on (method+path+query, the
exact fields you READ, status codes you handle) as contract fixtures;
they double as unit-test doubles. Rule: consume fields you use, nothing
more - every extra field read is coupling that will break on the
provider's next harmless refactor. Publish the contracts where CI can
verify them (Pact broker or the repo's contract directory).

## Provider side

Verify every published consumer contract against the real service (real
routes, real serialization, lightweight DB) on every PR. A provider
change that breaks a consumer's contract fails provider CI before it
ships - the surprise moves from Thursday night deploy to the PR where it
costs nothing.

## Schema-first variants

OpenAPI/GraphQL/gRPC as the contract: same discipline in different
clothes. Validate responses against the spec in CI (and the spec against
reality), lint for the sneaky breaking edits (removing a field, widening
a required one, narrowing a type). Version the schema; changelog
generated from the diff, BREAKING flagged.

## Breaking-change protocol

1. Provider adds (safe) -> consumers adopt at their pace -> provider
   removes the old field only when no contract reads it (broker
   can-i-deploy, or a deprecation window agreed between teams).
2. Consumer wants new capability -> new contract first, provider verifies
   against a branch, then builds. The contract is the conversation, not
   the postmortem.

## Anti-patterns

Contracts that mirror the entire response (that is a snapshot, it breaks
on every cosmetic change); contracts without CI verification
(documentation theater); and three services sharing one god-contract
(the blast radius of a shared contract is the whole team's calendar).
