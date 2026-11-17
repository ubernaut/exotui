# Detailed development log: `feature/bun-support`

- **Branch:** `feature/bun-support`
- **Started:** 2026-10-09

## 2026-10-09 — Full Bun port requested

User requested a new branch supporting all existing functionality, explicitly including `bun-webgpu` and exomux. Fetched
origin; local main and origin/main have no divergent commits. Created feature/bun-support while preserving the
uncommitted feasibility log from the preceding investigation. No live exomux instance will be used for acceptance tests.

ICC MCP work entry point was engaged directly. Explicit CLI full reindex refreshed all stores successfully after the
feasibility log edit. CLI work persistence is running; edit agents will start after its task metadata and leases are
verified. No repo-local agent-enforcement file exists. Task scope and acceptance checks live in
`plan/todo/049-bun-support.md`; plan/plan.md remains user-owned.

Initial implementation approach: explicit host boundary plus Bun terminal/files/process/server adapters, a native Bun
Terminal backend, lazy bun-webgpu setup with actual GPU workloads, full exomux migration, and portable package/tooling
support. ICC leases separate core work, GPU files and packages/exomux. Official bun-webgpu README and npm metadata were
consulted; npm currently publishes 0.1.7. The three-quake-tui checkout already has 0.1.5 native bindings as an available
reference, but no dependencies or runtime configuration there will be changed.

## Runtime port and real workload verification

Implemented an explicit runtimeHost boundary with native Deno delegation and Bun terminal, filesystem, process, socket,
HTTP/WebSocket, permissions and operating-system adapters. Public console/timer/process types are portable. All 16
package entrypoints have Bun exports, pinned optional integrations and an independent packed-consumer check. Existing
application/examples/scripts use the shared host. Bun task and isolated test runners preserve the repository's Deno test
contracts and canonical assertion behavior, including resource leak and asynchronous error checks. Browser bundles
retain an isolated host facade; all ten E2E commands and six browser build artifacts passed.

Exomux now uses the portable host and native Bun PTYs. The Bun compiler embeds GPU bindings and glyph assets and handles
compiled daemon self-reexecution. Tests use isolated state directories. Deno's full Exomux suite passed 562 tests; the
Bun suite passed 562. Source and standalone Deno/Bun client/daemon combinations passed input, resize, detach, replay,
kill and shutdown. Native lifecycle tests caught and fixed an uncancelled title timer and owned tailnet connection.

The real terminal input regression initially failed immediate resize. Investigation found passing an existing
Bun.Terminal to spawn leaves the child without a controlling terminal. Creating the terminal inline in Bun.spawn fixes
native SIGWINCH, Ctrl-C and Bash Ctrl-Z/fg job control on both Bun 1.4.0 and1.4.2 without FFI or an external helper. The
adapter now uses inline creation; all seven native host tests pass, including keyboard, paste, mouse, focus, 91x29
resize, terminal mode restoration, byte-exact 1 MiB output with backpressure and cancellation of a stalled output
consumer.

GPU initialization is lazy through bun-webgpu 0.1.7. Actual NVIDIA RTX 5060 Ti source and fresh standalone probes passed
on Bun 1.4.0: compute [17,34,51,68]; turbulence 44 dispatches/11 readbacks; Exomux Butterchurn nonblack RGB; all Three
ASCII styles in blocking/deferred modes with immediate image readback, 96x48 resize, cleanup and device loss recovery.
These are hardware workloads rather than mocks or CPU fallback. Bun's native upload limitations required PNG-backed GPU
textures, and manual rendering required explicit NodeFrame advancement. Deno rendering behavior is preserved. JSR
publishing required explicit public UniformNode type annotations; the corrected dry-run passes.

The existing installed Bun 1.3.9 is unsuitable: native WebSocket shutdown can hang and file watching loses repeated
atomic replacements. Pinned isolated Bun 1.4.0 fixes both; support therefore requires Bun 1.4+. The installed runtime
and live Exomux daemon were not changed. Compilation from disk to /tmp also exposed Bun 1.3.9's EXDEV copy problem;
compilation works from its output directory. Final checks use the pinned 1.4.0 binary.

Initial full regression runs exposed expected public API/entrypoint budget updates plus inherited NO_COLOR affecting
color tests. The accepted new runtime exports and portable declarations are reflected in generated API/budget artifacts;
checks run with NO_COLOR removed. Full final verification is still running. No health gate has been waived.

## Final regression evidence and audit limits

Bun 1.4.0's full isolated root suite passes 3,706 tests across 380 files; its full Exomux suite passes 563 tests across
58 files. The final native host regression also checks zero-length file reads. Strict checking passes 605 source roots
and an independent tarball consumer imports all 16 entrypoints, checks portable public types and runs a headless app
lifecycle. Default Deno discovery initially treated scripts/bun_test.ts as a test; renaming it to bun_test_runner.ts
fixes actual Deno discovery and all package task references. The default-discovery type check and focused reachability
test pass. Deno's final root suite passes 3,699 tests with 41 steps, zero failures and seven correctly ignored Bun-only
tests.

A fresh standalone Exomux build and all four Deno/Bun client-daemon combinations now additionally prove controlling
terminal ownership, kernel resize signals, foreground job process groups, Ctrl-Z stopping a real job, fg resuming it,
Ctrl-C interrupting it, input, retained scrollback and owned process cleanup. Source and compiled interactive checks
pass.

ICC full reindex, Git history refresh, guard-diff, completion oracle, readiness and production audit were executed. The
diff guard has no violations; its size and two replaced Three typing surfaces produce nonblocking warnings. The broad
production audit remains red for existing oversized modules and the generic completion oracle's fallback classifiers.
Exact source review confirms its three flagged paths are unchanged safe-rejection/disposed-listener handling and an
explicitly gated test transport. No Bun-specific oracle is registered, so that generic report is not a port acceptance
verdict. No severity or suppression policy was changed. Concrete hardware workloads, native terminal/daemon checks and
repository-owned gates supply the port's acceptance evidence. Final store refresh will follow the completed task record.

## Completion

All 52 repository health gates pass. Deno root: 3,699 passed with 41 steps, zero failures, seven Bun-only tests ignored.
Deno Exomux: 563 passed, zero failures. Web and worker suites pass. Formatting, public API inventory/reference,
reachability, package checks, JSR release checks, browser artifacts, E2E commands, desktop smoke and benchmarks all
pass. Final Bun host checks, strict 605-root checking and packed-consumer checking pass after the last compatibility
fix. Task 049 is complete and moved to todo/done; priority and summary logs are aligned. plan/plan.md is unchanged. The
original pre-port main-branch feasibility log is preserved. Changes remain uncommitted on the requested feature branch;
no merge, publish, live daemon change or installed Bun upgrade occurred. Final metadata freshness and diff checks follow
this record.

## Clean-install correction before handoff

A final frozen installation check found two Bun CLI/package wiring problems after runtime tests had passed. Bun 1.4
requires subcommand options after the subcommand: bun install --cwd DIR and bun run --cwd DIR TASK. Prefixing --cwd
before run silently prints usage with exit zero, so an exit code alone does not prove task execution. The task
translator, README and CI are corrected. Exomux's local parent file dependency also failed Bun's copy path; a
link:relative experiment installed successfully but linked the global install directory rather than the source. That
experiment was rejected by actual import checks. Clean source-copy installation and real entrypoint execution are being
verified before final handoff.

The parent file dependency succeeds in an actual fresh source checkout. The failure in this worktree came from a stale
nested lock and the previously installed manual symlink; removing that owned bad link and regenerating the lock restores
ordinary file:../.. installation. No global-link dependency is retained. Root and Exomux frozen installs pass, actual
entrypoints import, strict Exomux consumer types pass and all 563 Exomux tests pass in the clean copy. A private
identity probe and a deliberately leaked copied-library file also verify that the preload shares its instrumented host
across copies and still rejects resource leaks. The source/compiled native lifecycle checks and all four cross-runtime
pairs pass after reinstalling. The complete root suite rerun passes 3,707 tests across 381 files, including the new
task-execution regression. Default Deno discovery/type checking passes with the new Bun-only test correctly excluded.
The final JSR release and independent packed-consumer checks pass.

The root compile task now produces an actual standalone binary, and the root compatibility task executes all four
runtime combinations successfully. A filter regression in the isolated test runner was corrected: Bun's exact
zero-matching-file diagnostic is counted as filtered only when a filter was requested; an entirely unmatched filter,
import errors, assertion failures and resource leaks still fail. Both pattern syntaxes work. The actual root Exomux task
passes two native daemon tests while filtering 561 others. Plain Deno package-aware public checks and default discovery
also pass, in addition to the repository's established no-package-json health environment.

All implementation and acceptance work is complete. Final manifests use the ordinary parent file dependency and pinned
Bun 1.4 types; fresh installation, strict consumers, runtime workloads and lifecycle/resource guards have been checked.

## 2026-10-27 — Files tree and Markdown document viewer

The user asked whether exomux could open formatted Markdown, then requested a simple file explorer using the Tree widget
like Network. The library renderer existed but exomux had no file-opening UI. Added client-local Files and Document
windows, lazy folder listing, parent/refresh navigation, UTF-8 text previews, and the existing Markdown widget on a
composited surface. Files is available from the start menu and Ctrl-N e. The windows share normal host window behavior
and phone maximization, while their visibility and content remain outside daemon-shared state. Existing uncommitted Bun
changes were preserved. No changes to plan/plan.md.

Verification in progress: real temporary-directory fixtures plus mounted desktop/phone keyboard, mouse, touch and scroll
tests. ICC task: exomux-files-markdown.

### Verification and limits

- Focused filesystem/interaction tests cover lazy expansion, parent/refresh, Markdown versus literal text, preview size
  and encoding checks, stale reads, shared-client isolation, and real mounted menu/keyboard/mouse/touch/wheel behavior
  at 100 and 36 columns. Six tests pass on Bun 1.4.0; the full Deno package suite includes all six.
- The first package run had 567 passing tests and one failure: its existing start-menu inventory did not include Files.
  Updated that expectation. The first root run had five inherited NO_COLOR-related failures; the complete rerun with
  NO_COLOR removed passes without source changes to those tests.
- `env -u NO_COLOR PATH=/tmp/exomux-files-bun-1.4.0/package/bin:$PATH deno task health` passes every gate: 3,699 library
  tests (41 steps, 8 Bun-only skips), 569 Exomux tests, 62 web tests, and 54 worker tests. Package/API/release/format
  and reachability checks also pass. No library exports or budgets changed.
- Bun 1.4.0 was extracted into a task-owned temporary directory because installed Bun is 1.3.9. Both
  Bun-client/Deno-host and Deno-client/Bun-host compatibility probes pass input, resize, replay, cleanup and shell job
  control. The installed runtime and the maintainer's live daemon were not changed.
- Final review tightened path labels so a filename containing a newline or tab cannot spill into another header row.
  Focused tests and lint were rerun after that small change.
- ICC full index/memory/graph/search/substrate refresh and the scoped guard pass. Evidence lives under the external ICC
  task `exomux-files-markdown`; terminal appearance still awaits the maintainer's own live look.

## 2026-11-17 — Files folder menu and Markdown scrolling follow-up

The maintainer reported that Markdown scrolling did not work well in live use. The mounted desktop and phone harnesses
could move the offset and the painted content with a wheel, keys, or touch before the change; the exact live failure was
not reproduced. The old renderer rebuilt an offscreen TUI and Markdown widget for every offset and painted unstyled rows
while waiting for each new frame. Now the desktop paints semantic spans directly from the same cached Markdown layout
that clamps input, with a visible position percentage and additional `j`/`k` and Space shortcuts.

Files folder right-click now opens the existing anchored popup with **Open terminal here**, without expanding the
folder. The clicked directory goes to the standard terminal spawn `cwd` field unchanged, not into a shell command.
Coverage checks paths with spaces, dismiss without launch, and that right-clicking a file does not open a folder menu.

The port is still uncommitted on `feature/bun-support`; `main` has no Bun changes. This machine still defaults to Bun
1.3.9. An isolated Bun 1.4.0 passed the strict source check, all 16 packed entrypoints, and both mixed-runtime real PTY
probes (resize, replay, job control and cleanup). Native GPU evidence above is from the original port, not this rerun.
The isolated tmux UI smoke did not get through terminal input to the Files window; no live UI pass is claimed. ICC task:
`exomux-files-followup`.

Final package suites passed 570 tests each on Deno and Bun 1.4.0. A fresh standalone Bun build also passed the PTY
probes with both runtimes as clients. No installed runtime, live daemon, or release was changed.

## 2026-11-17 — Document renderers integrated

Fast-forwarded to document-renderers commit `07f0d615` and reapplied the local Bun/Files work, retaining the original
stash as a recovery checkpoint. Regenerated Unicode/API integration output and packaged all 19 entrypoints. Bun builds
the headless Mermaid browser module with esbuild and uses the same isolated Chromium host as Deno. Browser bundles omit
the OS host shim; UTF-8 output keeps the desktop below the unchanged 900,000-byte budget.

Bun 1.4.0 passes 4,711 tests across 500 files, strict source checks, the independent packaged-consumer check, source and
standalone PTY interoperability, and hardware WebGPU probes. Actual Chromium checks cover the 57-diagram official SVG
and headless catalogues, fonts, counters, Canvas2D resize, desktop interactions and animations. A Bun `String.raw`
transpilation difference was corrupting a non-ASCII TeX fixture; interpolating the original Unicode string preserves the
same assertion on both hosts. Exomux clean frozen installs use the symlink backend; an incomplete local package
directory may need moving aside before reinstalling. Nothing was pushed or published.

Final `deno task health` exits zero with all 53 gates passing. The Deno browser bundle subprocess now explicitly uses
the Deno lock/import map instead of incorporating the parallel Bun manifest. The final desktop bundle is 898,241 bytes.

## 2026-11-17 — Wasmtime planning

Recorded the Linux-first guest, GPU and persistence gates in `plan/todo/054-wasmtime-host.md`. The same `node:sqlite`
API preserved BLOBs in a disposable Deno 2.9.2 → Bun 1.4.0 → Deno 2.9.2 file round trip. Bun 1.3.9 could not import that
module. No Wasmtime, GPU or runtime implementation was run or changed for this plan.
