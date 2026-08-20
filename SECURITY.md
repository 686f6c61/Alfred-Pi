# Security Policy

Alfred-Pi manages credentials (API keys in `auth.json` / `models.json`) and
runs inside your coding agent - security is a core feature, not an add-on.

## Reporting a vulnerability

Email **dev@686f6c61.dev** (or use GitHub private vulnerability reporting).
Please don't open public issues for exploitable findings. We aim to respond
within 72 hours.

## What we commit to

- **Zero runtime dependencies** - no supply-chain surface in the extension
  itself; everything is `node:fs` and native `fetch`.
- **Keys are never echoed** in full after entry (masked `sk-a…b12` display),
  are persisted only in live config and private local backups, and are never
  sent anywhere except to the provider they belong to when you explicitly run
  a probe. Every outbound connection is inventoried in the network matrix
  below.
- **Private local backups contain secrets**: secrets appear in the live config
  and in these private local backups; the backup tree is `0700` and files are
  `0600`.
- **Writes to your config are previewed** (unified diff), backed up, and
  atomic. Restore is always offered.
- **Managed `auth.json` writes are owner-only**: every managed write or restore
  of `auth.json` finishes with owner-only `0600` permissions.
- **The pre-install audit is advisory** by design - it informs, you decide.
- **Incomplete npm audits fail closed**: an npm pre-install audit that cannot
  fetch every selected file is incomplete (`ok` false, `error` set, omissions
  listed) and is never reported as a clean bill of health.
- **npm audit identity is pinned**: an npm audit resolves version and integrity
  once; later fetches and any install identity use that pin, and a clipped
  sample is incomplete, never a clean bill of health.
- **Git audit sources use a closed allowlist**: unsupported protocols and
  remote helpers are rejected; accepted remotes are cloned without a shell and
  with Git's `file` and `ext` transports disabled.
- **Provider keys are literals or `$ENV` references**; `!` command references
  are rejected and never executed.
- **Google probe keys stay out of URLs**: Google probes send the key via
  `x-goog-api-key`, never as a query parameter.
- **Provider credentials stay bound to an approved origin**: Provider
  credentials are sent only to their explicitly authorized HTTPS origin;
  HTTP is limited to an explicitly approved loopback endpoint, and changing
  `baseUrl` never rebinds a key.
- **Domain links retain exact ownership**: Domain disable removes only
  symlinks created by this extension whose current target exactly matches the
  recorded path inside `packs/<id>`; pre-existing or retargeted links are
  preserved.
- **Config previews redact credential fields** while the real write payload
  remains opaque and is used only for the confirmed atomic write.
- **Automatic update checks are bounded**: `session_start` performs a
  background `GET` of the public manifest, with successes cached for 24 hours
  and failures suppressing another request for one hour.

## Network connections (complete inventory)

There is no telemetry, analytics, or crash reporting. The only automatic
connection is the update check; everything else is interactive (triggered by
an action you take in the TUI or the CLI, or by a pack skill you invoke).

| Destination | Data sent | Trigger | Configuration | Cache |
|---|---|---|---|---|
| Update manifest (`pi.686f6c61.dev/manifest.json`) | Plain GET: no keys, prompts, paths, or version identifier | **Automatic**: once per session start, in the background | Default URL; overridable manifest URL | `update-cache.json` in the data dir, 24 h after success; 1 h failure backoff |
| models.dev catalog (`models.dev/api.json`) | Plain GET | Interactive: opening the model picker | Fixed URL | `catalog-cache.json` in the data dir, 24 h TTL |
| npm registry + unpkg (`registry.npmjs.org`, `api.npmjs.org`, `unpkg.com`) | Package names you search or audit; file downloads of the exact pinned version | Interactive: package browser and pre-install audit | None | No response cache; version + integrity pinned for the whole audit/install session |
| Provider endpoints (presets and custom base URLs) | Your API key in the auth header; liveness `GET /models`; a deep probe sends a 1-token completion | Interactive: onboarding, "Test connection", "Re-discover models", deep probe, doctor | Base URL per provider: preset default or any custom base you enter | Probe results recorded in local health stats |
| Ollama server | `GET /api/tags` and model listing; no extension keys | Interactive: model discovery and doctor | Base URL (`http://127.0.0.1:11434` by default; `ollama.com` cloud preset available) | None |
| Git remotes (audit + install) | Shallow `git clone` of the URL you enter; your own git/SSH credentials may apply, never extension keys | Interactive: "Install from git source" (audit, then install) | Closed transport allowlist (HTTPS, SSH, SCP-like, local path); `file` and `ext` disabled | None: clone goes to a temp dir and is deleted |
| Docker registries (pack skills) | Image pulls/builds run by the agent (for example `sonarqube:lts-community`); build context bounded by your `.dockerignore` | Interactive: only when a pack skill you invoked runs `docker` commands | Your Docker daemon and registry credentials | Docker's local image cache |
| SonarQube server (pack skill) | `sonar-scanner` uploads source code and metrics with a project token | Interactive: `sonarqube-audit` skill at your request | Server URL and token (throwaway `localhost:9000` instance by default) | Server-side Docker volumes (`sonarqube_data`, `sonarqube_logs`, `sonarqube_extensions`) |

## Threats we explicitly do NOT cover

- Malicious models or prompts (that's the agent harness's domain).
- Local filesystem compromise - pi extensions run with your permissions by
  design; anything on your machine can read `auth.json`.
- Auditing private npm packages (nothing to fetch - the UI says so).

## Hardening tips

- Use `$ENV_VAR` key references instead of literals when you can.
- Pin installs to release tags (`pi install git:…@v0.2.0`).
- Run the doctor (`pi --alfred-pi=doctor`) after installing anything new.
