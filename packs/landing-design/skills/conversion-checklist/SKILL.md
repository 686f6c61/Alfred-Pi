---
description: Run an evidence-backed conversion review of a landing page, covering offer clarity, CTA flow, friction, proof and measurable mechanics. Use when the user asks to review, launch or improve a landing page for conversion.
origin: original
license: MIT
---

# Conversion Checklist

Produce a ranked conversion review in which every finding cites a rendered
element, captured behavior, analytics event or performance measurement.

## Procedure

1. **Define the conversion.** Name the audience, offer and one primary action.
   Record the public route or source file and list any excluded funnel steps.
2. **Capture the real page.** Review the rendered desktop and mobile states,
   not only component source. Save or cite screenshots with viewport sizes and
   identify what a new visitor sees, understands and can do in five seconds.
3. **Trace the CTA path.** Follow every primary CTA through form, validation,
   submission and success state. Cite the element or route where the path
   breaks, and verify that secondary actions are visually quieter.
4. **Measure friction.** Count required fields and decisions, expose pricing or
   limits, and check error recovery. Treat each extra request as friction until
   product or compliance evidence justifies it.
5. **Verify proof.** Match claims to attributed testimonials, product captures
   or numbers with a baseline. Place proof next to the doubt it resolves rather
   than collecting logos in an unrelated strip.
6. **Inspect instrumentation.** Use the browser network panel or the project's
   analytics debugger to prove that CTA, submit and conversion events fire once
   with the agreed properties. A button click is not a completed conversion.
7. **Measure the experience.** Run the repository's existing Lighthouse task,
   or use `npx --no-install lighthouse <url> --only-categories=performance
   --output=json --output-path=artifacts/conversion-lighthouse.json` when the
   CLI is already installed. Record mobile LCP and layout shift from the output.
8. **Rank and derive a test.** Put blockers first, then select one high-impact,
   uncertain change for `ab-testing`. Send wording work to `landing-copy` and
   acquisition or event implementation to `seo-analytics`.

## Output format

```markdown
| ID | Severity | Page evidence | Visitor impact | Minimal fix | Verification |
|---|---|---|---|---|---|
| CV-01 | blocker/high/medium/low | <route, element, screenshot or event> | <lost belief or action> | <specific change> | <capture, event or metric> |

Primary action: <one action>
Desktop capture: <path and viewport>
Mobile capture: <path and viewport>
LCP: <value, device and evidence path>
Event path: <view -> intent -> submit -> conversion>
A/B candidate: <one variable, hypothesis and primary metric>
```

## What not to do

- Do not check an item from source code when the rendered behavior can differ.
- Do not call a page clear because its author already knows the product.
- Do not recommend several simultaneous changes as one A/B variant.
- Do not accept invented urgency, anonymous praise or unverified performance.

## Limits and handoffs

This is a conversion review, not copywriting, technical SEO or statistical
analysis. Use `landing-copy` for the copy deck, `seo-analytics` for search and
event wiring, and `ab-testing` for sample size and experiment analysis.

Do not publish, alter production analytics or submit live forms without
authorization. Keep customer data and tokens out of screenshots and reports,
reuse existing analytics events before adding new ones, and stop when the page,
measurement source or target action cannot be observed.
