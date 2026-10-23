#!/bin/sh
# DSSL engine installer
#   curl -fsSL https://dssl-sable.vercel.app/install.sh | sh
set -e
BASE="https://dssl-sable.vercel.app"
ZIP="/tmp/dssl-engine-$$.zip"

command -v curl >/dev/null 2>&1 || { echo "DSSL installer: 'curl' is required."; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "DSSL installer: 'unzip' is required."; exit 1; }

echo "fetching the DSSL engine..."
curl -fsSL "$BASE/dssl-engine.zip" -o "$ZIP"
rm -rf dssl-engine
unzip -q "$ZIP" -d .
rm -f "$ZIP"

echo ""
echo "DSSL engine installed to ./dssl-engine"
echo "read dssl-engine/USAGE.md to wire it into a page."
