import { crayon } from "crayon";
import { assert, assertEquals } from "./deps.ts";
import { Box, Button, Input, Signal, Text } from "../mod.app.ts";
import { createTestTerminalApp } from "../mod.testing.ts";

// 036 T1: scene capture — styled spans, cursor state, hit regions, layout
// trees, and renderer stats alongside plain text.

Deno.test("pilot capture carries spans, cursor, hit regions, layout, and stats", async () => {
  const value = new Signal("hello");
  let input!: Input;
  const harness = await createTestTerminalApp({
    size: { columns: 30, rows: 8 },
    setup(app) {
      new Box({
        parent: app.tui,
        rectangle: { column: 0, row: 0, width: 30, height: 8 },
        zIndex: 0,
        theme: { base: crayon.bgBlack },
      });
      new Text({
        parent: app.tui,
        rectangle: { column: 2, row: 1, width: 10 },
        zIndex: 1,
        theme: { base: crayon.red },
        text: "ALERT",
      });
      input = new Input({
        parent: app.tui,
        rectangle: { column: 2, row: 3, width: 12, height: 1 },
        zIndex: 1,
        theme: { base: crayon.white, focused: crayon.cyan, cursor: { base: crayon.invert } },
        text: value,
      });
      app.registerComponent(input, { id: "name-input" });
      const button = new Button({
        parent: app.tui,
        rectangle: { column: 2, row: 5, width: 8, height: 1 },
        zIndex: 1,
        theme: { base: crayon.bgBlue, focused: crayon.bgLightBlue, active: crayon.bgCyan },
        label: { text: "OK" },
        onPress: () => {},
      });
      app.registerComponent(button, { id: "ok-button" });
      app.focus.focus(input);
    },
  });

  try {
    await harness.pilot.press("!"); // type into the focused input
    const capture = harness.pilot.capture();

    // Plain text and styled spans agree; the alert run carries its SGR style.
    assert(capture.text.includes("ALERT"));
    const alert = capture.spans.find((span) => span.text.includes("ALERT"));
    assert(alert && alert.row === 1 && alert.style.includes("\x1b["));
    // Distinctly styled regions produce distinct spans.
    const styles = new Set(capture.spans.map((span) => span.style));
    assert(styles.size >= 2);

    // Cursor state comes from the focused component.
    assert(capture.cursor);
    assertEquals(capture.cursor.bounds.row, 3);
    assertEquals(value.peek(), "!hello"); // "!" inserted at the initial cursor
    assertEquals(capture.cursor.position, 1);

    // Hit regions list the registered mouse targets.
    const regionIds = capture.hitRegions.map((region) => region.id).sort();
    assertEquals(regionIds, ["name-input", "ok-button"]);

    // The layout tree mirrors the component tree with resolved rectangles.
    const kinds = capture.layout.map((node) => node.kind).sort();
    assertEquals(kinds, ["Box", "Button", "Input", "Text"]);
    const box = capture.layout.find((node) => node.kind === "Box");
    assertEquals(box?.rectangle, { column: 0, row: 0, width: 30, height: 8 });
    assert(capture.layout.every((node) => node.visible));

    // Renderer stats reflect the render that produced the text.
    assert(capture.stats.flushedCells >= 0);
    assert(Number.isFinite(capture.stats.renderedObjects));
  } finally {
    harness.destroy();
    value.dispose();
  }
});
