#!/bin/sh
# Install komp (комп) from the latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/samchinmaya/komp/master/install.sh | sh
#
# Installs to ~/.local/bin by default; set KOMP_INSTALL_DIR to change that.
set -eu

REPO="samchinmaya/komp"
INSTALL_DIR="${KOMP_INSTALL_DIR:-$HOME/.local/bin}"

os=$(uname -s)
arch=$(uname -m)
case "$os-$arch" in
  Darwin-arm64)                target="aarch64-apple-darwin" ;;
  Darwin-x86_64)               target="x86_64-apple-darwin" ;;
  Linux-x86_64)                target="x86_64-unknown-linux-musl" ;;
  Linux-aarch64 | Linux-arm64) target="aarch64-unknown-linux-musl" ;;
  *)
    echo "komp: no prebuilt binary for $os $arch." >&2
    echo "Build it from source instead:  cargo install --git https://github.com/$REPO" >&2
    exit 1
    ;;
esac

asset="komp-$target.tar.gz"
url="https://github.com/$REPO/releases/latest/download/$asset"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $url"
curl -fsSL "$url" -o "$tmp/$asset"
curl -fsSL "$url.sha256" -o "$tmp/$asset.sha256"

# Check the download against the published checksum.
expected=$(cut -d ' ' -f 1 < "$tmp/$asset.sha256")
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | cut -d ' ' -f 1)
else
  actual=$(shasum -a 256 "$tmp/$asset" | cut -d ' ' -f 1)
fi
if [ "$expected" != "$actual" ]; then
  echo "komp: checksum mismatch, refusing to install." >&2
  exit 1
fi

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$INSTALL_DIR"
mv "$tmp/komp" "$INSTALL_DIR/komp"
chmod +x "$INSTALL_DIR/komp"

echo "Installed komp to $INSTALL_DIR/komp"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "Note: $INSTALL_DIR is not on your PATH. Add it, or run komp as $INSTALL_DIR/komp" ;;
esac

echo
echo "Connect it to Claude Code:"
echo "  claude mcp add --scope user komp -- \"$INSTALL_DIR/komp\" serve"
