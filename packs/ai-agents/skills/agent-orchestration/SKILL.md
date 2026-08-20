---
description: Patterns for orchestrating pi agents - when to go sequential vs fan-out vs crew-with-worktrees, role/model assignment, briefs, budgets and merging. Use when delegating to subagents, running parallel agents, or designing multi-agent workflows.
origin: original
license: MIT
---

# Agent Orchestration

## Pattern picker

| Situation | Pattern | Tool |
|---|---|---|
| Steps depend on each other; small context | **Sequential** (just you) | none - stay single-agent |
| Independent read-only tasks (research, review N files/PRs, compare options) | **Fan-out / gather** | pi-subagents roles, dynamic-workflows |
| Parallel *writes* to one repo | **Crew with worktrees** | pi-crew (one worktree per writer) |
| Pipeline with stages (explore → spec → implement → verify) | **Role chain** | pi-subagents scripted workflows |
| Huge search/synthesis (100s of units) | **Map-reduce** | @quintinshaw/pi-dynamic-workflows |

Rules of thumb: fan-out pays off when units × per-unit context ≫ your context,
or when latency matters more than tokens. If tasks share 80% of their context,
run them in ONE agent.

## The brief (what every subagent gets)

```
Goal: one sentence.
Scope: files/paths/URLs it may touch - nothing else.
Inputs: exactly what it needs (paste it; don't say "see repo").
Output: format + length (e.g. "findings list, ≤10 items, file:line each").
Constraints: read-only unless explicitly granted write; budget note if relevant.
```

## Model assignment per role

- scout / summarize / classify → cheap fast model
- implement / refactor → strong coding model
- review / verify / design → strong reasoning model (high thinking)
- Use Alfred-Pi profiles to name these stacks and switch without retyping;
  `/stack` shows which providers are healthy before you commit a fleet to one.

## Budget discipline

- Before a fan-out: estimate units × avg cost (the /usage table has per-model
  $/M; models.dev autofill keeps it current). Say the number out loud.
- Check the budget statusline: budget exceeded → sequential + cheap models, and
  say so; never silently launch a fleet into an exhausted budget.
- Prefer read-only subagents (they can't burn tokens on side effects).

## Merge protocol

1. One collector (you or a designated reviewer agent) - never peer-to-peer
   merge between subagents.
2. Conflicts resolved by the orchestrator with the original goal in mind.
3. Verify writers via diff review (worktrees make this cheap: one diff per
   worktree branch).
4. Report: what ran, what it cost (tokens/$ if available), what was merged,
   what was discarded and why.

## Failure handling

- A subagent fails or returns garbage → retry once with a tighter brief;
  then do it yourself or drop the unit. Don't cascade retries.
- Provider failing repeatedly (check /stack health) → switch models before
  relaunching, not after N failures.

Anti-patterns: fanning out to "speed up" a 2-step task; agents editing the
same file; nested fan-outs without budget math; using subagents to avoid
reading 200 lines yourself.
