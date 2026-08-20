---
description: Write or rewrite an evidence-backed landing page copy deck, including the hero, section sequence, proof and CTA microcopy. Use when the user asks for landing copy, a value proposition or conversion-focused page messaging.
origin: original
license: MIT
---

# Landing Copy

Produce a page-ready copy deck that turns verified product facts into one clear
promise, a coherent objection sequence and concrete calls to action.

## Procedure

1. **Read the source of truth.** Inspect the current page, product docs,
   customer research and approved claims. Use `rg -n` on the actual route or
   component files to find existing headings, CTAs and proof before rewriting.
2. **Write the brief.** State the audience, urgent job, offer, primary action,
   strongest evidence and the three objections the page must resolve. Mark
   unknown claims instead of filling them with plausible marketing language.
3. **Choose one promise.** Express the outcome and audience in plain language.
   Keep implementation details in the support line unless the technology is
   itself the buying reason.
4. **Rewrite the hero.** Draft a headline, one-sentence support line, primary
   CTA and one nearby proof element. CTA microcopy states the next moment and
   any real friction reducer, such as price, card requirement or setup time.
5. **Build the section ladder.** Answer in order: relevance, mechanism, proof,
   objections, price or limits, then the final action. Each section receives a
   heading, one claim, supporting evidence and its role in the decision.
6. **Audit proof and specificity.** Attribute quotes, give numbers a baseline
   and replace adjectives with observable facts. Request approval for legal,
   financial, health or comparative claims.
7. **Compare before and after.** Preserve the original text beside each changed
   line, explain the decision, then read the deck at mobile width for heading
   length, CTA truncation and repetitive claims.

## Output format

```markdown
# Copy deck: <page or route>
Audience: <specific audience>
Primary action: <single action>
Promise: <one sentence>

| Section | Before | After | Decision | Evidence needed |
|---|---|---|---|---|
| Hero headline | <current text> | <final copy> | <why this is clearer> | <source or open claim> |

CTA set:
- Primary: <verb plus next outcome>
- Friction reducer: <verified condition>
- Final CTA: <offer restated without fake urgency>
```

Example:

```text
Before: The powerful platform for modern teams.
After: Close monthly accounts without chasing five spreadsheets.
Reason: Names the audience's job and the removed friction; confirm the five-file baseline.
```

## Cliches and other anti-patterns

- Do not use "fast", "easy", "powerful", "seamless" or "revolutionary"
  without a measured fact that makes the adjective unnecessary.
- Do not invent testimonials, customer counts, deadlines or scarcity.
- Do not give every section a different value proposition or competing CTA.
- Do not hide price, limits or material conditions behind vague reassurance.

## Limits and handoffs

This skill owns words and their decision sequence. It does not certify SEO,
visual hierarchy or conversion lift. Use `seo-analytics` for metadata and
events, `visual-critique` for rendered hierarchy, `conversion-checklist` for
the whole path and `ab-testing` when two defensible variants remain.

Keep private research and customer identifiers out of the deliverable. Stop
when the product facts or claim approvals are missing, and return an explicit
evidence request rather than manufacturing persuasive copy.
