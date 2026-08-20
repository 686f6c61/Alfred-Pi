---
description: Technical SEO and analytics wiring for landings - meta and OG tags, structured data, sitemap/canonicals, conversion funnel events in GA4/Plausible/Umami. Use when fixing technical SEO or wiring analytics and funnels.
origin: original
license: MIT
---

# SEO and Analytics

## Technical SEO checklist (the part that actually breaks)

- **One canonical truth**: every public page declares its canonical;
  query params and trailing-slash variants resolve or redirect 301.
- **Title and description**: unique per page, title under ~60 chars with
  the value prop front-loaded; description sells the click (it is ad
  copy, not a summary).
- **OG and Twitter cards**: absolute image URLs (~1200x630), title,
  description; preview with a real scraper, not faith.
- **Structured data**: the type the page deserves (Product, FAQ, Breadcrumb)
  and nothing more; invalid markup is worse than none (rich results get
  pulled). Validate in the testing tool.
- **Indexability**: `noindex` only where meant; `robots.txt` does not
  remove indexed URLs (meta tags do); sitemap.xml present, referenced in
  robots, and only canonical URLs in it.
- **Performance is SEO**: see the web-performance skill; CWV are a ranking
  input and a conversion input.

## Analytics wiring (measure the funnel, not vanity)

1. **Pick the tool by trust model**: GA4 (free, Google-ecosystem),
  Plausible/Umami (cookieless, privacy-clean, matches a GDPR posture).
2. **Event contract before code**: name events in
  `object_action` (cta_click, signup_submit, purchase) with properties
  decided once; page_view alone tells you nothing about conversion.
3. **Funnel definition**: the 3-5 steps from landing to the one action
  (view -> intent -> convert), each with its event; instrument the
  conversion at the server or thank-you page, never only on the button
  (buttons click, forms abandon).
4. **Consent first**: fire personal analytics only after consent where
  required (cookie banner interplay: compliance pack); cookieless tools
  dodge most of it.
5. **UTM hygiene**: source/medium/campaign lowercase from a fixed
  vocabulary; a sheet of allowed values beats a free-for-all.

## Audit output

Table: item - current - expected - fix effort. Then the funnel table with
events, properties and where each fires. Verify with the network tab or
the tool's debugger before declaring victory.

## Command verification

Run the repository's existing SEO check. When Lighthouse is already installed,
use `npx --no-install lighthouse <url> --only-categories=seo --output=json
--output-path=artifacts/seo-lighthouse.json`; also inspect emitted markup with
`curl -fsSL <url> | rg -i '<title|canonical|og:|application/ld\+json'`.
Report the exact commands, exit status and artifact path. Browser debugger
evidence remains required for analytics events because static HTML cannot prove
that a conversion event fires once with the intended properties.

## What not to do

- Do not treat a unique title as a conversion strategy; that is
  `landing-copy`.
- Do not fire personal analytics before consent where a banner is
  required; that interplay is `privacy-review`.
- Do not declare Core Web Vitals "fixed" from this skill; budgets and
  CI gates are `web-performance`.
- Do not add a second SEO skill or move this oficio into web-fullstack.

## Limits and handoffs

This skill owns technical SEO markup and funnel event contracts on a
landing. Measuring LCP on the user's Chrome is `browser-improve`. CWV
as a ranking budget is `web-performance`. Sales titles and objection
ladders are `landing-copy`. Cookie and consent copy is the compliance
pack. Invalid structured data is worse than none: stop and validate
before shipping.
