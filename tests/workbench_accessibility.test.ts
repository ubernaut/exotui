// Copyright 2023 Im-Beast. MIT license.

// 036 T3: keyboard-only acceptance, reduced-motion behavior, contrast
// checks, high-contrast/color-blind themes, and labels/roles for all
// workbench controls.

import { crayon } from "crayon";
import { assert, assertEquals } from "./deps.ts";
import {
  COLOR_BLIND_SAFE_PALETTE,
  contrastRatio,
  createWorkbenchMotion,
  HIGH_CONTRAST_PALETTE,
  WORKBENCH_CONTROL_ACCESSIBILITY,
} from "../mod.ts";
import { Button, Input, Signal } from "../mod.app.ts";
import { createTestTerminalApp } from "../mod.testing.ts";

Deno.test("high-contrast and color-blind palettes pass their contrast gates", () => {
  const surface = HIGH_CONTRAST_PALETTE["surface"]!;
  for (const [token, color] of Object.entries(HIGH_CONTRAST_PALETTE)) {
    if (token === "surface") continue;
    const ratio = contrastRatio(color, surface);
    assert(ratio >= 7, `high-contrast ${token} is ${ratio.toFixed(2)}:1 — needs 7:1`);
  }
  const cbSurface = COLOR_BLIND_SAFE_PALETTE["surface"]!;
  for (const [token, color] of Object.entries(COLOR_BLIND_SAFE_PALETTE)) {
    if (token === "surface") continue;
    assert(contrastRatio(color, cbSurface) >= 4.5, `color-blind ${token} under 4.5:1`);
  }
  // The color-blind palette never opposes red and green: success carries
  // more blue than green dominance, danger more red than green.
  const success = COLOR_BLIND_SAFE_PALETTE["success"]!;
  const danger = COLOR_BLIND_SAFE_PALETTE["danger"]!;
  assert(success[2] > success[1], "success should be blue-dominant");
  assert(danger[1] < 130, "danger should avoid green content");
});

Deno.test("every workbench control declares a role and accessible name", () => {
  const entries = Object.entries(WORKBENCH_CONTROL_ACCESSIBILITY);
  assert(entries.length >= 10);
  for (const [control, descriptor] of entries) {
    assert(descriptor.label.trim().length > 0, `${control} lacks a label`);
    assert(descriptor.role.length > 0, `${control} lacks a role`);
  }
  assertEquals(WORKBENCH_CONTROL_ACCESSIBILITY["session-tabs"]!.role, "tablist");
  assertEquals(WORKBENCH_CONTROL_ACCESSIBILITY["file-explorer"]!.role, "tree");
});

Deno.test("reduced motion substitutes every nonessential workbench transition", () => {
  const reduced = createWorkbenchMotion({ reducedMotion: true });
  assertEquals(reduced.resolve("workbench:pane-slide"), { kind: "static", behavior: "jump-to-end" });
  assertEquals(reduced.resolve("workbench:toast-fade"), { kind: "static", behavior: "instant-fade" });
  assertEquals(reduced.resolve("workbench:modal-open"), { kind: "static", behavior: "jump-to-end" });
  // Focus feedback is essential: it keeps a short motion.
  const flash = reduced.resolve("workbench:focus-flash");
  assert(flash.kind === "animate" && flash.durationMs === 60);
  assertEquals(reduced.reducedSubstitutions().length, 3);
});

Deno.test("keyboard-only acceptance: every focusable is reachable by keys alone", async () => {
  const submitted: string[] = [];
  const text = new Signal("");
  const harness = await createTestTerminalApp({
    setup(app) {
      const input = new Input({
        parent: app.tui,
        rectangle: { column: 0, row: 0, width: 12, height: 1 },
        zIndex: 1,
        theme: { base: crayon.white, focused: crayon.cyan, cursor: { base: crayon.invert } },
        text,
      });
      const ok = new Button({
        parent: app.tui,
        rectangle: { column: 0, row: 2, width: 8, height: 1 },
        zIndex: 1,
        theme: { base: crayon.bgBlue, focused: crayon.bgLightBlue, active: crayon.bgCyan },
        label: { text: "OK" },
        onPress: () => void submitted.push("ok"),
      });
      const cancel = new Button({
        parent: app.tui,
        rectangle: { column: 0, row: 4, width: 8, height: 1 },
        zIndex: 1,
        theme: { base: crayon.bgBlue, focused: crayon.bgLightBlue, active: crayon.bgCyan },
        label: { text: "Cancel" },
        onPress: () => void submitted.push("cancel"),
      });
      app.registerComponent(input, { id: "name" });
      app.registerComponent(ok, { id: "ok" });
      app.registerComponent(cancel, { id: "cancel" });
      app.focus.focus(input);
      // The app wires return-activation for the focused control — the
      // keyboard path every workbench app declares.
      app.tui.on("keyPress", (event) => {
        if (event.key !== "return") return;
        const current = app.focus.current() as { interact?: (method: "keyboard") => void } | undefined;
        current?.interact?.("keyboard");
      });
    },
  });
  try {
    // Keys only: type, Tab to OK, activate, Tab to Cancel, activate.
    await harness.pilot.press("h");
    await harness.pilot.press("i");
    assertEquals(text.peek(), "hi");
    await harness.pilot.press("tab");
    await harness.pilot.press("return");
    await harness.pilot.press("tab");
    await harness.pilot.press("return");
    assertEquals(submitted, ["ok", "cancel"]); // both reached without a pointer
  } finally {
    harness.destroy();
    text.dispose();
  }
});
