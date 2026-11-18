# Exotui desktop on Linux/Wasmtime

`exotui-wasi` runs the shared desktop in a WASI 0.2 component. It uses the same ANSI painter and terminal input decoder
as the Deno/Bun desktop. The launcher owns raw terminal mode and an optional SQLite settings file. This is the desktop,
not the Exomux multiplexer or an Exomonitor port. WebGPU is not wired up; the CPU desktop is available.

## Try a local build

Build tools: Deno 2.9.2, Node 24 with jco 1.42.0, Bun 1.4+, Rust 1.97, a C toolchain, and Python 3. Build and test the
paired Linux artifacts from the repository root:

```sh
npm install --prefix "$TMPDIR/exotui-wasi-tools" --no-audit --no-fund @bytecodealliance/jco@1.42.0
JCO="$TMPDIR/exotui-wasi-tools/node_modules/.bin/jco" bash packages/exotui-wasi/check.sh dist
```

Extract `exotui-wasi-linux-*.tar.gz`, then run from a terminal:

```sh
./exotui-wasi ./desktop.wasm ./desktop.sqlite
```

Use `:memory:` instead of a state file for an ephemeral run. Ctrl-C exits. The paired Linux binaries don't need Deno,
Bun, Node, or a separate Wasmtime installation at runtime. Use the supplied component and a private state path. The
launcher grants no filesystem preopens; the desktop gets only the named settings store, terminal I/O, and the WASI
services it imports. The launcher is not intended for arbitrary downloaded components.

`check.sh` tests the release build in a private PTY, including startup, resize, keyboard and mouse input, terminal
restoration after Ctrl-C, SIGTERM or a guest failure, and settings written through the UI and reopened across Deno,
Wasmtime, and Bun. Deno and Bun desktops still default to their current storage; this does not migrate existing state.
`smoke.sh` remains a smaller, scripted stock-Wasmtime test.
