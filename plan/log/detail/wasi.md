# Detailed development log: `wasi`

- **Branch:** `wasi`
- **Started:** 2026-11-17

## 2026-11-17 — Shared desktop runs as a WASI guest

Branched from the pushed Bun integration commit `a5fd3c2e`. The opt-in `packages/exotui-wasi/smoke.sh` bundles
`createDesktopApp` and `runShellApp` without a Deno or Bun runtime shim. jco 1.42.0 with StarlingMonkey and Wasmtime
50.0.0 executed the 27,862,214-byte component, verified the 90×28 and 78×24 frames, ran a timer, and disposed the
scripted presenter. The `builtin:` selector works with `jco scaffold`; `componentize --wit` requires the resulting WIT
path. No terminal modes or persistent storage were exercised. Next gate: real keyboard/resize and terminal teardown
through the native launcher, then GPU and durable state.

## 2026-11-17 — Pre-release README

Documented Bun verification, Exomux Files, Markdown and Mermaid render paths, and desktop effects. The runtime matrix
separates Exomonitor's Bun test coverage from live-feed verification and lists Wasmtime as a scripted guest experiment,
not a supported release target.

## 2026-11-17 — Native desktop launcher and packaging

Added the Linux launcher, a narrow WIT terminal/store interface, and the paired release archive build. The guest uses
the native console presenter and input parser through injected services. In an isolated real PTY, the release build
renders at startup, receives Tab, redraws after resize, restores terminal state on Ctrl-C and SIGTERM, and applies saved
settings on restart. An unoptimized sequential Wasmtime embedding exceeded 100 seconds before initial output; optimized
host dependencies, parallel compilation, and disabling guest Cranelift optimization brought the build into the PTY test
window. The package check now has Deno seed settings, the guest change the wallpaper from its real UI, and Bun verify
the committed value and a Unicode record. No JSON migration or crash/contended-write guarantee is implied. Shared Deno
health passed all 53 gates; Bun type checking and focused desktop/budget tests passed.

The upstream `wasi-gfx-js` compute example at `771b101` componentizes with QuickJS. It fails with a StarlingMonkey
splicer panic on jco 1.42.0; the desktop itself fails QuickJS componentization at missing `TextEncoder`. No upstream GPU
path is enabled, and Node remains untouched.

The release gate now tests the extracted archive with an empty launcher PATH. Ctrl-C, SIGTERM, and an intentionally
failing component all restore the original termios and leave the alternate screen. The SQLite contract additionally
checks that a competing native writer does not replace a committed value and that corrupt UTF-8 is rejected.

## WebGPU host plugin probe

`wasi-webgpu-wasmtime` 0.5.2 registered successfully in a headless Wasmtime 50.0.0 embedder. The `wasi-gfx-js` compute
example (`771b101`) used QuickJS and a WASI 0.3 command export; Mesa lavapipe returned exact mapped values `[2, 6, 10]`.
A deliberately wrong expected result trapped and reported the actual values. No windowing shims or hardware adapter were
exercised. A WASI 0.2 command export returned without running the asynchronous assertion, so exit status alone was
insufficient. StarlingMonkey still panics on the reduced GPU WIT world. The plugin works for the compute guest, but the
the compute guest, but the existing desktop does not load it. No production dependency changed.

## 2026-11-18 — Main integration

The clean release dry run exposed a workspace lock rewrite when manifest discovery was disabled. Keep the npm manifest
visible to Deno CI and to the release dry run, matching the committed lock. The merge scope is the CPU-rendered Linux
desktop; the WebGPU probe is evidence only, and there is no version bump or release tag.
