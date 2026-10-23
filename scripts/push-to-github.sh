#!/usr/bin/env bash
# DSSL project — permanent cloud backup to GitHub.
# Usage: GITHUB_TOKEN=<your PAT> bash scripts/push-to-github.sh [repo-name]
# Needs: classic PAT with `repo` scope, or fine-grained PAT with repo create rights.
set -euo pipefail

REPO_NAME="${1:-dssl-language}"
API="https://api.github.com"

: "${GITHUB_TOKEN:?Set GITHUB_TOKEN env var first (a GitHub Personal Access Token with repo scope)}"

OWNER=$(curl -sf -H "Authorization: token $GITHUB_TOKEN" "$API/user" | python3 -c 'import json,sys;print(json.load(sys.stdin)["login"])')
echo "Authenticated as: $OWNER"

echo "Creating repo $OWNER/$REPO_NAME (skips if it already exists)..."
HTTP=$(curl -s -o /tmp/gh-create.json -w "%{http_code}" -X POST \
  -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  "$API/user/repos" -d "{\"name\":\"$REPO_NAME\",\"private\":true,\"description\":\"DSSL — a Domain Specific Style Language that replaces CSS (self-hosted engine, no CSS output)\"}")
if [ "$HTTP" = "422" ]; then echo "Repo already exists — pushing into it."; else [ "$HTTP" = "201" ] && echo "Repo created."; fi

cd /home/z/my-project
git remote remove cloud 2>/dev/null || true
git remote add cloud "https://x-access-token:$GITHUB_TOKEN@github.com/$OWNER/$REPO_NAME.git"
git push -u cloud main
git remote set-url cloud "https://github.com/$OWNER/$REPO_NAME.git"  # scrub token from .git/config
echo "DONE — permanent backup live at https://github.com/$OWNER/$REPO_NAME"
