---
description: Produce a structured visual critique of a rendered landing page, with captured evidence, severity, visitor impact and concrete fixes. Use when the user asks to review a screenshot, mockup or responsive landing design.
origin: original
license: MIT
---

# Visual Critique

Produce a prioritized visual review tied to specific regions in supplied or
captured desktop and mobile images, with no claims beyond what those images show.

## Procedure

1. **Secure comparable evidence.** Record the source, viewport and capture
   state. If the page is reachable and capture is authorized, reuse the
   repository's browser tooling or run `npx --no-install playwright screenshot
   --device="Desktop Chrome" <url> artifacts/landing-desktop.png` when
   Playwright is already installed. Obtain a mobile capture separately.
2. **Run the five-second pass.** View at natural scale, then blurred or zoomed
   out. Record the first three elements that attract attention. A finding exists
   when that order conflicts with offer, audience and primary action.
3. **Inspect hierarchy.** Compare headline, CTA, navigation, proof and
   decoration. Identify competing emphasis, unclear grouping and elements whose
   visual weight exceeds their decision value.
4. **Inspect rhythm.** Check alignment, section spacing, text measure, density
   and repeated components. Cite the image region or named component rather
   than describing the page as generally cramped or inconsistent.
5. **Inspect color and legibility.** Measure relevant text and control contrast
   when values are available, verify focus and state cues in a live page, and
   distinguish low contrast from weak brand preference.
6. **Inspect responsive reflow.** Compare order, wrapping, overflow, tap target
   size and CTA reachability. Do not infer a mobile defect from a desktop image.
7. **Rank only actionable findings.** Assign the severity scale below, combine
   duplicates and return at most three priority changes. Stay silent on visual
   preferences that have no usability, comprehension or conversion impact.

## Severity scale

- **Blocker:** the primary action or essential content cannot be perceived or used.
- **High:** hierarchy or reflow is likely to send visitors down the wrong path.
- **Medium:** repeated friction slows comprehension but does not block the path.
- **Low:** a localized inconsistency with a concrete, observable cost.

## Output format

```markdown
Captures: <path, viewport and state for each image>
Attention order: <first -> second -> third>

| ID | Severity | Location | Observed problem | Visitor impact | Concrete fix |
|---|---|---|---|---|---|
| VIS-01 | high | <capture and region> | <visible evidence> | <decision harmed> | <layout or style change> |

Priority changes: VIS-<id>, VIS-<id>, VIS-<id>
Not assessable from captures: <interaction, focus, mobile or empty>
```

Example finding:

```text
VIS-01 | high | desktop hero, right column | The decorative illustration is
larger and higher contrast than the headline and CTA | Attention leaves the
offer before the action is understood | Reduce the illustration width and use
the accent color only on the primary CTA; verify with a new capture.
```

## What not to do

- Do not report taste as evidence or redesign the brand to match a trend.
- Do not infer hover, focus, loading or submission behavior from a still image.
- Do not request pixel-perfect symmetry when grouping or reading order benefits.
- Do not produce a long inventory after the decision-changing findings end.

## Limits and handoffs

This is a rendered visual review, not copywriting, analytics, a full conversion
audit or an accessibility certificate. Use `landing-copy` for wording,
`conversion-checklist` for the funnel and `seo-analytics` for acquisition and
events. Request an accessibility specialist when conformance must be certified.

Remove or mask personal data and secrets in captures. Do not access private
pages, change production state or install capture tooling without authorization.
