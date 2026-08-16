// Copyright 2023 Im-Beast. MIT license.

// 036 R1: one renderer-neutral policy for alternate, buffered-main,
// and split-footer screen modes; buffered-main is documented as NOT
// inline mode.

import { assert, assertEquals } from "./deps.ts";
import { createScreenModePolicy, SCREEN_MODE_LIMITS } from "../mod.ts";

const SIZE = { columns: 80, rows: 24 };

Deno.test("alternate mode owns the whole alternate buffer and restores it", () => {
  const policy = createScreenModePolicy("alternate");
  assert(policy.usesAlternateScreen);
  assert(policy.enter(SIZE).includes("\x1b[?1049h"));
  assert(policy.exit(SIZE).includes("\x1b[?1049l"));
  assertEquals(policy.paintRect(SIZE), { column: 0, row: 0, width: 80, height: 24 });
});

Deno.test("buffered-main opens a primary-buffer region without 1049 and wipes it on exit", () => {
  const policy = createScreenModePolicy("buffered-main", { bufferRows: 5 });
  assert(!policy.usesAlternateScreen);
  const enter = policy.enter(SIZE);
  assert(!enter.includes("1049"), "buffered main must never switch buffers");
  assert(enter.startsWith("\x1b7"), "cursor is saved before the region opens");
  assertEquals(policy.paintRect(SIZE), { column: 0, row: 0, width: 80, height: 5 });
  const exit = policy.exit(SIZE);
  assert(exit.includes("\x1b[2K"), "exit wipes the region lines");
  assert(exit.endsWith("\x1b8"), "the shell's cursor comes back");
});

Deno.test("split-footer pins the app to the bottom rows via the scroll region", () => {
  const policy = createScreenModePolicy("split-footer", { footerRows: 3 });
  assert(policy.enter(SIZE).includes("\x1b[1;21r")); // shell scrolls in rows 1-21
  assertEquals(policy.paintRect(SIZE), { column: 0, row: 21, width: 80, height: 3 });
  assert(policy.exit(SIZE).startsWith("\x1b[r")); // margins reset first
  // A tiny terminal never gives the footer every row.
  const tiny = policy.paintRect({ columns: 20, rows: 2 });
  assertEquals(tiny.height, 1);
});

Deno.test("renderers ask the same questions of every mode", () => {
  for (const mode of ["alternate", "buffered-main", "split-footer"] as const) {
    const policy = createScreenModePolicy(mode, { footerRows: 2, bufferRows: 4 });
    const rect = policy.paintRect(SIZE);
    assert(rect.width === 80 && rect.height > 0);
    assert(typeof policy.enter(SIZE) === "string" && typeof policy.exit(SIZE) === "string");
  }
});

Deno.test("buffered-main is documented as not-inline, as frozen data", () => {
  assert(Object.isFrozen(SCREEN_MODE_LIMITS));
  assert(SCREEN_MODE_LIMITS.bufferedMain.includes("must not be called inline mode"));
  assert(SCREEN_MODE_LIMITS.inline.includes("separately"));
});
