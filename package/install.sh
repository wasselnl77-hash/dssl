#!/bin/sh
# DSSL installer. macOS, Linux, the BSDs, busybox: anything with a POSIX shell.
#
#   curl -fsSL https://dssl-sable.vercel.app/install.sh | sh
#
# wget works just as well:
#   wget -qO- https://dssl-sable.vercel.app/install.sh | sh
#
# install somewhere else by appending a folder:
#   curl -fsSL https://dssl-sable.vercel.app/install.sh | sh -s -- ~/my-site
set -eu

BASE="https://dssl-sable.vercel.app"
DEST="${1:-.}"

fetch() {
  # fetch <url> <file>. curl first, wget second, an honest no otherwise.
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    echo "dssl installer: I need 'curl' or 'wget' to download the engine. Install either one and run this again." >&2
    exit 1
  fi
}

unpack() {
  # unpack <archive> <where>. tar.gz is the default package and tar ships
  # with every distro and macOS. No tar? Take the zip route via unzip,
  # or python3 if even unzip is missing.
  archive="$1"
  where="$2"
  case "$archive" in
    *.tar.gz)
      tar -xzf "$archive" -C "$where"
      ;;
    *.zip)
      if command -v unzip >/dev/null 2>&1; then
        unzip -q "$archive" -d "$where"
      elif command -v python3 >/dev/null 2>&1; then
        python3 -c "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$archive" "$where"
      else
        echo "dssl installer: no tar, no unzip, no python3. One of the three, please." >&2
        exit 1
      fi
      ;;
  esac
}

# a scratch dir, gone when we are
TMP="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/dssl-install-$$")"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT INT TERM

echo "fetching the DSSL engine..."

if command -v tar >/dev/null 2>&1; then
  fetch "$BASE/dssl-engine.tar.gz" "$TMP/engine.tar.gz"
  unpack "$TMP/engine.tar.gz" "$TMP"
else
  fetch "$BASE/dssl-engine.zip" "$TMP/engine.zip"
  unpack "$TMP/engine.zip" "$TMP"
fi

if [ ! -d "$TMP/dssl-engine" ]; then
  echo "dssl installer: the package came down in an unexpected shape. Grab it manually: $BASE/dssl-engine.zip" >&2
  exit 1
fi

mkdir -p "$DEST"
rm -rf "$DEST/dssl-engine"
cp -R "$TMP/dssl-engine" "$DEST/dssl-engine"

echo ""
echo "DSSL engine installed to $DEST/dssl-engine"
echo ""
echo "next: open dssl-engine/USAGE.md. It is two tags and one example file."
