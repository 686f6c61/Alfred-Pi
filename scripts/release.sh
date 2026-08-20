#!/bin/sh
# Release helper: bump version, regenerate site/manifest.json, commit + tag.
#
# Usage: scripts/release.sh 0.2.0 ["Release notes"]
set -eu

VERSION="${1:?usage: scripts/release.sh <version> [notes]}"
NOTES="${2:-}"
cd "$(dirname "$0")/.."

case "$VERSION" in
  v*) echo "error: pass the bare version (no v prefix)" >&2; exit 1 ;;
esac

DATE="$(date +%Y-%m-%d)"
TAG="v$VERSION"

# 1. package.json version
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json && rm package.json.bak

# 2. prepend entry to site/manifest.json (python3 for safe JSON editing)
python3 - "$VERSION" "$DATE" "$TAG" "$NOTES" <<'PY'
import json, sys
version, date, tag, notes = sys.argv[1:5]
path = "site/manifest.json"
with open(path) as f:
    m = json.load(f)
m["latest"] = version
m.setdefault("versions", []).insert(0, {
    "version": version, "date": date, "gitTag": tag,
    "notes": notes or m.get("notes", ""),
})
with open(path, "w") as f:
    json.dump(m, f, indent=2)
    f.write("\n")
PY

echo "Bumped to $VERSION ($TAG) on $DATE"
echo "Next steps:"
echo "  git add -A && git commit -m 'release $TAG'"
echo "  git tag $TAG && git push origin main --tags"
echo "  deploy site/ to pi.686f6c61.dev"
