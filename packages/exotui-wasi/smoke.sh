#!/usr/bin/env bash
# Opt-in integration test; JCO and WASMTIME can point to isolated installations.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
jco=${JCO:-jco}
wasmtime=${WASMTIME:-wasmtime}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

deno bundle --platform=browser --output "$work/guest.mjs" packages/exotui-wasi/desktop_guest.ts
"$jco" scaffold "$work/command" --wit builtin:wasi-command@0.2.x --package-manager npm
"$jco" componentize "$work/guest.mjs" --backend starlingmonkey --wit "$work/command/wit" \
  --world-name command --disable http fetch-event --out "$work/desktop.wasm"
timeout 30s "$wasmtime" run "$work/desktop.wasm" > "$work/output"
diff -u <(printf '%s\n' 'exotui-wasi: desktop rendered 90x28 and 78x24; disposed') "$work/output"
printf 'Wasmtime desktop guest smoke passed (%s bytes)\n' "$(wc -c < "$work/desktop.wasm")"
