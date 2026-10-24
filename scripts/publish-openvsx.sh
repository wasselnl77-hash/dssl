#!/usr/bin/env bash
# Publishes the DSSL extension to Open VSX (the registry VSCodium searches).
#
# Token resolution order: $1 | $OPENVSX_TOKEN | the file named by $OPENVSX_TOKEN_FILE
# The token is never echoed and never lands in a tracked file.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dssl-vscode"

TOKEN="${OPENVSX_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -n "${OPENVSX_TOKEN_FILE:-}" ] && [ -f "$OPENVSX_TOKEN_FILE" ]; then
  TOKEN="$(tr -d '[:space:]' < "$OPENVSX_TOKEN_FILE")"
fi
if [ $# -ge 1 ] && [ -n "$1" ]; then
  TOKEN="$(printf '%s' "$1" | tr -d '[:space:]')"
fi
if [ -z "$TOKEN" ]; then
  echo "error: no Open VSX token (pass it as arg 1, set OPENVSX_TOKEN, or point OPENVSX_TOKEN_FILE at a file that holds it)" >&2
  exit 1
fi
if [ ${#TOKEN} -lt 16 ]; then
  echo "error: token looks too short to be real" >&2
  exit 1
fi

VSIX="$(ls -t "$DIR"/dssl-vscode-*.vsix 2>/dev/null | head -1)"
if [ -z "$VSIX" ]; then
  echo "error: no .vsix found in $DIR (run: cd dssl-vscode && npx @vscode/vsce package --no-dependencies)" >&2
  exit 1
fi

echo "publishing $(basename "$VSIX") to Open VSX (namespace ehs-studio)..."
cd "$DIR"

# create-namespace fails if it already exists; that is fine, keep going
npx --yes ovsx create-namespace ehs-studio --pat "$TOKEN" \
  || echo "(namespace create reported an error, continuing: it probably already exists)"

npx --yes ovsx publish "$(basename "$VSIX")" --pat "$TOKEN"
rc=$?

if [ $rc -eq 0 ]; then
  name="$(python3 -c "import json;print(json.load(open('package.json'))['name'])")"
  ver="$(python3 -c "import json;print(json.load(open('package.json'))['version'])")"
  echo ""
  echo "LIVE: https://open-vsx.org/extension/ehs-studio/$name/$ver"
  echo "VSCodium: Extensions tab -> search DSSL -> Install"
fi

unset TOKEN
exit $rc
