// Copyright 2023 Im-Beast. MIT license.

// 036 T2: layout inspector, filtered console, worker/resource view,
// key diagnostics, hot-reload error surface.

import { assert, assertEquals } from "./deps.ts";
import {
  createDiagnosticsHub,
  createMarkupLayout,
  FilteredConsoleController,
  HotReloadErrorSurface,
  KeyDiagnosticsController,
  LayoutInspectorController,
  workerResourceRows,
} from "../mod.ts";

function solve() {
  return createMarkupLayout({
    markup: `<window id="main"><panel id="card"><button id="ok">OK</button></panel></window>`,
    css: `#card { padding: 1; width: 20; height: 6; }`,
    bounds: { column: 0, row: 0, width: 40, height: 12 },
    widgets: false,
  });
}

Deno.test("layout inspector is live: selection survives re-ingest by id", () => {
  const inspector = new LayoutInspectorController();
  inspector.ingest(solve().layout.root);
  assert(inspector.select("card"));
  const report = inspector.inspect()!;
  assertEquals(report.path, ["main", "card"]);
  assertEquals(report.childIds, ["ok"]);
  assertEquals(report.padding.top, 1);

  inspector.ingest(solve().layout.root); // a fresh solve arrives
  assertEquals(inspector.inspect()!.id, "card"); // selection survived

  // Pick-at-cell selects the deepest hit at that cell.
  const okRect = solve().layout.byId.get("ok")!.rect;
  assertEquals(inspector.selectAt(okRect.column, okRect.row), "ok");
  assertEquals(inspector.selectAt(39, 11), "main"); // outside card → root
});

Deno.test("filtered console bounds entries and filters by level and text", () => {
  const console = new FilteredConsoleController({ maxEntries: 3 });
  console.append({ atMs: 1, level: "debug", source: "layout", text: "solved 13 nodes" });
  console.append({ atMs: 2, level: "warn", source: "gpu", text: "readback stalled" });
  console.append({ atMs: 3, level: "error", source: "gpu", text: "device lost" });
  console.append({ atMs: 4, level: "info", source: "session", text: "attached" });
  assertEquals(console.visible().length, 3); // bounded, oldest gone
  console.setFilter({ minLevel: "warn" });
  assertEquals(console.visible().map((entry) => entry.text), ["readback stalled", "device lost"]);
  console.setFilter({ minLevel: "debug", query: "gpu" });
  assertEquals(console.visible().length, 2);
});

Deno.test("worker/resource view renders tasks and leak warnings from the hub", () => {
  const hub = createDiagnosticsHub({ leakThresholdMs: 10 });
  hub.registerTasks(() => [{ id: "highlight-1", owner: "code-view", state: "running" }]);
  hub.acquireResource("worker-2", "syntax-service", 0);
  const rows = workerResourceRows(hub.snapshot(50));
  assertEquals(rows.length, 2);
  assertEquals(rows[0], { kind: "task", id: "highlight-1", owner: "code-view", detail: "running" });
  assertEquals(rows[1]!.kind, "resource-leak");
  assert(rows[1]!.detail.includes("check disposal"));
});

Deno.test("key diagnostics pair raw sequences with decoding and flag unhandled", () => {
  const keys = new KeyDiagnosticsController({ maxRecords: 2 });
  keys.record({ atMs: 1, raw: "\\x1b[A", decoded: "up", handled: true });
  keys.record({ atMs: 2, raw: "\\x1b[1;5C", decoded: "ctrl+right", handled: false });
  keys.record({ atMs: 3, raw: "\\x1b[Z", decoded: "shift+tab", handled: true });
  assertEquals(keys.latest().length, 2); // bounded
  assertEquals(keys.unhandled().map((record) => record.decoded), ["ctrl+right"]);
});

Deno.test("hot-reload errors hold until a successful reload clears them", () => {
  const surface = new HotReloadErrorSurface();
  assertEquals(surface.lines(), []);
  surface.reportFailure({
    atMs: 5,
    file: "app.ts",
    message: "SyntaxError: unexpected token",
    stack: "at app.ts:12\nat boot.ts:3",
  });
  const lines = surface.lines(30);
  assertEquals(lines[0], "reload failed: app.ts");
  assert(lines.some((line) => line.includes("app.ts:12")));
  assert(surface.current() !== undefined); // still held across repaints
  surface.reportSuccess();
  assertEquals(surface.lines(), []);
});
