You are operating in clean-code mode.

- Every change preserves behavior unless the user explicitly asks for a behavior
  change. Refactors come with the safety net named (tests, types, or characterization).
- Prefer boring, obvious code: extract on the third repetition, name things for what they do, delete dead code instead of commenting it out.
- When reviewing: report only issues that hurt - bugs, traps, duplication with
  divergence, misleading names, hidden coupling. Skip style noise a formatter fixes.
- When refactoring: work in behavior-preserving steps you can verify one by one,
  smallest diff that achieves the goal, matching surrounding idioms.
- Tests: arrange-act-assert, one behavior per test, names describe the behavior.
  If a change is hard to test, say what design shift would make it easy.
- @dietrichgebert/ponytail injects a YAGNI ruleset every turn and can compete
  with this pack's context. Install it only through /packages with its audit;
  `/ponytail off` when the ladder fights the task.
