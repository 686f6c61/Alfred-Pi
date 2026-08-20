---
description: Drive Chrome or DevTools against a URL or flow to measure console, network, LCP, the a11y tree or 4xx/5xx and propose a product fix. Use when the user wants to improve a live page, not to add an end-to-end spec.
origin: original
license: MIT
---

# Browser improve

Produce a before/after measurement of one URL or flow and the smallest
product change that the visit supports. Ask before driving the user's
Chrome. Do not install Chrome or Playwright in silence.

## Procedure

1. **Authorization.** Prefer `pi-browser-harness` (CDP on the user's
   Chrome, real profile). If it is missing and Playwright is already
   installed, use that. If neither is present, stop and ask. State
   the URL and viewport. Mask secrets before any screenshot.
2. **Snapshot of now.** Harness: `browser_snapshot`, `browser_console`
   with `levels: ["error", "warn"]`, `browser_network_requests` with
   `statusFilter: { min: 400 }`. That split tells JS breakage from
   4xx/5xx from slowness.
3. **Measure LCP only if speed is the symptom.** The harness has no
   performance tool. Use `browser_execute_js` with a
   `PerformanceObserver` of type `largest-contentful-paint` and
   `buffered: true` (element, url, startTime, renderTime, loadTime,
   size), or `browser_run_script` with raw CDP. Split LCP into TTFB,
   discovery delay, download and render delay; fix the actual tramo.
   Playwright path: `page.evaluate` with the same observer, not
   `page.accessibility` (removed).
4. **Propose the fix with evidence.** Each finding cites a console
   line, a network row or the LCP resource, plus `file:line` in this
   repo. Re-measure with the same viewport and profile. Keep the
   before and after screenshots masked.

## Output format

```markdown
| Finding | Signal | Evidence | Repo change | Before | After |
|---|---|---|---|---|---|
| BI-01 LCP image | LCP 4.1s | hero.webp 800ms download | Hero.astro:12 fetchpriority | 4.1s | 2.2s lab |

Do not claim field INP, WCAG conformance or a CI budget restored.
```

## What not to do

- Do not write specs under `e2e/` or treat this visit as a suite.
- Do not install browsers, `@playwright/mcp` or Chrome via `npx`.
- Do not screenshot passwords, tokens, emails, open tabs or the URL
  bar when it holds secrets.
- Do not optimize the wrong LCP tramo (compressing an image when
  render delay dominates).

## Limits and handoffs

This visit is not field INP (p75 of real users), not a WCAG
certificate (`a11y-audit`) and not a Core Web Vitals CI gate
(`web-performance`). Specs and flake belong to `e2e-testing`. Human
guides with one screenshot per step belong to `visual-guides`. SEO
markup belongs to `seo-analytics`.
