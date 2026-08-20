---
description: WCAG 2.2 AA accessibility audit of pages and components with an automated pass, the manual patterns tools miss, and criterion-numbered findings. Use when auditing UI accessibility or reviewing a page or form for a11y.
origin: original
license: MIT
---

# Accessibility Audit (WCAG 2.2 AA)

Produce a criterion-numbered findings list and the three fixes that unlock
the most users. This is an engineering audit, not a conformance
certificate.

## Procedure

1. **Automated pass** (catches roughly a third of issues): run
   `npx @axe-core/cli <url>` or Lighthouse on the page. It covers missing
   alt, empty links/buttons, missing `lang`, unlabeled inputs, duplicate
   ids, contrast pairs and heading order. Record each hit with its WCAG
   criterion number.
2. **Keyboard walk**: unplug the mouse. Every interactive element reachable
   and operable (2.1.1 Keyboard), no keyboard traps (2.1.2), visible focus
   (2.4.7), focus not hidden behind sticky headers (2.4.11 Focus Not
   Obscured, AA since 2.2).
3. **Focus order and dialogs**: DOM order matches visual/logical order
   (2.4.3); modals trap and restore focus; a skip-to-content link exists
   (2.4.1).
4. **Forms**: every input has a bound label via `for`/`id` or wrapping
   (1.3.1, 3.3.2); errors are identified in text and linked with
   `aria-describedby`, never color alone (3.3.1, 1.4.1). 2.2 adds 3.3.7 (no
   redundant entry: never re-ask data already given) and 3.3.8 (no
   cognitive puzzle as the only way to log in).
5. **Semantics and media**: real `<button>`/`<a>` instead of click-divs;
   landmarks (header/nav/main) and one `h1` with hierarchical headings
   (1.3.1); tables with `<th scope>`; alt text that conveys function
   (1.1.1); captions for video (1.2.2); no autoplay audio (1.4.2).
6. **Contrast, motion, zoom, targets**: text contrast 4.5:1 (1.4.3), 3:1
   for large text and UI components (1.4.11); `prefers-reduced-motion`
   honored and nothing flashes more than 3 times per second (2.3.1);
   usable at 200% zoom and 320px width without horizontal scroll traps
   (1.4.4, 1.4.10 Reflow); pointer targets at least 24x24 CSS px (2.5.8
   Target Size, AA since 2.2).

## Output format

One line per finding:

`[blocker | serious | moderate] WCAG x.x.x <name> - page/component - concrete fix`

Example:
`[blocker] 2.1.1 Keyboard - /checkout payment modal - card iframe traps focus; add focus trap and ESC close`

Close with the three fixes that unlock the most users, in order.

## What not to do

- Do not stop at the axe output; the automated pass misses focus order,
  traps and meaningful alt, and that is where the blockers live.
- Do not fix semantics by spraying ARIA: a real `<button>` beats five
  attributes.
- Do not eyeball contrast; measure the ratio.
- Do not count an overlay widget as compliance; overlays fix nothing in the
  DOM.
- Do not report "fails WCAG" without the criterion number.

## Limits

- This audit does not certify WCAG conformance and does not settle legal
  exposure: formal conformance claims, public procurement and disputes need
  a certified human auditor.
- One reviewer plus tools cannot cover every criterion (audio content, sign
  language, cognitive load); state which criteria you checked and which you
  did not.
