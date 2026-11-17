# 054 — Run the same exotui app on Deno, Bun, and Wasmtime

Status: Proposed — 2026-11-17. Linux first; implementation not started.

## Outcome

Run one TypeScript desktop app on all three hosts, with the same input normalization, cell layout and painting, WGSL,
CPU fallback, settings, and workspace codecs. Only launchers, capability providers, and guest bindings know the host.
Browser support stays intact. A Wasmtime build is a JavaScript guest component plus an `exotui-wasi` launcher, not a
claim that stock `wasmtime run` supplies GPU or persistence.

## Current state

- `src/runtime/host.ts` has a host injection point, but `RuntimeHost` is a broad Deno/Bun OS surface. The console
  presenter already supplies frames, input and store selection; don't implement a fake Deno or extend every
  `RuntimeHost` member to start.
- `src/app/backgrounds/gpu_device.ts` owns a shared desktop device and currently initializes Bun itself;
  `src/three_ascii/webgpu_compat.ts` has a separate acquisition path for feature/limit negotiation. Audit both and
  preserve their contracts rather than blindly force them onto one device.
- `src/runtime/storage.ts` exposes `AsyncStore` (`get/set/delete`) and `PersistentSignal`. Browser uses IndexedDB;
  console uses JSON; generic `createRuntimeStore` defaults to memory when IndexedDB is absent. Not every caller already
  goes through the same factory. Route the reference app through the presenter or an injected store factory first; don't
  change public fallback behavior globally.

## Target design

- **Guest and launcher.** Start with a pinned WASI 0.2 component using jco/ComponentizeJS and StarlingMonkey. Bundle the
  actual shared TypeScript app and assets; no app rewrite. A small Rust executable embeds Wasmtime, links standard WASI
  services, and registers versioned WIT interfaces for only the missing capabilities. A plugin is a host-side
  registration module initially, not a dynamically loaded native library. Use scheduler/terminal adapters for just the
  necessary input, output, resize, and timer operations. Keep ANSI, Unicode and input decoding in TypeScript. Make the
  host responsible for restoring terminal state on exit, trap or handled interruption. Use explicit host configuration,
  not global Deno/Bun shims.
- **WebGPU.** Use one host-neutral acquisition seam with Deno/Bun/browser adapters that keep the current native APIs. In
  the WASI guest, implement only the TypeScript WebGPU surface exercised by the reference workloads, with opaque
  resources and a Rust `wgpu` host. Start offscreen with WGSL compute, then render-to-texture and readback; no native
  windowing. Evaluate `wasi-gfx-runtime` against the exact guest/toolchain pin: the upstream WebGPU work targets WASI
  0.3 async, so adapting it is an option, not a dependency of the 0.2 milestone. If it doesn't fit, keep a small
  versioned private WIT bridge. Batch command encoding and transfers at submission boundaries where measurements justify
  it; don't put a host crossing in per-cell paint. Maintain ownership and ordering, map errors and device loss, release
  resources on guest exit, and make GPU opt-in with bounded resource/transfer limits. Always offer the existing CPU path
  when disabled, unavailable, or lost. No alternate WGSL or Rust implementations of application workloads.
- **Persistence.** Implement an IndexedDB-equivalent _for exotui's needs_, not the browser API: namespaced `AsyncStore`
  with atomic single-key replacement/deletion and a shared, versioned application codec for supported values. Browser
  keeps its real IndexedDB adapter. Prefer one optional TypeScript `node:sqlite` adapter on supported Deno/Bun versions
  and a native SQLite provider behind a byte-oriented WIT import on Wasmtime. Keep one schema definition and fixture
  set, with namespace/key as the primary key and an opaque encoded BLOB as the value. Rust must not know workspace or
  theme schema. Host chooses the state directory and allowed namespaces; guest provides no arbitrary DB path or SQL.
  Keep existing JSON as the default until an explicit, backup-preserving, idempotent migration is proven. Surface
  denied, busy, quota and corrupt-data failures explicitly; memory is an advertised ephemeral mode, not a silent
  replacement for failing durable storage. Do not union incompatible value semantics: audit real values before freezing
  the codec; no promise of arbitrary structured clone, secondary indexes, or multi-key transactions. Define write
  acknowledgment as backend transaction commit for the durable portable profile; browser conformance must check the
  transaction completion, not simply the request callback, without promising identical crash/power-loss guarantees.

## Implementation sequence and stop/go gates

For the upstream GPU trial, test both `wasi-gfx-js` (guest WebGPU bindings) and `wasi-gfx-runtime` (host) together.
Reuse both if they pass the actual workload; don't write our own guest API facade just because we own the launcher.

1. **Prove the JS guest before expanding the host.** Componentize a minimal app behind the existing presenter boundary,
   then load the shared desktop graph and run a headless fixture: render two frames, process input and resize, run a
   timer, and exit. Capture startup time/component size and enumerate missing builtins, imports and dependency features
   (streams, `AbortController`, timers, JS dependency resolution). Keep terminal I/O scripted at first, then verify a
   real PTY handles raw input, resizing and teardown. If basic app behavior requires a broad Node/DOM polyfill or a
   fork, stop and review the guest/toolchain choice before adding GPU or claiming support.
2. **Prove GPU with the same shader.** Before committing to a private bridge, test whether the pinned JavaScript guest
   and Wasmtime can call upstream WASI 0.3 WebGPU and complete async readback without a larger shim. Use the upstream
   interface if it passes; otherwise keep the WASI 0.2 baseline and the narrow private bridge. On 0.2, keep guest
   JavaScript promises but use explicit polling/notifications for GPU completion instead of blocking the app loop. Run
   the existing compute fixture on Deno, Bun and Wasmtime and compare exact readback bytes. Use the unchanged turbulence
   workload as the first production-shaped test, followed by one real offscreen render/readback and resize. Measure
   crossings, copied bytes, frame latency and resource cleanup; compare at fixed sizes with the native path. Exercise
   no-device, denied GPU, loss and reacquisition or CPU fallback; cover software CI separately from a named hardware
   lane and record backend/adapter. Expand toward Three ASCII and Butterchurn only after this gate, with a
   workload-to-method audit rather than speculative API coverage.
3. **Prove persistent state.** Run one `AsyncStore` contract suite across the browser and the three native runtimes
   against their declared semantics. Save an actual theme/workspace, reopen it on all three native hosts, and complete
   the round trip with the same database and codec on a supported local filesystem. Test missing keys, overwrites,
   deletes, Unicode, namespaces, interrupted writes, writer contention, incompatible versions, and read-only/full
   storage. Leave browser data origin-local; exchange state via the shared application format if needed. Keep a
   separately tested, opt-in migration from JSON.
4. **Ship a gated reference application, not full exomux parity.** Package the guest and custom launcher independently
   of library core dependencies. Run a clean packaged consumer on Linux with only the launcher and component installed,
   both with and without GPU, and run Deno/Bun/browser regression gates and existing bundle budgets. Document the
   capability matrix. PTY spawning and daemon/job control, raw host filesystem access, native workers/audio, and
   host-launched Chromium for headless Mermaid are separate follow-ups; don't claim them from a successful desktop smoke
   test.

## Acceptance checks

- [ ] All three launchers use the same desktop app entry, input/painter logic, state codec and GPU workload source.
      Build/import checks reject runtime-specific imports in the shared app and keep Rust/native bindings out of
      browser/core bundles.
- [ ] WASI fixture passes keyboard/resize/timer/persistence and terminal restoration; unavailable capabilities are
      reported honestly.
- [ ] Shared compute, offscreen render/readback, resize, loss and software fallback pass with recorded GPU backend,
      latency, and resource/copy measurements; a software-only pass is not hardware evidence.
- [ ] Durable state round-trips across fresh Deno, Bun, and Wasmtime processes, with restart, contention and
      failure-path coverage. Existing JSON files remain readable and untouched unless explicitly migrated.
- [ ] Deno, Bun and browser regressions pass; a packaged WASI demo runs without Deno/Bun installed. Publish no support
      claim beyond the measured feature matrix.

## Evidence and references

A disposable local probe passed a Deno 2.9.2 → Bun 1.4.0 → Deno 2.9.2 SQLite BLOB round trip using `node:sqlite` on both
hosts. Installed Bun 1.3.9 could not import `node:sqlite`. This verifies only that shared API/file path for the tested
versions, not Bun's whole API, WASI, locking or migration. Wasmtime and the GPU bridge have not been run.

- [Upstream GPU guest and host overview](https://wasi-gfx.dev/).
- [Wasmtime WASI 0.2 embedding](https://docs.wasmtime.dev/examples-wasip2.html) and
  [JS components](https://component-model.bytecodealliance.org/language-support/javascript.html).
- [wasi:webgpu proposal](https://github.com/WebAssembly/wasi-webgpu),
  [wasi-gfx runtime](https://github.com/wasi-gfx/wasi-gfx-runtime),
  [WASI working group update on async](https://github.com/WebAssembly/meetings/blob/main/wasi/2026/WASI-07-09.md), and
  [wgpu](https://github.com/gfx-rs/wgpu).
- [WASI key-value proposal](https://github.com/WebAssembly/wasi-keyvalue) leaves consistency provider-dependent; use it
  as an adapter option, not as the durability contract. [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html)
  documents the underlying journaling assumptions.
