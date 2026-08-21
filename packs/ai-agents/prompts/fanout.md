---
name: fanout
description: Plan and run a subagent fan-out for a task - pattern choice, briefs, per-role models, budget estimate and merge protocol
argument-hint: <args>
origin: original
license: MIT
---

Fan out this task across agents: $@

Apply the agent-orchestration skill:
1. Decompose the task; name the pattern (sequential / fan-out / crew-worktree
   / role chain / map-reduce / DAG) and justify it in one line. If the work
   already has blocking edges, use `/implement` instead.
2. Check `/stack` health and the budget before committing; show the
   cost estimate (units × per-unit cost from the usage table).
3. Write the brief per subagent (goal, scope, inputs, output format).
4. Assign models per role from the configured profiles.
5. Execute with the available tooling (pi-subagents / dynamic-workflows /
   pi-crew), collect with the merge protocol, and report what ran, what it
   cost, and what was merged or discarded.
