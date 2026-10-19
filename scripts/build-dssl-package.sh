#!/bin/sh
# rebuilds public/dssl-engine.zip and public/dssl-engine.tar.gz from canonical
# sources: package/ (docs + installers) and public/ (engine + starter styles).
# also keeps the served public/install.sh in sync with the packaged one.
set -eu
cd "$(dirname "$0")/.."

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

PKG="$STAGE/dssl-engine"
mkdir -p "$PKG/dssl" "$PKG/styles" "$PKG/examples"

# the engine itself
cp public/dssl/boot.js public/dssl/index.js public/dssl/parser.js \
   public/dssl/resolver.js public/dssl/engine.js public/dssl/utils.js "$PKG/dssl/"

# starter tokens + example stylesheet
cp public/styles/tokens.dssl "$PKG/styles/"
cp public/examples/hello.dssl "$PKG/examples/"

# docs + installers + license
cp package/USAGE.md package/install.sh package/install.ps1 package/LICENSE "$PKG/"

# the served one-liner installers are the packaged installers, always
cp package/install.sh public/install.sh
cp package/install.ps1 public/install.ps1

rm -f public/dssl-engine.zip public/dssl-engine.tar.gz
( cd "$STAGE" \
  && zip -qr /home/z/my-project/public/dssl-engine.zip dssl-engine \
  && tar -czf /home/z/my-project/public/dssl-engine.tar.gz dssl-engine )

chmod +x public/install.sh "$PKG/install.sh"

echo "--- built ---"
ls -la public/dssl-engine.zip public/dssl-engine.tar.gz public/install.sh
echo "--- zip contents ---"
unzip -l public/dssl-engine.zip
echo "--- tarball contents ---"
tar -tzf public/dssl-engine.tar.gz
