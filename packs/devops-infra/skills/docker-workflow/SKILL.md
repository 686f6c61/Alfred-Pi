---
description: Build, harden, run and debug Docker and Compose workloads, covering deterministic images, runtime isolation and cleanup safety. Use when the user asks to write, review or operate container files and services.
origin: original
license: MIT
---

# Docker Workflow

Produce working Docker or Compose changes, or a review with command-backed
findings, from build layout through runtime hardening and safe cleanup.

## Procedure

1. **Inspect the real stack.** Find `Dockerfile*`, `compose*.y*ml`,
   `.dockerignore`, env examples and deployment config with `rg --files`.
   Reuse service names, ports, health routes and the repository's package tool.
2. **Make the image deterministic.** Use a multi-stage build, copy manifests
   before source, install from the lockfile and copy only required artifacts.
   Keep compilers and development dependencies out of the runtime stage.
3. **Constrain the build context.** Exclude `.git`, dependencies, outputs and
   env files in `.dockerignore`. Use specific `COPY` sources and inspect layers
   with `docker history <image>` before accepting image size or secret hygiene.
4. **Model Compose explicitly.** Use named volumes for durable data, service
   names for internal networking, a readiness healthcheck and conditional
   `depends_on`. Fail closed on missing secrets with
   `${POSTGRES_PASSWORD:?set it in .env}` instead of a default value.
5. **Run the focused loop.** Use `docker compose up -d`,
   `docker compose logs --tail=100 <service>` and
   `docker compose exec <service> sh`. Rebuild and restart only the changed
   service with `docker compose build <service> && docker compose up -d <service>`.
6. **Diagnose before mutation.** Read `docker compose ps`, service logs and
   `docker inspect <container> --format '{{.State.ExitCode}} {{.State.Error}}'`.
   Verify that the app listens on `0.0.0.0` and that dependent services resolve
   by Compose name before changing the proxy or restarting the stack.
7. **Clean up safely.** Run `docker system df` first. `docker compose down`
   preserves named volumes; `docker compose down -v` deletes their data and
   requires explicit confirmation. Never add `-a` or volume pruning by reflex.

## Runtime hardening

This section absorbs the unique delta of the retired `docker-hardening` skill.

- Pin production base images and deployed images by digest. Keep the readable
  version beside the digest so dependency updates remain reviewable.
- Reject `privileged: true`. Prefer a non-root `USER`, narrow capabilities and
  explicit writable paths; accept privilege only for a documented requirement
  after approval.
- Reject `network_mode: host`. Prefer an internal network and explicit port
  bindings; accept host networking only when its necessity and exposure are
  documented and approved.
- Verify effective state with
  `docker inspect <container> --format '{{.HostConfig.Privileged}} {{.HostConfig.NetworkMode}} {{.Image}}'`.

## Output format

```markdown
| ID | Severity | Location | Evidence | Risk | Minimal fix | Verification |
|---|---|---|---|---|---|---|
| DKR-01 | blocker/high/medium/low | <file:line or container> | <config or command result> | <impact> | <bounded change> | <exact command> |

Build command: <command and result>
Runtime command: <command and result>
Image digest: <digest or missing>
Destructive action awaiting approval: <command and data affected, or none>
```

## What not to do

- Do not use `latest`, a floating production image or an unrecorded base digest.
- Do not use `COPY . .` when it can include env files, credentials or build junk.
- Do not treat restart policy or `depends_on` as proof of application readiness.
- Do not prune volumes, recreate durable data or expose the Docker socket to
  make an error disappear.

## Limits and handoffs

This is the single Docker build, runtime and hardening skill. Use `release-gate`
for deployment approval, `incident-triage` for a live outage and `db-ops` before
changing database volumes or recovery state. Keep secret values out of images,
logs and reports, reuse existing networks and volumes, and stop when destructive
scope, production authorization or a recovery path is unknown.
