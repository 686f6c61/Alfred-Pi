---
name: refactor
description: Behavior-preserving refactor of a path or symbol - plan of small verified steps, then apply them one by one
argument-hint: <args>
origin: original
license: MIT
---

Refactor $@ without changing behavior.

1. Read the target and its callers. State the current behavior you must preserve.
2. Name the smells and pick moves from the refactoring-patterns skill.
3. Write the step plan (one move per step, safety net per step).
4. Apply step by step, verifying (tests/types) after each.

If tests don't exist and the code is non-trivial, write characterization
tests before step 1. If any step can't be verified, stop and report why.
