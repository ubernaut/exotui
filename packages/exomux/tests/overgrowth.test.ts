import { assert, assertEquals } from "./deps.ts";
import {
  EXOMUX_MAX_OVERGROWTH_RATIO,
  EXOMUX_OVERGROWTH_BACKGROUND_IDS,
  exomuxBackgroundOvergrows,
  exomuxOvergrowthCovers,
  exomuxOvergrowthRatio,
  exomuxOvergrowthThreshold,
  ExomuxOvergrowthTracker,
  exomuxOvergrowthVisible,
} from "../overgrowth.ts";
import { EXOMUX_BACKGROUND_IDS } from "../model.ts";

const RECT = { column: 10, row: 4, width: 20, height: 10 };

Deno.test("exomux overgrowth applies only to the organic backgrounds", () => {
  assertEquals([...EXOMUX_OVERGROWTH_BACKGROUND_IDS].sort(), [
    "circuit",
    "fire",
    "ivy",
    "jungle",
    "matrix",
    "rainy windows",
    "turbulence",
  ]);
  // Naming the excluded ids rather than deriving them from the list under test
  // keeps this from passing tautologically when a background is added.
  const focal = EXOMUX_BACKGROUND_IDS.filter((id) => !exomuxBackgroundOvergrows(id));
  assertEquals([...focal].sort(), [
    "biomech",
    "butterchurn",
    "butterchurn cpu",
    "image",
    "metaballs",
    "skull",
    "vaporwave",
  ]);
});

Deno.test("exomux overgrowth ratio ramps slowly and never fully hides a window", () => {
  const full = 120_000;
  assertEquals(exomuxOvergrowthRatio(0, full), 0);
  assertEquals(exomuxOvergrowthRatio(-5, full), 0);

  // Monotonic, and still modest early on so the effect reads as gradual.
  let previous = 0;
  for (const elapsed of [1_000, 10_000, 30_000, 60_000, 120_000]) {
    const ratio = exomuxOvergrowthRatio(elapsed, full);
    assert(ratio >= previous, "ratio must never go backwards");
    previous = ratio;
  }
  assert(exomuxOvergrowthRatio(6_000, full) < 0.1, "should barely start after a few seconds");
  assertEquals(exomuxOvergrowthRatio(full, full), EXOMUX_MAX_OVERGROWTH_RATIO);
  // Clamped, so the centre of a window always survives.
  assertEquals(exomuxOvergrowthRatio(full * 100, full), EXOMUX_MAX_OVERGROWTH_RATIO);
  assert(EXOMUX_MAX_OVERGROWTH_RATIO < 1);
});

Deno.test("exomux overgrowth creeps inward from the window border", () => {
  // Border cells give way well before centre cells.
  const border = exomuxOvergrowthThreshold(RECT.column, RECT.row, RECT);
  const centre = exomuxOvergrowthThreshold(
    RECT.column + Math.floor(RECT.width / 2),
    RECT.row + Math.floor(RECT.height / 2),
    RECT,
  );
  assert(border < centre, `border ${border} should fall before centre ${centre}`);

  // Coverage grows monotonically with the ratio and starts empty.
  const covered = (ratio: number): number => {
    let count = 0;
    for (let row = RECT.row; row < RECT.row + RECT.height; row += 1) {
      for (let column = RECT.column; column < RECT.column + RECT.width; column += 1) {
        if (exomuxOvergrowthCovers(column, row, RECT, ratio)) count += 1;
      }
    }
    return count;
  };
  assertEquals(covered(0), 0);
  const low = covered(0.2);
  const mid = covered(0.5);
  const high = covered(EXOMUX_MAX_OVERGROWTH_RATIO);
  assert(low < mid && mid < high, `coverage should grow: ${low} < ${mid} < ${high}`);
  assert(high < RECT.width * RECT.height, "the window is never fully reclaimed");

  // Deterministic: the same cell resolves identically every call.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assertEquals(
      exomuxOvergrowthThreshold(RECT.column + 3, RECT.row + 2, RECT),
      exomuxOvergrowthThreshold(RECT.column + 3, RECT.row + 2, RECT),
    );
  }
  // Cells outside the rect are never reclaimed.
  assertEquals(exomuxOvergrowthCovers(RECT.column - 1, RECT.row, RECT, 1), false);
});

Deno.test("exomux overgrowth tracker resets the focused window and forgets closed ones", () => {
  const tracker = new ExomuxOvergrowthTracker();
  tracker.sync(["a", "b"], "a", 1_000);
  assertEquals(tracker.idleMs("a", 5_000), 0);
  assertEquals(tracker.idleMs("b", 5_000), 4_000);

  // Focus moves: the newly active window resets, the old one starts idling.
  tracker.sync(["a", "b"], "b", 6_000);
  assertEquals(tracker.idleMs("b", 9_000), 0);
  assertEquals(tracker.idleMs("a", 9_000), 3_000);

  // Refocusing resets the clock rather than resuming it.
  tracker.sync(["a", "b"], "a", 20_000);
  assertEquals(tracker.idleMs("a", 21_000), 0);

  // Closed windows are dropped so ids cannot leak between sessions.
  tracker.sync(["a"], "a", 22_000);
  assertEquals(tracker.idleMs("b", 30_000), 0);

  tracker.clear();
  assertEquals(tracker.idleMs("a", 40_000), 0);
});

Deno.test("exomux overgrowth is clipped by windows stacked above the reclaimed one", () => {
  // An idle window behind the focused one must not paint its reclaim over the
  // window on top, or the focused window sprouts background characters.
  const idle = { column: 0, row: 0, width: 40, height: 20 };
  const onTop = { column: 20, row: 5, width: 30, height: 10 };
  const ratio = EXOMUX_MAX_OVERGROWTH_RATIO;

  let visibleUnderneath = 0;
  let visibleBeneathTop = 0;
  let clipped = 0;
  for (let row = idle.row; row < idle.row + idle.height; row += 1) {
    for (let column = idle.column; column < idle.column + idle.width; column += 1) {
      const covers = exomuxOvergrowthCovers(column, row, idle, ratio);
      const visible = exomuxOvergrowthVisible(column, row, idle, ratio, [onTop]);
      const beneath = column >= onTop.column && column < onTop.column + onTop.width &&
        row >= onTop.row && row < onTop.row + onTop.height;
      if (visible && beneath) visibleBeneathTop += 1;
      if (visible && !beneath) visibleUnderneath += 1;
      if (covers && !visible) clipped += 1;
    }
  }

  assertEquals(visibleBeneathTop, 0, "no reclaimed cell may show through the window on top");
  assert(visibleUnderneath > 0, "the exposed part of the idle window must still reclaim");
  assert(clipped > 0, "the stacked window must actually be clipping something");

  // With nothing stacked above, clipping changes nothing.
  let unclipped = 0;
  for (let row = idle.row; row < idle.row + idle.height; row += 1) {
    for (let column = idle.column; column < idle.column + idle.width; column += 1) {
      if (exomuxOvergrowthVisible(column, row, idle, ratio, [])) unclipped += 1;
    }
  }
  assertEquals(unclipped, visibleUnderneath + clipped);
});
