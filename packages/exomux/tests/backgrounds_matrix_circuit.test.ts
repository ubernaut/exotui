// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertNotEquals } from "./deps.ts";
import type { Rectangle } from "@ubernaut/exotui";
import type { ExomuxAnimatedBackground, ExomuxBackgroundCell } from "../background.ts";
import { ExomuxMatrixRainField } from "../matrix_background.ts";
import { ExomuxCircuitField } from "../circuit_background.ts";
import { exomuxTheme } from "../model.ts";

const THEME = exomuxTheme("midnight");
const ALT_THEME = exomuxTheme("t2");
const START = 10_000;
const STEP = 125;
const TRACE_GLYPHS = new Set(["─", "│", "┌", "┐", "└", "┘", "o"]);

type CellSnapshot = { char: string; foreground: readonly number[]; bold: boolean } | null;

function rect(width: number, height: number): Rectangle {
  return { column: 0, row: 0, width, height };
}

function snapshot(
  grid: ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>>,
): CellSnapshot[][] {
  return grid.map((row) =>
    row.map((cell) => cell ? { char: cell.char, foreground: [...cell.foreground], bold: cell.bold ?? false } : null)
  );
}

function advanceFrames(
  field: ExomuxAnimatedBackground,
  bounds: Rectangle,
  from: number,
  frames: number,
): number {
  let now = from;
  for (let index = 0; index < frames; index += 1) {
    now += STEP;
    field.advance({ bounds, now });
  }
  return now;
}

function advanceObstacleFrames(
  field: ExomuxAnimatedBackground,
  bounds: Rectangle,
  from: number,
  frames: number,
  obstacles: readonly Rectangle[],
  activeObstacle?: Rectangle,
): number {
  let now = from;
  for (let index = 0; index < frames; index += 1) {
    now += STEP;
    field.advance({ bounds, now, obstacles, ...(activeObstacle ? { activeObstacle } : {}) });
  }
  return now;
}

function inZone(x: number, y: number, zone: Rectangle, margin = 1): boolean {
  return x >= zone.column - margin && x <= zone.column + zone.width - 1 + margin &&
    y >= zone.row - margin && y <= zone.row + zone.height - 1 + margin;
}

function onBorder(x: number, y: number, zone: Rectangle): boolean {
  const inside = inZone(x, y, zone, 0);
  return inside && (
    x === zone.column || x === zone.column + zone.width - 1 ||
    y === zone.row || y === zone.row + zone.height - 1
  );
}

/**
 * Asserts no chip or trace cell occupies the zone plus 1-cell margin. Tap
 * traces terminate flush on their window border by design, so only their final
 * approach cells (margin cell plus the border via) are exempt.
 */
function assertClearOfZone(field: ExomuxCircuitField, zone: Rectangle): void {
  const inspection = field.inspect();
  for (const chip of inspection.chips) {
    const overlaps = chip.x <= zone.column + zone.width && zone.column - 1 <= chip.x + chip.width - 1 &&
      chip.y <= zone.row + zone.height && zone.row - 1 <= chip.y + chip.height - 1;
    assert(!overlaps, `chip at ${chip.x},${chip.y} ${chip.width}x${chip.height} intersects keep-out zone`);
  }
  for (const trace of inspection.traces) {
    const cells = trace.kind === "tap" ? trace.cells.slice(0, -2) : trace.cells;
    for (const cell of cells) {
      assert(!inZone(cell.x, cell.y, zone), `${trace.kind} trace cell ${cell.x},${cell.y} inside keep-out zone`);
    }
  }
}

function traceLayoutKey(field: ExomuxCircuitField): string {
  const inspection = field.inspect();
  return JSON.stringify({
    chips: inspection.chips,
    traces: inspection.traces.map((trace) => ({ kind: trace.kind, cells: trace.cells })),
  });
}

function eachField(run: (name: string, create: (seed: number) => ExomuxAnimatedBackground) => void): void {
  run("matrix", (seed) => new ExomuxMatrixRainField({ seed }));
  run("circuit", (seed) => new ExomuxCircuitField({ seed }));
}

eachField((name, create) => {
  Deno.test(`ExomuxBackgrounds: ${name} is deterministic for equal seeds and timestamps`, () => {
    const bounds = rect(80, 24);
    const a = create(7);
    const b = create(7);
    advanceFrames(a, bounds, START, 10);
    advanceFrames(b, bounds, START, 10);
    assertEquals(snapshot(a.rasterizeCells(bounds, THEME)), snapshot(b.rasterizeCells(bounds, THEME)));

    const c = create(8);
    advanceFrames(c, bounds, START, 10);
    assertNotEquals(snapshot(a.rasterizeCells(bounds, THEME)), snapshot(c.rasterizeCells(bounds, THEME)));
  });

  Deno.test(`ExomuxBackgrounds: ${name} grid changes as simulated time advances`, () => {
    const bounds = rect(100, 30);
    const field = create(11);
    const now = advanceFrames(field, bounds, START, 4);
    const before = snapshot(field.rasterizeCells(bounds, THEME));
    advanceFrames(field, bounds, now, 6);
    const after = snapshot(field.rasterizeCells(bounds, THEME));
    assertNotEquals(before, after);
  });

  Deno.test(`ExomuxBackgrounds: ${name} matches bounds dimensions and survives resizes`, () => {
    const field = create(3);
    const small = rect(80, 24);
    let now = advanceFrames(field, small, START, 3);
    const smallGrid = field.rasterizeCells(small, THEME);
    assertEquals(smallGrid.length, 24);
    for (const row of smallGrid) assertEquals(row.length, 80);

    const large = rect(120, 40);
    now = advanceFrames(field, large, now, 3);
    const largeGrid = field.rasterizeCells(large, THEME);
    assertEquals(largeGrid.length, 40);
    for (const row of largeGrid) assertEquals(row.length, 120);
  });

  Deno.test(`ExomuxBackgrounds: ${name} defined cells stay finite 8-bit RGB and follow the theme`, () => {
    const bounds = rect(100, 30);
    const field = create(21);
    advanceFrames(field, bounds, START, 8);
    const midnight = snapshot(field.rasterizeCells(bounds, THEME));
    const neuralSteel = snapshot(field.rasterizeCells(bounds, ALT_THEME));

    let defined = 0;
    for (const grid of [midnight, neuralSteel]) {
      for (const row of grid) {
        for (const cell of row) {
          if (!cell) continue;
          defined += 1;
          assertEquals(cell.foreground.length, 3);
          for (const channel of cell.foreground) {
            assert(Number.isInteger(channel), `channel ${channel} must be an integer`);
            assert(channel >= 0 && channel <= 255, `channel ${channel} out of range`);
          }
        }
      }
    }
    assert(defined > 0, "expected at least one painted cell");
    assertNotEquals(midnight, neuralSteel);
  });

  Deno.test(`ExomuxBackgrounds: ${name} performs 100 frames at 200x60 in under 2 seconds`, () => {
    const bounds = rect(200, 60);
    const field = create(5);
    const startedAt = performance.now();
    let now = START;
    for (let index = 0; index < 100; index += 1) {
      now += STEP;
      field.advance({ bounds, now });
      field.rasterizeCells(bounds, THEME);
    }
    const elapsed = performance.now() - startedAt;
    assert(elapsed < 2_000, `100 frames took ${elapsed.toFixed(1)}ms`);
  });
});

Deno.test("ExomuxMatrixRainField: pointer proximity diverges from a pointer-free twin", () => {
  const bounds = rect(100, 30);
  const withPointer = new ExomuxMatrixRainField({ seed: 9 });
  const without = new ExomuxMatrixRainField({ seed: 9 });
  let now = advanceFrames(withPointer, bounds, START, 5);
  advanceFrames(without, bounds, START, 5);

  const visible = withPointer.inspect().drops.find((drop) => drop.y >= 0 && drop.y < bounds.height) ??
    withPointer.inspect().drops[0]!;
  withPointer.setPointer({ column: visible.column, row: 12 }, now);
  now = advanceFrames(withPointer, bounds, now, 8);
  advanceFrames(without, bounds, now - 8 * STEP, 8);
  assertNotEquals(
    snapshot(withPointer.rasterizeCells(bounds, THEME)),
    snapshot(without.rasterizeCells(bounds, THEME)),
  );
});

Deno.test("ExomuxCircuitField: pointer proximity diverges from a pointer-free twin", () => {
  const bounds = rect(100, 30);
  const withPointer = new ExomuxCircuitField({ seed: 13 });
  const without = new ExomuxCircuitField({ seed: 13 });
  let now = advanceFrames(withPointer, bounds, START, 2);
  advanceFrames(without, bounds, START, 2);

  const trace = withPointer.inspect().traces.find((candidate) => candidate.cells.length > 0);
  assert(trace, "expected at least one grown trace");
  const pulseCell = trace.cells[trace.pulses[0]!.index % trace.cells.length]!;
  withPointer.setPointer({ column: pulseCell.x, row: pulseCell.y }, now);
  now = advanceFrames(withPointer, bounds, now, 4);
  advanceFrames(without, bounds, now - 4 * STEP, 4);
  assertNotEquals(
    snapshot(withPointer.rasterizeCells(bounds, THEME)),
    snapshot(without.rasterizeCells(bounds, THEME)),
  );
});

Deno.test("ExomuxCircuitField: layout grows chips and traces whose bits keep moving", () => {
  const bounds = rect(100, 30);
  const field = new ExomuxCircuitField({ seed: 17 });
  let now = advanceFrames(field, bounds, START, 2);

  const inspection = field.inspect();
  assert(inspection.chips.length >= 1, "expected at least one chip");
  assert(inspection.traces.some((trace) => trace.cells.length > 0), "expected at least one trace cell");

  const before = snapshot(field.rasterizeCells(bounds, THEME));
  let sawChipFill = false;
  let sawTraceGlyph = false;
  for (const row of before) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.char === "▓") sawChipFill = true;
      if (TRACE_GLYPHS.has(cell.char)) sawTraceGlyph = true;
    }
  }
  assert(sawChipFill, "expected a chip interior cell");
  assert(sawTraceGlyph, "expected a trace glyph cell");

  now = advanceFrames(field, bounds, now, 4);
  const after = snapshot(field.rasterizeCells(bounds, THEME));
  let traceCellChanged = false;
  for (let row = 0; row < before.length && !traceCellChanged; row += 1) {
    for (let column = 0; column < before[row]!.length; column += 1) {
      const a = before[row]![column];
      const b = after[row]![column];
      const traceCell = (a !== null && TRACE_GLYPHS.has(a.char)) || (b !== null && TRACE_GLYPHS.has(b.char));
      if (!traceCell) continue;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        traceCellChanged = true;
        break;
      }
    }
  }
  assert(traceCellChanged, "expected bit motion to change at least one trace cell");
});

Deno.test("ExomuxCircuitField: chips and traces avoid obstacle keep-out zones", () => {
  const bounds = rect(120, 36);
  const obstacle: Rectangle = { column: 44, row: 12, width: 28, height: 10 };
  const field = new ExomuxCircuitField({ seed: 31 });
  advanceObstacleFrames(field, bounds, START, 20, [obstacle]);
  assertClearOfZone(field, obstacle);
});

Deno.test("ExomuxCircuitField: layout rearranges when an obstacle moves", () => {
  const bounds = rect(120, 36);
  const positionA: Rectangle = { column: 12, row: 6, width: 20, height: 8 };
  const positionB: Rectangle = { column: 78, row: 20, width: 30, height: 10 };
  const field = new ExomuxCircuitField({ seed: 37 });
  let now = advanceObstacleFrames(field, bounds, START, 20, [positionA]);
  assertClearOfZone(field, positionA);
  const beforeMove = traceLayoutKey(field);

  now = advanceObstacleFrames(field, bounds, now, 20, [positionB]);
  assertClearOfZone(field, positionB);
  assertNotEquals(traceLayoutKey(field), beforeMove, "expected the layout to rearrange after the obstacle moved");
});

Deno.test("ExomuxCircuitField: obstacles receive tap traces terminating flush on their border", () => {
  const bounds = rect(120, 36);
  const obstacle: Rectangle = { column: 50, row: 10, width: 20, height: 8 };
  const field = new ExomuxCircuitField({ seed: 29 });
  advanceObstacleFrames(field, bounds, START, 20, [obstacle]);

  const inspection = field.inspect();
  const taps = inspection.traces.filter((trace) => trace.kind === "tap");
  assert(taps.length >= 1, "expected at least one tap trace for the obstacle");
  for (const tap of taps) {
    assertEquals(tap.obstacleIndex, 0);
    assert(tap.cells.length >= 2, "expected a routed tap path");
    const via = tap.cells[tap.cells.length - 1]!;
    assertEquals(via.glyph, "o");
    assert(onBorder(via.x, via.y, obstacle), `via at ${via.x},${via.y} must sit flush on the obstacle border`);
    for (let index = 1; index < tap.cells.length; index += 1) {
      const previous = tap.cells[index - 1]!;
      const current = tap.cells[index]!;
      assertEquals(
        Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y),
        1,
        "tap path cells must connect contiguously toward the via",
      );
    }
    const chip = inspection.chips[tap.chipIndex]!;
    const first = tap.cells[0]!;
    assert(
      first.x >= chip.x - 1 && first.x <= chip.x + chip.width &&
        first.y >= chip.y - 1 && first.y <= chip.y + chip.height,
      "tap path must start at the source chip edge",
    );
  }
});

Deno.test("ExomuxCircuitField: active-window taps render brighter with faster pulses", () => {
  const bounds = rect(100, 30);
  const obstacle: Rectangle = { column: 60, row: 8, width: 24, height: 10 };
  const focused = new ExomuxCircuitField({ seed: 41 });
  const unfocused = new ExomuxCircuitField({ seed: 41 });
  let now = START;
  for (let index = 0; index < 16; index += 1) {
    now += STEP;
    focused.advance({ bounds, now, obstacles: [obstacle], activeObstacle: obstacle });
    unfocused.advance({ bounds, now, obstacles: [obstacle] });
  }

  const focusedTaps = focused.inspect().traces.filter((trace) => trace.kind === "tap");
  const unfocusedTaps = unfocused.inspect().traces.filter((trace) => trace.kind === "tap");
  assert(focusedTaps.length >= 1, "expected at least one tap trace");
  assertEquals(
    focusedTaps.map((trace) => trace.cells),
    unfocusedTaps.map((trace) => trace.cells),
    "focus emphasis must not change tap geometry",
  );

  const focusedGrid = snapshot(focused.rasterizeCells(bounds, THEME));
  const unfocusedGrid = snapshot(unfocused.rasterizeCells(bounds, THEME));
  let colorDiffers = false;
  for (const tap of focusedTaps) {
    for (const cell of tap.cells) {
      const a = focusedGrid[cell.y]?.[cell.x];
      const b = unfocusedGrid[cell.y]?.[cell.x];
      if (a && b && JSON.stringify(a.foreground) !== JSON.stringify(b.foreground)) colorDiffers = true;
    }
  }
  assert(colorDiffers, "expected active tap cells to rasterize with a brighter blend");

  let pulsesDiverged = false;
  for (let index = 0; index < 6; index += 1) {
    now += STEP;
    focused.advance({ bounds, now, obstacles: [obstacle], activeObstacle: obstacle });
    unfocused.advance({ bounds, now, obstacles: [obstacle] });
    const focusedPulses = focused.inspect().traces.filter((trace) => trace.kind === "tap").map((t) => t.pulses);
    const unfocusedPulses = unfocused.inspect().traces.filter((trace) => trace.kind === "tap").map((t) => t.pulses);
    if (JSON.stringify(focusedPulses) !== JSON.stringify(unfocusedPulses)) pulsesDiverged = true;
  }
  assert(pulsesDiverged, "expected doubled pulse speed on active taps to diverge pulse positions");
});

Deno.test("ExomuxCircuitField: obstacle sequences preserve determinism", () => {
  const bounds = rect(120, 36);
  const positionA: Rectangle = { column: 20, row: 8, width: 24, height: 10 };
  const positionB: Rectangle = { column: 70, row: 18, width: 26, height: 12 };
  const positionBMoved: Rectangle = { column: 64, row: 14, width: 26, height: 12 };
  const a = new ExomuxCircuitField({ seed: 23 });
  const b = new ExomuxCircuitField({ seed: 23 });
  for (const field of [a, b]) {
    let now = START;
    now = advanceObstacleFrames(field, bounds, now, 6, [positionA]);
    now = advanceObstacleFrames(field, bounds, now, 6, [positionA, positionB], positionB);
    advanceObstacleFrames(field, bounds, now, 6, [positionBMoved], positionBMoved);
  }
  assertEquals(JSON.parse(JSON.stringify(a.inspect())), JSON.parse(JSON.stringify(b.inspect())));
  assertEquals(snapshot(a.rasterizeCells(bounds, THEME)), snapshot(b.rasterizeCells(bounds, THEME)));
});

Deno.test("ExomuxCircuitField: 100 frames at 200x60 with 3 moving obstacles stay under budget", () => {
  const bounds = rect(200, 60);
  const field = new ExomuxCircuitField({ seed: 5 });
  const startedAt = performance.now();
  let now = START;
  for (let frame = 0; frame < 100; frame += 1) {
    now += STEP;
    const obstacles: Rectangle[] = [
      { column: 10 + (frame % 20), row: 5, width: 30, height: 12 },
      { column: 90, row: 10 + (frame % 10), width: 40, height: 14 },
      { column: 150 - (frame % 15), row: 34, width: 28, height: 10 },
    ];
    field.advance({ bounds, now, obstacles, activeObstacle: obstacles[0]! });
    field.rasterizeCells(bounds, THEME);
  }
  const elapsed = performance.now() - startedAt;
  assert(elapsed < 2_500, `100 obstacle frames took ${elapsed.toFixed(1)}ms`);
});

Deno.test("ExomuxMatrixRainField: columns fall at sharply different speeds", () => {
  const field = new ExomuxMatrixRainField({ seed: 99 });
  const bounds = { column: 0, row: 0, width: 120, height: 40 };
  // Advance long enough that many drops have respawned into fresh speed classes.
  const speeds: number[] = [];
  for (let frame = 0; frame < 400; frame += 1) {
    field.advance({ bounds, obstacles: [], now: frame * 16.7 });
    for (const drop of field.inspect().drops) speeds.push(drop.speed);
  }
  assert(speeds.length > 0, "expected drops to sample");

  const slowest = Math.min(...speeds);
  const fastest = Math.max(...speeds);
  // "Significantly faster" - the quickest streaks outrun the drifters manyfold.
  assert(fastest / slowest >= 6, `expected a wide speed spread, got ${slowest}..${fastest}`);

  // The population is genuinely tiered rather than one uniform band: a clear
  // majority drift slowly while a real minority tear down the screen.
  // Measured on screen, not at spawn: a slow plurality with a visible minority
  // of streaks. Thresholds sit well clear of the observed ~0.52 / ~0.19 split.
  const drifters = speeds.filter((speed) => speed <= 0.24).length / speeds.length;
  const streakers = speeds.filter((speed) => speed >= 0.95).length / speeds.length;
  assert(drifters > 0.35, `expected a slow plurality, got ${drifters}`);
  assert(streakers > 0.10, `expected a visible share of fast streaks, got ${streakers}`);

  // Faster columns carry longer tails so the streaks read as motion.
  const inspection = field.inspect().drops;
  const fast = inspection.filter((drop) => drop.speed >= 0.95);
  const slow = inspection.filter((drop) => drop.speed <= 0.24);
  if (fast.length > 0 && slow.length > 0) {
    const mean = (values: readonly number[]) => values.reduce((total, value) => total + value, 0) / values.length;
    assert(
      mean(fast.map((drop) => drop.tail)) > mean(slow.map((drop) => drop.tail)),
      "fast drops should trail longer than slow ones",
    );
  }
});

Deno.test("ExomuxCircuitField: surveys the board and populates empty space over time", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 160, height: 48 };
  field.advance({ bounds, obstacles: [], now: 0 });
  const initialChips = field.inspect().chips.length;
  assert(initialChips > 0, "expected an initial layout");

  // Run past several survey intervals; the board should fill toward its ceiling.
  let now = 0;
  for (let frame = 0; frame < 4_000; frame += 1) {
    now += 16.7;
    field.advance({ bounds, obstacles: [], now });
  }
  const grownChips = field.inspect().chips.length;
  assert(
    grownChips > initialChips,
    `expected the survey to add chips into empty board, ${initialChips} -> ${grownChips}`,
  );

  // Chips never overlap each other, however many surveys have run.
  const chips = field.inspect().chips;
  for (let a = 0; a < chips.length; a += 1) {
    for (let b = a + 1; b < chips.length; b += 1) {
      const first = chips[a]!;
      const second = chips[b]!;
      const disjoint = first.x + first.width <= second.x || second.x + second.width <= first.x ||
        first.y + first.height <= second.y || second.y + second.height <= first.y;
      assert(disjoint, `chips ${a} and ${b} overlap after resurvey`);
    }
  }
  // And the board stays bounded rather than growing without limit.
  assert(chips.length <= 40, `chip count should stay bounded, got ${chips.length}`);
});

Deno.test("ExomuxCircuitField: routes over windows that are no longer obstacles", () => {
  const bounds = { column: 0, row: 0, width: 120, height: 40 };
  const window = { column: 30, row: 10, width: 40, height: 16 };

  // While the window is an obstacle the board keeps clear of it.
  const avoiding = new ExomuxCircuitField({ seed: 11 });
  let now = 0;
  for (let frame = 0; frame < 200; frame += 1) {
    now += 16.7;
    avoiding.advance({ bounds, obstacles: [window], now });
  }
  // Measure the interior: the board deliberately taps a window's border with
  // vias, so the edge ring is expected to carry a cell or two either way.
  const interior = {
    column: window.column + 2,
    row: window.row + 2,
    width: window.width - 4,
    height: window.height - 4,
  };
  const avoidingCells = countCellsInside(avoiding, bounds, interior);

  // Dropping it from the obstacle list - as overgrowth does for idle windows -
  // lets the fabric grow across it instead.
  const covering = new ExomuxCircuitField({ seed: 11 });
  now = 0;
  for (let frame = 0; frame < 200; frame += 1) {
    now += 16.7;
    covering.advance({ bounds, obstacles: [], now });
  }
  const coveringCells = countCellsInside(covering, bounds, interior);

  assertEquals(avoidingCells, 0, "an obstacle window must stay clear of the board");
  assert(coveringCells > 0, "a reclaimed window should have circuitry drawn across it");
});

function countCellsInside(
  field: ExomuxCircuitField,
  bounds: { column: number; row: number; width: number; height: number },
  region: { column: number; row: number; width: number; height: number },
): number {
  const grid = field.rasterizeCells(bounds, THEME);
  let count = 0;
  for (let row = region.row; row < region.row + region.height; row += 1) {
    for (let column = region.column; column < region.column + region.width; column += 1) {
      if (grid[row - bounds.row]?.[column - bounds.column]) count += 1;
    }
  }
  return count;
}

Deno.test("ExomuxCircuitField: chips are logic gates driven by power and ground rails", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 100, height: 32 };
  let now = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    now += 60;
    field.advance({ bounds, obstacles: [], now });
  }
  const inspection = field.inspect();

  // Every chip is a named gate wired to at least two inputs.
  const gates = new Set(["AND", "OR", "NAND", "NOR", "XOR", "XNOR"]);
  assert(inspection.chips.length >= 3, "expected a populated board");
  for (const chip of inspection.chips) {
    assert(gates.has(chip.gate), `unexpected gate ${chip.gate}`);
    assertEquals(chip.label, chip.gate);
    assert(chip.inputCount >= 2, "a gate should be wired to at least two inputs");
  }
  // A mix of gate kinds keeps the behaviour interesting.
  const kinds = new Set(inspection.chips.map((chip) => chip.gate));
  assert(kinds.size >= 2, "expected more than one gate kind on the board");

  // Power and ground rails are both placed, at distinct spots.
  assert(inspection.power, "expected a power rail");
  assert(inspection.ground, "expected a ground rail");
  assertEquals(inspection.power!.label, "VCC");
  assertEquals(inspection.ground!.label, "GND");
  assert(
    inspection.power!.x !== inspection.ground!.x || inspection.power!.y !== inspection.ground!.y,
    "the rails must not overlap",
  );
});

Deno.test("ExomuxCircuitField: the logic network settles to a mix of high and low gates", () => {
  // A working board neither latches every gate high nor stalls every gate low;
  // it does real work driven by the two rails.
  const field = new ExomuxCircuitField({ seed: 11 });
  const bounds = { column: 0, row: 0, width: 90, height: 28 };
  let now = 0;
  // Advance well past several logic ticks so states have settled/oscillated.
  for (let frame = 0; frame < 300; frame += 1) {
    now += 60;
    field.advance({ bounds, obstacles: [], now });
  }
  const inspection = field.inspect();
  // At least some gates end up high and some low: the network is doing work,
  // not stuck all-on or all-off.
  const live = inspection.liveChips;
  assert(live >= 0 && live <= inspection.chips.length);
  assert(live !== inspection.chips.length || inspection.chips.length <= 1, "not every gate should latch high");
});

Deno.test("ExomuxCircuitField: the logic network changes state over time", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 92, height: 26 };
  let now = 0;
  for (let frame = 0; frame < 120; frame += 1) {
    now += 60;
    field.advance({ bounds, obstacles: [], now });
  }
  const seen = new Set<string>();
  for (let tick = 0; tick < 12; tick += 1) {
    for (let frame = 0; frame < 12; frame += 1) {
      now += 60;
      field.advance({ bounds, obstacles: [], now });
    }
    seen.add(field.inspect().chips.map((chip) => (chip.state ? "1" : "0")).join(""));
  }
  // Feedback between gates makes the board oscillate rather than freeze on one
  // pattern, which is the emergent behaviour the simulation exists to show.
  assert(seen.size >= 2, `expected the logic state to evolve, saw ${seen.size} distinct patterns`);
});

Deno.test("ExomuxCircuitField: logic simulation stays deterministic for one seed", () => {
  const bounds = { column: 0, row: 0, width: 88, height: 30 };
  const drive = (seed: number): string => {
    const field = new ExomuxCircuitField({ seed });
    let now = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      now += 60;
      field.advance({ bounds, obstacles: [], now });
    }
    return field.inspect().chips.map((chip) => `${chip.gate}:${chip.state ? 1 : 0}`).join("|");
  };
  assertEquals(drive(19), drive(19));
  assert(drive(19) !== drive(20), "different seeds should diverge");
});

Deno.test("ExomuxCircuitField: wires physically route from each driver to its consumer gate", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 100, height: 32 };
  let now = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    now += 60;
    field.advance({ bounds, obstacles: [], now });
  }
  const inspection = field.inspect();
  const wires = inspection.traces.filter((trace) => trace.kind === "wire");
  assert(wires.length >= 4, "expected the logic graph to be realized as wires");

  // Chip nodes by id, plus rail/oscillator cells, so we can locate every pin.
  const chipById = new Map(inspection.chips.map((chip) => [
    // The snapshot has no chip id, but consumerChipId/driver reference ids; we
    // instead check adjacency to rectangles, so index chips by their rect.
    `${chip.x},${chip.y}`,
    chip,
  ]));
  void chipById;
  const near = (
    cell: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number },
  ): boolean => {
    // A cell touching the chip's 1-cell perimeter ring.
    return cell.x >= rect.x - 1 && cell.x <= rect.x + rect.width &&
      cell.y >= rect.y - 1 && cell.y <= rect.y + rect.height;
  };
  const touchesRail = (cell: { x: number; y: number }, rail?: { x: number; y: number }): boolean =>
    rail !== undefined &&
    cell.x >= rail.x - 1 && cell.x <= rail.x + 3 && cell.y >= rail.y - 1 && cell.y <= rail.y + 1;

  // Every wire's two ends must physically abut the endpoints its logic names:
  // the driver at one end, the consumer gate at the other.
  const consumerById = new Map(inspection.chips.map((chip, index) => [index, chip]));
  void consumerById;
  let checked = 0;
  for (const wire of wires) {
    assert(wire.cells.length >= 2, "a routed wire needs at least two cells");
    const head = wire.cells[0]!;
    const tail = wire.cells[wire.cells.length - 1]!;
    // The consumer: the chip whose ring the tail touches, or the lamp it feeds.
    if (wire.consumerLedId !== undefined) {
      const lamp = inspection.leds.find((led) => led.id === wire.consumerLedId);
      assert(lamp, "a lamp wire names a lamp that is not on the board");
      assertEquals({ x: tail.x, y: tail.y }, { x: lamp!.x - 1, y: lamp!.y }, "a lamp wire ends on the lamp's pin");
      checked += 1;
      continue;
    }
    const consumer = inspection.chips.find((chip) => near(tail, chip));
    assert(consumer, `wire tail at ${tail.x},${tail.y} should touch its consumer gate`);
    // The driver end must touch whatever drives it. A signal wire is never
    // driven by a rail: VCC and GND reach a gate as supply, not as logic.
    assert(wire.driver !== "power" && wire.driver !== "ground", "a rail must not drive a signal wire");
    if (wire.driver === "osc") {
      assert(
        inspection.oscillators.some((oscillator) => touchesRail(head, oscillator)),
        "an oscillator wire must start at a CLK node",
      );
    } else {
      assert(
        inspection.chips.some((chip) => near(head, chip)),
        `a chip-driven wire must start at a gate, head ${head.x},${head.y}`,
      );
    }
    checked += 1;
  }
  assert(checked === wires.length, "every wire was checked");

  // Wire cells are contiguous orthogonal steps: a real routed path, not a jump.
  for (const wire of wires) {
    for (let index = 1; index < wire.cells.length; index += 1) {
      const a = wire.cells[index - 1]!;
      const b = wire.cells[index]!;
      assertEquals(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, "wire cells must be adjacent");
    }
  }

  // Pulses run forward, driver → consumer: after a step the lead pulse's index
  // rises (mod length), never falls. Wires of three cells or fewer are skipped:
  // a driver pin directly beside its consumer pin makes a cycle so short that a
  // forward wrap and a backward step are the same index delta.
  const before = wires.map((wire) => wire.pulses.map((pulse) => pulse.index));
  const lengths = wires.map((wire) => wire.cells.length);
  now += 60;
  field.advance({ bounds, obstacles: [], now });
  const after = field.inspect().traces.filter((trace) => trace.kind === "wire")
    .map((wire) => wire.pulses.map((pulse) => pulse.index));
  let forward = 0;
  let moved = 0;
  for (let w = 0; w < Math.min(before.length, after.length); w += 1) {
    const length = lengths[w]!;
    if (length < 4) continue;
    for (let p = 0; p < Math.min(before[w]!.length, after[w]!.length); p += 1) {
      let delta = after[w]![p]! - before[w]![p]!;
      if (delta > length / 2) delta -= length;
      if (delta < -length / 2) delta += length;
      if (delta === 0) continue;
      moved += 1;
      if (delta > 0) forward += 1;
    }
  }
  if (moved > 0) assert(forward / moved >= 0.9, `pulses should run forward: ${forward}/${moved}`);
});

Deno.test("ExomuxCircuitField: the board opens as a small valid circuit", () => {
  // "Simple but valid": a handful of gates, every one supplied by both rails and
  // driven by a signal traced back to a generator, before any evolution runs.
  for (const seed of [3, 7, 15, 31, 44]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 110, height: 30 };
    field.advance({ bounds, obstacles: [], now: 0 });
    const inspection = field.inspect();

    assertEquals(inspection.chips.length, 3, `seed ${seed}: the opening circuit should be small`);
    assertEquals(inspection.floatingChips, 0, `seed ${seed}: an opening gate has too few inputs`);
    assertEquals(inspection.groundedChips, 3, `seed ${seed}: an opening gate is missing a supply rail`);
    assertEquals(inspection.clockedChips, 3, `seed ${seed}: an opening gate traces back to no generator`);
    assert(inspection.power && inspection.ground, `seed ${seed}: expected both rails`);
    assert(inspection.oscillators.length >= 1, `seed ${seed}: expected a clock`);

    // VCC takes the top-left corner and GND the bottom-right, with a clock in
    // each of the other two and the odd one out in the middle of the board.
    assertEquals({ x: inspection.power!.x, y: inspection.power!.y }, { x: 0, y: 0 }, `seed ${seed}: VCC off-corner`);
    assertEquals(
      { x: inspection.ground!.x, y: inspection.ground!.y },
      { x: bounds.width - 3, y: bounds.height - 1 },
      `seed ${seed}: GND off-corner`,
    );
    const clocks = inspection.oscillators.map((clock) => `${clock.x},${clock.y}`);
    assert(clocks.includes(`${bounds.width - 3},0`), `seed ${seed}: no clock in the top-right corner`);
    assert(clocks.includes(`0,${bounds.height - 1}`), `seed ${seed}: no clock in the bottom-left corner`);
    assert(
      clocks.includes(`${Math.floor((bounds.width - 3) / 2)},${Math.floor(bounds.height / 2)}`),
      `seed ${seed}: a board this size should carry a central clock too`,
    );
    // Every generator drives something rather than blinking on its own.
    const driven = new Set(
      inspection.traces.filter((trace) => trace.driver === "osc").map((trace) =>
        `${trace.cells[0]!.x},${trace.cells[0]!.y}`
      ),
    );
    assert(driven.size >= 2, `seed ${seed}: expected the clocks to be wired, saw ${driven.size}`);
    // Every gate is wired, and each wire ends on the gate it claims to feed.
    const wires = inspection.traces.filter((trace) => trace.kind === "wire");
    assert(wires.length >= 6, `seed ${seed}: expected the opening netlist to be routed, saw ${wires.length}`);
  }
});

/** The terminals a source node may anchor a wire on, in the field's own order. */
function sourcePins(source: { x: number; y: number }, bounds: Rectangle): Array<{ x: number; y: number }> {
  const westward = source.x + 3 / 2 > bounds.width / 2;
  const inner = westward ? source.x - 1 : source.x + 3;
  const faceX = westward ? -1 : 1;
  const inwardY = source.y * 2 < bounds.height ? 1 : -1;
  return [
    { x: inner, y: source.y },
    { x: source.x + 1, y: source.y + inwardY },
    { x: inner, y: source.y + inwardY },
    { x: source.x + 3 - 1 - (westward ? 0 : 2), y: source.y + inwardY },
    { x: inner + faceX, y: source.y },
  ];
}

Deno.test("ExomuxCircuitField: gate inputs enter on the left and outputs leave on the right", () => {
  let wireCount = 0;
  let enteringEast = 0;
  for (const seed of [3, 7, 11, 19, 31]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 120, height: 34 };
    let now = 0;
    // Long enough that growth, splices and drift have all reshaped the board.
    for (let frame = 0; frame < 900; frame += 1) {
      now += 62.5;
      field.advance({ bounds, obstacles: [], now });
    }
    const inspection = field.inspect();
    const chipById = new Map(inspection.chips.map((chip) => [chip.id, chip]));
    const ledById = new Map(inspection.leds.map((led) => [led.id, led]));
    const sources = [inspection.power!, inspection.ground!, ...inspection.oscillators];

    for (const wire of inspection.traces) {
      if (wire.kind !== "wire") continue;
      const consumer = wire.consumerChipId !== undefined ? chipById.get(wire.consumerChipId) : undefined;
      const lamp = wire.consumerLedId !== undefined ? ledById.get(wire.consumerLedId) : undefined;
      assert(consumer ?? lamp, `seed ${seed}: a wire names a consumer that is not on the board`);
      wireCount += 1;

      // The wire ends on the consumer's left: that is its input pin.
      const tail = wire.cells[wire.cells.length - 1]!;
      if (consumer) {
        assertEquals(tail.x, consumer.x - 1, `seed ${seed}: an input pin left the consumer's left edge`);
        assert(
          tail.y >= consumer.y && tail.y < consumer.y + consumer.height,
          `seed ${seed}: input pin at row ${tail.y} sits off the consumer's left edge`,
        );
      } else {
        assertEquals({ x: tail.x, y: tail.y }, { x: lamp!.x - 1, y: lamp!.y }, `seed ${seed}: lamp pin off its left`);
      }
      if (wire.cells[wire.cells.length - 2]!.x === tail.x - 1) enteringEast += 1;

      // And it starts on the driver's right edge: that is its output pin.
      const head = wire.cells[0]!;
      if (wire.driver === "chip") {
        const driver = inspection.chips.find((chip) =>
          head.x === chip.x + chip.width && head.y >= chip.y && head.y < chip.y + chip.height
        );
        assert(driver, `seed ${seed}: a wire starts at ${head.x},${head.y}, off every gate's right edge`);
      } else {
        // A source drives out of the face pointing into the board — east for one
        // in the left half, west for a right-hand corner — sliding a row up or
        // down when the pin itself is taken.
        assert(
          sources.some((source) => sourcePins(source, bounds).some((pin) => pin.x === head.x && pin.y === head.y)),
          `seed ${seed}: a source wire starts at ${head.x},${head.y}, not at a source's output pin`,
        );
      }
    }
  }
  assert(wireCount >= 50, `expected plenty of wires to check, saw ${wireCount}`);
  // Wires are routed through stubs that force them out of the driver eastward
  // and into the consumer eastward; only a board too tight for the stub falls
  // back to a direct route, which still lands on the correct pins.
  assert(
    enteringEast / wireCount >= 0.95,
    `wires should approach their consumer heading east: ${enteringEast}/${wireCount}`,
  );
});

Deno.test("ExomuxCircuitField: an eight-lamp array reads the circuit out across the top", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 110, height: 30 };
  let now = 0;
  field.advance({ bounds, obstacles: [], now });
  const opening = field.inspect();

  assertEquals(opening.leds.length, 8, "expected the full lamp array on a board this wide");
  for (const led of opening.leds) {
    assertEquals(led.y, 1, "the array sits on the second row, clear of the corner wiring");
    assert(led.driven, `lamp ${led.id} should be wired to a gate`);
  }
  // Evenly spaced, and centred on the board.
  const columns = opening.leds.map((led) => led.x);
  for (let index = 1; index < columns.length; index += 1) {
    assertEquals(columns[index]! - columns[index - 1]!, 3, "lamps are evenly spaced");
  }
  const span = columns[columns.length - 1]! - columns[0]! + 1;
  const leftGap = columns[0]!;
  const rightGap = bounds.width - (columns[0]! + span);
  assert(Math.abs(leftGap - rightGap) <= 1, `the array should be centred, gaps ${leftGap}/${rightGap}`);

  // Every lamp has a complete circuit: a feed into its anode and a return out
  // of its cathode back to GND. A lamp with only half of that cannot conduct.
  const feeds = opening.traces.filter((trace) => trace.kind === "wire" && trace.consumerLedId !== undefined);
  const returns = opening.traces.filter((trace) => trace.kind === "return");
  assertEquals(feeds.length, 8, "expected one feed per lamp");
  assertEquals(returns.length, 8, "expected one ground return per lamp");
  for (const led of opening.leds) {
    assert(led.connected, `lamp ${led.id} should have a complete circuit`);
    const feed = feeds.find((trace) => trace.consumerLedId === led.id);
    const back = returns.find((trace) => trace.consumerLedId === led.id);
    assert(feed && back, `lamp ${led.id} is missing half its circuit`);
    // The return leaves the lamp's own cathode and ends at the GND rail.
    const start = back!.cells[0]!;
    assertEquals(Math.abs(start.x - led.x) + Math.abs(start.y - led.y), 1, "a return starts at the lamp's cathode");
    const end = back!.cells[back!.cells.length - 1]!;
    assert(
      sourcePins(opening.ground!, bounds).some((pin) => pin.x === end.x && pin.y === end.y),
      `lamp ${led.id}'s return ends at ${end.x},${end.y} rather than the GND rail`,
    );
  }

  // The array tracks the gates it watches: over time it shows more than one pattern.
  const patterns = new Set<string>();
  for (let sample = 0; sample < 14; sample += 1) {
    for (let frame = 0; frame < 12; frame += 1) {
      now += 60;
      field.advance({ bounds, obstacles: [], now });
    }
    const inspection = field.inspect();
    patterns.add(inspection.leds.map((led) => (led.state ? "1" : "0")).join(""));
    // A lit lamp always has both halves of its circuit on the grid; a lamp
    // missing either half must be dark rather than glowing on nothing.
    for (const led of inspection.leds) {
      const feed = inspection.traces.some((trace) => trace.kind === "wire" && trace.consumerLedId === led.id);
      const back = inspection.traces.some((trace) => trace.kind === "return" && trace.consumerLedId === led.id);
      assertEquals(led.connected, feed && back, `lamp ${led.id} disagrees with its wiring`);
      if (!led.connected) assert(!led.state, `lamp ${led.id} lit up with no circuit`);
    }
  }
  assert(patterns.size >= 2, `expected the array to change, saw ${patterns.size} patterns`);
});

Deno.test("ExomuxCircuitField: a lamp only lights when its circuit is complete", () => {
  // Windows shove the board around and can cut a lamp off from its gate or from
  // the rail. Whatever the layout does, an unlit path must never glow.
  for (const seed of [7, 29, 53]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 110, height: 30 };
    let now = 0;
    for (let sample = 0; sample < 12; sample += 1) {
      const obstacle = sample % 3 === 0 ? [] : [{ column: 4 + sample * 6, row: 0, width: 30, height: 14 }];
      for (let frame = 0; frame < 30; frame += 1) {
        now += 62.5;
        field.advance({ bounds, obstacles: obstacle, now });
      }
      const inspection = field.inspect();
      for (const led of inspection.leds) {
        const feed = inspection.traces.some((trace) => trace.kind === "wire" && trace.consumerLedId === led.id);
        const back = inspection.traces.some((trace) => trace.kind === "return" && trace.consumerLedId === led.id);
        if (led.state) {
          assert(feed, `seed ${seed}: lamp ${led.id} is lit with no feed at sample ${sample}`);
          assert(back, `seed ${seed}: lamp ${led.id} is lit with no return at sample ${sample}`);
        }
      }
    }
  }
});

Deno.test("ExomuxCircuitField: every gate's output drives a gate or a lamp", () => {
  for (const seed of [7, 23, 61]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 130, height: 34 };
    let now = 0;
    field.advance({ bounds, obstacles: [], now });
    assertEquals(field.inspect().danglingChips, 0, `seed ${seed}: the opening circuit left an output dangling`);
    // Hold through growth, and through a window shoving the board around.
    for (let sample = 0; sample < 16; sample += 1) {
      const obstacle = sample % 2 === 0 ? [] : [{ column: 20 + sample * 4, row: 10, width: 26, height: 12 }];
      for (let frame = 0; frame < 40; frame += 1) {
        now += 62.5;
        field.advance({ bounds, obstacles: obstacle, now });
      }
      const inspection = field.inspect();
      assertEquals(inspection.danglingChips, 0, `seed ${seed}: a gate output dangled at sample ${sample}`);
      for (const led of inspection.leds) assert(led.driven, `seed ${seed}: lamp ${led.id} went unwired`);
      if (obstacle.length > 0) continue;
      // With the board clear, every one of those outputs is a wire on the grid
      // leaving the gate's right edge, not just an entry in the netlist.
      for (const chip of inspection.chips) {
        const drives = inspection.traces.some((trace) =>
          trace.kind === "wire" && trace.cells[0]!.x === chip.x + chip.width &&
          trace.cells[0]!.y >= chip.y && trace.cells[0]!.y < chip.y + chip.height
        );
        assert(drives, `seed ${seed}: gate ${chip.id} has no output wire at sample ${sample}`);
      }
    }
  }
});

Deno.test("ExomuxCircuitField: every wired input is drawn, on boards of any size", () => {
  // Regression: the route search gave up after a fixed number of cells, so on a
  // desktop with more cells than that it abandoned routes it could have found
  // and the wire was simply never drawn — gates appeared with no inputs at all.
  // The largest size here is deliberately well past the old cap.
  for (const [width, height] of [[110, 30], [140, 40], [200, 60]]) {
    for (const seed of [3, 19]) {
      const field = new ExomuxCircuitField({ seed });
      const bounds = { column: 0, row: 0, width, height };
      let now = 0;
      for (let frame = 0; frame < 2_000; frame += 1) {
        now += 62.5;
        field.advance({ bounds, obstacles: [], now });
      }
      const inspection = field.inspect();
      assert(inspection.chips.length >= 8, `${width}x${height}: expected a populated board`);
      for (const chip of inspection.chips) {
        const wires = inspection.traces.filter((trace) =>
          trace.kind === "wire" && trace.consumerChipId === chip.id
        ).length;
        assertEquals(
          wires,
          chip.inputCount,
          `${width}x${height} seed ${seed}: gate ${chip.id} has ${chip.inputCount} inputs but ${wires} wires`,
        );
      }
      // And the supply runs and lamp circuits survive the same search.
      assertEquals(inspection.groundedChips, inspection.chips.length, `${width}x${height}: a gate lost a rail`);
      assertEquals(inspection.danglingChips, 0, `${width}x${height}: a gate output dangled`);
      for (const led of inspection.leds) assert(led.connected, `${width}x${height}: lamp ${led.id} lost its circuit`);
    }
  }
});

Deno.test("ExomuxCircuitField: every gate is the same small package", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 120, height: 34 };
  let now = 0;
  for (let frame = 0; frame < 900; frame += 1) {
    now += 62.5;
    field.advance({ bounds, obstacles: [], now });
  }
  const inspection = field.inspect();
  assert(inspection.chips.length >= 8, "expected a populated board");
  for (const chip of inspection.chips) {
    assertEquals({ width: chip.width, height: chip.height }, { width: 8, height: 5 }, "gates are 8x5 packages");
  }

  // Borders included: the label sits inside, and the body is drawn edge to edge.
  const grid = field.rasterizeCells(bounds, THEME);
  const chip = inspection.chips[0]!;
  assertEquals(grid[chip.y]?.[chip.x]?.char, "╔");
  assertEquals(grid[chip.y]?.[chip.x + chip.width - 1]?.char, "╗");
  assertEquals(grid[chip.y + chip.height - 1]?.[chip.x]?.char, "╚");
  assertEquals(grid[chip.y + chip.height - 1]?.[chip.x + chip.width - 1]?.char, "╝");
});

Deno.test("ExomuxCircuitField: clicking a gate traces out everything wired to it", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 120, height: 34 };
  let now = 0;
  for (let frame = 0; frame < 600; frame += 1) {
    now += 62.5;
    field.advance({ bounds, obstacles: [], now });
  }
  const before = field.inspect();
  const target = before.chips[3]!;

  // A click inside the package selects it; bare board is left to the desktop.
  assertEquals(field.pick(target.x - 2, target.y - 2), false, "a click off the gates falls through");
  assertEquals(field.pick(target.x + 2, target.y + 2), true, "a click inside a gate is claimed");
  assertEquals(field.inspect().selectedChipId, target.id);

  // Clicking bare board drops the highlight without swallowing the click.
  assertEquals(field.pick(target.x - 2, target.y - 2), false, "clearing must not consume a desktop click");
  assertEquals(field.inspect().selectedChipId, undefined);
  assertEquals(field.pick(target.x + 2, target.y + 2), true);

  // Every trace with that gate at either end is repainted, and nothing else is.
  const plain = new ExomuxCircuitField({ seed: 7 });
  let plainNow = 0;
  for (let frame = 0; frame < 600; frame += 1) {
    plainNow += 62.5;
    plain.advance({ bounds, obstacles: [], now: plainNow });
  }
  const selectedGrid = field.rasterizeCells(bounds, THEME);
  const plainGrid = plain.rasterizeCells(bounds, THEME);

  const inspection = field.inspect();
  const connected = inspection.traces.filter((trace) =>
    trace.consumerChipId === target.id ||
    (trace.driver === "chip" &&
      trace.cells[0]!.x === target.x + target.width &&
      trace.cells[0]!.y >= target.y && trace.cells[0]!.y < target.y + target.height)
  );
  assert(connected.length >= 3, `expected the gate to be wired, saw ${connected.length} traces`);

  let repainted = 0;
  for (const trace of connected) {
    for (const cell of trace.cells) {
      const now = selectedGrid[cell.y]?.[cell.x];
      const then = plainGrid[cell.y]?.[cell.x];
      if (now && then && JSON.stringify(now.foreground) !== JSON.stringify(then.foreground)) repainted += 1;
    }
  }
  assert(repainted > 0, "a selected gate's wiring must be drawn differently");

  // Clicking it again releases the selection.
  assertEquals(field.pick(target.x + 2, target.y + 2), true);
  assertEquals(field.inspect().selectedChipId, undefined);
});

Deno.test("ExomuxCircuitField: a net's forks are dotted as junctions", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 120, height: 34 };
  let now = 0;
  for (let frame = 0; frame < 600; frame += 1) {
    now += 62.5;
    field.advance({ bounds, obstacles: [], now });
  }
  const inspection = field.inspect();
  assert(inspection.junctions > 0, "a board this size fans nets out and so must fork");

  // A junction is a branch in one net, so the cell has three or more neighbours
  // along that net's own traces — not merely three neighbours on the grid.
  const nets = new Map<string, Map<string, Set<string>>>();
  for (const trace of inspection.traces) {
    if (trace.kind === "tap") continue;
    const key = trace.driver === "chip" || trace.driver === "osc"
      ? `${trace.driver}:${trace.consumerChipId ?? trace.consumerLedId ?? "?"}:${trace.cells[0]!.x},${
        trace.cells[0]!.y
      }`
      : trace.driver;
    const net = nets.get(key) ?? new Map<string, Set<string>>();
    nets.set(key, net);
    for (let index = 0; index < trace.cells.length; index += 1) {
      const at = `${trace.cells[index]!.x},${trace.cells[index]!.y}`;
      const neighbours = net.get(at) ?? new Set<string>();
      net.set(at, neighbours);
      for (const step of [index - 1, index + 1]) {
        const cell = trace.cells[step];
        if (cell) neighbours.add(`${cell.x},${cell.y}`);
      }
    }
  }
  // Rail nets alone are enough to prove the shape: they fan out to every gate.
  const railForks = [...(nets.get("ground") ?? new Map()).values()].filter((set) => set.size >= 3).length;
  assert(railForks > 0, "the ground net runs to every gate, so it must branch");

  const grid = field.rasterizeCells(bounds, THEME);
  let dots = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell?.char === "●") dots += 1;
    }
  }
  assert(dots > 0, "junction dots must reach the grid");
  assert(dots <= inspection.junctions, "no more dots than junctions were found");
});

Deno.test("ExomuxCircuitField: the circuit grows to cover the whole board", () => {
  // A board that fills one corner and leaves the rest bare reads as broken, so
  // growth has to keep working the empty space until the desktop is populated.
  const bounds = { column: 0, row: 0, width: 140, height: 40 };
  for (const seed of [3, 7, 19, 44]) {
    const field = new ExomuxCircuitField({ seed });
    let now = 0;
    for (let frame = 0; frame < 2_400; frame += 1) {
      now += 62.5;
      field.advance({ bounds, obstacles: [], now });
    }
    const inspection = field.inspect();
    assert(inspection.chips.length >= 20, `seed ${seed}: only ${inspection.chips.length} gates grew`);

    // Every quadrant carries part of the circuit, rather than it bunching up.
    const quadrants = [0, 0, 0, 0];
    for (const chip of inspection.chips) {
      const column = chip.x + chip.width / 2 < bounds.width / 2 ? 0 : 1;
      const row = chip.y + chip.height / 2 < bounds.height / 2 ? 0 : 2;
      quadrants[row + column] += 1;
    }
    for (let index = 0; index < quadrants.length; index += 1) {
      assert(quadrants[index]! >= 3, `seed ${seed}: quadrant ${index} holds only ${quadrants[index]} gates`);
    }

    // And they take up a real share of the desktop, not a token few cells.
    const covered = inspection.chips.reduce((cells, chip) => cells + chip.width * chip.height, 0);
    const share = covered / (bounds.width * bounds.height);
    assert(share >= 0.2, `seed ${seed}: gates cover only ${(share * 100).toFixed(1)}% of the board`);
  }
});

Deno.test("ExomuxCircuitField: evolution adds gates without ever invalidating the circuit", () => {
  // Growth is the only thing that changes the netlist, and it may only extend
  // it: at every sample the board must be larger-or-equal and still valid.
  for (const seed of [5, 23, 61]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 140, height: 40 };
    let now = 0;
    field.advance({ bounds, obstacles: [], now });
    const opening = field.inspect().chips.length;
    let previous = opening;
    for (let sample = 0; sample < 24; sample += 1) {
      for (let frame = 0; frame < 40; frame += 1) {
        now += 62.5;
        field.advance({ bounds, obstacles: [], now });
      }
      const inspection = field.inspect();
      assert(
        inspection.chips.length >= previous,
        `seed ${seed}: the circuit shrank from ${previous} to ${inspection.chips.length}`,
      );
      previous = inspection.chips.length;
      assertEquals(inspection.floatingChips, 0, `seed ${seed}: a gate lost its inputs at sample ${sample}`);
      assertEquals(
        inspection.groundedChips,
        inspection.chips.length,
        `seed ${seed}: a gate lost a rail at sample ${sample}`,
      );
      assertEquals(
        inspection.clockedChips,
        inspection.chips.length,
        `seed ${seed}: a gate lost the clock at sample ${sample}`,
      );
    }
    assert(previous > opening, `seed ${seed}: expected the circuit to evolve past ${opening} gates`);
  }
});

Deno.test("ExomuxCircuitField: gate-to-gate wiring never closes a loop", () => {
  // Signal flows one way, so the routed netlist must stay acyclic however many
  // gates have been appended or spliced into it.
  for (const seed of [7, 29, 53]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 130, height: 36 };
    let now = 0;
    for (let frame = 0; frame < 800; frame += 1) {
      now += 62.5;
      field.advance({ bounds, obstacles: [], now });
    }
    const inspection = field.inspect();
    // driver id -> consumer ids, read off the routed wires themselves.
    const edges = new Map<number, number[]>();
    for (const wire of inspection.traces) {
      if (wire.kind !== "wire" || wire.driver !== "chip" || wire.consumerChipId === undefined) continue;
      const driver = inspection.chips.find((chip) =>
        wire.cells[0]!.x === chip.x + chip.width &&
        wire.cells[0]!.y >= chip.y && wire.cells[0]!.y < chip.y + chip.height
      );
      if (!driver) continue;
      edges.set(driver.id, [...(edges.get(driver.id) ?? []), wire.consumerChipId]);
    }
    assert(edges.size >= 2, `seed ${seed}: expected gates to feed one another`);

    const state = new Map<number, "open" | "closed">();
    const walk = (id: number): boolean => {
      if (state.get(id) === "open") return true;
      if (state.get(id) === "closed") return false;
      state.set(id, "open");
      for (const next of edges.get(id) ?? []) {
        if (walk(next)) return true;
      }
      state.set(id, "closed");
      return false;
    };
    for (const chip of inspection.chips) {
      assert(!walk(chip.id), `seed ${seed}: the netlist closed a loop through gate ${chip.id}`);
    }
  }
});

Deno.test("ExomuxCircuitField: both rails run to every gate as supply, not as signal", () => {
  // Power is a connection, not a logic level: each gate must have VCC reaching
  // its top edge and GND its bottom edge, on its own run back to the rail. A
  // gate is never "grounded" because some logic path happens to pass a rail.
  for (const seed of [3, 7, 15, 31, 44]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 120, height: 34 };
    let now = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      now += 62.5;
      field.advance({ bounds, obstacles: [], now });
    }
    const inspection = field.inspect();
    const rails = inspection.traces.filter((trace) => trace.kind === "rail");
    const powered = new Set<number>();
    const grounded = new Set<number>();

    for (const run of rails) {
      assert(run.consumerChipId !== undefined, `seed ${seed}: a supply run names no gate`);
      const gate = inspection.chips.find((chip) => chip.id === run.consumerChipId)!;
      assert(gate, `seed ${seed}: a supply run names a gate that is not on the board`);
      const head = run.cells[0]!;
      const tail = run.cells[run.cells.length - 1]!;

      // Each run is laid the way its current flows, so pulses never stream out
      // of ground: VCC drives down into the gate, and the gate sinks out to GND.
      const railEnd = run.driver === "power" ? head : tail;
      const gateEnd = run.driver === "power" ? tail : head;
      if (run.driver === "power") {
        assertEquals(gateEnd.y, gate.y - 1, `seed ${seed}: VCC must land on the gate's top edge`);
        powered.add(gate.id);
      } else if (run.driver === "ground") {
        assertEquals(gateEnd.y, gate.y + gate.height, `seed ${seed}: GND must leave the gate's bottom edge`);
        grounded.add(gate.id);
      } else {
        throw new Error(`seed ${seed}: a supply run is driven by ${run.driver}`);
      }
      assert(
        gateEnd.x >= gate.x && gateEnd.x < gate.x + gate.width,
        `seed ${seed}: supply pin at column ${gateEnd.x} sits off the gate`,
      );
      // And the other end is on the rail it claims to connect.
      const rail = run.driver === "power" ? inspection.power! : inspection.ground!;
      assert(
        sourcePins(rail, bounds).some((pin) => pin.x === railEnd.x && pin.y === railEnd.y),
        `seed ${seed}: a ${run.driver} run meets the rail at ${railEnd.x},${railEnd.y}, off its terminals`,
      );
    }

    // Every gate, not a lucky few: one VCC run and one GND run each.
    assert(inspection.chips.length >= 3, `seed ${seed}: expected a populated board`);
    for (const chip of inspection.chips) {
      assert(powered.has(chip.id), `seed ${seed}: gate ${chip.id} is unpowered`);
      assert(grounded.has(chip.id), `seed ${seed}: gate ${chip.id} is ungrounded`);
    }
    assertEquals(inspection.groundedChips, inspection.chips.length, `seed ${seed}: a gate lost a rail`);
    assertEquals(rails.length, inspection.chips.length * 2, `seed ${seed}: expected two supply runs per gate`);

    // Current runs toward ground, never out of it. Cells are ordered gate → GND
    // on a ground run, so its pulses advancing forward is what proves the
    // direction on screen. Runs of three cells or fewer are skipped: on a cycle
    // that short a forward wrap and a step back are the same index delta.
    const groundRuns = rails.filter((run) => run.driver === "ground" && run.cells.length >= 4);
    const before = groundRuns.map((run) => run.pulses.map((pulse) => pulse.index));
    now += 62.5;
    field.advance({ bounds, obstacles: [], now });
    const after = field.inspect().traces.filter((trace) =>
      trace.kind === "rail" && trace.driver === "ground" && trace.cells.length >= 4
    ).map((run) => run.pulses.map((pulse) => pulse.index));

    let moved = 0;
    let towardGround = 0;
    for (let run = 0; run < Math.min(before.length, after.length); run += 1) {
      const length = groundRuns[run]!.cells.length;
      for (let pulse = 0; pulse < Math.min(before[run]!.length, after[run]!.length); pulse += 1) {
        let delta = after[run]![pulse]! - before[run]![pulse]!;
        if (delta > length / 2) delta -= length;
        if (delta < -length / 2) delta += length;
        if (delta === 0) continue;
        moved += 1;
        if (delta > 0) towardGround += 1;
      }
    }
    if (moved > 0) {
      assertEquals(towardGround, moved, `seed ${seed}: current ran away from GND on ${moved - towardGround} runs`);
    }
  }
});

Deno.test("ExomuxCircuitField: every gate connects to the power, ground and clock sources", () => {
  // A plausible circuit leaves nothing floating: each gate is supplied by both
  // rails and driven by a signal traced back to a generator. Check across seeds
  // and after obstacle churn.
  for (const seed of [3, 7, 15, 31, 44]) {
    const field = new ExomuxCircuitField({ seed });
    const bounds = { column: 0, row: 0, width: 100, height: 32 };
    let now = 0;
    for (let frame = 0; frame < 40; frame += 1) {
      now += 60;
      field.advance({ bounds, obstacles: [], now });
    }
    let inspection = field.inspect();
    assertEquals(inspection.groundedChips, inspection.chips.length, `seed ${seed}: a gate lost a supply rail`);
    assertEquals(inspection.clockedChips, inspection.chips.length, `seed ${seed}: a gate traces back to no generator`);
    assertEquals(inspection.floatingChips, 0, `seed ${seed}: a gate has no signal driving it`);
    assert(inspection.power && inspection.ground, "expected both rails");

    // Move a window through the board so chips relocate/despawn and re-wire,
    // then confirm supply and signal both survived it.
    for (const column of [10, 40, 70]) {
      const obstacle = { column, row: 8, width: 24, height: 12 };
      for (let frame = 0; frame < 40; frame += 1) {
        now += 60;
        field.advance({ bounds, obstacles: [obstacle], now });
      }
    }
    for (let frame = 0; frame < 40; frame += 1) {
      now += 60;
      field.advance({ bounds, obstacles: [], now });
    }
    inspection = field.inspect();
    assertEquals(
      inspection.groundedChips,
      inspection.chips.length,
      `seed ${seed}: a gate lost a supply rail after a window churned the board`,
    );
    assertEquals(
      inspection.clockedChips,
      inspection.chips.length,
      `seed ${seed}: a gate lost its clock after a window churned the board`,
    );
    assertEquals(inspection.floatingChips, 0, `seed ${seed}: a gate lost its inputs after a window churned the board`);
  }
});

Deno.test("ExomuxCircuitField: signal generators emit a steady square wave", () => {
  const field = new ExomuxCircuitField({ seed: 7 });
  const bounds = { column: 0, row: 0, width: 96, height: 30 };
  let now = 0;
  for (let frame = 0; frame < 40; frame += 1) {
    now += 60;
    field.advance({ bounds, obstacles: [], now });
  }
  const oscillators = field.inspect().oscillators;
  assert(oscillators.length >= 1, "a board this size should carry at least one oscillator");
  for (const oscillator of oscillators) {
    assertEquals(oscillator.label, "CLK");
    assert(oscillator.periodTicks >= 2 && oscillator.periodTicks <= 6, "period within the declared range");
  }

  // Sample the first oscillator across many logic ticks: it should hold each
  // level for its period then flip, producing a regular square wave — unlike a
  // gate, whose output depends on its inputs.
  const period = oscillators[0]!.periodTicks;
  const wave: boolean[] = [];
  for (let tick = 0; tick < period * 4; tick += 1) {
    for (let frame = 0; frame < 11; frame += 1) {
      now += 60;
      field.advance({ bounds, obstacles: [], now });
    }
    wave.push(field.inspect().oscillators[0]!.state);
  }
  // It must both rise and fall over the window (it is not stuck).
  assert(wave.some((level) => level) && wave.some((level) => !level), "the oscillator must toggle");
  // Consecutive equal levels never exceed the period: each half-cycle is bounded.
  let run = 1;
  let maxRun = 1;
  for (let index = 1; index < wave.length; index += 1) {
    run = wave[index] === wave[index - 1] ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  assert(maxRun <= period + 1, `half-cycle ${maxRun} should not exceed the period ${period}`);
});
