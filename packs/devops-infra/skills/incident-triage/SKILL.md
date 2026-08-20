---
description: Incident triage for web services - stabilize, localize the failing layer (DNS/edge/origin/app/DB), gather evidence, then fix; with the 502/503/timeout playbook. Use when a service is down or erroring.
origin: original
license: MIT
---

# Incident Triage

**Order of operations**
1. Stabilize if possible: rollback last deploy, flip feature flag, scale up.
   Root cause comes after the bleeding stops.
2. Localize the layer, top-down:
   - DNS: `dig +short app.example.com` → right IP/name?
   - Edge/proxy: HTTP status from outside (`curl -I`) vs direct to origin
     (`curl -I -H "Host: app.example.com" http://ORIGIN_IP`).
   - Origin server: is the container/process up (`docker ps`, `systemctl`)?
   - App: logs - crash loop? OOM? startup error? port binding?
   - Dependencies: DB reachable? disk full? (`df -h`) certificates expired?
3. Gather evidence before mutating: last 200 log lines, deploy diff, monitoring
   graphs, `docker inspect` state.

**502/503/504 playbook**
- 502 from proxy: origin refused the connection - app crashed/wrong port.
  Check: `docker logs`, listening address (`0.0.0.0` not `127.0.0.1`), PORT env.
- 503 from platform: no healthy backends - healthcheck failing; container
  starting or DB not ready.
- 504: app accepted but too slow - DB query, upstream call hang, or proxy
  timeout < real processing time.

**After stabilization**: timeline (first bad event ↔ last change), blast
radius, root cause, and prevention items (alert, healthcheck, rollback drill).

Report format: status → evidence → hypothesis → action taken → follow-ups.

## Limits and failure modes

- Do not restart, scale or change timeouts before one hypothesis has evidence;
  those actions can erase the state needed to identify the cause.
- Do not mutate DNS, firewall rules, production data or certificates without
  explicit authorization and a rollback path.
- Keep credentials, customer payloads and private addresses out of the report;
  quote only the minimal log lines needed to support the hypothesis.
- Stop after localizing the failing boundary. Use `db-ops` for database
  recovery, `kubernetes-triage` for cluster remediation and a provider owner
  when the failing control plane is outside the accessible scope.
