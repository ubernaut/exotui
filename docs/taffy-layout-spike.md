# Taffy 0.12.x Layout Backend Spike

Status: adapter boundary complete; runtime adoption deferred\
Research date: 2026-07-16

## Decision

Do not replace Yoga or advertise a working Taffy backend today. No evaluated distribution simultaneously provides a
published Taffy 0.12.x build, Deno and browser packaging, intrinsic measurement, lifecycle behavior, and a maintained
compatibility promise.

The intended future role is to **complement Yoga for Block and Grid**, not replace a working Flexbox backend before
runtime evidence exists. The current decision is therefore **reject/defer the available distributions**, keep Yoga and
the dependency-free solver unchanged, and retain the opt-in adapter and probe added by this spike as the acceptance gate
for a future candidate.

This is deliberately not a fake backend. The repository now contains the bridge contract, loader, validation,
projection, lifecycle, tests, and candidate probe, but no code claims to execute Rust Taffy without a real wrapper.

## Distribution research

The evaluation used upstream or package-owner sources rather than aggregator summaries.

| Candidate                 | Evidence                                                                                                                                                                                                                                                                                                                                                       | Decision                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Taffy Rust crate          | [docs.rs currently identifies Taffy 0.12.2](https://docs.rs/taffy/0.12.2/taffy/) and documents Block, Flexbox, Grid, `TaffyTree`, caching, and `compute_layout_with_measure`. Its [layout result](https://docs.rs/taffy/0.12.2/taffy/tree/struct.Layout.html) includes position, size, content size, border, padding, and margin.                              | Strong engine and the required 0.12.x target, but not a JavaScript distribution. |
| Upstream WASM PR #394     | The upstream README still calls the binding [WIP](https://github.com/DioxusLabs/taffy#bindings-to-other-languages). [PR #394](https://github.com/DioxusLabs/taffy/pull/394) remains a draft; its author stated on 2025-09-24 that it was not actively being worked on and encouraged consumers to bind Taffy themselves.                                       | Not a maintained, published dependency.                                          |
| Upstream WASM PR #927     | [PR #927](https://github.com/DioxusLabs/taffy/pull/927) was opened in March 2026, reports an approximately 339 KB optimized binary, and covers common Block, Flexbox, and Grid styles. It remains a draft with changes requested. The upstream review specifically notes that measure functions are absent and that this severely restricts text/image leaves. | Promising future base, but not consumable or complete enough for a TUI.          |
| `taffy-js` / `taffy-wasm` | The package owner publishes [`taffy-js`](https://www.npmjs.com/package/taffy-js) and [`taffy-wasm`](https://www.npmjs.com/package/taffy-wasm), but the owner repository's [Cargo manifest declares `taffy = "0.9.2"`](https://github.com/ByteLandTechnology/taffy-js/blob/main/Cargo.toml#L13).                                                                | Published and useful research, but outside the required 0.12.x series.           |
| `taffy-layout`            | The package owner publishes [`taffy-layout`](https://www.npmjs.com/package/taffy-layout), but its [Cargo manifest also declares Taffy 0.9.2](https://github.com/ByteLandTechnology/taffy-layout/blob/main/Cargo.toml#L13).                                                                                                                                     | Same version mismatch; not adopted.                                              |

Taffy 0.12.x itself is active. The blocker is the JavaScript/WASM distribution and integration contract, not the Rust
layout engine.

## Implemented boundary

The opt-in implementation is in `src/layout/solvers/taffy.ts`, published only through the experimental
`@ubernaut/exotui/layout/taffy` subpath. Neither the stable main module nor the default solver imports a Taffy package
or WASM asset.

The boundary provides:

- `TaffyLayoutSolver`, which implements the existing synchronous `LayoutSolver` contract.
- `TaffyLayoutSolverLoader`, which accepts a caller-owned import callback and caches only the validated module. Each
  solver receives an independent backend instance.
- A versioned `deno-tui.taffy-layout@1` manifest and request/result protocol.
- A hard Taffy `0.12.x` version check. A 0.9.x wrapper cannot be accidentally treated as the evaluated engine.
- Exhaustive capability-manifest validation. A loaded backend must report `optional` or `custom`, never `planned`.
- A defensive clone of the public `LayoutNode` tree, normalized bounds, and a host measurement callback shaped after
  `compute_layout_with_measure`.
- Strict result validation for protocol version, finite dimensions, non-negative sizes, node identity, and exact tree
  shape before any result reaches renderers.
- Parent-relative floating-point layout projection using rounded absolute edges, followed by the shared overflow and
  hit-region contracts.
- Idempotent disposal. A disposed solver reports unsupported and cannot be reused.
- Deterministic diagnostics for missing modules, incompatible protocol or Taffy versions, malformed capability data,
  asynchronous solve attempts, invalid measurement, malformed results, and backend failures.

No Taffy `NodeId`, `TaffyTree`, allocator, raw pointer, or WASM object appears in the public API. A bridge owns all such
handles and returns a source-tree-shaped plain result.

## Wrapper contract

A candidate wrapper module must export both a manifest and a factory:

```ts
import type { TaffyBackend, TaffyBackendManifest } from "@ubernaut/exotui/layout/taffy";

export const taffyBackendManifest: TaffyBackendManifest = {
  protocol: "deno-tui.taffy-layout",
  protocolVersion: 1,
  backendName: "my-pinned-taffy-wasm",
  taffyVersion: "0.12.2",
  capabilities: completeAndEvidenceBackedCapabilities,
};

export async function createTaffyBackend(): Promise<TaffyBackend> {
  const wasm = await initializePinnedWasm();
  return {
    solve(request) {
      // Build a private Taffy tree, call request.measure from Taffy's measure
      // closure, compute synchronously, and return plain parent-relative data.
      return solveThroughPrivateTaffyTree(wasm, request);
    },
    dispose() {
      wasm.free();
    },
  };
}
```

Loading remains explicit:

```ts
import { loadTaffyLayoutSolver } from "@ubernaut/exotui/layout/taffy";

const solver = await loadTaffyLayoutSolver({
  loadModule: () => import("./my-pinned-taffy-wrapper.ts"),
});
```

The asynchronous boundary ends at backend creation. `LayoutSolver.solve()` and the measurement callback remain
synchronous. A bridge that returns a Promise from `solve()` fails closed because the existing render pipeline is
synchronous.

In a Web Worker, load and construct the solver inside that worker. The solver and its measurement callback are not
`postMessage` payloads, and no process-global backend cache is used.

## Compatibility and benchmark probe

Run the checked-in probe against a candidate wrapper:

```sh
deno run -A scripts/taffy/probe.ts \
  --module ./path/to/taffy-bridge-wrapper.ts \
  --iterations 100
```

The JSON report checks:

- the protocol and Taffy 0.12.x manifest;
- declared Flexbox, Grid, and intrinsic-measurement support;
- deterministic Flexbox grow output;
- a two-by-two fractional Grid;
- an intrinsic text leaf that requires the host measurement callback;
- a 781-node nested tree with complete result projection;
- first-solve and repeated cross-boundary timing; and
- disposal behavior.

The probe intentionally has no default module and never downloads a candidate. Missing, incompatible, or malformed
backends exit nonzero with a structured adapter error.

## Evidence completed by this spike

| Requirement                                                   | Result                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| No default runtime dependency or import cost                  | Pass. The adapter imports only repository-local TypeScript and accepts a caller-owned loader.                                          |
| Public layout-tree stability                                  | Pass. `LayoutNode`, `LayoutSolverInput`, and `LayoutSolverResult` are unchanged.                                                       |
| No Taffy handles in public APIs                               | Pass. Only strings, numbers, public layout data, capability metadata, and a host measurement callback cross the boundary.              |
| Deterministic loader/cache behavior                           | Pass in focused tests. Concurrent callers share module validation; backend instances remain isolated. Failed imports are retryable.    |
| Disposal                                                      | Pass in focused tests. Disposal is idempotent and prevents reuse.                                                                      |
| Projection and failure diagnostics                            | Pass in focused tests, including float rounding, overflow, visibility, hit regions, duplicate IDs, async results, and reordered trees. |
| Real Deno terminal import and solve                           | Pending a real Taffy 0.12.x wrapper. The adapter and probe type-check in Deno.                                                         |
| Browser import and Pages bundling                             | Pending a real candidate and its WASM packaging. The adapter itself has no Deno-only runtime dependency.                               |
| Worker execution                                              | Pending a real candidate. The loader has no global cache and is designed to be constructed within a worker.                            |
| Simple/Yoga/Taffy conformance corpus                          | Pending a real candidate. Protocol fixtures test the adapter, not Taffy's algorithm.                                                   |
| Cold size, load time, steady layout, memory, and FFI overhead | Pending a real candidate. The probe records load and solve timing but cannot honestly invent WASM size or memory data.                 |

## Adoption gate

Revisit the decision only when a candidate satisfies all of the following:

1. It is pinned to a released Taffy 0.12.x version and has reproducible source and WASM artifacts.
2. It implements the checked-in bridge protocol without leaking engine handles.
3. It calls the host measurement callback for text, images, and custom widgets.
4. It passes the probe in Deno terminal, a bundled browser page, and a Web Worker.
5. It passes the L0/L1 conformance corpus for shared fields and the Grid/Block corpus for its complementary role.
6. Its capability claims exactly match observed behavior and unsupported mappings produce diagnostics.
7. Disposal and repeated construction show no unbounded memory growth.
8. Checked-in reports record WASM bytes, cold initialization, first layout, steady layout, large nested layout, and
   cross-boundary cost against Simple and Yoga on the same machine.

Until then, Simple remains the dependency-free default, Yoga remains the opt-in Flexbox backend, and Taffy remains an
experimental integration boundary rather than a shipped runtime.
