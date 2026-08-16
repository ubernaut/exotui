import { crayon } from "crayon";
import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { Box, Button, Computed, Signal, Text } from "../mod.app.ts";
import { createTestTerminalApp } from "../mod.testing.ts";

// 036 T1: pilot extensions — target/selector clicks, hover, drag capture,
// modifiers, double/triple click, frame waits, and text-based tooltip and
// notification helpers.

Deno.test("pilot clicks targets by ID and selector with modifier passthrough", async () => {
  const clicks: Array<{ id: string; ctrl: boolean }> = [];
  const harness = await createTestTerminalApp({
    size: { columns: 30, rows: 10 },
    setup(app) {
      const button = new Button({
        parent: app.tui,
        rectangle: { column: 3, row: 2, width: 12, height: 3 },
        zIndex: 1,
        theme: { base: crayon.bgBlue, focused: crayon.bgLightBlue, active: crayon.bgCyan },
        label: { text: "Save" },
        onPress: () => {},
      });
      app.registerComponent(button, { id: "save-button" });
      app.mouse.register({
        id: "raw-target",
        bounds: { column: 20, row: 5, width: 6, height: 2 },
        onPress: (event, context) => {
          clicks.push({ id: context.id, ctrl: event.ctrl });
        },
      });
    },
  });

  try {
    // ID lookup exposes bounds; missing IDs throw with the known list.
    assertEquals(harness.pilot.target("save-button").bounds.column, 3);
    let threw = "";
    try {
      harness.pilot.target("nope");
    } catch (error) {
      threw = String(error);
    }
    assertStringIncludes(threw, "save-button");

    // Selector-style lookup over inspections.
    const found = harness.pilot.findTarget((target) => target.bounds.row === 5);
    assertEquals(found?.id, "raw-target");

    const result = await harness.pilot.clickTarget("raw-target", { ctrl: true });
    assertEquals(result.press.targetId, "raw-target");
    assertEquals(clicks, [{ id: "raw-target", ctrl: true }]);

    const doubled = await harness.pilot.doubleClick(23, 5);
    assertEquals(doubled.length, 2);
    const tripled = await harness.pilot.tripleClick(23, 5);
    assertEquals(tripled.length, 3);
    assertEquals(clicks.length, 1 + 2 + 3);
  } finally {
    harness.destroy();
  }
});

Deno.test("pilot hover reaches drag handlers and drags hold mouse capture", async () => {
  const hovered: string[] = [];
  const dragTrail: Array<[number, number]> = [];
  const harness = await createTestTerminalApp({
    size: { columns: 30, rows: 10 },
    setup(app) {
      app.mouse.register({
        id: "hover-zone",
        bounds: { column: 0, row: 0, width: 10, height: 2 },
        captureDrag: false,
        onDrag: (_event, context) => {
          hovered.push(context.id);
        },
      });
      app.mouse.register({
        id: "slider",
        bounds: { column: 0, row: 5, width: 4, height: 1 },
        captureDrag: true,
        onPress: () => {},
        onDrag: (event, context) => {
          assert(context.captured);
          dragTrail.push([event.x, event.y]);
        },
        onRelease: () => {},
      });
    },
  });

  try {
    const hover = await harness.pilot.hoverTarget("hover-zone");
    assertEquals(hover.targetId, "hover-zone");
    assertEquals(hovered, ["hover-zone"]);

    // Capture keeps motion routed to the slider even outside its bounds.
    const drag = await harness.pilot.drag(1, 5, 25, 5, { steps: 3 });
    assertEquals(drag.press.targetId, "slider");
    assertEquals(drag.moves.map((move) => move.targetId), ["slider", "slider", "slider"]);
    assert(drag.moves.every((move) => move.captured));
    assertEquals(dragTrail, [[9, 5], [17, 5], [25, 5]]);
    assertEquals(drag.release.targetId, "slider");
    assertEquals(harness.pilot.capturedTarget(), undefined); // released
  } finally {
    harness.destroy();
  }
});

Deno.test("pilot frame waits and text helpers observe notifications appearing and dismissing", async () => {
  const notice = new Signal("");
  const harness = await createTestTerminalApp({
    size: { columns: 40, rows: 6 },
    setup(app) {
      // Notifications render over a surface; the box is what repaints cells
      // a shrinking message vacates.
      new Box({
        parent: app.tui,
        rectangle: { column: 0, row: 0, width: 40, height: 6 },
        zIndex: 0,
        theme: { base: crayon.bgBlack },
      });
      new Text({
        parent: app.tui,
        rectangle: { column: 1, row: 1, width: 38 },
        zIndex: 1,
        theme: { base: crayon.white },
        text: new Computed(() => notice.value),
      });
    },
  });

  try {
    await harness.pilot.waitFrames(2);
    assert(!harness.pilot.snapshot().includes("Saved"));

    queueMicrotask(() => {
      notice.value = "Saved to disk";
    });
    await harness.pilot.waitForText("Saved to disk", { timeoutMs: 1_000 });

    queueMicrotask(() => {
      notice.value = "";
    });
    await harness.pilot.waitForTextGone("Saved to disk", { timeoutMs: 1_000 });
  } finally {
    harness.destroy();
    notice.dispose();
  }
});
