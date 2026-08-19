// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "@ubernaut/exotui";
import type { ExomuxRgb, ExomuxThemeSpec } from "./model.ts";
import {
  type ExomuxAnimatedBackground,
  type ExomuxBackgroundAdvanceOptions,
  type ExomuxBackgroundCell,
  type ExomuxBackgroundPoint,
  mixExomuxRgb,
} from "./background.ts";

const TAU = Math.PI * 2;
const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const POINTER_LIFETIME_MS = 1_600;

/** Cells a strand extends per baseline frame while it is still growing. */
const GROWTH_CELLS_PER_FRAME = 0.16;
/** How sharply a strand may turn per cell, in radians. */
const MAX_TURN_PER_CELL = 0.34;
/** Cells a strand must reach before it stops extending. */
const MIN_STRAND_LENGTH = 18;
const STRAND_LENGTH_SPREAD = 70;
/** How often the field surveys itself for bare ground worth seeding. */
const SURVEY_INTERVAL_MS = 6_000;
/**
 * Strands live this long before their trailing cells wither. It comfortably
 * exceeds the time a section needs to work through leaf, flower and fruit, so
 * mature growth is something you actually get to see rather than a race.
 */
const STRAND_LIFETIME_MS = 600_000;
/**
 * Growth is staged by the age of each individual section, so a strand reads as
 * bare stalk at the tip and progressively richer the further back you look:
 * stalk, then leaves, then flowers, then fruit.
 */
const LEAF_AGE_MS = 8_000;
const FLOWER_AGE_MS = 25_000;
const FRUIT_AGE_MS = 50_000;
/** A bud takes this long to open from first swell to full flower. */
const BLOOM_OPEN_MS = 12_000;
/** Fruit must hang this long before it is ripe enough to pick. */
const FRUIT_RIPEN_MS = 60_000;
/** Age past which a section thickens into a second cell of stalk. */
const THICKEN_AGE_MS = 14_000;
/**
 * Per-tick chance an eligible section advances a stage, scaled by its age.
 * Each stage is rarer than the last, so leaves are common, flowers occasional
 * and fruit a genuine find.
 */
const LEAF_CHANCE = 0.055;
const FLOWER_CHANCE = 0.010;
const FRUIT_CHANCE = 0.007;
/**
 * Young stalk keeps its ornaments well apart so the runner stays readable;
 * older stalk tolerates them packed closer, which is what makes a mature
 * section visibly carry more than a fresh one.
 */
const ORNAMENT_SPACING_YOUNG = 3;
const ORNAMENT_SPACING_MATURE = 1;
/** How often ornament growth is reconsidered. */
const ORNAMENT_TICK_MS = 900;
/** Confetti thrown by one picked fruit. */
const CONFETTI_PER_FRUIT = 18;
const CONFETTI_LIFETIME_MS = 1_400;
const CONFETTI_GRAVITY = 0.055;
const MAX_STRANDS = 40;
const SURVEY_SAMPLES = 40;
const OBSTACLE_MARGIN = 1;

/**
 * Stalk weight by section age: a fresh tip is a faint sliver and an old runner
 * is solid block, so the vine visibly thickens as it matures.
 */
const STALK_GLYPHS = ["░", "▒", "▓", "█"] as const;
/** Secondary cell painted beside a thick section to widen the runner. */
const STALK_EDGE_GLYPH = "▒";
/** Leaflets, drawn as plain ASCII rather than symbol glyphs. */
const LEAF_GLYPHS = ["<", ">", "v", "^"] as const;
/** Bud opening sequence in ASCII: set, swell, part, open bloom. */
const BLOOM_STAGES = [".", ":", "+", "*"] as const;
/** Fruit: dull while it sets, then a full berry once ripe and pickable. */
const FRUIT_UNRIPE_GLYPH = "o";
const FRUIT_RIPE_GLYPH = "@";
/** Confetti thrown when ripe fruit is picked, oldest particles first. */
const CONFETTI_GLYPHS = ["*", "+", "x", "'", "."] as const;

/** What one section of stalk is currently carrying. */
export type ExomuxIvyOrnament = "none" | "leaf" | "flower" | "fruit";

/** One section of a strand exposed for deterministic tests. */
export interface ExomuxIvyCellSnapshot {
  readonly x: number;
  readonly y: number;
  /** How long this section has existed, in milliseconds. */
  readonly ageMs: number;
  readonly ornament: ExomuxIvyOrnament;
  /** 0 at first swell through 1 at full bloom; only meaningful for flowers. */
  readonly openness: number;
  /** True once fruit has hung long enough to be picked. */
  readonly ripe: boolean;
}

/** One ivy strand exposed for deterministic tests. */
export interface ExomuxIvyStrandSnapshot {
  readonly cells: readonly ExomuxIvyCellSnapshot[];
  readonly ageMs: number;
  readonly growing: boolean;
}

/** Serializable ivy inspection for tests and diagnostics. */
export interface ExomuxIvyInspection {
  readonly strands: readonly ExomuxIvyStrandSnapshot[];
  readonly obstacles: readonly Rectangle[];
  /** Live confetti particles from recently picked fruit. */
  readonly confetti: number;
  readonly ripeFruit: number;
}

/** Construction options for the ivy field. */
export interface ExomuxIvyFieldOptions {
  readonly seed?: number;
  /** Scales strand population; 1 keeps a comfortable spread. */
  readonly density?: number;
}

interface IvyCell {
  x: number;
  y: number;
  /** Heading, in radians, the strand held when it entered this cell. */
  heading: number;
  /** Milliseconds since this section grew; drives every growth stage. */
  ageMs: number;
  ornament: ExomuxIvyOrnament;
  /** Milliseconds a flower has been opening. */
  bloomMs: number;
  /** Milliseconds fruit has hung, or undefined when the cell carries none. */
  fruitMs?: number;
  hue: number;
  seed: number;
}

interface IvyConfetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  hue: number;
}

interface IvyStrand {
  cells: IvyCell[];
  heading: number;
  /** Signed curl applied every cell, re-rolled occasionally for a wandering arc. */
  curl: number;
  curlHoldCells: number;
  targetLength: number;
  growthAccumulator: number;
  ageMs: number;
  hue: number;
}

interface IvyPointer extends ExomuxBackgroundPoint {
  readonly updatedAt: number;
}

/**
 * Creeping ivy background. Strands seed at the board edges and extend along
 * gently curving arcs, hugging keep-out zones the way the circuit field routes
 * around windows, so the fabric grows over reclaimed windows and leaves the
 * focused one clear. Mature strands set buds along their length that open into
 * flowers over the following few seconds; the palette is taken entirely from
 * the active theme so the bloom stays in key with the desktop.
 */
export class ExomuxIvyField implements ExomuxAnimatedBackground {
  readonly #density: number;
  #randomState: number;
  #bounds?: Rectangle;
  #strands: IvyStrand[] = [];
  #keepOut = new Uint8Array();
  #obstacles: Rectangle[] = [];
  #obstacleKey?: string;
  #pointer?: IvyPointer;
  #activePointer?: { column: number; row: number };
  #lastFrameAt?: number;
  #surveyTimerMs = 0;
  #ornamentTimerMs = 0;
  #confetti: IvyConfetti[] = [];
  #cells: (ExomuxBackgroundCell | undefined)[][] = [];

  constructor(options: ExomuxIvyFieldOptions = {}) {
    this.#density = Math.min(3, Math.max(0.25, options.density ?? 1));
    this.#randomState = (options.seed ?? 0x49_56_59_31) >>> 0;
  }

  setPointer(point: ExomuxBackgroundPoint, now = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = { column: point.column, row: point.row, updatedAt: finite(now, 0) };
  }

  clearPointer(): void {
    this.#pointer = undefined;
  }

  /** Extends strands, ages blooms, and reseeds bare ground; true when anything moved. */
  advance(options: ExomuxBackgroundAdvanceOptions): boolean {
    const bounds = normalizeBounds(options.bounds);
    if (!bounds) return false;
    this.#ensureLayout(bounds);
    const now = finite(options.now, performance.now());
    const elapsed = this.#lastFrameAt === undefined
      ? FRAME_BASELINE_MS
      : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - this.#lastFrameAt));
    this.#lastFrameAt = now;
    if (elapsed <= 0) return false;
    const delta = elapsed / FRAME_BASELINE_MS;
    this.#surveyTimerMs += elapsed;

    const pointer = this.#pointer && now - this.#pointer.updatedAt <= POINTER_LIFETIME_MS ? this.#pointer : undefined;
    this.#activePointer = pointer
      ? { column: pointer.column - bounds.column, row: pointer.row - bounds.row }
      : undefined;

    let changed = this.#syncObstacles(options, bounds);

    this.#ornamentTimerMs += elapsed;
    const growOrnaments = this.#ornamentTimerMs >= ORNAMENT_TICK_MS;
    if (growOrnaments) this.#ornamentTimerMs = 0;

    for (let index = this.#strands.length - 1; index >= 0; index -= 1) {
      const strand = this.#strands[index]!;
      strand.ageMs += elapsed;
      if (this.#extendStrand(strand, bounds, delta)) changed = true;
      if (this.#ageSections(strand, elapsed, growOrnaments)) changed = true;
      // Old strands wither from the tail so the board keeps turning over, but
      // only on the slow tick: shedding a cell per frame would strip a long
      // runner in seconds.
      if (growOrnaments && strand.ageMs > STRAND_LIFETIME_MS) {
        strand.cells.shift();
        changed = true;
        if (strand.cells.length === 0) this.#strands.splice(index, 1);
      }
    }
    if (this.#advanceConfetti(elapsed, delta, bounds)) changed = true;

    while (this.#surveyTimerMs >= SURVEY_INTERVAL_MS) {
      this.#surveyTimerMs -= SURVEY_INTERVAL_MS;
      if (this.#seedIntoOpenGround(bounds)) changed = true;
    }
    return changed;
  }

  /** Paints vines, leaves, and blooms into a reused row-major cell buffer. */
  rasterizeCells(
    bounds: Rectangle,
    theme: ExomuxThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized) return [];
    this.#ensureLayout(normalized);
    const { width, height } = normalized;
    this.#ensureCellBuffer(width, height);
    for (const row of this.#cells) row.fill(undefined);

    const vineDeep = mixExomuxRgb(theme.background, theme.success, 0.45);
    const vineLit = mixExomuxRgb(theme.success, theme.text, 0.3);
    const flowerPalette: readonly ExomuxRgb[] = [
      theme.accent,
      theme.warning,
      theme.danger,
      mixExomuxRgb(theme.accent, theme.text, 0.4),
    ];

    for (const strand of this.#strands) {
      for (const cell of strand.cells) {
        if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) continue;
        const maturity = Math.min(1, cell.ageMs / (FRUIT_AGE_MS * 1.2));
        const stalkShade = mixExomuxRgb(vineDeep, vineLit, 0.2 + maturity * 0.6);

        // A mature runner spills onto the cell beside it, so old growth reads
        // visibly thicker than the fresh tip.
        if (cell.ageMs >= THICKEN_AGE_MS) {
          const perpendicular = headingStep(cell.heading + TAU / 4);
          const edgeX = cell.x + perpendicular.dx;
          const edgeY = cell.y + perpendicular.dy;
          if (edgeX >= 0 && edgeX < width && edgeY >= 0 && edgeY < height && !this.#cells[edgeY]![edgeX]) {
            this.#cells[edgeY]![edgeX] = {
              char: STALK_EDGE_GLYPH,
              foreground: mixExomuxRgb(vineDeep, stalkShade, 0.55),
            };
          }
        }

        // Stalk first; an ornament then overwrites its own cell.
        const weight = Math.min(STALK_GLYPHS.length - 1, Math.floor(maturity * STALK_GLYPHS.length));
        this.#cells[cell.y]![cell.x] = { char: STALK_GLYPHS[weight]!, foreground: stalkShade };

        if (cell.ornament === "leaf") {
          this.#cells[cell.y]![cell.x] = {
            char: LEAF_GLYPHS[cell.seed % LEAF_GLYPHS.length]!,
            foreground: mixExomuxRgb(stalkShade, theme.success, 0.5),
          };
        } else if (cell.ornament === "flower") {
          const openness = Math.min(1, cell.bloomMs / BLOOM_OPEN_MS);
          const petal = flowerPalette[cell.hue % flowerPalette.length]!;
          this.#cells[cell.y]![cell.x] = {
            char: BLOOM_STAGES[bloomStage(cell.bloomMs)]!,
            foreground: mixExomuxRgb(vineLit, petal, 0.3 + openness * 0.7),
            ...(openness > 0.6 ? { bold: true } : {}),
          };
        } else if (cell.ornament === "fruit") {
          const ripe = (cell.fruitMs ?? 0) >= FRUIT_RIPEN_MS;
          const berry = flowerPalette[(cell.hue + 2) % flowerPalette.length]!;
          this.#cells[cell.y]![cell.x] = {
            char: ripe ? FRUIT_RIPE_GLYPH : FRUIT_UNRIPE_GLYPH,
            // Ripe fruit is saturated and bold; it is the only clickable thing.
            foreground: ripe ? berry : mixExomuxRgb(stalkShade, berry, 0.4),
            ...(ripe ? { bold: true } : {}),
          };
        }
      }
    }

    for (const particle of this.#confetti) {
      const x = Math.round(particle.x);
      const y = Math.round(particle.y);
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const life = Math.min(1, particle.lifeMs / CONFETTI_LIFETIME_MS);
      const stage = Math.min(CONFETTI_GLYPHS.length - 1, Math.floor(life * CONFETTI_GLYPHS.length));
      const spark = flowerPalette[particle.hue % flowerPalette.length]!;
      this.#cells[y]![x] = {
        char: CONFETTI_GLYPHS[stage]!,
        // Sparks fade back toward the vine as they fall.
        foreground: mixExomuxRgb(spark, vineDeep, life * 0.7),
        ...(life < 0.5 ? { bold: true } : {}),
      };
    }

    return this.#cells;
  }

  /** Serializable snapshot for deterministic tests. */
  inspect(): ExomuxIvyInspection {
    return {
      strands: this.#strands.map((strand) => ({
        cells: strand.cells.map((cell) => ({
          x: cell.x,
          y: cell.y,
          ageMs: cell.ageMs,
          ornament: cell.ornament,
          openness: Math.min(1, cell.bloomMs / BLOOM_OPEN_MS),
          ripe: cell.ornament === "fruit" && (cell.fruitMs ?? 0) >= FRUIT_RIPEN_MS,
        })),
        ageMs: strand.ageMs,
        growing: strand.cells.length < strand.targetLength,
      })),
      obstacles: this.#obstacles.map((rectangle) => ({ ...rectangle })),
      confetti: this.#confetti.length,
      ripeFruit: this.#strands.reduce(
        (total, strand) =>
          total + strand.cells.filter((cell) => cell.ornament === "fruit" && (cell.fruitMs ?? 0) >= FRUIT_RIPEN_MS)
            .length,
        0,
      ),
    };
  }

  #ensureLayout(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (previous?.width === bounds.width && previous.height === bounds.height) {
      this.#bounds = { ...bounds };
      return;
    }
    this.#bounds = { ...bounds };
    this.#keepOut = new Uint8Array(bounds.width * bounds.height);
    this.#obstacles = [];
    this.#obstacleKey = undefined;
    this.#strands = [];
    this.#confetti = [];
    const target = clampInteger(Math.round((4 + (bounds.width * bounds.height) / 380) * this.#density), 3, MAX_STRANDS);
    for (let index = 0; index < target; index += 1) this.#seedStrand(bounds);
  }

  #ensureCellBuffer(width: number, height: number): void {
    if (this.#cells.length === height && this.#cells[0]?.length === width) return;
    this.#cells = Array.from(
      { length: height },
      () => new Array<ExomuxBackgroundCell | undefined>(width).fill(undefined),
    );
  }

  /** Seeds one strand at a board edge, heading inward. */
  #seedStrand(bounds: Rectangle, origin?: { x: number; y: number }): boolean {
    const { width, height } = bounds;
    let x: number;
    let y: number;
    let heading: number;
    if (origin) {
      x = origin.x;
      y = origin.y;
      heading = this.#random() * TAU;
    } else {
      const edge = Math.floor(this.#random() * 4);
      if (edge === 0) {
        x = Math.floor(this.#random() * width);
        y = 0;
        heading = TAU / 4;
      } else if (edge === 1) {
        x = width - 1;
        y = Math.floor(this.#random() * height);
        heading = TAU / 2;
      } else if (edge === 2) {
        x = Math.floor(this.#random() * width);
        y = height - 1;
        heading = -TAU / 4;
      } else {
        x = 0;
        y = Math.floor(this.#random() * height);
        heading = 0;
      }
    }
    if (!this.#passable(x, y, bounds)) return false;
    const hue = Math.floor(this.#random() * 4);
    this.#strands.push({
      cells: [{ x, y, heading, ageMs: 0, ornament: "none", bloomMs: 0, hue, seed: Math.floor(this.#random() * 1024) }],
      heading,
      curl: (this.#random() - 0.5) * MAX_TURN_PER_CELL,
      curlHoldCells: 3 + Math.floor(this.#random() * 8),
      targetLength: MIN_STRAND_LENGTH + Math.floor(this.#random() * STRAND_LENGTH_SPREAD),
      growthAccumulator: 0,
      ageMs: 0,
      hue,
    });
    return true;
  }

  /** Extends one strand along its curving heading; true when it gained a cell. */
  #extendStrand(strand: IvyStrand, bounds: Rectangle, delta: number): boolean {
    if (strand.cells.length >= strand.targetLength) return false;
    strand.growthAccumulator += GROWTH_CELLS_PER_FRAME * delta;
    let grew = false;
    while (strand.growthAccumulator >= 1) {
      strand.growthAccumulator -= 1;
      const head = strand.cells[strand.cells.length - 1]!;
      // Re-roll the curl now and then so the arc wanders instead of spiralling.
      strand.curlHoldCells -= 1;
      if (strand.curlHoldCells <= 0) {
        strand.curl = (this.#random() - 0.5) * MAX_TURN_PER_CELL * 2;
        strand.curlHoldCells = 3 + Math.floor(this.#random() * 8);
      }
      const previousHeading = strand.heading;
      strand.heading += strand.curl;
      const step = headingStep(strand.heading);
      let nextX = head.x + step.dx;
      let nextY = head.y + step.dy;
      if (!this.#passable(nextX, nextY, bounds)) {
        // Hug the obstruction: try turning either way before giving up.
        let deflected = false;
        for (const turn of [TAU / 8, -TAU / 8, TAU / 4, -TAU / 4]) {
          const candidate = headingStep(strand.heading + turn);
          if (!this.#passable(head.x + candidate.dx, head.y + candidate.dy, bounds)) continue;
          strand.heading += turn;
          nextX = head.x + candidate.dx;
          nextY = head.y + candidate.dy;
          deflected = true;
          break;
        }
        if (!deflected) {
          strand.targetLength = strand.cells.length;
          return grew;
        }
      }
      void previousHeading;
      strand.cells.push({
        x: nextX,
        y: nextY,
        heading: strand.heading,
        ageMs: 0,
        ornament: "none",
        bloomMs: 0,
        hue: strand.hue,
        seed: Math.floor(this.#random() * 1024),
      });
      grew = true;
    }
    return grew;
  }

  /**
   * Ages every section and promotes it through the growth stages. A section
   * only ever advances one step — bare, leaf, flower, fruit — and the chance of
   * advancing rises with age, so old runners end up carrying far more than the
   * young growth near the tip.
   */
  #ageSections(strand: IvyStrand, elapsed: number, grow: boolean): boolean {
    let changed = false;
    for (let index = 0; index < strand.cells.length; index += 1) {
      const cell = strand.cells[index]!;
      cell.ageMs += elapsed;
      if (cell.ornament === "flower" && cell.bloomMs < BLOOM_OPEN_MS) {
        const before = bloomStage(cell.bloomMs);
        cell.bloomMs = Math.min(BLOOM_OPEN_MS, cell.bloomMs + elapsed);
        if (bloomStage(cell.bloomMs) !== before) changed = true;
      }
      if (cell.fruitMs !== undefined) {
        const wasRipe = cell.fruitMs >= FRUIT_RIPEN_MS;
        cell.fruitMs += elapsed;
        if (!wasRipe && cell.fruitMs >= FRUIT_RIPEN_MS) changed = true;
      }
      if (!grow) continue;
      // Older sections sprout more readily; the ramp is capped so growth stays
      // gradual rather than snapping to fully dressed.
      const maturity = Math.min(1, cell.ageMs / (FRUIT_AGE_MS * 1.5));
      const roll = this.#random();
      if (cell.ornament === "none") {
        // Bare stalk only sprouts away from what is already growing, so the
        // runner never disappears under its own foliage.
        if (cell.ageMs < LEAF_AGE_MS) continue;
        if (roll > LEAF_CHANCE * (0.35 + maturity)) continue;
        if (this.#ornamentNearby(strand, index, ornamentSpacing(cell.ageMs))) continue;
        cell.ornament = "leaf";
        changed = true;
      } else if (cell.ornament === "leaf" && cell.ageMs >= FLOWER_AGE_MS) {
        if (roll > FLOWER_CHANCE * (0.35 + maturity)) continue;
        cell.ornament = "flower";
        cell.bloomMs = 0;
        changed = true;
      } else if (cell.ornament === "flower" && cell.bloomMs >= BLOOM_OPEN_MS && cell.ageMs >= FRUIT_AGE_MS) {
        if (roll > FRUIT_CHANCE * (0.35 + maturity)) continue;
        cell.ornament = "fruit";
        cell.fruitMs = 0;
        changed = true;
      }
    }
    return changed;
  }

  /** True when a neighbouring section along the strand already carries growth. */
  #ornamentNearby(strand: IvyStrand, index: number, spacing: number): boolean {
    const first = Math.max(0, index - spacing);
    const last = Math.min(strand.cells.length - 1, index + spacing);
    for (let probe = first; probe <= last; probe += 1) {
      if (probe !== index && strand.cells[probe]!.ornament !== "none") return true;
    }
    return false;
  }

  /** Steps live confetti and retires spent particles. */
  #advanceConfetti(elapsed: number, delta: number, bounds: Rectangle): boolean {
    if (this.#confetti.length === 0) return false;
    for (let index = this.#confetti.length - 1; index >= 0; index -= 1) {
      const particle = this.#confetti[index]!;
      particle.lifeMs += elapsed;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += CONFETTI_GRAVITY * delta;
      const gone = particle.lifeMs >= CONFETTI_LIFETIME_MS ||
        particle.x < -2 || particle.y < -2 || particle.x > bounds.width + 2 || particle.y > bounds.height + 2;
      if (gone) this.#confetti.splice(index, 1);
    }
    return true;
  }

  /**
   * Picks ripe fruit at one desktop cell, bursting it into confetti. Returns
   * false for anything else so the click falls through to the desktop.
   */
  pick(column: number, row: number, now = performance.now()): boolean {
    const bounds = this.#bounds;
    if (!bounds) return false;
    const x = Math.floor(column - bounds.column);
    const y = Math.floor(row - bounds.row);
    for (const strand of this.#strands) {
      for (const cell of strand.cells) {
        if (cell.x !== x || cell.y !== y) continue;
        if (cell.ornament !== "fruit" || (cell.fruitMs ?? 0) < FRUIT_RIPEN_MS) continue;
        cell.ornament = "none";
        cell.fruitMs = undefined;
        cell.bloomMs = 0;
        // The section keeps its age, so it will bud and fruit again in time.
        this.#burst(x, y, cell.hue);
        this.#lastFrameAt = finite(now, this.#lastFrameAt ?? 0);
        return true;
      }
    }
    return false;
  }

  #burst(x: number, y: number, hue: number): void {
    for (let index = 0; index < CONFETTI_PER_FRUIT; index += 1) {
      const angle = (index / CONFETTI_PER_FRUIT) * TAU + this.#random() * 0.4;
      const speed = 0.25 + this.#random() * 0.75;
      this.#confetti.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.35,
        lifeMs: 0,
        hue: (hue + index) % 4,
      });
    }
  }

  /** Periodic survey: seeds a strand into whatever bare ground it can find. */
  #seedIntoOpenGround(bounds: Rectangle): boolean {
    const ceiling = clampInteger(
      Math.round((4 + (bounds.width * bounds.height) / 380) * this.#density),
      3,
      MAX_STRANDS,
    );
    if (this.#strands.length >= ceiling) return false;
    const occupied = new Set<number>();
    for (const strand of this.#strands) {
      for (const cell of strand.cells) occupied.add(cell.y * bounds.width + cell.x);
    }
    for (let attempt = 0; attempt < SURVEY_SAMPLES; attempt += 1) {
      const x = Math.floor(this.#random() * bounds.width);
      const y = Math.floor(this.#random() * bounds.height);
      if (!this.#passable(x, y, bounds)) continue;
      if (this.#crowded(x, y, bounds, occupied)) continue;
      if (this.#seedStrand(bounds, { x, y })) return true;
    }
    return false;
  }

  /** True when the neighbourhood already carries vine, so seeds spread out. */
  #crowded(x: number, y: number, bounds: Rectangle, occupied: ReadonlySet<number>): boolean {
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= bounds.width || ny >= bounds.height) continue;
        if (occupied.has(ny * bounds.width + nx)) return true;
      }
    }
    return false;
  }

  #passable(x: number, y: number, bounds: Rectangle): boolean {
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return false;
    return this.#keepOut[y * bounds.width + x] !== 1;
  }

  /** Applies the frame's obstacle list; prunes strands caught in a new keep-out. */
  #syncObstacles(options: ExomuxBackgroundAdvanceOptions, bounds: Rectangle): boolean {
    const local: Rectangle[] = [];
    for (const rectangle of options.obstacles ?? []) {
      const normalized = normalizeBounds(rectangle);
      if (!normalized) continue;
      local.push({
        column: normalized.column - bounds.column,
        row: normalized.row - bounds.row,
        width: normalized.width,
        height: normalized.height,
      });
    }
    const key = local
      .map((rectangle) => `${rectangle.column},${rectangle.row},${rectangle.width},${rectangle.height}`)
      .join(";");
    if (key === this.#obstacleKey) return false;
    this.#obstacleKey = key;
    this.#obstacles = local;

    const { width, height } = bounds;
    if (this.#keepOut.length !== width * height) this.#keepOut = new Uint8Array(width * height);
    else this.#keepOut.fill(0);
    for (const rectangle of this.#obstacles) {
      const x0 = Math.max(0, rectangle.column - OBSTACLE_MARGIN);
      const y0 = Math.max(0, rectangle.row - OBSTACLE_MARGIN);
      const x1 = Math.min(width - 1, rectangle.column + rectangle.width - 1 + OBSTACLE_MARGIN);
      const y1 = Math.min(height - 1, rectangle.row + rectangle.height - 1 + OBSTACLE_MARGIN);
      if (x1 < x0 || y1 < y0) continue;
      for (let y = y0; y <= y1; y += 1) this.#keepOut.fill(1, y * width + x0, y * width + x1 + 1);
    }

    // Trim any strand that a window has just grown over; it regrows elsewhere.
    for (let index = this.#strands.length - 1; index >= 0; index -= 1) {
      const strand = this.#strands[index]!;
      const keep = strand.cells.findIndex((cell) => !this.#passable(cell.x, cell.y, bounds));
      if (keep < 0) continue;
      strand.cells.length = keep;
      strand.targetLength = Math.min(strand.targetLength, keep);
      if (strand.cells.length === 0) this.#strands.splice(index, 1);
    }
    return true;
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

/** How far apart ornaments must sit on a section of the given age. */
function ornamentSpacing(ageMs: number): number {
  if (ageMs >= FRUIT_AGE_MS) return ORNAMENT_SPACING_MATURE;
  if (ageMs >= FLOWER_AGE_MS) return ORNAMENT_SPACING_MATURE + 1;
  return ORNAMENT_SPACING_YOUNG;
}

/** Index into BLOOM_STAGES for one bud's opening progress. */
function bloomStage(bloomMs: number): number {
  return Math.min(BLOOM_STAGES.length - 1, Math.floor(bloomMs / BLOOM_OPEN_MS * BLOOM_STAGES.length));
}

/** Quantizes a heading to one of eight cell steps. */
function headingStep(heading: number): { dx: number; dy: number } {
  const normalized = ((heading % TAU) + TAU) % TAU;
  const octant = Math.round(normalized / (TAU / 8)) % 8;
  switch (octant) {
    case 0:
      return { dx: 1, dy: 0 };
    case 1:
      return { dx: 1, dy: 1 };
    case 2:
      return { dx: 0, dy: 1 };
    case 3:
      return { dx: -1, dy: 1 };
    case 4:
      return { dx: -1, dy: 0 };
    case 5:
      return { dx: -1, dy: -1 };
    case 6:
      return { dx: 0, dy: -1 };
    default:
      return { dx: 1, dy: -1 };
  }
}

function clampInteger(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.max(low, Math.min(high, Math.round(value)));
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

function normalizeBounds(value: Rectangle): Rectangle | undefined {
  if (
    !Number.isFinite(value.column) || !Number.isFinite(value.row) ||
    !Number.isFinite(value.width) || !Number.isFinite(value.height)
  ) return undefined;
  const width = Math.floor(value.width);
  const height = Math.floor(value.height);
  if (width <= 0 || height <= 0) return undefined;
  return { column: Math.floor(value.column), row: Math.floor(value.row), width, height };
}
