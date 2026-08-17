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

/** Rebuilds the snapshot-area grid from a sparse frame (clipping outside). */
function frameGlyphs(frame: SurfaceAnimationFrame): string[] {
  const rows = SNAPSHOT.length;
  const columns = SNAPSHOT[0]!.length;
  const grid = Array.from({ length: rows }, () => new Array<string>(columns).fill(" "));
  for (const cell of frame.cells) {
    if (cell.row >= 0 && cell.row < rows && cell.column >= 0 && cell.column < columns) {
      grid[cell.row]![cell.column] = cell.char;
    }
  }
  return grid.map((row) => row.join(""));
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
      overflow: { left: 8, right: 8, up: 4, down: 12 },
    });
    const start = animation.frameAt(0);
    assertEquals(frameGlyphs(start), SNAPSHOT, `${kind} frame 0 shows the snapshot`);
    assertEquals(start.done, false);

    const end = animation.frameAt(400);
    assertEquals(end.cells.length, 0, `${kind} final frame is empty`);
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
    assertEquals(animation.frameAt(0).cells.length, 0, `${kind} in-start is empty`);
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

Deno.test("fall-apart spills debris below the snapshot within the declared overflow", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "fall-apart",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
    overflow: { down: 10 },
  });
  let sawBelow = false;
  for (const elapsed of [150, 250, 350]) {
    for (const cell of animation.frameAt(elapsed).cells) {
      assert(cell.sourceRow <= cell.row, "cells fall, never rise");
      assert(cell.row < SNAPSHOT.length + 10, "debris stays inside the stage");
      if (cell.row >= SNAPSHOT.length) sawBelow = true;
    }
  }
  assert(sawBelow, "debris travels past the snapshot bottom");
});

Deno.test("without overflow the animation stays confined to the snapshot", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "explode",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
  });
  for (const elapsed of [100, 200, 300]) {
    for (const cell of animation.frameAt(elapsed).cells) {
      assert(cell.row >= 0 && cell.row < SNAPSHOT.length, "confined rows");
      assert(cell.column >= 0 && cell.column < SNAPSHOT[0]!.length, "confined columns");
    }
  }
});

Deno.test("melt slides whole columns down through the overflow region", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "melt",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
    overflow: { down: 20 },
  });
  const frame = animation.frameAt(260);
  let sawBelow = false;
  for (const cell of frame.cells) {
    assertEquals(cell.sourceColumn, cell.column, "melt never drifts horizontally");
    assert(cell.sourceRow <= cell.row, "melt only slides down");
    if (cell.row >= SNAPSHOT.length) sawBelow = true;
  }
  assert(sawBelow, "melt runs past the snapshot bottom");
});

Deno.test("incinerate burns from the bottom, carries ember heat, and lofts sparks", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "incinerate",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
    overflow: { up: 6 },
  });
  const late = animation.frameAt(300);
  const liveRows = new Set(late.cells.filter((cell) => cell.heat === undefined).map((cell) => cell.row));
  assert(!liveRows.has(SNAPSHOT.length - 1), "the bottom rows burn away first");
  let sawHeat = false;
  for (const frame of [animation.frameAt(150), animation.frameAt(200), late]) {
    for (const cell of frame.cells) if (cell.heat !== undefined) sawHeat = true;
  }
  assert(sawHeat, "embers ride the burn front");
});

Deno.test("explode moves cells outward and past the snapshot edges", () => {
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "explode",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
    overflow: { left: 10, right: 10, up: 5, down: 5 },
  });
  const centerRow = (SNAPSHOT.length - 1) / 2;
  const centerColumn = (SNAPSHOT[0]!.length - 1) / 2;
  const frame = animation.frameAt(200);
  assert(frame.cells.length > 0, "mid-flight frame still shows cells");
  let sawOutside = false;
  for (const cell of frame.cells) {
    const before = Math.hypot(cell.sourceRow - centerRow, cell.sourceColumn - centerColumn);
    const after = Math.hypot(cell.row - centerRow, cell.column - centerColumn);
    assert(after >= before - 0.75, "cells fly away from the center");
    if (
      cell.column < 0 || cell.column >= SNAPSHOT[0]!.length ||
      cell.row < 0 || cell.row >= SNAPSHOT.length
    ) sawOutside = true;
  }
  assert(sawOutside, "shrapnel crosses the snapshot edges");
});

Deno.test("fly converges every cell onto the fly target and out", () => {
  const target = { column: -6, row: -2 };
  const animation = createSurfaceAnimation({
    snapshot: SNAPSHOT,
    kind: "fly",
    direction: "out",
    durationMs: 400,
    seed: 3,
    easing: "linear",
    overflow: { left: 10, up: 4 },
    flyTarget: target,
  });
  let previousSpread = Number.POSITIVE_INFINITY;
  for (const elapsed of [100, 200, 300]) {
    const frame = animation.frameAt(elapsed);
    if (frame.cells.length === 0) break;
    let spread = 0;
    for (const cell of frame.cells) {
      spread = Math.max(spread, Math.hypot(cell.row - target.row, cell.column - target.column));
    }
    assert(spread <= previousSpread + 0.001, "the swarm tightens toward the target");
    previousSpread = spread;
  }
  assertEquals(animation.frameAt(400).cells.length, 0);
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
    const count = animation.frameAt(elapsed).cells.length;
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

Deno.test("transition direction assembles only open; snapshot transitions play out", () => {
  assertEquals(surfaceTransitionDirection("open"), "in");
  assertEquals(surfaceTransitionDirection("close"), "out");
  assertEquals(surfaceTransitionDirection("minimize"), "out");
  assertEquals(surfaceTransitionDirection("maximize"), "out");
  assertEquals(surfaceTransitionDirection("restore"), "out");
});
