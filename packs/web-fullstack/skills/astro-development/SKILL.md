---
description: Astro development - when to pick it, project structure, islands/hydration directives, content collections, assets, SSR vs static, adapters and deploy. Use when building sites, landing pages or content-heavy apps with Astro.
origin: original
license: MIT
---

# Astro Development

## When Astro (and when not)

Pick Astro for: content sites, landing pages, docs, blogs, marketing,
anything SEO-first - HTML-first with zero JS by default.
Reconsider for: heavy app-like dashboards with global state (SPA frameworks
fit better; you can still host them on an Astro page via an island).

## Structure & routing

```
src/
├── pages/          # file routes: index.astro, blog/[slug].astro, api/*.ts
├── layouts/        # BaseLayout with <head>, meta, fonts
├── components/     # .astro components + framework islands
├── content/        # markdown/mdx collections + config.ts (zod schema)
└── styles/         # global.css; scoped styles live in components
```

- `.astro` components run at build/request time - their JS never ships.
- Islands: `client:load` (immediate), `client:idle`, `client:visible`
  (hydrate on scroll - default choice for below-fold widgets).
- Shared island state: nanostores, not context (islands don't share it).

## Content collections (the killer feature)

Define schema in `src/content/config.ts` with zod; query with
`getCollection("blog")`. Type-safe frontmatter, slugs handled, draft support.
Use for anything editorial - never hand-write HTML for repeated content.

## Assets & performance

- `astro:assets` `<Image>`/`<Picture>`: automatic webp/avif, width/height
  (no layout shift), responsive srcset. Remote images: configure domains.
- Fonts: `fontsource` packages or self-host; avoid Google Fonts CDN.
- `prefetch` enabled for internal links; sitemap integration for SEO.
- Measure with Lighthouse before shipping: Astro's default output should be
  ~100/100 on static content - if it isn't, an island is the suspect.

## Static vs SSR

- Default static (`dist/`) - deploy anywhere (CDN, Coolify static, pages).
- SSR when you need it: `npx astro add node` (self-host) or the Cloudflare
  adapter; per-route `export const prerender` lets you mix static + dynamic.
- Server code in `.ts` endpoints under `pages/api/` or Actions; env via
  `import.meta.env` (`PUBLIC_` prefix for client-exposed values only).

## Deploy

- Static: upload `dist/` (Cloudflare pages, Coolify static, any CDN).
- SSR node: Dockerfile runs `node ./dist/server/entry.mjs` (PORT env)
  follows the docker-workflow skill rules.
- Set `site` in astro.config for canonical URLs/sitemap.

Gotchas: view transitions need `transition:animate` care with islands;
scoped styles don't leak (good) - don't fight it with :global; `client:only`
means no SSR HTML (blank until JS) - avoid for content.

## Review output

Return a table with `location`, `render mode`, `hydration or asset concern`,
`user impact`, `minimal change` and `verification`. Verify with the repository's
build command and `npx astro check` only when Astro is already installed; report
SSR, adapter or deployment assumptions that cannot be tested locally.
