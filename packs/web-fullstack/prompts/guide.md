---
name: guide
description: Generate a step-by-step visual guide with screenshots for a web flow - plan, drive the app, capture and write docs/guide-<flow>/
argument-hint: <url> <what to document>
origin: original
license: MIT
---

Create a step-by-step visual guide for this flow: $@

Follow the visual-guides skill. Ask before driving the user's Chrome.
Detect the driving layer already present (pi-browser-harness, then
Playwright already installed). Do not install browsers. Plan the steps,
mask URL-bar secrets, names and notifications before each capture, write
docs/guide-<flow>/index.md with assets, and keep a regenerable script.
Do not convert that script into an E2E suite unless I ask. End with the
exact regenerate command.
