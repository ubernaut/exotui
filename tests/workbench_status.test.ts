import { assertEquals } from "./deps.ts";
import { DiagnosticsCollector } from "../src/runtime/diagnostics.ts";
import { workbenchStyledRowsRenderCommandsInto } from "../src/app/workbench_row_render.ts";
import {
  dataFooterRows,
  type RowStyle,
  threeHeaderRows,
  threeHeaderRowsInto,
  type WorkbenchRowTheme,
} from "../src/app/workbench_rows.ts";
import {
  formatWorkbenchDiagnosticLogEntry,
  formatWorkbenchDiagnosticStatus,
  initialWorkbenchDiagnosticLogRows,
  subscribeWorkbenchDiagnosticLog,
  workbenchCompactStatusDiagnostics,
  workbenchEmptyWorkspaceMessage,
  workbenchHeaderHelp,
  workbenchStatusLeft,
  workbenchStatusLine,
  workbenchStatusShortcuts,
  workbenchStatusSnapshotLine,
  workbenchTileDensityLabel,
} from "../src/app/workbench/mod.ts";

const rowTheme: WorkbenchRowTheme = {
  buttonActiveText: "#101010",
  buttonActiveBg: "#aaff00",
  muted: "#888888",
  panelSoft: "#202020",
  soft: "#999999",
  surface: "#000000",
};
const renderTheme = { text: "#eee", surface: "#111" };
const fit = (text: string, width: number) => text.slice(0, Math.max(0, width)).padEnd(Math.max(0, width));

Deno.test("workbench status helpers bucket tile density", () => {
  assertEquals(workbenchTileDensityLabel(-2), "wide");
  assertEquals(workbenchTileDensityLabel(0), "balanced");
  assertEquals(workbenchTileDensityLabel(Number.NaN), "balanced");
  assertEquals(workbenchTileDensityLabel(3), "dense");
});

Deno.test("workbench status helper composes optional diagnostics", () => {
  assertEquals(
    workbenchStatusLeft({ focus: "Inspector", theme: "Unit-01", tileDensity: 0 }),
    "focus Inspector | Unit-01 | tiles balanced",
  );
  assertEquals(
    workbenchStatusLeft({ focus: "Data", theme: "Unit-01", tileDensity: 1, diagnostics: "diag 1 warning" }),
    "focus Data | Unit-01 | tiles dense | diag 1 warning",
  );
});

Deno.test("workbench status helper compacts only redundant diagnostic breakdowns", () => {
  assertEquals(workbenchCompactStatusDiagnostics(undefined), undefined);
  assertEquals(workbenchCompactStatusDiagnostics("diag 1 warning (1 warning)"), "diag 1 warning");
  assertEquals(workbenchCompactStatusDiagnostics("diag 2 Warnings ( 2 warning )"), "diag 2 Warnings");
  assertEquals(
    workbenchCompactStatusDiagnostics("diag 3 error (1 error, 2 warning)"),
    "diag 3 error (1 error, 2 warning)",
  );
  assertEquals(
    workbenchCompactStatusDiagnostics("diag 1 warning (renderer unavailable)"),
    "diag 1 warning (renderer unavailable)",
  );
  assertEquals(
    workbenchStatusLine({
      focus: "Three ASCII",
      theme: "Unit-01 Signal",
      tileDensity: 0,
      diagnostics: "diag 1 warning (1 warning)",
      width: 118,
    }),
    "focus Three ASCII | Unit-01 Signal | tiles balanced | diag 1 warning   F10 menu  N panels  F6 layout  G config  Q quit",
  );
});

Deno.test("workbench status helper exposes terminal and web shortcut profiles", () => {
  assertEquals(
    workbenchStatusShortcuts(),
    "F10 menu  N panels  F6 layout  Shift+T themes  G config",
  );
  assertEquals(
    workbenchStatusShortcuts("web"),
    "1-8 focus  T theme  H help  Q quit  click controls",
  );
  assertEquals(
    workbenchStatusShortcuts("terminal", 118),
    "F10 menu  N panels  F6 layout  G config  Q quit",
  );
  assertEquals(
    workbenchStatusShortcuts("web", 64),
    "T theme  H help  Q quit",
  );
});

Deno.test("workbench status helper composes aligned full status lines", () => {
  assertEquals(
    workbenchStatusLine({
      focus: "Inspector",
      theme: "Unit-01",
      tileDensity: 0,
      width: 24,
    }),
    "focus Inspector | Unit-…",
  );
  assertEquals(
    workbenchStatusLine({
      focus: "data",
      theme: "Unit-01",
      tileDensity: 1,
      diagnostics: "diag ok",
      shortcutProfile: "web",
      width: 72,
    }),
    "focus data | Unit-01 | tiles dense …  1-8 focus  T theme  H help  Q quit",
  );
  assertEquals(
    workbenchStatusLine({
      focus: "Three",
      theme: "Unit-01",
      tileDensity: 0,
      diagnostics: "diag 2 warning (2 warning)",
      width: 80,
      showShortcuts: false,
    }),
    "focus Three | Unit-01 | tiles balanced | diag 2 warning",
  );
});

Deno.test("workbench status snapshot helper composes aligned status lines", () => {
  assertEquals(
    workbenchStatusSnapshotLine({
      snapshot: {
        focus: "Logs",
        theme: "Ghost Shell",
        tileDensity: -1,
        diagnostics: "slow frame",
      },
      width: 64,
      shortcutProfile: "web",
    }),
    "focus Logs | Ghost Shell | tiles wide …  T theme  H help  Q quit",
  );
});

Deno.test("workbench empty workspace messages classify closed minimized and hidden states", () => {
  assertEquals(
    workbenchEmptyWorkspaceMessage({ windows: [{ closed: true }, { closed: true }] }),
    "All windows closed. Use Panels to add a window.",
  );
  assertEquals(
    workbenchEmptyWorkspaceMessage({ windows: [{ minimized: true }, { minimized: true }] }),
    "All open windows minimized. Press R or use the shelf to restore.",
  );
  assertEquals(
    workbenchEmptyWorkspaceMessage({ windows: [{}, { closed: true }] }),
    "No visible windows. Use Panels to add a window.",
  );
  assertEquals(
    workbenchEmptyWorkspaceMessage({
      windows: [{ minimized: true }],
      labels: { minimized: "All panels minimized. Press R or click restore." },
    }),
    "All panels minimized. Press R or click restore.",
  );
});

Deno.test("workbench header help is collapsed by default and adapts when expanded", () => {
  assertEquals(workbenchHeaderHelp({ width: 20 }), "");
  assertEquals(workbenchHeaderHelp({ width: 132 }), "");
  assertEquals(workbenchHeaderHelp({ width: 20, expanded: true }), "");
  assertEquals(workbenchHeaderHelp({ width: 40, expanded: true }), "F10 menu  Q quit");
  assertEquals(workbenchHeaderHelp({ width: 56, expanded: true }), "F10 menu  N panels  Tab focus  Q quit");
  assertEquals(
    workbenchHeaderHelp({ width: 96, expanded: true }),
    "F10 menu  N panels  F6 layout  G config  Tab focus  Q quit",
  );
  assertEquals(
    workbenchHeaderHelp({ width: 132, expanded: true }),
    "F10 menu  N panels  F6 layout  T theme  G config  C close  Tab focus  Q quit",
  );
  assertEquals(workbenchHeaderHelp({ width: 20, minVisibleWidth: 12, expanded: true }), "F10 menu  Q quit");
});

Deno.test("workbench diagnostics helpers format initial logs and compact status", () => {
  const diagnostics = new DiagnosticsCollector();
  const entry = diagnostics.report({
    source: "three-panel",
    code: "kitty-graphics-fallback",
    severity: "warning",
    message: "Kitty graphics requested but unavailable.",
    detail: "raster graphics surface is unavailable",
  });

  assertEquals(
    formatWorkbenchDiagnosticLogEntry(entry),
    "diagnostic 1 warning (1 warning) latest three-panel/kitty-graphics-fallback",
  );
  assertEquals(
    initialWorkbenchDiagnosticLogRows(diagnostics, ["ready"], { maxLogEntries: 2 }),
    [
      "ready",
      "diagnostic 1 warning (1 warning) latest three-panel/kitty-graphics-fallback",
    ],
  );
  assertEquals(formatWorkbenchDiagnosticStatus(diagnostics), "diag 1 warning");
});

Deno.test("workbench diagnostics subscription forwards future entries only", () => {
  const diagnostics = new DiagnosticsCollector();
  diagnostics.report({
    source: "storage",
    code: "early",
    severity: "debug",
    message: "early",
  });

  const logs: string[] = [];
  const unsubscribe = subscribeWorkbenchDiagnosticLog(diagnostics, (message) => logs.push(message), {
    logLabel: "runtime",
  });
  diagnostics.report({
    source: "storage",
    code: "persist-failed",
    severity: "warning",
    message: "Workspace persist failed.",
  });
  unsubscribe();
  diagnostics.report({
    source: "storage",
    code: "late",
    severity: "warning",
    message: "late",
  });

  assertEquals(logs, [
    "runtime 1 warning (1 warning) latest storage/persist-failed",
  ]);
});

Deno.test("threeHeaderRows adapts title and geometry labels to width", () => {
  assertEquals(threeHeaderRows("studio", 80, rowTheme), [
    { text: " ACEROLA THREE.JS ASCII · studio · STUDIO GEOMETRY ", fg: "#101010", bg: "#aaff00", bold: true },
    { text: "torus knot · sphere · block · floor plane", fg: "#999999", bg: "#000000" },
    { text: "", bg: "#000000" },
  ]);
  assertEquals(threeHeaderRows("studio", 16, rowTheme)[0]?.text, " THREE ASCII · studio ");
  assertEquals(threeHeaderRows("studio", 16, rowTheme)[1]?.text, "torus · sphere · block · floor");
});

Deno.test("threeHeaderRows includes compact renderer telemetry when it fits", () => {
  const rows = threeHeaderRows("BLOCKS", 150, rowTheme, {
    totalMs: 17.4,
    sceneMs: 12.2,
    readbackMs: 4.1,
    assemblyMs: 1.3,
    cells: 1920,
    deferredReadbackSlots: 6,
    deferredReadbackUnresolved: 2,
    sourceMaxCells: 3840,
    targetFps: 14.2,
    measuredFps: 11.8,
    pressureCells: 60,
    pressureHighFrames: 0,
    pressureLowFrames: 12,
    pressureByteRate: 12_581,
    pressureScoped: true,
  });
  assertEquals(
    rows[1]?.text,
    "torus knot · sphere · block · floor plane · frame 17ms scene 12 read 4 asm 1 1920c cap 3840c @14fps live 12fps q2/6 io 13KB/s tier 60c h0/l12",
  );
  assertEquals(
    threeHeaderRows("BLOCKS", 132, rowTheme, {
      totalMs: 612.4,
      initMs: 590.2,
      sceneMs: 604.3,
      readbackMs: 4.1,
      assemblyMs: 1.3,
      cells: 240,
    })[1]?.text,
    "torus knot · sphere · block · floor plane · frame 612ms init 590 scene 604 read 4 asm 1 240c",
  );
  assertEquals(
    threeHeaderRows("BLOCKS", 30, rowTheme, {
      totalMs: 17.4,
      sceneMs: 12.2,
      readbackMs: 4.1,
      assemblyMs: 1.3,
      cells: 1920,
      deferredReadbackSlots: 6,
      deferredReadbackUnresolved: 6,
      deferredReadbackSaturated: true,
      targetFps: 18,
      measuredFps: 9.7,
      pressureCells: 30,
      pressureHighFrames: 1,
      pressureLowFrames: 0,
      pressureScoped: false,
    })[1]?.text,
    "17ms 1920c live 10fps",
  );
});

Deno.test("threeHeaderRowsInto reuses caller-owned row storage", () => {
  const target: RowStyle[] = [{ text: "stale" }, { text: "stale" }, { text: "stale" }, { text: "extra" }];
  const firstRows = threeHeaderRowsInto(target, "BLOCKS", 80, rowTheme);
  const firstRow = firstRows[0];
  const secondRow = firstRows[1];
  const thirdRow = firstRows[2];

  assertEquals(firstRows, threeHeaderRows("BLOCKS", 80, rowTheme));
  assertEquals(firstRows.length, 3);

  const secondRows = threeHeaderRowsInto(target, "GLYPHS", 30, rowTheme, {
    totalMs: 17.4,
    sceneMs: 12.2,
    readbackMs: 4.1,
    assemblyMs: 1.3,
    cells: 1920,
    targetFps: 18,
    measuredFps: 9.7,
  });

  assertEquals(secondRows, target);
  assertEquals(secondRows[0] === firstRow, true);
  assertEquals(secondRows[1] === secondRow, true);
  assertEquals(secondRows[2] === thirdRow, true);
  assertEquals(secondRows[0]?.text, " THREE ASCII · GLYPHS ");
  assertEquals(secondRows[1]?.text, "17ms 1920c live 10fps");
  assertEquals(secondRows[2], { text: "", bg: "#000000" });
});

Deno.test("dataFooterRows returns styled footer rows and wraps narrow widths", () => {
  assertEquals(dataFooterRows({ page: 1, pageCount: 3, selectedKey: "cpu", width: 80, theme: rowTheme, fit: crop }), [
    {
      text: "page 1/3 selected cpu arrows/page keys S sort",
      fg: "#888888",
      bg: "#202020",
    },
  ]);

  const rows = dataFooterRows({ page: 1, pageCount: 3, selectedKey: "cpu", width: 14, theme: rowTheme, fit: crop });
  assertEquals(rows.every((row) => row.fg === "#888888" && row.bg === "#202020"), true);
  assertEquals(rows.length > 1, true);
});

Deno.test("workbenchStyledRowsRenderCommandsInto clips rows and applies theme fallbacks", () => {
  const rows: RowStyle[] = [
    { text: "alpha" },
    { text: "beta", fg: "#f00", bg: "#00f", bold: true },
    { text: "gamma" },
  ];

  const commands = workbenchStyledRowsRenderCommandsInto([], {
    rect: { column: 2, row: 3, width: 4, height: 2 },
    rows,
    theme: renderTheme,
    fit,
  });

  assertEquals(commands, [
    { row: 3, column: 2, text: "alph", fg: "#eee", bg: "#111", bold: false },
    { row: 4, column: 2, text: "beta", fg: "#f00", bg: "#00f", bold: true },
  ]);
});

Deno.test("workbenchStyledRowsRenderCommandsInto supports source offsets for scrolled panels", () => {
  const target = [{ row: 99, column: 99, text: "stale", fg: "x", bg: "y", bold: true }];
  const commands = workbenchStyledRowsRenderCommandsInto(target, {
    rect: { column: 0, row: 10, width: 8, height: 3 },
    rows: [{ text: "hidden" }, { text: "visible" }],
    sourceStart: 1,
    theme: renderTheme,
    fit,
  });

  assertEquals(commands, [
    { row: 10, column: 0, text: "visible ", fg: "#eee", bg: "#111", bold: false },
  ]);
  assertEquals(commands, target);
});

Deno.test("workbenchStyledRowsRenderCommandsInto clears target for empty bounds", () => {
  const target = [{ row: 1, column: 1, text: "stale", fg: "x", bg: "y", bold: true }];
  const commands = workbenchStyledRowsRenderCommandsInto(target, {
    rect: { column: 0, row: 0, width: 0, height: 1 },
    rows: [{ text: "hidden" }],
    theme: renderTheme,
    fit,
  });

  assertEquals(commands, []);
  assertEquals(commands, target);
});

function crop(text: string, width: number): string {
  return text.slice(0, Math.max(0, width));
}
