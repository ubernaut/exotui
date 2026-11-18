#!/usr/bin/env bash
set -euo pipefail
output=${1:?usage: build_guest.sh OUTPUT.wasm}
output=$(realpath -m -- "$output")
source=${2:-packages/exotui-wasi/terminal_guest.ts}
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
jco=${JCO:-jco}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
host='exotui:host/terminal@0.1.0'
deno bundle --frozen --platform=browser --external "$host" --output "$work/guest.mjs" "$source"
"$jco" scaffold "$work/command" --wit builtin:wasi-command@0.2.x --package-manager npm
cp "$work/command/wit/package.wit" "$work/command/wit/deps/wasi-cli.wit"
cp packages/exotui-wasi/wit/host.wit "$work/command/wit/deps/exotui-host.wit"
printf '%s\n' 'package exotui:desktop@0.1.0;' 'world desktop {' \
  '  export wasi:cli/run@0.2.12;' "  import $host;" '}' > "$work/command/wit/package.wit"
"$jco" componentize "$work/guest.mjs" --backend starlingmonkey --wit "$work/command/wit" \
  --world-name desktop --disable http fetch-event --out "$work/desktop.wasm"
mv -- "$work/desktop.wasm" "$output"
