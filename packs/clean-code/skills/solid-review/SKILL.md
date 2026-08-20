---
description: Review a code tree for SOLID violations that actually hurt, with one pain-graded finding per line. Use when reviewing design quality, god classes, coupling, or when one change keeps forcing edits in many files.
origin: original
license: MIT
---

# SOLID Review

Produce a pain-graded SOLID report over a real tree: one line per violation
that hurts today, with the smallest fix. Not a lecture on the five letters.

## The pass

1. **Scope the tree.** Review the directory or module the user names. If
   none was named, find the hot spots first:
   `git log --format=format: --name-only | sort | uniq -c | sort -rn | head -20`
   and review the highest-churn directories.
2. **Hunt with grep, not vibes.** Anchors per principle:
   - SRP: one file mixing vocabularies (billing words next to email words),
     `Utils`/`Helpers`/`Manager` grab-bags, constructors with many imports.
   - OCP: the same field switched in several files:
     `grep -rn "switch" src/ | grep <field>`; adding a variant should mean
     adding one module, not editing five.
   - LSP: `throw new Error("not supported")` in overrides, `instanceof`
     checks against a base type, overrides that narrow the return or
     silently weaken the base contract.
   - ISP: implementors stubbing interface methods with `return null`,
     `// unused` or empty bodies.
   - DIP: business logic calling `new` on db, http or clock, or importing
     infrastructure packages directly, so it cannot be tested or swapped.
3. **Prove the pain before reporting.** Each candidate needs a present-tense
   scenario: "adding a payment method means editing checkout.ts, pricing.ts,
   invoice.ts and the same switch in admin.ts". No scenario, no finding.
4. **Apply the silence threshold.** A violation with no current pain is not
   reported. A 3-field struct "breaking SRP" is noise; so is a switch with
   two stable cases.

## Output format

One line per finding, no preamble:

`[impact: bug-risk | rigidity | test-pain] PRINCIPLE - file:line - symptom - smallest fix`

Example:
`[impact: rigidity] OCP - src/billing/invoice.ts:88 - every new plan edits this switch and three siblings - move plan behavior behind a Plan interface`

Close with the single violation whose fix unlocks the most future changes.

## What not to do

- Do not report violations without a pain scenario; dogma is not a finding.
- Do not flag naming taste, formatting or line count: that is linter work.
- Do not prescribe patterns (factories, strategies) the pain does not ask
  for; the fix must fit the scenario you wrote.
- Do not review the whole repo when the user named a module; wide nets
  catch noise.

## Limits and handoff

- This is a design-pain pass, not a security review (security pack) and not
  an architecture redesign: when the pain is a missing boundary or a wrong
  context split, hand off to the ddd-architecture skill of this pack.
- Findings do not ship as rewrites: fixes go through refactoring-patterns,
  behavior-preserving steps with the safety net named.
