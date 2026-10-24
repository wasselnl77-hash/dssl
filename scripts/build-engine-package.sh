#!/usr/bin/env bash
# Rebuild public/dssl-engine.zip and public/dssl-engine.tar.gz from the current engine + package texts.
# Usage: bash scripts/build-engine-package.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/dssl-engine/dssl" "$STAGE/dssl-engine/styles" "$STAGE/dssl-engine/examples" "$STAGE/dssl-engine/cli"
cp "$ROOT"/public/dssl/boot.js "$ROOT"/public/dssl/index.js "$ROOT"/public/dssl/engine.js \
   "$ROOT"/public/dssl/parser.js "$ROOT"/public/dssl/resolver.js "$ROOT"/public/dssl/static.js "$ROOT"/public/dssl/utils.js \
   "$STAGE/dssl-engine/dssl/"
cp "$ROOT/cli/dssl.mjs" "$STAGE/dssl-engine/cli/"
cp "$ROOT/public/styles/tokens.dssl" "$STAGE/dssl-engine/styles/"
cp "$ROOT/engine-package/USAGE.md" "$ROOT/engine-package/install.sh" "$STAGE/dssl-engine/"
cp "$ROOT/engine-package/hello.dssl" "$STAGE/dssl-engine/examples/hello.dssl"
cp "$ROOT/package/LICENSE" "$STAGE/dssl-engine/LICENSE"

rm -f "$ROOT/public/dssl-engine.zip"
python3 - "$STAGE" "$ROOT/public/dssl-engine.zip" <<'PY'
import os, sys, zipfile
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for base, _dirs, files in os.walk(stage):
        for f in files:
            full = os.path.join(base, f)
            z.write(full, os.path.relpath(full, stage))
PY
rm -f "$ROOT/public/dssl-engine.tar.gz"
tar -czf "$ROOT/public/dssl-engine.tar.gz" -C "$STAGE" dssl-engine
echo "built $ROOT/public/dssl-engine.tar.gz"
echo "built $ROOT/public/dssl-engine.zip:"
python3 -m zipfile -l "$ROOT/public/dssl-engine.zip"
