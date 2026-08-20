---
description: Web performance engineering - Core Web Vitals budgets (LCP, INP, CLS), images and fonts, bundle size, measurement with Lighthouse and field data. Use when the page feels slow or when optimizing CWV, bundle, fonts or images.
origin: original
license: MIT
---

# Web Performance

## Budgets first

Agree budgets before touching code; ship them as CI gates:
- **LCP < 2.5 s**, **INP < 200 ms**, **CLS < 0.1** (75th percentile, mobile).
- Bundle: route-level JS budget (e.g. < 150 KB gzip initial), total
  request count and transfer cap for the critical path.

## Diagnose in this order

1. **Measure**: Lighthouse lab run for the shape, field data (RUM/Analytics)
   for the truth. Lab INP is fiction; field INP is law.
2. **LCP**: what is the resource, when was it discovered, how long did it
   take? Usual culprits: hero image without priority, render-blocking
   CSS/fonts, server TTFB, client-only rendering of above-the-fold.
3. **INP**: long tasks during interaction; hydration waterfalls; heavy
   handlers. Split work, yield (`scheduler.yield`), do less.
4. **CLS**: images/ads/embeds without reserved space, web fonts swaps,
   late-injected banners. Reserve dimensions always; `font-display:
   optional` when the swap cost is visible.

## Fixes by lever

- **Images**: modern formats, correct sizes (`srcset`), lazy below the
  fold, `fetchpriority="high"` for the LCP image only, and never a
  background-image for the hero.
- **Fonts**: subset, preload the one weight of the one family above the
  fold, or self-host with `size-adjust` to kill the swap.
- **JS**: code-split by route and by interaction; defer hydration of
  islands (`client:idle/visible` thinking); audit the dependency cost
  (`bundle visualizer`) and delete before shrinking.
- **CSS**: critical inline or not; remove dead CSS; avoid the chain of
  blocking imports.
- **Network/edge**: cache headers, CDN, Brotli, preconnect to the API
  origin, early hints when the platform allows.

## Report format

Per finding: metric affected, cause with evidence (trace or waterfall
line), fix, expected delta, and the budget it restores. Re-measure after;
no performance claim without a before/after at the same percentile.

## Verification and limits

When Lighthouse is already available, capture a comparable lab artifact with
`npx lighthouse <url> --output=json --output-path=<report.json>` and record the
device, throttling and commit. Lab data cannot prove field INP or production
percentiles; use deployed RUM for those claims. A live DevTools visit
(current LCP element, console, network) is `browser-improve`; this skill
owns the budget and the code or CI change. Hand framework-specific island
work to `astro-development` and release enforcement to `release-gate`.
