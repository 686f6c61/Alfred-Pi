---
description: Run an evidence-backed release gate for web services, covering build, configuration, data safety, runtime hardening, edge controls, deployment and rollback. Use when preparing to deploy or expose a service or site publicly.
origin: original
license: MIT
---

# Release Gate

Produce a go or no-go release decision backed by commands, named blockers, an
exact deployment sequence and a tested rollback path.

## Procedure

1. **Capture the real release path.** Read manifests, lockfiles, Docker or
   platform config, migrations and runbooks. Record the repository's build,
   deploy, health and rollback commands instead of inventing generic ones.
2. **Prove the artifact.** Build from the locked dependency graph in a clean or
   equivalent environment, run the required tests and identify the immutable
   image tag or artifact digest. Inspect output for accidentally bundled
   credentials without printing any secret value.
3. **Prove configuration safety.** Compare required environment names with the
   target configuration, keep values out of the report, disable debug behavior
   and verify least-privilege runtime identity and filesystem access.
4. **Protect data changes.** Classify each migration, identify locks or
   irreversible transforms, take the approved backup and cite the latest
   restore drill. Stop before destructive changes when no recovery evidence
   exists.
5. **Verify runtime exposure.** Use `ss -ltnp` or `docker port <container>` on
   the target host to confirm intended bindings, then check readiness against
   real dependencies and graceful termination behavior.
6. **Verify the edge.** Run `curl -fsSI https://<host>` and record HTTPS
   redirect, HSTS, CSP and other required headers. Confirm DNS and certificate
   names without treating a local config file as deployed proof.
7. **Rehearse rollback.** Name the previous immutable artifact, the one command
   or bounded sequence that restores it, and the migration policy: reversible
   step, expand-contract or forward fix.
8. **Deploy only with authorization.** Execute the approved sequence, preserve
   logs without secrets, then repeat health, route and header checks against the
   public endpoint. A failed blocker check produces no-go, not optimism.
9. **Close the gate.** Report every check as pass, fail or not applicable with
   evidence, list blockers first and state who owns each remaining action.

## Evidence matrix

```markdown
| Check | Command or artifact | Result | Evidence | Blocker | Minimal fix |
|---|---|---|---|---|---|
| Reproducible build | <repo build command> | pass/fail/n.a. | <digest or log path> | yes/no | <action> |
| Migration recovery | <restore drill record> | pass/fail/n.a. | <date/path> | yes/no | <action> |
| Runtime binding | ss -ltnp | pass/fail/n.a. | <expected address:port> | yes/no | <action> |
| HTTPS and HSTS | curl -fsSI https://<host> | pass/fail/n.a. | <status and header> | yes/no | <action> |

Decision: GO | NO-GO
Blockers: <owner, fix, verification>
Deploy sequence: <numbered exact commands>
Rollback sequence: <numbered exact commands and trigger>
Post-deploy verification: <commands and observed results>
```

## What not to do

- Do not mark a checklist item complete from documentation alone when runtime
  evidence is available.
- Do not deploy `latest`, improvise an untested migration rollback or destroy a
  volume to clear an error.
- Do not expose credentials in commands, shell history, logs or the report.
- Do not continue after a failed backup, readiness, TLS or rollback blocker.

## Delta, limits and handoffs

This skill replaces `hardening-checklist` and `deploy-checklist`. Its delta is
one release workflow that combines the former security evidence for bindings,
privilege, secrets, TLS and recovery with the former web deployment and
rollback sequence. The single trigger prevents competing pre-deploy checklists.

It is a readiness gate, not a code vulnerability review or incident runbook.
Use `owasp-review` and `frontend-security` before the gate for code findings,
`dependency-audit` for component risk and `incident-triage` after a failed live
release. Reuse existing infrastructure, require confirmation for destructive
commands and stop when authorization, credentials or recovery proof is absent.
