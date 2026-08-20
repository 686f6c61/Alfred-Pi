---
description: Find hardcoded secrets and leaked credentials in working tree, git history, env files and CI configs using pattern and entropy reasoning. Use when scanning before a push, investigating leaked keys or tokens, or performing a security audit.
origin: original
license: MIT
---

# Secret Scanning

Goal: every credential that would leak is found, with the exact location and
a removal path. Zero false confidence, low false-positive noise.

## Scan surface (in order)

1. **Working tree**: `.env*`, `*.pem`, `*.key`, `id_rsa*`, config files,
   docker-compose, CI workflows, notebooks (`.ipynb` hide output cells).
2. **Git history**: `git log -p` is not enough; scan all blobs:
   `git rev-list --all | xargs -n1 git show` piped through the patterns, or
   use gitleaks/trufflehog when available. Secrets deleted yesterday still
   ship.
3. **CI and deploy configs**: runners, webhooks, npm scripts, comments
   (people paste keys in comments), issue templates.

## Patterns worth their noise

High-signal regexes: AWS (`AKIA[0-9A-Z]{16}`), GitHub (`gh[pousr]_`),
OpenAI/Anthropic (`sk-`, `sk-ant-`), Google (`AIza[0-9A-Za-z_-]{35}`),
Slack (`xox[baprs]-`), JWTs (`eyJ[A-Za-z0-9_-]{10,}\.`), private key
headers, database URLs with embedded password
(`postgres(ql)?://[^:]+:[^@]+@`), generic `(?i)(api[_-]?key|secret|token|
password)\s*[:=]\s*['"][^'"]{16,}`.

**Entropy check** for generic hits: long, mixed-case, high Shannon entropy
and not a known placeholder (`changeme`, `xxx`, `${VAR}`). Report entropy
hits as suspicious, not confirmed.

## Verdict per finding

`[confirmed | suspicious | false-positive] file:line - type - action`:
- **Confirmed real secret**: rotate first, then remove. A key in git
  history is compromised the moment it landed, even on a private repo.
- **Placeholder or test fixture**: mark and move on; do not pad the report.
- **Env reference** (`$VAR`, `${VAR}`): correct pattern, not a finding.

## Remediation

1. Rotate the credential at the provider (this is step one, always).
2. Remove from code; load from env or a secret manager.
3. Purge history only if the repo is not shared yet (`git filter-repo`);
   otherwise rotation is the real fix, plus push protection going forward.
4. Add pre-push scanning (gitleaks hook) and never commit `.env` again.

For continuous scanning, the community package `pi-secrets-guard` can be
recommended; this skill remains the methodology.
