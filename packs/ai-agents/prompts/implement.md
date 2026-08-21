---
name: implement
description: Execute a spec or ticket graph with agents - frontier, worktrees, budget, one collector
argument-hint: <spec-or-tickets>
origin: adapted
license: MIT
---

Implement this with agents: $@

Apply the agent-orchestration skill with the **DAG / frontier** pattern
when the work already has blocking edges. If there are no blocking
edges, use `/fanout` instead of this prompt.

1. Read the spec or the ticket list. Name the graph: tickets, blocking
   edges, current frontier (tickets with no unmet blocker). If the user
   gave a blob of intent and no tickets, treat it as **one** ticket and
   stay sequential.
2. Check `/stack` health and `/usage` (daily budget and model prices)
   before launching anyone. Say the estimate (units × per-unit cost).
   Budget exceeded → sequential + cheap models, and say so.
3. One worktree and one branch per writer (`pi-crew` or `git worktree`).
   Briefs are pointers (spec path, ticket path, files), not pasted
   novels. Writers do not merge each other.
4. Each ticket that changes behaviour runs **tdd-workflow** at a named
   seam: red, green, then the original tests for that unit.
5. One collector merges by ticket intent, then **pr-review-checklist**
   (including Spec / fidelity). Recalculate the frontier after each
   merge; launch only what just unblocked.
6. Report as pipes:
   `ticket | state | branch | tests | cost | merged or discarded and why`
   Remove leftover worktrees only after confirming they have no
   uncommitted work.

Do not invent a GitHub Issues board. A local list
(`.scratch/<feature>/tickets/*.md`) is enough when the user did not
bring a tracker.
