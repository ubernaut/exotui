#!/usr/bin/env bash
# Compiles Exomux and installs it for the current user, so `exomux` works from
# any directory. Re-run after pulling changes to refresh the installed binary.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${EXOMUX_BIN_DIR:-$HOME/.local/bin}"

if ! command -v deno >/dev/null 2>&1; then
  echo "error: deno is required to build Exomux (https://deno.com)" >&2
  exit 1
fi

echo "Compiling Exomux..."
deno task --cwd "$repo/packages/exomux" compile

mkdir -p "$bin_dir"
install -m 755 "$repo/packages/exomux/exomux" "$bin_dir/exomux"
echo "Installed $bin_dir/exomux"

case ":$PATH:" in
  *":$bin_dir:"*)
    echo "Run it from anywhere with: exomux"
    ;;
  *)
    echo "note: $bin_dir is not on your PATH. Add it with:"
    echo "  export PATH=\"$bin_dir:\$PATH\""
    ;;
esac
