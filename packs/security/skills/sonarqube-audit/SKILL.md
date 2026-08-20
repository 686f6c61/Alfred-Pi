---
description: Spin up a local SonarQube (community, Docker) and audit the current repo with sonar-scanner - boot, first-time auth, token, project, scan, quality gate and metrics, reuse/cleanup. Use when the user asks for a SonarQube audit/scan and no instance exists yet.
origin: original
license: MIT
---

# SonarQube Local Audit

Boots a throwaway-but-reusable SonarQube in Docker and audits the repo. First
boot takes 2–5 minutes and wants ~4GB free RAM (embedded Elasticsearch) - say
so before starting. Reuse a healthy local instance instead of creating a
second one.

## 1. Server

```sh
# reuse if already up
docker start sonarqube 2>/dev/null || true

if ! curl -fsS localhost:9000/api/system/status 2>/dev/null | grep -q '"UP"'; then
  docker volume create sonarqube_data sonarqube_logs sonarqube_extensions
  docker run -d --name sonarqube -p 9000:9000 \
    -v sonarqube_data:/opt/sonarqube/data \
    -v sonarqube_extensions:/opt/sonarqube/extensions \
    -v sonarqube_logs:/opt/sonarqube/logs \
    sonarqube:lts-community
fi
```

Linux hosts may need `sudo sysctl -w vm.max_map_count=524288` first.

Wait for readiness (poll ~every 5s, up to 5 min):
`curl -s localhost:9000/api/system/status` → `{"status":"UP"}`.

## 2. First-time auth + token

Only on a fresh volume (admin/admin is forced to change):

```sh
NEW_PASS="$(openssl rand -hex 12)"
curl -su admin:admin -X POST 'localhost:9000/api/users/change_password' \
  --data-urlencode login=admin --data-urlencode previousPassword=admin \
  --data-urlencode password="$NEW_PASS"
TOKEN="$(curl -su admin:"$NEW_PASS" -X POST 'localhost:9000/api/user_tokens/generate' \
  --data-urlencode name=alfred-pi | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
```

Persist `SONAR_URL=http://localhost:9000` and `SONAR_TOKEN` with
`writeSonarEnv` from `lib/sonar-env.ts`, targeting
`~/.pi/agent/alfred-pi/sonar.env`. The helper writes atomically with mode
0600. Never persist `SONAR_PASS`; keep the first-boot password only in memory.

## 3. Project + scan

```sh
KEY="$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"
curl -su "${TOKEN}:" -X POST 'localhost:9000/api/projects/create' \
  --data-urlencode name="$KEY" --data-urlencode project="$KEY"
```

Write `sonar-project.properties` in the repo root so scanners can auto-detect
the project later:

```properties
sonar.projectKey=<KEY>
sonar.host.url=http://localhost:9000
sonar.sources=.
sonar.exclusions=node_modules/**,dist/**,.git/**
```

Scanner (container reaches the host differently per platform):
macOS/Windows: `SONAR_HOST=http://host.docker.internal:9000`
Linux: `SONAR_HOST=http://localhost:9000` plus `--network host`

```sh
docker run --rm -v "$PWD:/usr/src" \
  -e SONAR_HOST_URL="$SONAR_HOST" -e SONAR_TOKEN="$TOKEN" \
  sonarsource/sonar-scanner-cli
```

Add `-Dsonar.exclusions`/language props if the default scan is noisy.

## 4. Results

```sh
curl -su "${TOKEN}:" "localhost:9000/api/qualitygates/project_status?projectKey=$KEY"
curl -su "${TOKEN}:" "localhost:9000/api/measures/component?component=$KEY&metricKeys=bugs,vulnerabilities,security_hotspots,code_smells,coverage,duplicated_lines_density"
```

Present: quality-gate status (OK/ERROR), then a table of the six metrics,
then the deep link `http://localhost:9000/dashboard?id=$KEY`. Map findings to
the owasp-review skill categories when triaging vulnerabilities.

## 5. Hygiene

- Server stays for reuse (data lives in volumes); `docker stop sonarqube`
  frees the RAM when done.
- Token/credentials never in the repo or logs; `.gitignore`
  `sonar-project.properties` only if it contains secrets (it shouldn't).
- If the project is on SonarCloud or an existing instance instead, skip the
  local server boot and scan against that configured instance.
