---
description: Generate step-by-step visual guides with one screenshot per action, deterministic viewport and masked secrets. Use when documenting a web flow with screenshots, Scribe/Tango-style how-tos or a regenerable capture script.
origin: original
license: MIT
---

# Visual guides

Produce a written guide where every step shows a screenshot: what to
click, what happens, what the reader should see. Ask before driving
the user's Chrome. Mask secrets before the first capture.

## Driving layer (first available, never installed in silence)

1. **pi-browser-harness** if already configured: Chrome of the user,
   profile, logins, 40 CDP tools.
2. **Playwright already in the repo** (or `@playwright/mcp` already
   installed): headed or headless, one screenshot per step.
3. If neither is present, stop and ask. Do not run `npx …@latest` and
   do not call Playwright "always available".

For a narrated video of the same flow, `npx demo-dev` only when that
tool is already on the machine. Desktop (non-web) capture is out of
this skill.

## Process

1. **Plan before driving.** Title, audience, prerequisites, exact
   step list. One user action per step.
2. **Authorization and hygiene.** Confirm the profile. Fixed viewport
   1280×800 (deviceScaleFactor 2). Seeded demo data. Mask the URL bar
   when it holds tokens, names, avatars and notifications before the
   shutter fires. Never keep `storageState` in git.
3. **Per step.** Action → screenshot of the result with the next
   target visible → caption that still makes sense if the image is
   missing. Alt text describes the screen, not "step 1".
4. **Write** `docs/guide-<flow>/index.md` plus `assets/steps/`.

## Output conventions

```
docs/guide-<flow>/
├── index.md
└── assets/steps/
    ├── 01-open-project.png
    └── 02-click-new-button.png
```

```markdown
# How to <goal>
One-line promise. **Time:** ~2 min · **Requires:** editor role.
### 1. Open the projects page
![Projects page with the New button highlighted](assets/steps/01-open-project.png)
Click **New project** (top-right). The empty project form opens.
```

3–8 steps for one task. Each step: at most two sentences plus one
screenshot. Keep a driving script so captures can be regenerated;
converting it into an E2E spec with assertions and CI happens only
when the user asks, then hand off to `e2e-testing`.

## What not to do

- Do not bundle several clicks into one step.
- Do not capture real passwords, session cookies or personal inboxes.
- Do not treat the screenshot as the only text; the prose must stand.
- Do not turn the capture script into CI E2E by default.

## Limits and handoffs

This skill owns human how-tos with captures. Diátaxis prose without
pictures is `documentation` in the docs pack. Visual critique of a
landing (severity, evidence, change) is `visual-critique`. Improving
a live page (console, network, LCP) is `browser-improve`. Playwright
suites are `e2e-testing`.
