---
name: sonar
description: Local SonarQube audit - boot the community server in Docker, scan this repo and report quality gate + metrics
origin: original
license: MIT
---

Run a SonarQube audit of this repo following the sonarqube-audit skill
end to end (reuse or boot the server, credentials from
~/.pi/agent/alfred-pi/sonar.env, register, scan, report gate and
metrics with the dashboard link). Announce the RAM and time caveat before
the first boot. Finish with the three highest-impact fixes.
