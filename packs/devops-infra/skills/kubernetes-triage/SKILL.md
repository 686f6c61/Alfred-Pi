---
description: Kubernetes triage - crashloop and OOMKill diagnosis, stuck rollouts, probes, requests/limits, kubectl describe/logs/rollout undo workflow. Use when the repo or the incident involves k8s manifests, helm charts or kubectl.
origin: original
license: MIT
---

# Kubernetes Triage

## Order of operations

1. `kubectl get pods -o wide` + `kubectl get events --sort-by=.lastTimestamp`:
   the event log names the suspect before you guess.
2. `kubectl describe pod <p>`: read **Events** bottom-up (last error wins)
   and **State** (Waiting/CrashLoopBackOff/OOMKilled/Evicted).
3. `kubectl logs <p> --previous` for the crash that killed the previous
   container; the live logs of a restarting pod lie.

## The classics, by symptom

- **ImagePullBackOff**: wrong tag/registry/credentials (imagePullSecrets);
  the message literally says which of the three.
- **CrashLoopBackOff**: app exiting on start. Logs --previous; most often
  bad env, missing secret, or failing readiness of a dependency at boot.
  Fix the app or add initContainers; never "solve" with restartPolicy
  games.
- **OOMKilled (exit 137)**: memory limit vs actual usage. Raise limits
  with evidence (metrics), or fix the leak; do not delete limits.
- **Evicted**: node pressure (disk/memory); node-level story, not the
  pod's.
- **Pending**: no scheduler fit: insufficient cpu/memory, taints,
  PVC unbound. `describe` events say which constraint.
- **Rollout stuck**: `kubectl rollout status`, then `describe deploy`:
   usually probes failing or progressDeadlineSeconds hit;
   `kubectl rollout undo` is the stabilize move while you diagnose.
- **Service no endpoints**: selector/label mismatch or readiness never
   passes; check endpoints (`kubectl get endpoints`).

## Probes and resources (the config that prevents incidents)

- Readiness gates traffic; liveness restarts. A liveness probe that checks
  dependencies converts their outage into your restart storm.
- `startupProbe` for slow bootstrapping apps instead of fat liveness
  thresholds.
- Requests are scheduling truth: set them from real usage (P95), not
  vibes; limits with headroom over observed peak, or no limits at all
  with a reason you can defend.

## In repos (manifests/helm)

Review order: labels/selectors coherence, probes present and meaningful,
resources set, no `latest` tags, secrets not inlined, PodSecurity
compatible, and helm values without a footgun default.

## Report format

```markdown
Status: stable/degraded/down
Scope: <namespace, workload and affected users>
Evidence: <exact kubectl command> -> <decisive result>
Working hypothesis: <cause and confidence>
Stabilization: <action taken or approval needed>
Fix: <manifest location and minimal change>
Verification: <rollout, readiness and service command>
Follow-ups: <owner and prevention item>
```
