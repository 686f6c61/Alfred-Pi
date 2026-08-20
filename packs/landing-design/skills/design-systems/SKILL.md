---
description: Major design systems catalog and how to work inside one - Material 3, Apple HIG, Fluent, Ant, shadcn/ui, MUI, Bootstrap, Chakra, Mantine, Carbon, Radix; tokens, spacing, type scales, component vocabulary, adherence audits. Use when the project uses or must choose a design system, when UI looks inconsistent, or when the user names one (shadcn, Material, Ant...).
origin: original
license: MIT
---

# Design Systems

## Rule zero

Adopt, do not invent. A design system is a contract: components, tokens and
vocabulary that users already half-know. Your job is to build inside it and
break it only with a reason you can write in one line. Two systems in one
product is zero systems.

## Catalog: fingerprints and when to use

| System | Fingerprint | Use when |
|---|---|---|
| **Material Design 3** (Google) | Dynamic color, elevation layers, FAB, ripple; tokens as roles (primary, surface, on-surface) | Android presence, Google-adjacent product, teams that want exhaustive rules |
| **Apple HIG** | Blur/translucency, large titles, SF symbols, 44pt targets, platform-native controls feel | Apple-first or premium consumer app; iOS/macOS web companions |
| **Fluent 2** (Microsoft) | Subtle depth, acrylic, tight density, Segoe; calm enterprise look | Enterprise/Windows audience, Microsoft ecosystem |
| **Ant Design** | Dense admin components, tables and forms first, strong opinions, React | Admin panels, dashboards, back-office CRUD |
| **shadcn/ui + Tailwind** | Copy-in components you own, Tailwind utilities, Radix behavior underneath; theme via CSS variables | Product teams that want full control without a framework lock; the current default of indie web |
| **MUI** | Material implemented for React, theming object, mature datagrid | React teams wanting Material without doing it by hand |
| **Bootstrap 5** | 12-col grid, utility+component mix, instantly recognizable | Shipping fast with zero design ambition; internal tools |
| **Chakra / Mantine** | Token-friendly, accessible defaults, styled-props ergonomics | React apps that style in JS and want a11y out of the box |
| **Radix (primitives)** | Headless behavior only: no look, all a11y and state | You own the visuals but not the hard parts (dialogs, menus, comboboxes) |
| **Carbon** (IBM) | Grid discipline, data-heavy patterns, IBM Plex | Serious data/enterprise products with design staff |
| **Polaris** (Shopify) | Commerce patterns, merchant vocabulary | Shopify apps; anything commerce-admin shaped |

## Tokens: the actual system

Whatever the system, consistency lives in tokens. Map, never hardcode:

- **Color**: semantic roles (background, surface, foreground, primary,
  destructive) before palette values; dark mode by swapping roles, not pages.
- **Spacing**: one scale (4/8 based), no arbitrary values; gap = scale steps.
- **Type**: 2 families max (display + text), fixed scale with named steps,
  line-heights per step.
- **Radius, elevation, motion**: one scale each; motion respects
  `prefers-reduced-motion`.

If a value is not expressible in tokens, either the token set is incomplete
(extend it once) or the design is off-system (push back).

## Working inside one

1. **Detect** the system from deps and markup (shadcn: `components/ui` +
   Radix; MUI/Ant/Chakra in package.json; Bootstrap classes; M3 tokens in
   CSS vars) before proposing anything visual.
2. **Reuse the vocabulary**: prefer the system's component over a custom
  one (their dialog, their table). Custom only for what the system lacks.
3. **Extend by tokens**, not overrides: one source per role; no one-off
  hexes or magic px in components.
4. **New component**: match density, radius, elevation and type step of
  siblings; it should be unidentifiable as an addition.

## Landing work with a system

A landing still needs one idea (hero promise, proof ladder), but executed
with the product's system so the click-through does not feel like changing
store. Design first with tokens; borrow the system's hero-scale type step,
not a random display font.

## Adherence audit (for /landing-review or design review)

For each screen check: token-only values (no stray hex/px), one spacing
scale, type steps respected, component vocabulary from the system, dark
mode roles coherent, motion within scale. Report as
`[off-system] element - what breaks - token or component to use`.
