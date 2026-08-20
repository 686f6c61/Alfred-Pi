---
description: Domain-Driven Design architecture - ubiquitous language, bounded contexts and context mapping, aggregates with invariants, entities vs value objects, domain events, hexagonal placement. Use when designing or reviewing system structure, module boundaries, or when the model and the code speak different languages.
origin: original
license: MIT
---

# DDD Architecture

The core claim: software rots when the team, the code and the domain stop
speaking the same language. DDD is the discipline that keeps them aligned.

## Strategic design (before any class)

### Ubiquitous language

One term, one meaning, everywhere: conversation, code, tests, commits. If
sales says "account", support says "profile" and the code says `User`,
every feature pays a translation tax. Gaps in the language ARE the design
finding: `Order` vs `Basket` vs `Cart` in one codebase means a boundary is
missing.

### Bounded contexts

The same word means different things in different contexts, and that is
correct: `Customer` in Marketing (a lead with segments) is not `Customer`
in Fulfillment (a shipping address with constraints). A context is the
unit of model consistency: inside, the language is one; across, translate.

Context map (draw it as boxes and arrows, one page):

| Pattern | When |
|---|---|
| **Partnership** | Two contexts evolve together, same team cadence |
| **Customer-Supplier** | Upstream serves downstream; downstream has a voice |
| **Conformist** | Downstream accepts upstream's model as-is (be honest when you do) |
| **Anticorruption layer (ACL)** | Downstream translates an external/legacy model into its own; the single best defense against legacy gravity |
| **Open Host Service / Published Language** | One published contract for many consumers (pairs with api-design) |

### Subdomains (why the contexts exist)

Core (your competitive edge: invest, model deeply), Supporting (needed,
buy or keep simple), Generic (auth, billing: buy/adopt, do not invent).
DDD effort goes to core; CRUD is the CORRECT design for generic.

## Tactical design (inside a context)

### Aggregates

An aggregate is a consistency boundary around invariants: one transaction,
one aggregate, always.

- Rules of thumb: aggregate root is the only entry point; references to
  others go by ID, never by object; keep aggregates SMALL (the invariant
  decides the size: an order of max 20 lines justifies lines inside the
  Order; product names do not).
- One aggregate per transaction; cross-aggregate consistency is eventual,
  via domain events (below). If you need two aggregates atomic, the
  boundary is probably wrong or the invariant is mislabeled.

### Entities, value objects, and the bias

Value objects (no identity, immutable, equality by value: Money, DateRange,
Address) are the default choice; entities (identity over time) only when
tracking matters. Anemic models (all entities, all getters/setters, logic
elsewhere) are the anti-pattern: put the behavior where the data lives.

### Domain events

Past-tense facts (`OrderPlaced`, `PaymentFailed`) that carry intent across
boundaries. Rules: named in the ubiquitous language, published by the
aggregate that owns the fact, consumed asynchronously; events are
contracts too (versioning belongs in the conversation, not the postmortem).

### Placement: hexagonal (ports and adapters)

Domain at the center with zero framework imports; ports (interfaces the
domain owns) for persistence, messaging, time; adapters implement them
outside. The test: the domain package compiles without the framework on
the classpath. Repositories are ports of the domain, one per aggregate;
queries that feed screens can bypass the model (CQRS-lite: read models
where the screens need shape, no ceremony).

## How to run a DDD pass

1. **Event storming-lite**: list domain events on the wall (past tense),
   then commands that cause them, then the aggregates that enforce them;
   boundaries emerge where the language shifts or invariants cluster.
2. **Name the contexts and the map**: one page, patterns labeled, ACLs
   explicit, saved as `docs/context-map.md` so it survives the meeting.
   Every integration is a decision, not an accident.
3. **Slice one vertical**: one aggregate, end to end (events, port,
   adapter, test), before scaffolding the rest.
4. **Record it**: contexts and their reasons are exactly what
   `adr` (docs pack) exists for; API boundaries between contexts follow
   the api-design skill with the published-language lens.

## Honesty section

- CRUD app with one team and one database: DDD is overhead; modules with
  clear names win.
- "Shared kernel" everywhere is the smell of no boundaries; so is one
  `common`/`core` package that every context imports.
- Microservices are an output of context mapping, never an input; a
  modular monolith with honest boundaries upgrades cheaply when (if) the
  map demands it.
