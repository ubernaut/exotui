# Testing And Performance

This fork treats demos, tests, and runtime capability checks as part of the public surface.

## Feature Checklist

Every new feature cluster should include:

- A focused public API with small modules and pure helpers where possible.
- Unit tests for helper behavior.
- A runnable demo when the feature changes visible UI behavior.
- Runtime capability detection when using Workers, WebGPU, WebGL, IndexedDB, or other optional platform APIs.
- A fallback path or clear constructor-time failure for unavailable platform APIs.

## Snapshot Helpers

`./testing` exports helpers for terminal-output tests:

- `stripAnsi(value)` removes ANSI control sequences.
- `normalizeTerminalSnapshot(value)` strips ANSI and trailing cell whitespace.
- `frameBufferToSnapshot(frameBuffer)` turns a canvas frame buffer into normalized text.
- `createTestStdout()` captures canvas writes in memory.
- `createTestCanvas({ size })` creates a canvas with deterministic in-memory stdout.
- `canvasSnapshot(canvas)` and `canvasRowText(canvas, row, width)` read rendered output from a canvas frame buffer.
- `Canvas.inspectRender()` reports the most recent render pass, including updated objects, intersection recalculations,
  and flushed cells for repaint regression tests.
- `compareTerminalSnapshot(actual, expected)` returns normalized text plus bounded line/column mismatches.
- `formatTerminalSnapshotDiff(comparison)` formats those mismatches for readable test failures.
- `assertTerminalSnapshot(actual, expected)` throws that formatted diagnostic when snapshots differ.
- `createTestKeyPress()` and `createTestMouseScroll()` build deterministic input events without reading from a TTY.
- `createTestFocusable()` and `TestKeyPressTarget` make focus/navigation tests independent of real components.

These helpers are intentionally small and do not choose a test framework. They work with Deno's built-in test runner.

## Application Pilot

`createTestTerminalApp()` constructs the real opinionated app shell on a deterministic in-memory canvas and returns a
`TerminalAppPilot`. It disables host stdin and process-signal ownership while preserving commands, action middleware,
focus, component registration, pointer routing, responsive layout, and rendering.

```ts
import { assertEquals } from "jsr:@std/assert";
import { createTestTerminalApp } from "jsr:@ubernaut/exotui/testing";

let count = 0;
const harness = await createTestTerminalApp<{ type: "increment" }>({
  commands: [{
    id: "increment",
    label: "Increment",
    binding: { key: "i" },
    action: { type: "increment" },
  }],
  onAction: () => count += 1,
});

try {
  await harness.pilot.press("i");
  await harness.pilot.resize(100, 30);
  assertEquals(count, 1);
  assertEquals(harness.canvas.size.peek(), { columns: 100, rows: 30 });
} finally {
  harness.destroy();
}
```

The pilot also provides `click()`, `scroll()`, `paste()`, `focus()`, `executeCommand()`, direct action `dispatch()`,
`settle()`, `waitFor()`, and normalized canvas `snapshot()`. Key and action methods settle asynchronous action handlers
before returning. Pointer methods await the app mouse router directly, making async hit targets deterministic without a
real terminal input loop.

## Runtime Performance Layer

`src/runtime/mod.ts` exposes:

- `detectRuntimeCapabilities()` plus `summarizeRuntimeCapabilities()` / `formatRuntimeCapabilities()` for Workers,
  WebGPU, WebGL, OffscreenCanvas, and IndexedDB diagnostics.
- `createRuntimePlan()` / `formatRuntimePlan()` for deterministic worker, storage, and renderer fallback decisions.
- `detectTerminalCapabilities()` plus `createTerminalPlan()` / `formatTerminalPlan()` for deterministic color, Unicode,
  mouse protocol, bracketed paste, hyperlink, and alternate-screen decisions.
- `detectTerminalEnvironment()`, `terminalEnvironmentDiagnostics()`, and `createTerminalPortabilityReport()` for
  tmux/SSH, truecolor, locale, TTY, and noninteractive diagnostics.
- `terminalSessionSequences()` and `createTerminalSessionController()` for testable terminal enter/exit setup with an
  injectable writer. Noninteractive terminal plans intentionally emit no setup or teardown escape sequences.
- `RuntimeProfile`, `RuntimeProfileRegistry`, and runtime profile catalog helpers for named, queryable policies such as
  balanced, throughput, portable, and ephemeral execution.
- `inspectRuntimeWorkload()`, `createRuntimeWorkloadReport()`, and `formatRuntimeWorkloadMarkdown()` for scheduler and
  worker-pool pressure telemetry.
- `AsyncScheduler` for bounded, prioritized, and abortable queued async work.
- `RenderLoop` for inspectable terminal frame loops with injectable timers.
- `WorkerPool`, `installWorkerHandler()`, and `workerTransform()` for standards-style worker jobs and pipeline stages.
- `MemoryStore` and `IndexedDbStore` for configurable persistence.
- `CachedAsyncResource` and `CachedDataPipeline` for optional store-backed restore paths before fresh async work
  completes.
- `DataQueryController` plus `queryLocalData()` for cacheable async datasets with normalized search, filter, sort, and
  pagination state.

Prefer this layer over directly branching on globals inside components. Components should stay deterministic and easy to
test; apps and renderers should use runtime and terminal plans to decide whether to use Workers, WebGPU, WebGL,
IndexedDB, Unicode glyphs, mouse protocols, or fallback implementations. `WorkerPool.run(payload, { signal })` can abort
pending callers, `pendingCount()` exposes lightweight backpressure state, and `workerFactory` lets tests inject a
deterministic worker without starting real threads. Use `createRuntimeWorkloadReport()` when a demo, settings pane, or
CI log needs one view over both scheduler queues and worker pools. It reports capacity, running work, queued work,
saturation, idle state, and termination state without requiring callers to special-case each runtime primitive.
`AsyncScheduler.inspect()` additionally reports scheduled, completed, failed, cancelled, max-running, and max-pending
counters for queue pressure diagnostics. `RenderLoop.inspect()` reports frame budget, last/average/max tick duration,
and over-budget frame counts so renderers can expose frame pressure without adding their own timers.

`DataQueryController` is the shared runtime primitive for async table, catalog, picker, and dashboard datasets. It wraps
`CachedAsyncResource`, exposes normalized `params`, `state`, and `result` signals, and keeps query, filter, sort, page,
and page-size mutations testable without coupling the data source to a specific widget. Use `queryLocalData()` for
in-memory rows, or provide an async loader that calls a service, worker, IndexedDB store, or WebGPU/WebGL-backed
preprocessor before returning a `DataQueryResult`. `bindDataQueryParams()` connects search/filter/page signals to async
loads, while `bindDataQueryResult()` and `bindDataQueryTable()` project query pages into row signals or
`DataTableController` instances. `bindDataQuerySetting()` persists query params through app settings, and
`bindDataQueryCommands()` exposes reload, restore, cache clearing, query/filter clearing, paging, page-size, and sort
operations to command palettes, menus, and keymaps. `createDataQueryPlugin()` packages those bindings behind the same
rollback-safe app plugin lifecycle used by runtime profiles and themes. Run `deno task data-query` for a cache-backed
process query demo.

`createAppPluginDefinitionRegistry()` keeps plugin catalogs testable when apps discover route, command, keymap, runtime,
theme, or data-query modules dynamically. The registry supports replacement-safe registration, filtered reports, and
Markdown output, so docs, launcher screens, and marketplace-style settings panes can use one source of truth. Run
`deno task app-plugin-catalog` for the built-in plugin registry report.

Runtime profiles let apps expose strategy choices as data instead of hard-coded conditionals. A settings pane can show
`RuntimeProfileRegistry.catalog()`, keep the selected profile in a `RuntimeProfileController`, persist it with
`bindRuntimeProfileSetting()`, and expose `bindRuntimeProfileCommands()` through command palettes or menus.
`createRuntimeProfilePlugin()` installs that controller, command surface, optional keymap mirroring, and setting
persistence through the same disposable app-plugin lifecycle as theme and route modules. Run `deno task capabilities`
for the current capability summary, terminal environment diagnostics, default plan, and built-in profile table, or
`deno task capabilities -- --json` for machine-readable reports. When color works over raw SSH but degrades inside tmux,
the terminal diagnostics should report `tmux-truecolor-missing`; configure tmux with
`set -g default-terminal "tmux-256color"` and `set -as terminal-overrides ",*:Tc"`, then reload or restart tmux.

`BenchmarkRunner` supports per-case `category`, `description`, `tags`, `iterations`, `warmupIterations`, `maxAverageMs`,
and `maxTotalMs`. Pass `{ now }` in `BenchmarkRunnerOptions` to make benchmark unit tests deterministic, use
`summarize()` or `summarizeBenchmarkResults()` for pass/fail reporting, and format output with
`formatBenchmarkResults()` or `formatBenchmarkSummary()`. Summaries include aggregate `totalMs` and `averageMs` fields
for CLI reports and machine-readable logs. Use `inspect()` plus `createBenchmarkCatalogReport()` or
`formatBenchmarkCatalogMarkdown()` to expose benchmark metadata in docs, settings screens, CI summaries, and launchers
without running workloads. Run `deno task benchmark -- --list` for the readable catalog,
`deno task benchmark -- --list --json` for structured catalog output, or `deno task benchmark -- --json` for structured
timing output; threshold failures exit nonzero.

The default benchmark catalog intentionally covers high-volume TUI paths rather than microbenchmarks only:

- `layout/flex-rects-3-pane` and `layout/tile-rects-resize-wall` for pane solving and frequent terminal resize.
- `render/sparkline-80` and `render/render-loop-300-steps` for dashboard text rendering and render-loop telemetry.
- `data/table-select-100k` and `data/list-visible-50k` for large table/list navigation.
- `input/mouse-hit-test-500-targets` for dense mouse-aware regions.
- `widgets/theme-standard-39-components` for full component theme catalog coverage.
- `runtime/scheduler-batch-100` for bounded async scheduling pressure.

Thresholds are deliberately conservative smoke limits. When a case fails, first rerun with `--json` to compare total and
average timings, then inspect whether the workload should move to an `AsyncScheduler`, `WorkerPool`, cached data
pipeline, virtualized viewport, or renderer-specific fallback. Tighten thresholds only after the relevant path is stable
on the slowest supported development machine.

Run the default suite without broad permissions:

```bash
deno test
```

Run the contributor health gate:

```bash
deno task health
```

Run the end-to-end web and console suite:

```bash
deno task e2e
deno task e2e -- --json
```

## Renderer And Workbench Probes

Three ASCII and workbench changes need runtime evidence in addition to unit tests. GPU-backed probes are serialized by
the repository lock, so run them normally rather than launching several in parallel:

```bash
DENO_NO_PACKAGE_JSON=1 deno task three-workbench:startup-probe
DENO_NO_PACKAGE_JSON=1 deno task three-workbench:resize-probe
DENO_NO_PACKAGE_JSON=1 deno task three-ascii:live-probe -- --frames 45 --glyphs blocks --max-cells 960 --check --max-average-ms 40
DENO_NO_PACKAGE_JSON=1 deno task workbench-default-resize-visual-smoke
```

The startup probe checks first-grid publication and steady renderer time. The resize probe grows a live panel from
`80x24` to `154x41` cells and requires the published grid to reach at least 6,000 cells, which guards the contract that
the ASCII surface follows its current console rectangle. The PTY resize smoke validates the composed workbench frame,
truecolor coverage, and nonblank Three pane after a real terminal resize. Use `workbench-fullscreen-resize-visual-smoke`
when fullscreen geometry, pressure policy, or repaint behavior changes.

Inspect the public re-export graph before release:

```bash
deno task api-inventory
deno task api-inventory -- --json
deno task package-check -- --quiet
deno task release-check
deno task api-inventory -- --check --quiet --fail-duplicates --min-doc-coverage=1 --baseline=docs/api-stable-baseline.json
deno task api-reference > docs/api-reference.md
deno task screenshots
deno task visual-smoke
```

The inventory reports crawled modules, re-export declarations, exported symbol counts, missing local targets, and
duplicate public symbol names. The contributor health gate runs the quiet check with duplicate failure enabled, 100%
documentation coverage, and `docs/api-stable-baseline.json` stable export drift detection. `deno task package-check`
verifies package identity, SemVer, the lean publish allowlist, export-map alignment, and stable-root policy.
`deno task release-check` adds the strict JSR publish dry run and reports artifact file count and size. `deno task e2e`
runs finite public console reports, web type checks/tests, the GitHub Pages build, and generated browser asset checks in
one gate. The generated `docs/api-reference.md` file expands that inventory into a complete public module and symbol
reference. The screenshot task regenerates the README's curated JPEG captures for distinct interactive and catalog
surfaces under `docs/screenshots/`; report-style demos remain reproducible as text through their tasks. The visual smoke
task runs representative noninteractive demos, strips ANSI, and verifies stable anchor text for the gallery, window
manager, component catalog, terminal command workflow, and capability report. Use it as a fast pre-screenshot check
after changing layouts, themes, command output, or generated reports.

Run the worker integration path with permissions:

```bash
deno task test:workers
```
