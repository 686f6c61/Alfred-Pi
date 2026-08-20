---
description: Engineer internationalization and localization through message extraction, ICU syntax, locale negotiation, formatting and pseudo-localization. Use when preparing an app for multiple locales, wiring a message catalog or fixing locale-specific defects.
origin: original
license: MIT
---

# i18n / l10n

Produce an implementation plan or patch that externalizes messages, preserves
locale semantics and verifies fallback, formatting and layout behavior.

## Procedure

1. **Inspect the current stack.** Read manifests, framework config, locale
   folders and existing helpers with `rg --files | rg '(i18n|locales?|messages?|translations?)'`.
   Reuse the installed library and repository conventions.
2. **Inventory user-facing strings.** Search components, routes, validation and
   email templates. Classify hard-coded text, concatenation, dynamic fragments,
   inaccessible labels and strings that intentionally stay technical.
3. **Extract stable messages.** Use semantic ids such as `cart.item_count`, not
   English source text. With an existing FormatJS setup run its configured
   extraction script; with i18next use the repository's parser command. Do not
   install or switch libraries without approval.
4. **Model grammar in the message.** Use ICU MessageFormat or the library's
   equivalent for plural, select and gender. Keep whole sentences together so
   translators can change word order and never branch on `n === 1` in code.
5. **Define locale resolution.** Document precedence across user preference,
   route, cookie and `Accept-Language`, then declare a fallback chain such as
   `pt-BR -> pt -> en`. Carry locale explicitly rather than relying on a global.
6. **Format locale-sensitive data.** Use `Intl.DateTimeFormat`,
   `Intl.NumberFormat` and explicit time zones. Store instants independently of
   presentation and do not infer a time zone from language.
7. **Verify catalogs and UI.** Run the existing extraction, typecheck and test
   commands. Exercise a pseudo-locale with expansion and bidirectional text,
   then check missing keys, fallback behavior and layout truncation.
8. **Review the diff.** Preserve translator changes, flag obsolete keys before
   deletion and show catalog churn separately from application changes.

## Output format

```markdown
| Message id | Source location | Variables | Plural/select | Locales missing | Action |
|---|---|---|---|---|---|
| cart.item_count | src/cart/Summary.tsx:18 | count | plural | es, ar | extract |

Resolution: <user setting -> route -> header -> default>
Fallbacks: <locale -> parent -> default>
Commands run: <extract>; <typecheck/test>; <pseudo-locale check>
Untranslated or blocked: <ids and owner>
```

## What not to do

- Do not concatenate translated fragments or encode English word order in code.
- Do not use source text as the message id or silently rename stable ids.
- Do not hand-format dates, numbers or currencies.
- Do not delete keys, overwrite translations or expose private user content to
  an external translation service without approval.

## Limits and handoffs

This skill owns localization plumbing and runtime behavior, not translation
quality or regional legal advice. Hand Spanish copy quality to the
`traduccion-en-es` skill and high-stakes language to a professional translator.
If extraction would create a broad catalog rewrite, stop with a plan and diff
before writing. Keep secrets and personal data out of catalogs and examples.
