// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { createAnyMotionTracking, softwareCursorRender, windowResizeGlyphAt } from "../src/app/software_cursor.ts";
import type { WorkbenchWindowHostProjection } from "../src/app/workbench_window_host.ts";
import {
  animatedBackgroundHasPresets,
  animatedBackgroundIsDisposable,
  mixAnimatedBackgroundRgb,
  releaseIdleAnimatedBackgrounds,
} from "../src/app/animated_background.ts";

const PROJECTION = {
  floatingWindows: [{
    rect: { column: 4, row: 2, width: 20, height: 8 },
    clientRect: { column: 5, row: 3, width: 18, height: 6 },
    // Two title-bar buttons, as every real window has.
    controls: [
      { kind: "minimize", hitRect: { column: 18, row: 2, width: 3, height: 1 } },
      { kind: "close", hitRect: { column: 21, row: 2, width: 2, height: 1 } },
    ],
  }],
} as unknown as WorkbenchWindowHostProjection;

Deno.test("windowResizeGlyphAt maps a floating window's drag edges to glyphs", () => {
  assertEquals(windowResizeGlyphAt(PROJECTION, 10, 2), "✥"); // title row moves
  // A press on a title-bar button activates the button; no gesture ever starts,
  // so the cursor must not offer a move it cannot deliver.
  assertEquals(windowResizeGlyphAt(PROJECTION, 18, 2), undefined); // minimize button
  assertEquals(windowResizeGlyphAt(PROJECTION, 20, 2), undefined); // still minimize
  assertEquals(windowResizeGlyphAt(PROJECTION, 22, 2), undefined); // close button
  assertEquals(windowResizeGlyphAt(PROJECTION, 17, 2), "✥"); // bare cell before them
  // The title row's outer columns are resize corners to the hit test.
  assertEquals(windowResizeGlyphAt(PROJECTION, 4, 2), "⤡"); // top-left corner
  assertEquals(windowResizeGlyphAt(PROJECTION, 23, 2), "⤢"); // top-right corner
  assertEquals(windowResizeGlyphAt(PROJECTION, 4, 6), "↔"); // left edge
  assertEquals(windowResizeGlyphAt(PROJECTION, 23, 6), "↔"); // right edge
  assertEquals(windowResizeGlyphAt(PROJECTION, 10, 9), "↕"); // bottom edge
  assertEquals(windowResizeGlyphAt(PROJECTION, 4, 9), "⤢"); // bottom-left corner
  assertEquals(windowResizeGlyphAt(PROJECTION, 23, 9), "⤡"); // bottom-right corner
  assertEquals(windowResizeGlyphAt(PROJECTION, 10, 5), undefined); // inside content
  assertEquals(windowResizeGlyphAt(PROJECTION, 40, 12), undefined); // bare desktop

  // The render descriptor: plain block off-window, contextual glyph on edges,
  // and a plain block when resize awareness is off (modal open).
  assertEquals(softwareCursorRender(true, { column: 40, row: 12 }, PROJECTION)?.glyph, "█");
  assertEquals(softwareCursorRender(true, { column: 10, row: 2 }, PROJECTION)?.glyph, "✥");
  assertEquals(softwareCursorRender(true, { column: 10, row: 2 }, PROJECTION, false)?.glyph, "█");
  assertEquals(softwareCursorRender(false, { column: 10, row: 2 }, PROJECTION), undefined);
});

Deno.test("createAnyMotionTracking asserts, keeps alive, and restores mode 1003", () => {
  const written: string[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const tracking = createAnyMotionTracking({
    write: (sequence) => written.push(sequence),
    keepaliveMs: 100,
    schedule: (callback) => {
      const handle = nextTimer++;
      timers.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      timers.delete(handle as number);
    },
  });
  tracking.setEnabled(true);
  tracking.setEnabled(true); // idempotent
  assertEquals(written, ["\x1b[?1003h"]);
  assertEquals(tracking.enabled, true);
  // The keepalive re-asserts enable so a later downgrade cannot stick.
  assert(timers.size === 1);
  for (const callback of timers.values()) callback();
  assertEquals(written, ["\x1b[?1003h", "\x1b[?1003h"]);
  tracking.dispose();
  assertEquals(written.at(-1), "\x1b[?1003l");
  assertEquals(timers.size, 0);
  assertEquals(tracking.enabled, false);
});

Deno.test("animated background guards narrow capabilities and release idle fields", () => {
  const plain = {
    setPointer() {},
    clearPointer() {},
    advance: () => false,
    rasterizeCells: () => [],
  };
  let disposed = 0;
  const owning = { ...plain, dispose: () => disposed++ };
  const preset = { ...plain, presetIndex: 0, presetName: "a", presetCount: 1, selectPreset() {} };
  assertEquals(animatedBackgroundIsDisposable(plain), false);
  assertEquals(animatedBackgroundIsDisposable(owning), true);
  assertEquals(animatedBackgroundHasPresets(preset), true);

  const fields = new Map<string, typeof plain>([["a", plain], ["b", owning], ["keep", {
    ...plain,
    dispose: () => disposed++,
  }]]);
  releaseIdleAnimatedBackgrounds(fields, "keep");
  assertEquals(disposed, 1);
  assertEquals([...fields.keys()], ["a", "keep"]);

  assertEquals(mixAnimatedBackgroundRgb([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25]);
});
