#!/usr/bin/env bash
# Build and test the two release artifacts together from an isolated directory.
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$here/target}"
export CARGO_TARGET_DIR="$(realpath -m -- "$CARGO_TARGET_DIR")"
cargo build --release --locked --manifest-path "$here/Cargo.toml"
bash "$here/build_guest.sh" "$work/desktop.wasm"
bash "$here/build_guest.sh" "$work/failing.wasm" "$here/failing_guest.ts"
cp -- "$CARGO_TARGET_DIR/release/exotui-wasi" "$work/exotui-wasi"
cp -- "$here/README.md" "$here/../../LICENSE.md" "$work"
archive="exotui-wasi-linux-$(uname -m).tar.gz"
tar -C "$work" -czf "$work/$archive" exotui-wasi desktop.wasm README.md LICENSE.md
mkdir -- "$work/install"
tar -xzf "$work/$archive" -C "$work/install"
python3 "$here/test_pty.py" "$work/install/exotui-wasi" "$work/install/desktop.wasm" \
  "$work/state.sqlite" "$work/failing.wasm"
if [[ $# -gt 0 ]]; then
  mkdir -p -- "$1"
  cp -- "$work/$archive" "$1/$archive"
fi
