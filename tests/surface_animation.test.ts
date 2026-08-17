import { assert, assertEquals, assertNotEquals } from "./deps.ts";
import {
  createSurfaceAnimation,
  resolveSurfaceAnimationKind,
  SURFACE_ANIMATION_KINDS,
  type SurfaceAnimationFrame,
  type SurfaceAnimationKind,
  surfaceAnimationSpeedScale,
  surfaceTransitionDirection,
} from "../src/surface_animation.ts";

const SNAPSHOT = [
  "┌────────┐",
  "│ HELLO  │",
  "│ WORLD  │",
  "└────────┘",
];

function frameGlyphs(frame: SurfaceAnimationFrame): string[] {
  return frame.cells.map((row) => row.map((cell) => cell?.char ?? " ").join(""));
}

function liveCellCount(frame: SurfaceAnimationFrame): number {
  let count = 0;
  for (const row of frame.cells) {
    for (const cell of row) if (cell) count += 1;
  }
  return count;
}

Deno.test("surface animation starts at the snapshot and empties when done (out)", () => {
  for (const kind of SURFACE_ANIMATION_KINDS) {
    const animation = createSurfaceAnimation({
      snapshot: SNAPSHOT,
      kind,
      direction: "out",
      durationMs: 400,
      seed: 7,
      easing: "linear",
    });
    const start = animation.frameAt(0);
    assertEquals(frameGlyphs(start), SNAPSHOT, `${kind} frame 0 shows the snapshot`);
    assertEquals(start.done, false);

    const end = animation.frameAt(400);
    assertEquals(liveCellCount(end), 0, `${kind} final frame is empty`);
    assertEquals(end.done, true);
  }
});

Deno.test("surface animation 'in' direction assembles to the snapshot", () => {
  for (const kind of SURFACE_ANIMATION_KINDS) {
    const animation = createSurfaceAnimation({
      snapshot: SNAPSHOT,
      kind,
      direction: "in",
      durationMs: 400,
      seed: 7,
      easing: "linear",
    });
    assertEquals(liveCellCount(animation.frameAt(0)), 0, `${kind} in-start is empty`);
    const end = animation.frameAt(400);
    assertEquals(frameGlyphs(end), SNAPSHOT, `${kind} in-end shows the snapshot`);
    assertEquals(end.done, true);
  }
});

Deno.test("surface animation frames are deterministic per seed and differ across seeds", () => {
  const options = {
    snapshot: SNAPSHOT,
    kind: "disintegrate" as SurfaceAnimationKind,
    direction: "out" as const,
    durationMs: 400,
    easing: "linear" as const,
  };
  const first = createSurfaceAnimation({ ...options, seed: 42 });
  const second = createSurfaceAnimation({ ...options, seed: 42 });
  const other = createSurfaceAnimation({ ...options, seed: 43 });
  assertEquals(frameGlyphs(first.frameAt(180)), frameGlyphs(second.frameAt(180)));
  assertNotEquals(frameGlyphs(first.frameAt(180)), frameGlyphs(other.frameAt(180)));
});

Deno.test("fall-apart only ever moves cells downward", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "fall-apart",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
  });
  for (const elapsed of [50, 150, 250, 350]) {
    const frame = animation.frameAt(elapsed);
    frame.cells.forEach((row, rowIndex) => {
      for (const cell of row) {
        if (cell) assert(cell.sourceRow <= rowIndex, "cells fall, never rise");
      }
    });
  }
});

Deno.test("melt keeps columns fixed and slides rows down", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "melt",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
  });
  const frame = animation.frameAt(220);
  frame.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell) return;
      assertEquals(cell.sourceColumn, columnIndex, "melt never drifts horizontally");
      assert(cell.sourceRow <= rowIndex, "melt only slides down");
    });
  });
});

Deno.test("incinerate burns from the bottom and carries ember heat", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "incinerate",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
  });
  const late = animation.frameAt(300);
  const liveRows = late.cells.map((row) => row.some(Boolean));
  const lastLive = liveRows.lastIndexOf(true);
  assert(lastLive < SNAPSHOT.length - 1, "the bottom rows burn away first");
  let sawHeat = false;
  for (const frame of [animation.frameAt(150), animation.frameAt(200), late]) {
    for (const row of frame.cells) {
      for (const cell of row) if (cell?.heat !== undefined) sawHeat = true;
    }
  }
  assert(sawHeat, "embers ride the burn front");
});

Deno.test("explode moves cells outward from the center", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "explode",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
  });
  const centerRow = (SNAPSHOT.length - 1) / 2;
  const centerColumn = (SNAPSHOT[0]!.length - 1) / 2;
  const frame = animation.frameAt(160);
  let checked = 0;
  frame.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell) return;
      const before = Math.hypot(cell.sourceRow - centerRow, cell.sourceColumn - centerColumn);
      const after = Math.hypot(rowIndex - centerRow, columnIndex - centerColumn);
      assert(after >= before - 0.75, "cells fly away from the center");
      checked += 1;
    });
  });
  assert(checked > 0, "mid-flight frame still shows cells");
});

Deno.test("disintegrate removes cells monotonically", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "disintegrate",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
  });
  let previous = Number.POSITIVE_INFINITY;
  for (const elapsed of [0, 100, 200, 300, 400]) {
    const count = liveCellCount(animation.frameAt(elapsed));
    assert(count <= previous, "cells only ever disappear");
    previous = count;
  }
});

Deno.test("random kind resolves deterministically per seed and always to a real kind", () => {
  assertEquals(resolveSurfaceAnimationKind("random", 5), resolveSurfaceAnimationKind("random", 5));
  const kinds = new Set<SurfaceAnimationKind>();
  for (let seed = 0; seed < 64; seed += 1) {
    const kind = resolveSurfaceAnimationKind("random", seed);
    assert(SURFACE_ANIMATION_KINDS.includes(kind));
    kinds.add(kind);
  }
  assert(kinds.size > 1, "different seeds reach different kinds");
  assertEquals(resolveSurfaceAnimationKind("melt", 9), "melt");
});

Deno.test("speed scale disables on off and orders fast < normal < slow", () => {
  assertEquals(surfaceAnimationSpeedScale("off"), null);
  const fast = surfaceAnimationSpeedScale("fast")!;
  const normal = surfaceAnimationSpeedScale("normal")!;
  const slow = surfaceAnimationSpeedScale("slow")!;
  assert(fast < normal && normal < slow);
});

Deno.test("transition direction maps close/minimize out and open/maximize/restore in", () => {
  assertEquals(surfaceTransitionDirection("close"), "out");
  assertEquals(surfaceTransitionDirection("minimize"), "out");
  assertEquals(surfaceTransitionDirection("open"), "in");
  assertEquals(surfaceTransitionDirection("maximize"), "in");
  assertEquals(surfaceTransitionDirection("restore"), "in");
});
