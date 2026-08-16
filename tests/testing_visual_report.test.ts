import { crayon } from "crayon";
import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { Box, Computed, Signal, Text } from "../mod.app.ts";
import {
  createTestTerminalApp,
  renderSceneDiffReport,
  renderSceneSvg,
  runPilotMatrix,
  sgrToCss,
} from "../mod.testing.ts";

// 036 T1: reviewable HTML/SVG diff artifacts and the size × key-sequence
// test matrix.

Deno.test("sgrToCss maps palette, truecolor, 256-color, and attributes", () => {
  assertEquals(sgrToCss("\x1b[31m").color, "#cd3131");
  assertEquals(sgrToCss("\x1b[97m").color, "#ffffff");
  assertEquals(sgrToCss("\x1b[44m").background, "#2472c8");
  assertEquals(sgrToCss("\x1b[38;2;12;34;56m").color, "rgb(12,34,56)");
  assertEquals(sgrToCss("\x1b[48;5;196m").background, "rgb(255,0,0)");
  const styled = sgrToCss("\x1b[1;4;31m");
  assert(styled.bold && styled.underline && styled.color === "#cd3131");
  // Unknown codes are kept, not silently dropped.
  assertEquals(sgrToCss("\x1b[73m").unmapped, [73]);
});

Deno.test("diff report is a reviewable artifact with panes, highlights, and mismatches", async () => {
  const message = new Signal("OK");
  const harness = await createTestTerminalApp({
    size: { columns: 20, rows: 4 },
    setup(app) {
      new Box({
        parent: app.tui,
        rectangle: { column: 0, row: 0, width: 20, height: 4 },
        zIndex: 0,
        theme: { base: crayon.bgBlack },
      });
      new Text({
        parent: app.tui,
        rectangle: { column: 1, row: 1, width: 18 },
        zIndex: 1,
        theme: { base: crayon.red },
        text: new Computed(() => message.value),
      });
    },
  });

  try {
    const before = harness.pilot.capture();
    message.value = "FAILED";
    await harness.pilot.settle();
    const after = harness.pilot.capture();

    const report = renderSceneDiffReport(before, after, { title: "status change" });
    assert(!report.pass);
    assertEquals(report.mismatches.length, 1);
    assertEquals(report.mismatches[0]!.line, 2);
    // The artifact is a full document with both panes and the changed line marked.
    assertStringIncludes(report.html, "<h2>Before</h2>");
    assertStringIncludes(report.html, "<h2>After</h2>");
    assertStringIncludes(report.html, 'class="changed"');
    assertStringIncludes(report.html, "FAILED");
    assertStringIncludes(report.html, "color:#cd3131"); // red span survives into CSS

    // Identical captures pass and say so.
    const same = renderSceneDiffReport(after, after);
    assert(same.pass);
    assertStringIncludes(same.html, "No visual changes.");

    // The SVG frame carries positioned styled text.
    const svg = renderSceneSvg(after);
    assertStringIncludes(svg, "<svg xmlns=");
    assertStringIncludes(svg, 'fill="#cd3131"');
    assertStringIncludes(svg, "FAILED");
  } finally {
    harness.destroy();
    message.dispose();
  }
});

Deno.test("matrix runs every size and key sequence against a fresh app", async () => {
  const entries = await runPilotMatrix({
    sizes: [{ columns: 20, rows: 4 }, { columns: 40, rows: 8 }],
    sequences: [
      { keys: [] },
      { label: "type-ab", keys: ["a", { key: "b", shift: true }] },
    ],
    app() {
      const typed = new Signal("");
      return {
        setup(app) {
          new Text({
            parent: app.tui,
            rectangle: { column: 0, row: 0, width: 18 },
            zIndex: 1,
            theme: { base: crayon.white },
            text: new Computed(() => `[${typed.value}] ${app.tui.rectangle.value.width}w`),
          });
          app.tui.on("keyPress", (event) => {
            typed.value += event.shift ? event.key.toUpperCase() : event.key;
          });
        },
      };
    },
  });

  assertEquals(entries.map((entry) => entry.label), [
    "20x4 / (no keys)",
    "20x4 / type-ab",
    "40x8 / (no keys)",
    "40x8 / type-ab",
  ]);
  assertStringIncludes(entries[0]!.capture.text, "[] 20w");
  assertStringIncludes(entries[1]!.capture.text, "[aB] 20w"); // shift preserved & replayable
  assertStringIncludes(entries[3]!.capture.text, "[aB] 40w");
  assertEquals(entries[1]!.keys.length, 2);
});
