// Copyright 2023 Im-Beast. MIT license.

import type { Rectangle } from "@ubernaut/exotui";
import {
  type ExomuxAnimatedBackground,
  type ExomuxBackgroundAdvanceOptions,
  type ExomuxBackgroundCell,
  type ExomuxBackgroundPoint,
  mixExomuxRgb,
} from "./background.ts";
import type { ExomuxRgb, ExomuxThemeSpec } from "./model.ts";

const FRAME_BASELINE_MS = 16.7;
const MAX_FRAME_DELTA_MS = 48;
const POINTER_LIFETIME_MS = 1_800;
const POINTER_REACH_CELLS = 5;
const PULSE_CELLS_PER_FRAME = 0.5;
/**
 * How often one more gate is grown into the circuit, at a board that has filled
 * up. An emptier board grows faster, so a fresh layout populates itself in a
 * minute or so instead of leaving the screen bare.
 */
const CIRCUIT_GROW_INTERVAL_MS = 6_000;
/** Share of the grow interval a completely empty board waits. */
const EMPTY_BOARD_GROW_FACTOR = 0.3;
const CHIP_DRIFT_INTERVAL_MS = 18_000;
/** Upper bound on chips once the board starts filling reclaimed space. */
const MAX_BOARD_CHIPS = 40;
/** Board cells per gate the ceiling aims for, so a big desktop carries a big circuit. */
const CELLS_PER_CHIP = 150;
/** Candidate placements sampled when hunting for free board. */
const EMPTY_REGION_SAMPLES = 56;
/** Every gate is the same small package: 8 columns by 5 rows, borders included. */
const CHIP_WIDTH = 8;
const CHIP_HEIGHT = 5;
const CHIP_MARGIN = 1;
const CHIP_SPACING = 2;
/** Tries to seat a gate beside its driver before falling back to the emptiest board. */
const NEARBY_PLACE_ATTEMPTS = 12;
/** Gates the board opens with: a small circuit that is already complete. */
const SEED_GATE_COUNT = 3;
/** Columns the first stage band leaves clear for the left-hand sources to fan out. */
const SOURCE_COLUMN_WIDTH = 5;
/** Columns kept free left of a gate: its input pins, plus room to turn into them. */
const INPUT_APPROACH_COLUMNS = 2;
/** Horizontal pitch between successive logic stages, so signals read left to right. */
const STAGE_PITCH = CHIP_WIDTH + CHIP_SPACING + 4;
/** Chance that growth splices a gate into an existing wire instead of appending one. */
const SPLICE_CHANCE = 0.35;
/**
 * The generation-stamped search visits each cell at most once, so the board's own
 * cell count is the real bound and a blocked route still fails in one sweep. A
 * fixed cap below that silently truncates the search on any desktop larger than
 * it — the route is abandoned and its wire never drawn.
 */
const routeVisitCap = (bounds: Rectangle): number => bounds.width * bounds.height;
/** Keep-out padding, in cells, applied around every window obstacle rect. */
const OBSTACLE_MARGIN = 1;
/**
 * Longest a re-route may be deferred while windows are still moving. A drag
 * changes the keep-out every frame; re-routing the whole board that often is
 * wasted work, so routing coalesces until the windows settle or this elapses.
 */
const WIRE_REBUILD_MAX_DEFER_MS = 400;
/** Layout-reaction jobs (relocations, regrows, taps) processed per advance. */
const LAYOUT_JOBS_PER_FRAME = 3;
const MAX_PENDING_JOBS = 128;
/** Pulses on taps of the focused window run this much faster. */
const ACTIVE_TAP_PULSE_MULTIPLIER = 2;
/** How far the base tap trace color shifts toward theme.accent when focused. */
const ACTIVE_TAP_BASE_MIX = 0.6;

const VIA_GLYPH = "o";
/** Marks a cell where one net forks, the way a schematic dots a real junction. */
const JUNCTION_GLYPH = "●";
const CHIP_FILL_GLYPH = "▓";

/** Lamps in the indicator array across the top of the board. */
const LED_COUNT = 8;
/** Columns between lamps: one for the next lamp's input pin, one to turn into it. */
const LED_SPACING = 3;
/** Row the array sits on, clear of the wires the top corners run along row 0. */
const LED_ROW = 1;
const LED_ON_GLYPH = "█";
const LED_OFF_GLYPH = "░";

/**
 * Each chip is a logic gate drawn as a node with its signal inputs on the left
 * edge and its single output on the right, so signal flow reads left to right,
 * and with its supply pins on the top and bottom edges, where the VCC and GND
 * rails reach it. Power and signal are kept apart on purpose: a gate is powered
 * because both rails run to it, never because some logic path happens to pass
 * through a rail, and the CLK nodes are signal generators rather than a substitute
 * for either rail. The board opens as a small complete circuit — every gate
 * powered, grounded and fully driven — and evolves by growing one gate at a time,
 * either appended to an existing output or spliced into an existing wire, so the
 * circuit is valid at every instant while getting steadily more elaborate.
 */
const GATE_TYPES = ["AND", "OR", "NAND", "NOR", "XOR", "XNOR"] as const;
type GateType = (typeof GATE_TYPES)[number];

/**
 * One wired logic input: another gate's output, or a free-running generator.
 * The rails are deliberately absent — VCC and GND are power connections into a
 * gate's supply pins, not signals it computes with.
 */
type LogicRef =
  | { readonly kind: "chip"; readonly id: number }
  | { readonly kind: "osc"; readonly id: number };

/** Anything that can push current onto a trace, including the two power rails. */
type CircuitDriver =
  | LogicRef
  | { readonly kind: "power" }
  | { readonly kind: "ground" };

/** Interval between synchronous logic evaluations. */
const LOGIC_TICK_MS = 620;
/** Inputs wired into each gate. */
const MIN_GATE_INPUTS = 2;
const MAX_GATE_INPUTS = 3;
/**
 * Hard ceiling on a gate's input pins — one per row of its left edge. Growth
 * aims for `MAX_GATE_INPUTS`; only the pass that guarantees every output reaches
 * something goes past it, and a 4- or 5-input gate is an ordinary part anyway.
 */
const MAX_GATE_FANIN = CHIP_HEIGHT;
/** Pulse-speed multiplier for a de-energized (output-low) trace; it idles slow. */
const IDLE_PULSE_MULTIPLIER = 0.22;
/** The two supply rails, in the order they are run to every gate. */
const RAIL_KINDS = ["power", "ground"] as const;
const POWER_LABEL = "VCC";
const GROUND_LABEL = "GND";
const OSCILLATOR_LABEL = "CLK";
/** Cells a source label occupies; its output pin sits immediately to the right. */
const SOURCE_LABEL_WIDTH = 3;
/** An oscillator flips its output every this-many-to-that-many logic ticks. */
const OSC_MIN_PERIOD_TICKS = 2;
const OSC_MAX_PERIOD_TICKS = 6;
/** A board this large is big enough to warrant the third, central generator. */
const CENTER_CLOCK_CELLS = 2_400;
const MAX_OSCILLATORS = 3;

/** Direction order: up, right, down, left. */
const DIR_DX = [0, 1, 0, -1] as const;
const DIR_DY = [-1, 0, 1, 0] as const;

/** Glyph for a trace cell indexed by `arrivalDirection * 4 + exitDirection`. */
const TRACE_GLYPHS = [
  "│",
  "┌",
  "│",
  "┐",
  "┘",
  "─",
  "┐",
  "─",
  "│",
  "└",
  "│",
  "┘",
  "└",
  "─",
  "┌",
  "─",
] as const;

/** Construction options shared by the Exomux animated background catalog. */
export interface ExomuxCircuitFieldOptions {
  readonly seed?: number;
  /** Scales chip and trace counts; 1 keeps the default board population. */
  readonly density?: number;
}

/** One placed chip snapshot exposed for deterministic tests. */
export interface ExomuxCircuitChipSnapshot {
  /** Stable gate identity, as referenced by `ExomuxCircuitTraceSnapshot`. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  /** The logic gate this chip evaluates. */
  readonly gate: GateType;
  /** Number of wired inputs. */
  readonly inputCount: number;
  /** Current logic output. */
  readonly state: boolean;
  /** Depth from the source column; drives which vertical band the gate sits in. */
  readonly stage: number;
}

/** A power or ground rail exposed for deterministic tests. */
export interface ExomuxCircuitRailSnapshot {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

/** A free-running oscillator (signal generator) exposed for deterministic tests. */
export interface ExomuxCircuitOscillatorSnapshot {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  /** Logic ticks between output flips. */
  readonly periodTicks: number;
  /** Current square-wave output. */
  readonly state: boolean;
}

/** One trace snapshot with its animated pulses, exposed for deterministic tests. */
export interface ExomuxCircuitTraceSnapshot {
  readonly chipIndex: number;
  /** Signal wires, rail supply runs, lamp ground returns, and window tap traces. */
  readonly kind: "wire" | "rail" | "return" | "tap";
  /** Index into `obstacles` for tap traces; absent on wires. */
  readonly obstacleIndex?: number;
  /** What drives the trace; pulses flow from it toward the sink. */
  readonly driver: "chip" | "osc" | "power" | "ground";
  /** For wires, the gate id this wire feeds. */
  readonly consumerChipId?: number;
  /** For wires into the indicator array, the lamp id this wire feeds. */
  readonly consumerLedId?: number;
  readonly cells: readonly Readonly<{ x: number; y: number; glyph: string }>[];
  readonly pulses: readonly Readonly<{ index: number }>[];
}

/** One indicator lamp exposed for deterministic tests. */
export interface ExomuxCircuitLedSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** True while the gate driving the lamp is high. */
  readonly state: boolean;
  /** False only while the lamp is waiting for a gate to be wired to it. */
  readonly driven: boolean;
  /** True once both its feed and its ground return are physically routed. */
  readonly connected: boolean;
}

/** Inspection payload mirroring the metaball field's test hook. */
export interface ExomuxCircuitInspection {
  readonly bounds?: Rectangle;
  readonly chips: readonly ExomuxCircuitChipSnapshot[];
  readonly traces: readonly ExomuxCircuitTraceSnapshot[];
  /** Window keep-out rects in field-local coordinates. */
  readonly obstacles: readonly Rectangle[];
  /** Index into `obstacles` of the focused window, when one matched. */
  readonly activeObstacleIndex?: number;
  /** Queued layout-reaction jobs still waiting to run. */
  readonly pendingJobs: number;
  /** The power rail node, when placed. */
  readonly power?: ExomuxCircuitRailSnapshot;
  /** The ground rail node, when placed. */
  readonly ground?: ExomuxCircuitRailSnapshot;
  /** Free-running signal generators placed on the board. */
  readonly oscillators: readonly ExomuxCircuitOscillatorSnapshot[];
  /** The indicator lamp array across the top of the board. */
  readonly leds: readonly ExomuxCircuitLedSnapshot[];
  /** Count of gates whose output drives no gate and no lamp. */
  readonly danglingChips: number;
  /** Cells drawn as a junction dot because one net forks there. */
  readonly junctions: number;
  /** The gate the pointer selected, whose wiring is drawn highlighted. */
  readonly selectedChipId?: number;
  /** Count of chips whose output is currently high. */
  readonly liveChips: number;
  /** Count of gates whose input cone reaches both the power and ground rail. */
  readonly groundedChips: number;
  /** Count of gates whose input cone reaches a CLK generator. */
  readonly clockedChips: number;
  /** Count of gates with fewer than the minimum wired inputs; a valid board has none. */
  readonly floatingChips: number;
}

interface CircuitChip {
  readonly id: number;
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  label: string;
  gate: GateType;
  /** Wired inputs, in pin order; pin `i` enters the left edge at input row `i`. */
  inputs: LogicRef[];
  /** Longest driver depth + 1, used to band gates into left-to-right stages. */
  stage: number;
  /** Current logic output, committed on the previous tick. */
  state: boolean;
  /** Output computed this tick, swapped in after every gate has been read. */
  nextState: boolean;
}

/** A power or ground rail node placed on the board. */
interface CircuitRail {
  x: number;
  y: number;
  /** Corner the node belongs at; it returns here whenever the spot is free. */
  readonly homeX: number;
  readonly homeY: number;
  readonly label: string;
}

/** A free-running oscillator: a clock/signal source powered by both rails. */
interface CircuitOscillator {
  readonly id: number;
  x: number;
  y: number;
  readonly homeX: number;
  readonly homeY: number;
  readonly label: string;
  /** Logic ticks between flips. */
  periodTicks: number;
  /** Ticks since the last flip. */
  phase: number;
  state: boolean;
}

/**
 * One lamp in the indicator array. A pure sink: it takes a single input on its
 * left and shows that signal, so the board's output is legible at a glance.
 */
interface CircuitLed {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** What the lamp displays; undefined only until a gate is wired to it. */
  driver?: LogicRef;
  /** True once both the feed and the ground return are physically routed. */
  connected: boolean;
  state: boolean;
}

interface CircuitTraceCell {
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
}

interface CircuitPulse {
  index: number;
  accumulator: number;
}

interface CircuitTrace {
  /**
   * A signal wire between two pins, a supply run from a rail into a gate's
   * power pin, or a decorative tap onto a window border.
   */
  kind: "wire" | "rail" | "return" | "tap";
  /**
   * What drives current onto this trace. Cells run driver → consumer, so pulses
   * always flow forward: out of the driver's output pin and into the sink pin.
   */
  driver: CircuitDriver;
  /** For wires: the gate this wire feeds. */
  consumerChipId?: number;
  /** For wires into the indicator array: the lamp this wire feeds. */
  consumerLedId?: number;
  /**
   * For a supply run: the gate whose conduction pushes current along it. A gate
   * draws from VCC while its output is high and sinks into GND while it is low,
   * so the two runs light on opposite halves of the gate's cycle.
   */
  energizedBy?: LogicRef;
  /** True on a run that carries current while `energizedBy` is low, not high. */
  sinking?: boolean;
  /** Source chip index for taps; the driver's chip index for wires, else -1. */
  chipIndex: number;
  /** Index into the current obstacle list; only meaningful on tap traces. */
  obstacleIndex?: number;
  /** Local rect of the window this tap terminates on; identity across moves. */
  obstacleRect?: Rectangle;
  cells: CircuitTraceCell[];
  pulses: CircuitPulse[];
}

/** Deferred, deterministic layout reaction executed a few per frame. */
type CircuitLayoutJob =
  | { readonly kind: "relocate-chip"; readonly chipId: number }
  | { readonly kind: "grow-taps"; readonly rect: Rectangle };

interface CircuitPathPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * An output pin plus the direction a wire leaves it: east for a gate, and for a
 * source whichever way its terminal faces the board.
 */
interface CircuitDriverPin {
  readonly point: CircuitPathPoint;
  readonly exitTo: CircuitPathPoint;
}

interface CircuitPointer extends ExomuxBackgroundPoint {
  readonly updatedAt: number;
}

/**
 * Procedural PCB background: a live logic circuit laid out left to right. The
 * VCC, CLK and GND sources occupy the left column; each gate takes its inputs on
 * its left edge and drives its single output pin off its right edge, and wires
 * are routed to leave a driver heading east and to arrive at a consumer heading
 * east, so current visibly flows in one direction. The board starts as a small
 * valid circuit and evolves by growing one gate every ~6s — appended to an
 * existing output or spliced into an existing wire — never leaving an input
 * floating and never breaking a gate's connection to all three sources.
 *
 * Window rects passed as obstacles become keep-out zones (rect plus a 1-cell
 * margin): chips relocate out of them, crossing wires re-route around them, and
 * every window receives 1-3 "tap" traces routed from the nearest chip flush onto
 * its border via `o`. Taps to the focused window render brighter with
 * double-speed bold pulses. All randomness flows through one LCG so equal seeds,
 * timestamps, and obstacle sequences reproduce equal grids.
 */
export class ExomuxCircuitField implements ExomuxAnimatedBackground {
  #randomState: number;
  readonly #density: number;
  #bounds?: Rectangle;
  #pointer?: CircuitPointer;
  #activePointer?: ExomuxBackgroundPoint;
  #lastFrameAt?: number;
  #chips: CircuitChip[] = [];
  #traces: CircuitTrace[] = [];
  #occupancy = new Uint8Array();
  #keepOut = new Uint8Array();
  #obstacles: Rectangle[] = [];
  #obstacleKey?: string;
  #activeObstacleIndex?: number;
  #pendingJobs: CircuitLayoutJob[] = [];
  #nextChipId = 0;
  #cells: (ExomuxBackgroundCell | undefined)[][] = [];
  #growTimerMs = 0;
  #driftTimerMs = 0;
  #logicTimerMs = 0;
  #power?: CircuitRail;
  #ground?: CircuitRail;
  #oscillators: CircuitOscillator[] = [];
  #nextOscId = 0;
  #leds: CircuitLed[] = [];
  #nextLedId = 0;
  /** Chip count the logic graph was last wired for; a change forces a rewire. */
  #logicChipCount = -1;
  /** Set when the physical wire routing no longer matches the logic or layout. */
  #wiresDirty = false;
  /** Simulated time the pending re-route has been waiting for the windows to settle. */
  #wireDeferMs = 0;
  /** Cells where one net forks, indexed by `y * width + x`; drawn as junction dots. */
  #junctions = new Set<number>();
  /** Gate the pointer last clicked; its wiring is traced out in the highlight colour. */
  #selectedChipId?: number;
  // Reused routing scratch: a generation stamp marks cells visited this route,
  // so no per-route array reset or allocation is needed on the hot path.
  #routeSeen = new Uint32Array();
  #routePrev = new Int32Array();
  #routeQueue = new Int32Array();
  #routeGeneration = 0;

  constructor(options: ExomuxCircuitFieldOptions = {}) {
    this.#randomState = (options.seed ?? 0x50_43_42_31) >>> 0;
    this.#density = clamp(finite(options.density, 1), 0.1, 4);
  }

  /** Updates the transient acceleration point without coupling it to input routing. */
  setPointer(point: ExomuxBackgroundPoint, now = performance.now()): void {
    if (!Number.isFinite(point.column) || !Number.isFinite(point.row)) return;
    this.#pointer = {
      column: point.column,
      row: point.row,
      updatedAt: finite(now, performance.now()),
    };
  }

  clearPointer(): void {
    this.#pointer = undefined;
    this.#activePointer = undefined;
  }

  /** Advances pulses, obstacle reactions, and slow layout shifts once; returns true when anything changed. */
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
    this.#growTimerMs += elapsed;
    this.#driftTimerMs += elapsed;
    this.#logicTimerMs += elapsed;

    const pointer = this.#pointer && now - this.#pointer.updatedAt <= POINTER_LIFETIME_MS ? this.#pointer : undefined;
    this.#activePointer = pointer
      ? { column: pointer.column - bounds.column, row: pointer.row - bounds.row }
      : undefined;

    let changed = false;
    const obstaclesMoved = this.#syncObstacles(options, bounds);
    if (obstaclesMoved) changed = true;
    if (this.#processLayoutJobs(bounds)) changed = true;
    // A chip the layout relocated away or despawned leaves dangling references
    // and possibly starved gates, so repair the netlist before it is evaluated.
    if (this.#chips.length !== this.#logicChipCount) {
      this.#repairCircuit();
      this.#wiresDirty = true;
    }

    // Slow evolution: drift one chip now and then, and grow one more gate into
    // the circuit. Each dirties the routing so the wires re-route around it.
    while (this.#driftTimerMs >= CHIP_DRIFT_INTERVAL_MS) {
      this.#driftTimerMs -= CHIP_DRIFT_INTERVAL_MS;
      if (this.#driftOneChip(bounds)) changed = true;
    }
    for (
      let interval = this.#growInterval(bounds);
      this.#growTimerMs >= interval;
      interval = this.#growInterval(bounds)
    ) {
      this.#growTimerMs -= interval;
      if (!this.#growCircuit(bounds)) break;
      changed = true;
    }
    // Route (or re-route) every wire once per structural change, not per frame,
    // and hold off entirely while a window is still being dragged across the
    // board — its final position is the only one worth routing around.
    if (this.#wiresDirty) {
      this.#wireDeferMs += elapsed;
      if (!obstaclesMoved || this.#wireDeferMs >= WIRE_REBUILD_MAX_DEFER_MS) {
        this.#rebuildWires(bounds);
        this.#wireDeferMs = 0;
        changed = true;
      }
    }

    while (this.#logicTimerMs >= LOGIC_TICK_MS) {
      this.#logicTimerMs -= LOGIC_TICK_MS;
      if (this.#tickLogic()) changed = true;
    }

    const activeIndex = this.#activeObstacleIndex;
    for (const trace of this.#traces) {
      const length = trace.cells.length;
      if (length === 0) continue;
      const activeTap = trace.kind === "tap" && activeIndex !== undefined && trace.obstacleIndex === activeIndex;
      // Current flows driver → sink along the cells, so pulses always run
      // forward. An energized trace (driver output high) runs at full speed; an
      // idle one only creeps, so the logic state reads at a glance.
      const energized = this.#traceEnergized(trace);
      const logicMultiplier = energized ? 1 : IDLE_PULSE_MULTIPLIER;
      for (const pulse of trace.pulses) {
        const cell = trace.cells[pulse.index % length]!;
        const near = this.#activePointer !== undefined &&
          Math.max(
              Math.abs(cell.x - this.#activePointer.column),
              Math.abs(cell.y - this.#activePointer.row),
            ) <= POINTER_REACH_CELLS;
        pulse.accumulator += PULSE_CELLS_PER_FRAME * (near ? 2 : 1) *
          (activeTap ? ACTIVE_TAP_PULSE_MULTIPLIER : 1) * logicMultiplier * delta;
        const steps = Math.floor(pulse.accumulator);
        if (steps > 0) {
          pulse.accumulator -= steps;
          pulse.index = (pulse.index + steps) % length;
          changed = true;
        }
      }
    }
    return changed;
  }

  /**
   * Whether a trace is carrying current right now. A signal wire follows its
   * driver; a supply run follows the gate it serves, inverted on the ground side
   * because a gate only sinks into ground while its output is low.
   */
  #traceEnergized(trace: CircuitTrace): boolean {
    if (!trace.energizedBy) return this.#driverState(trace.driver);
    const state = this.#driverState(trace.energizedBy);
    return trace.sinking ? !state : state;
  }

  /** Resolves the live output of whatever drives a trace. */
  #driverState(driver: CircuitDriver): boolean {
    switch (driver.kind) {
      case "power":
        return true;
      case "ground":
        return false;
      case "osc":
        return this.#oscillators.find((oscillator) => oscillator.id === driver.id)?.state ?? false;
      case "chip":
        return this.#chips.find((chip) => chip.id === driver.id)?.state ?? false;
    }
  }

  /** Paints chips, traces, vias, and pulses into a reused row-major cell buffer. */
  rasterizeCells(
    bounds: Rectangle,
    theme: ExomuxThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>> {
    const normalized = normalizeBounds(bounds);
    if (!normalized) {
      this.#cells = [];
      return this.#cells;
    }
    this.#ensureLayout(normalized);
    const { width, height } = normalized;
    this.#ensureCellBuffer(width, height);

    const traceBase = mixExomuxRgb(theme.border, theme.background, 0.35);
    const viaColor = mixExomuxRgb(theme.border, theme.text, 0.15);
    const chipBorder = mixExomuxRgb(theme.border, theme.text, 0.25);
    const chipBody = mixExomuxRgb(theme.surfaceStrong, theme.text, 0.2);
    const labelColor = mixExomuxRgb(theme.muted, theme.text, 0.1);
    const pulseHead = mixExomuxRgb(theme.accent, theme.text, 0.2);
    const pulseTrail = mixExomuxRgb(theme.accent, traceBase, 0.5);
    const highlight = mixExomuxRgb(traceBase, theme.accent, 0.45);
    const activeTapBase = mixExomuxRgb(traceBase, theme.accent, ACTIVE_TAP_BASE_MIX);
    const activeTapVia = mixExomuxRgb(viaColor, theme.accent, 0.5);
    const activeTapHead = mixExomuxRgb(pulseHead, theme.text, 0.35);
    const activeTapTrail = mixExomuxRgb(pulseTrail, theme.accent, 0.5);
    // An energized (output-high) trace carries the theme accent; an idle one
    // recedes toward the board so live logic stands out from dormant logic.
    const liveTrace = mixExomuxRgb(traceBase, theme.accent, 0.55);
    const idleTrace = mixExomuxRgb(traceBase, theme.background, 0.35);
    const liveChipBody = mixExomuxRgb(chipBody, theme.accent, 0.5);
    const liveChipBorder = mixExomuxRgb(chipBorder, theme.accent, 0.55);
    const liveLabel = mixExomuxRgb(labelColor, theme.text, 0.6);
    // A clicked gate lights its own wiring so a single net can be followed
    // across a crowded board.
    const selectedTrace = mixExomuxRgb(theme.warning, theme.text, 0.25);
    const selectedBorder = mixExomuxRgb(theme.warning, theme.text, 0.45);
    const pointer = this.#activePointer;
    const activeIndex = this.#activeObstacleIndex;

    for (const trace of this.#traces) {
      const activeTap = trace.kind === "tap" && activeIndex !== undefined && trace.obstacleIndex === activeIndex;
      // Energize a wire by whatever drives it (a rail, an oscillator, or a gate).
      const energized = this.#traceEnergized(trace);
      const selected = this.#traceSelected(trace);
      const baseColor = selected ? selectedTrace : activeTap ? activeTapBase : energized ? liveTrace : idleTrace;
      for (const cell of trace.cells) {
        if (cell.x < 0 || cell.x >= width || cell.y < 0 || cell.y >= height) continue;
        const near = pointer !== undefined &&
          Math.max(Math.abs(cell.x - pointer.column), Math.abs(cell.y - pointer.row)) <= POINTER_REACH_CELLS;
        const foreground = selected
          ? selectedTrace
          : near
          ? highlight
          : cell.glyph === VIA_GLYPH
          ? (activeTap ? activeTapVia : viaColor)
          : baseColor;
        // A fork in this net is dotted, so a branch reads as a connection rather
        // than as two wires that happen to touch.
        const junction = this.#junctions.has(cell.y * width + cell.x) && cell.glyph !== VIA_GLYPH;
        this.#cells[cell.y]![cell.x] = {
          char: junction ? JUNCTION_GLYPH : cell.glyph,
          foreground,
          ...(selected || junction ? { bold: true } : {}),
        };
      }
      const length = trace.cells.length;
      if (length === 0) continue;
      // Current runs driver → sink (forward), so the trail lags one cell behind.
      for (const pulse of trace.pulses) {
        const headCell = trace.cells[pulse.index % length]!;
        const trailCell = trace.cells[(pulse.index - 1 + length) % length]!;
        if (trailCell.y >= 0 && trailCell.y < height && trailCell.x >= 0 && trailCell.x < width) {
          this.#cells[trailCell.y]![trailCell.x] = activeTap
            ? { char: trailCell.glyph, foreground: activeTapTrail, bold: true }
            : { char: trailCell.glyph, foreground: pulseTrail };
        }
        if (headCell.y >= 0 && headCell.y < height && headCell.x >= 0 && headCell.x < width) {
          this.#cells[headCell.y]![headCell.x] = {
            char: headCell.glyph,
            foreground: activeTap ? activeTapHead : pulseHead,
            bold: true,
          };
        }
      }
    }

    for (const chip of this.#chips) {
      const lastRow = chip.height - 1;
      const lastColumn = chip.width - 1;
      // A gate that is currently outputting high lights up its body and border.
      const chosen = chip.id === this.#selectedChipId;
      const bodyColor = chip.state ? liveChipBody : chipBody;
      const borderColor = chosen ? selectedBorder : chip.state ? liveChipBorder : chipBorder;
      for (let r = 0; r < chip.height; r += 1) {
        const gy = chip.y + r;
        if (gy < 0 || gy >= height) continue;
        for (let c = 0; c < chip.width; c += 1) {
          const gx = chip.x + c;
          if (gx < 0 || gx >= width) continue;
          const edge = r === 0 || r === lastRow || c === 0 || c === lastColumn;
          const char = !edge
            ? CHIP_FILL_GLYPH
            : r === 0
            ? (c === 0 ? "╔" : c === lastColumn ? "╗" : "═")
            : r === lastRow
            ? (c === 0 ? "╚" : c === lastColumn ? "╝" : "═")
            : "║";
          this.#cells[gy]![gx] = { char, foreground: edge ? borderColor : bodyColor };
        }
      }
      // Centre the gate label inside the chip interior, clipped to what fits.
      const interior = Math.max(0, chip.width - 2);
      const label = chip.label.slice(0, interior);
      const labelRow = chip.y + Math.floor(chip.height / 2);
      const labelColumn = chip.x + 1 + Math.max(0, Math.floor((interior - label.length) / 2));
      for (let index = 0; index < label.length; index += 1) {
        const gx = labelColumn + index;
        if (labelRow < 0 || labelRow >= height || gx < 0 || gx >= width) continue;
        this.#cells[labelRow]![gx] = {
          char: label[index]!,
          foreground: chip.state ? liveLabel : labelColor,
          bold: true,
        };
      }
    }

    this.#paintRail(this.#power, theme, mixExomuxRgb(theme.warning, theme.text, 0.3), true, width, height);
    this.#paintRail(this.#ground, theme, mixExomuxRgb(theme.muted, theme.background, 0.2), false, width, height);

    // Signal generators: an unboxed label that pulses bright/bold on its square
    // wave's high phase and dims on the low, blinking at its own fixed rate. The
    // last glyph carries the waveform so the state is legible when it is small.
    const oscHigh = mixExomuxRgb(theme.accent, theme.text, 0.4);
    const oscLow = mixExomuxRgb(theme.accent, theme.background, 0.35);
    for (const oscillator of this.#oscillators) {
      if (oscillator.y < 0 || oscillator.y >= height) continue;
      const color = oscillator.state ? oscHigh : oscLow;
      const glyphs = oscillator.state ? "CL^" : "CL_";
      for (let index = 0; index < glyphs.length; index += 1) {
        const gx = oscillator.x + index;
        if (gx < 0 || gx >= width) continue;
        if (this.#keepOut[oscillator.y * width + gx] !== 0) continue;
        this.#cells[oscillator.y]![gx] = { char: glyphs[index]!, foreground: color, bold: oscillator.state };
      }
    }

    // The indicator array: a lit lamp burns in the theme's success colour, an
    // unlit one recedes toward the board so the pattern reads at a glance.
    const ledOn = mixExomuxRgb(theme.success, theme.text, 0.35);
    const ledOff = mixExomuxRgb(theme.muted, theme.background, 0.55);
    for (const led of this.#leds) {
      if (led.x < 0 || led.x >= width || led.y < 0 || led.y >= height) continue;
      if (this.#keepOut[led.y * width + led.x] !== 0) continue;
      this.#cells[led.y]![led.x] = {
        char: led.state ? LED_ON_GLYPH : LED_OFF_GLYPH,
        foreground: led.state ? ledOn : ledOff,
        bold: led.state,
      };
    }
    return this.#cells;
  }

  /**
   * Draws one rail node as a bold 3-cell label. A cell inside a window keep-out
   * is left blank: a source that has nowhere free to slide to still must not
   * paint itself over a terminal.
   */
  #paintRail(
    rail: CircuitRail | undefined,
    _theme: ExomuxThemeSpec,
    color: ExomuxRgb,
    bold: boolean,
    width: number,
    height: number,
  ): void {
    if (!rail || rail.y < 0 || rail.y >= height) return;
    for (let index = 0; index < rail.label.length; index += 1) {
      const gx = rail.x + index;
      if (gx < 0 || gx >= width) continue;
      if (this.#keepOut[rail.y * width + gx] !== 0) continue;
      this.#cells[rail.y]![gx] = { char: rail.label[index]!, foreground: color, bold };
    }
  }

  /** Deterministic state snapshot for tests. */
  inspect(): ExomuxCircuitInspection {
    const clocked = this.#clockReach();
    return {
      ...(this.#bounds ? { bounds: { ...this.#bounds } } : {}),
      chips: this.#chips.map((chip) => ({
        id: chip.id,
        x: chip.x,
        y: chip.y,
        width: chip.width,
        height: chip.height,
        label: chip.label,
        gate: chip.gate,
        inputCount: chip.inputs.length,
        state: chip.state,
        stage: chip.stage,
      })),
      traces: this.#traces.map((trace) => ({
        chipIndex: trace.chipIndex,
        kind: trace.kind,
        ...(trace.kind === "tap" && trace.obstacleIndex !== undefined ? { obstacleIndex: trace.obstacleIndex } : {}),
        driver: trace.driver.kind,
        ...(trace.consumerChipId !== undefined ? { consumerChipId: trace.consumerChipId } : {}),
        ...(trace.consumerLedId !== undefined ? { consumerLedId: trace.consumerLedId } : {}),
        cells: trace.cells.map((cell) => ({ ...cell })),
        pulses: trace.pulses.map((pulse) => ({ index: pulse.index })),
      })),
      obstacles: this.#obstacles.map((rectangle) => ({ ...rectangle })),
      ...(this.#activeObstacleIndex !== undefined ? { activeObstacleIndex: this.#activeObstacleIndex } : {}),
      pendingJobs: this.#pendingJobs.length,
      ...(this.#power ? { power: { ...this.#power } } : {}),
      ...(this.#ground ? { ground: { ...this.#ground } } : {}),
      oscillators: this.#oscillators.map((oscillator) => ({
        x: oscillator.x,
        y: oscillator.y,
        label: oscillator.label,
        periodTicks: oscillator.periodTicks,
        state: oscillator.state,
      })),
      leds: this.#leds.map((led) => ({
        id: led.id,
        x: led.x,
        y: led.y,
        state: led.state,
        driven: led.driver !== undefined,
        connected: led.connected,
      })),
      danglingChips: this.#countDanglingGates(),
      junctions: this.#junctions.size,
      ...(this.#selectedChipId !== undefined ? { selectedChipId: this.#selectedChipId } : {}),
      liveChips: this.#chips.reduce((count, chip) => count + (chip.state ? 1 : 0), 0),
      groundedChips: this.#countSuppliedGates(),
      clockedChips: this.#chips.reduce((count, chip) => count + (clocked.get(chip.id) ? 1 : 0), 0),
      floatingChips: this.#chips.reduce((count, chip) => count + (chip.inputs.length === 0 ? 1 : 0), 0),
    };
  }

  /** Counts gates whose output feeds neither another gate nor a lamp. */
  #countDanglingGates(): number {
    const consumed = new Set<number>();
    for (const chip of this.#chips) {
      for (const input of chip.inputs) {
        if (input.kind === "chip") consumed.add(input.id);
      }
    }
    for (const led of this.#leds) {
      if (led.driver?.kind === "chip") consumed.add(led.driver.id);
    }
    return this.#chips.reduce((count, chip) => count + (consumed.has(chip.id) ? 0 : 1), 0);
  }

  #ensureLayout(bounds: Rectangle): void {
    const previous = this.#bounds;
    if (previous?.width === bounds.width && previous.height === bounds.height) {
      this.#bounds = { ...bounds };
      return;
    }
    this.#bounds = { ...bounds };
    this.#generateLayout(bounds);
  }

  #generateLayout(bounds: Rectangle): void {
    const { width, height } = bounds;
    this.#occupancy = new Uint8Array(width * height);
    this.#keepOut = new Uint8Array(width * height);
    this.#obstacles = [];
    this.#obstacleKey = undefined;
    this.#activeObstacleIndex = undefined;
    this.#pendingJobs = [];
    this.#chips = [];
    this.#traces = [];
    this.#junctions.clear();
    this.#selectedChipId = undefined;
    this.#power = undefined;
    this.#ground = undefined;
    this.#oscillators = [];
    this.#leds = [];
    this.#logicChipCount = -1;
    this.#logicTimerMs = 0;
    this.#growTimerMs = 0;
    this.#driftTimerMs = 0;
    this.#wiresDirty = false;
    if (Math.min(width, height) < 2 * CHIP_MARGIN + 3) return;
    // Sources own the left column before anything else claims it, so every gate
    // downstream of them can be reached by a wire that runs left to right.
    this.#placeSources(bounds);
    this.#placeLeds(bounds);
    this.#buildSeedCircuit(bounds);
    this.#connectIdleClocks();
    this.#wireOutputs();
    this.#logicChipCount = this.#chips.length;
    // Route the physical wires that realize the logic graph, so they exist on
    // the very first frame rather than after the first advance.
    this.#rebuildWires(bounds);
  }

  /**
   * The output pin of one gate: the free cell just off the middle of its right
   * edge, so every wire it drives leaves the node heading east. Rows nearer the
   * middle win; a fully blocked right edge falls back to any free perimeter cell
   * so a crowded gate still connects rather than silently dropping its fanout.
   */
  #chipOutputPin(chip: CircuitChip, bounds: Rectangle): CircuitPathPoint | undefined {
    const column = chip.x + chip.width;
    const middle = chip.y + (chip.height >> 1);
    for (let offset = 0; offset < chip.height; offset += 1) {
      const row = offset % 2 === 0 ? middle + (offset >> 1) : middle - ((offset + 1) >> 1);
      if (row < chip.y || row >= chip.y + chip.height) continue;
      if (this.#pinFree(column, row, bounds)) return { x: column, y: row };
    }
    return this.#anyPerimeterPin(chip, bounds);
  }

  /**
   * Input pins for one gate: `count` free cells down its left edge, spread so
   * the pins keep their wiring order top to bottom and every wire arrives from
   * the west. A blocked row slides to the nearest free row on the same edge;
   * once the left edge is exhausted the remaining pins share the last one rather
   * than leaving an input unrouted.
   */
  #chipInputPins(chip: CircuitChip, count: number, bounds: Rectangle): (CircuitPathPoint | undefined)[] {
    const column = chip.x - 1;
    const taken = new Set<number>();
    const pins: (CircuitPathPoint | undefined)[] = [];
    for (let index = 0; index < count; index += 1) {
      const preferred = chip.y +
        Math.min(chip.height - 1, Math.floor(((index + 0.5) * chip.height) / Math.max(1, count)));
      let chosen: number | undefined;
      for (let offset = 0; offset < chip.height; offset += 1) {
        const row = offset % 2 === 0 ? preferred + (offset >> 1) : preferred - ((offset + 1) >> 1);
        if (row < chip.y || row >= chip.y + chip.height || taken.has(row)) continue;
        if (!this.#pinFree(column, row, bounds)) continue;
        chosen = row;
        break;
      }
      if (chosen === undefined) {
        const fallback = pins.findLast((pin) => pin !== undefined) ?? this.#anyPerimeterPin(chip, bounds);
        pins.push(fallback);
        continue;
      }
      taken.add(chosen);
      pins.push({ x: column, y: chosen });
    }
    return pins;
  }

  /**
   * A gate's two supply pins: VCC lands on the top edge and GND on the bottom,
   * clear of the signal pins on the left and the output on the right. They sit
   * a third and two thirds across so the supply runs stay visually distinct.
   */
  #chipRailPin(chip: CircuitChip, rail: "power" | "ground", bounds: Rectangle): CircuitPathPoint | undefined {
    const row = rail === "power" ? chip.y - 1 : chip.y + chip.height;
    const preferred = chip.x +
      Math.max(0, Math.min(chip.width - 1, Math.round(chip.width * (rail === "power" ? 0.3 : 0.7))));
    for (let offset = 0; offset < chip.width; offset += 1) {
      const column = offset % 2 === 0 ? preferred + (offset >> 1) : preferred - ((offset + 1) >> 1);
      if (column < chip.x || column >= chip.x + chip.width) continue;
      if (this.#pinFree(column, row, bounds)) return { x: column, y: row };
    }
    return undefined;
  }

  /** True while a cell is on the board and carries neither a node nor a keep-out. */
  #pinFree(x: number, y: number, bounds: Rectangle): boolean {
    if (x < 0 || x >= bounds.width || y < 0 || y >= bounds.height) return false;
    const index = y * bounds.width + x;
    return this.#occupancy[index] !== 1 && this.#keepOut[index] === 0;
  }

  /** Last-resort anchor for a gate whose left or right edge is entirely blocked. */
  #anyPerimeterPin(chip: CircuitChip, bounds: Rectangle): CircuitPathPoint | undefined {
    for (let r = 0; r < chip.height; r += 1) {
      if (this.#pinFree(chip.x + chip.width, chip.y + r, bounds)) return { x: chip.x + chip.width, y: chip.y + r };
      if (this.#pinFree(chip.x - 1, chip.y + r, bounds)) return { x: chip.x - 1, y: chip.y + r };
    }
    for (let c = 0; c < chip.width; c += 1) {
      if (this.#pinFree(chip.x + c, chip.y - 1, bounds)) return { x: chip.x + c, y: chip.y - 1 };
      if (this.#pinFree(chip.x + c, chip.y + chip.height, bounds)) return { x: chip.x + c, y: chip.y + chip.height };
    }
    return undefined;
  }

  /**
   * Routes every logic edge as a physical wire from its driver's output pin on
   * the right of that node to the consuming gate's input pin on the left of its
   * node, then keeps the window taps. Wires avoid chips and keep-out zones and
   * may cross one another, so a route usually exists while the endpoints share
   * free space. Runs on any structural change.
   */
  #rebuildWires(bounds: Rectangle): void {
    this.#wiresDirty = false;
    this.#traces = this.#traces.filter((trace) => trace.kind === "tap");
    if (this.#chips.length === 0) return;

    const chipIndexById = new Map<number, number>();
    const chipOutputPin = new Map<number, CircuitPathPoint>();
    for (let index = 0; index < this.#chips.length; index += 1) {
      const chip = this.#chips[index]!;
      chipIndexById.set(chip.id, index);
      const output = this.#chipOutputPin(chip, bounds);
      if (output) chipOutputPin.set(chip.id, output);
    }

    // A rail feeds the whole board, so its runs fan out from several terminals
    // around its label instead of all piling onto one cell — that is what makes
    // a corner rail read as wired to the circuit rather than grazed by one line.
    const terminals = new Map<string, { pins: CircuitDriverPin[]; cursor: number }>();
    const sourceNode = (ref: CircuitDriver): CircuitRail | CircuitOscillator | undefined => {
      if (ref.kind === "power") return this.#power;
      if (ref.kind === "ground") return this.#ground;
      if (ref.kind === "osc") return this.#oscillators.find((entry) => entry.id === ref.id);
      return undefined;
    };
    // Terminals are handed out round-robin so runs fan across the rail, but a
    // run that cannot reach the one it drew falls through to the others rather
    // than leaving a gate unsupplied on a crowded board.
    const driverPins = (ref: CircuitDriver): CircuitDriverPin[] => {
      if (ref.kind === "chip") {
        const point = chipOutputPin.get(ref.id);
        return point ? [{ point, exitTo: { x: 1, y: 0 } }] : [];
      }
      const key = ref.kind === "osc" ? `osc:${ref.id}` : ref.kind;
      let entry = terminals.get(key);
      if (!entry) {
        const node = sourceNode(ref);
        entry = { pins: node ? this.#sourceTerminals(node.x, node.y, bounds) : [], cursor: 0 };
        terminals.set(key, entry);
      }
      const pins = entry.pins;
      if (pins.length === 0) return [];
      const start = entry.cursor;
      entry.cursor += 1;
      return pins.map((_, offset) => pins[(start + offset) % pins.length]!);
    };
    const routeFrom = (
      ref: CircuitDriver,
      sink: CircuitPathPoint,
      approachFrom?: CircuitPathPoint,
    ): CircuitTraceCell[] | undefined => {
      for (const option of driverPins(ref)) {
        const cells = this.#routeWire(option.point, sink, bounds, option.exitTo, approachFrom);
        if (cells) return cells;
      }
      return undefined;
    };

    for (const chip of this.#chips) {
      const pins = this.#chipInputPins(chip, chip.inputs.length, bounds);
      for (let index = 0; index < chip.inputs.length; index += 1) {
        const input = chip.inputs[index]!;
        const sink = pins[index];
        if (!sink) continue;
        const cells = routeFrom(input, sink);
        if (!cells) continue;
        const pulseCount = 2 + Math.floor(this.#random() * 3);
        const pulses: CircuitPulse[] = Array.from({ length: pulseCount }, () => ({
          index: Math.floor(this.#random() * cells.length),
          accumulator: 0,
        }));
        this.#traces.push({
          kind: "wire",
          driver: input,
          consumerChipId: chip.id,
          chipIndex: input.kind === "chip" ? chipIndexById.get(input.id) ?? -1 : -1,
          cells,
          pulses,
        });
      }
    }

    // Both rails run to every gate. This is the only thing that powers a gate:
    // no logic path through the board counts as a supply connection. Each run is
    // laid in the direction its current actually flows — down from VCC into the
    // gate's supply pin, and out of the gate's ground pin away to GND — so the
    // pulses on it never read as something streaming out of ground.
    for (let index = 0; index < this.#chips.length; index += 1) {
      const chip = this.#chips[index]!;
      for (const rail of RAIL_KINDS) {
        const pin = this.#chipRailPin(chip, rail, bounds);
        if (!pin) continue;
        let cells: CircuitTraceCell[] | undefined;
        if (rail === "power") {
          cells = routeFrom({ kind: rail }, pin, { x: 0, y: -1 });
        } else {
          // Gate → rail: the gate is the source of this current, GND the sink.
          for (const terminal of driverPins({ kind: "ground" })) {
            cells = this.#routeWire(pin, terminal.point, bounds, { x: 0, y: 1 }, terminal.exitTo);
            if (cells) break;
          }
        }
        if (!cells) continue;
        this.#traces.push({
          kind: "rail",
          driver: { kind: rail },
          consumerChipId: chip.id,
          chipIndex: -1,
          energizedBy: { kind: "chip", id: chip.id },
          sinking: rail === "ground",
          cells,
          pulses: [{ index: Math.floor(this.#random() * cells.length), accumulator: 0 }],
        });
      }
    }

    // A lamp needs a complete path before it can conduct: the driving gate's
    // output into its anode on the left, and a return out of its cathode below
    // it back to the GND rail. It lights only when both halves actually routed —
    // an unwired lamp is a dark lamp.
    for (const led of this.#leds) {
      led.connected = false;
      const driver = led.driver;
      if (!driver) continue;
      const anode = { x: led.x - 1, y: led.y };
      if (!this.#pinFree(anode.x, anode.y, bounds)) continue;
      const feed = routeFrom(driver, anode);
      if (!feed) continue;

      // The return runs the other way, so the rail terminal is the sink here.
      const cathode = this.#ledCathodePin(led, bounds);
      if (!cathode) continue;
      let returnCells: CircuitTraceCell[] | undefined;
      for (const terminal of driverPins({ kind: "ground" })) {
        returnCells = this.#routeWire(cathode.point, terminal.point, bounds, cathode.exitTo, terminal.exitTo);
        if (returnCells) break;
      }
      if (!returnCells) continue;

      const pulseCount = 1 + Math.floor(this.#random() * 2);
      this.#traces.push({
        kind: "wire",
        driver,
        consumerLedId: led.id,
        chipIndex: driver.kind === "chip" ? chipIndexById.get(driver.id) ?? -1 : -1,
        cells: feed,
        pulses: Array.from({ length: pulseCount }, () => ({
          index: Math.floor(this.#random() * feed.length),
          accumulator: 0,
        })),
      });
      // The return carries the same signal, so it only runs bright while the
      // lamp is actually conducting.
      this.#traces.push({
        kind: "return",
        driver,
        consumerLedId: led.id,
        chipIndex: -1,
        cells: returnCells,
        pulses: [{ index: Math.floor(this.#random() * returnCells.length), accumulator: 0 }],
      });
      led.connected = true;
    }

    this.#recomputeJunctions(bounds);
  }

  /**
   * Finds the cells where one net forks. Junctions are read off the paths the
   * net's traces actually take, not off which cells sit next to each other: a
   * cell where the net enters and leaves in three or more directions is a real
   * branch, whereas two of its wires merely running side by side is not.
   */
  #recomputeJunctions(bounds: Rectangle): void {
    this.#junctions.clear();
    const nets = new Map<string, Map<number, Set<number>>>();
    const link = (net: Map<number, Set<number>>, from: number, to: number): void => {
      let neighbours = net.get(from);
      if (!neighbours) {
        neighbours = new Set<number>();
        net.set(from, neighbours);
      }
      neighbours.add(to);
    };
    for (const trace of this.#traces) {
      if (trace.kind === "tap") continue;
      const key = circuitNetKey(trace.driver);
      let net = nets.get(key);
      if (!net) {
        net = new Map<number, Set<number>>();
        nets.set(key, net);
      }
      for (let index = 0; index < trace.cells.length; index += 1) {
        const cell = trace.cells[index]!;
        if (cell.x < 0 || cell.x >= bounds.width || cell.y < 0 || cell.y >= bounds.height) continue;
        const at = cell.y * bounds.width + cell.x;
        const previous = trace.cells[index - 1];
        const next = trace.cells[index + 1];
        if (previous) link(net, at, previous.y * bounds.width + previous.x);
        if (next) link(net, at, next.y * bounds.width + next.x);
      }
    }
    for (const net of nets.values()) {
      for (const [at, neighbours] of net) {
        if (neighbours.size >= 3) this.#junctions.add(at);
      }
    }
  }

  /**
   * Selects the gate under one desktop cell and traces its wiring out in the
   * highlight colour. Clicking it again, or clicking bare board, clears the
   * selection; anything else falls through to the desktop.
   */
  pick(column: number, row: number): boolean {
    const bounds = this.#bounds;
    if (!bounds) return false;
    const x = Math.floor(column - bounds.column);
    const y = Math.floor(row - bounds.row);
    const hit = this.#chips.find((chip) =>
      x >= chip.x && x < chip.x + chip.width && y >= chip.y && y < chip.y + chip.height
    );
    const previous = this.#selectedChipId;
    this.#selectedChipId = hit === undefined || hit.id === previous ? undefined : hit.id;
    // Only a click that landed on a gate is consumed. Clicking bare board drops
    // the highlight too, but the desktop still gets its click — the next frame
    // repaints the wiring either way.
    return hit !== undefined;
  }

  /** True while a trace is part of the selected gate's wiring, either end of it. */
  #traceSelected(trace: CircuitTrace): boolean {
    const selected = this.#selectedChipId;
    if (selected === undefined) return false;
    if (trace.consumerChipId === selected) return true;
    if (trace.driver.kind === "chip" && trace.driver.id === selected) return true;
    return trace.energizedBy?.kind === "chip" && trace.energizedBy.id === selected;
  }

  /**
   * A lamp's cathode: the cell below it, so the return drops away from the array
   * the way a gate's ground pin hangs off its bottom edge. A blocked cell falls
   * back to the row above or the far side.
   */
  #ledCathodePin(
    led: CircuitLed,
    bounds: Rectangle,
  ): { point: CircuitPathPoint; exitTo: CircuitPathPoint } | undefined {
    const candidates: Array<{ point: CircuitPathPoint; exitTo: CircuitPathPoint }> = [
      { point: { x: led.x, y: led.y + 1 }, exitTo: { x: 0, y: 1 } },
      { point: { x: led.x, y: led.y - 1 }, exitTo: { x: 0, y: -1 } },
      { point: { x: led.x + 1, y: led.y }, exitTo: { x: 1, y: 0 } },
    ];
    for (const candidate of candidates) {
      if (this.#pinFree(candidate.point.x, candidate.point.y, bounds)) return candidate;
    }
    return undefined;
  }

  /**
   * A source node's output terminals, in the order runs claim them: the face of
   * its label pointing into the board first, then the cells on the row beside it
   * that also face inward. Spreading runs over several terminals keeps a rail
   * visibly wired into the circuit rather than touched by a single trace.
   */
  #sourceTerminals(x: number, y: number, bounds: Rectangle): CircuitDriverPin[] {
    const westward = x + SOURCE_LABEL_WIDTH / 2 > bounds.width / 2;
    const inner = westward ? x - 1 : x + SOURCE_LABEL_WIDTH;
    const face: CircuitPathPoint = { x: westward ? -1 : 1, y: 0 };
    const inwardY = y * 2 < bounds.height ? 1 : -1;
    const beside: CircuitPathPoint = { x: 0, y: inwardY };
    const candidates: CircuitDriverPin[] = [
      { point: { x: inner, y }, exitTo: face },
      { point: { x: x + 1, y: y + inwardY }, exitTo: beside },
      { point: { x: inner, y: y + inwardY }, exitTo: beside },
      { point: { x: x + SOURCE_LABEL_WIDTH - 1 - (westward ? 0 : 2), y: y + inwardY }, exitTo: beside },
      { point: { x: inner + face.x, y }, exitTo: face },
    ];
    const pins: CircuitDriverPin[] = [];
    for (const candidate of candidates) {
      if (!this.#pinFree(candidate.point.x, candidate.point.y, bounds)) continue;
      if (pins.some((pin) => samePoint(pin.point, candidate.point))) continue;
      pins.push(candidate);
    }
    return pins;
  }

  /**
   * Routes one wire so it leaves its driver through the pin's own face and
   * reaches its consumer through the pin's: the path is pinned through a stub one
   * cell beyond the output pin (east for a gate, west for a right-hand source)
   * and a stub one cell off the input pin on the side it faces — west for a
   * signal pin, north or south for a supply pin — and both pins are blocked for
   * the search so the route cannot double back through them. A board too tight
   * for the stubs falls back to a direct route, which still lands on the correct
   * pins.
   */
  #routeWire(
    source: CircuitPathPoint,
    sink: CircuitPathPoint,
    bounds: Rectangle,
    exitTo: CircuitPathPoint = { x: 1, y: 0 },
    approachFrom: CircuitPathPoint = { x: -1, y: 0 },
  ): CircuitTraceCell[] | undefined {
    const exit: CircuitPathPoint = { x: source.x + exitTo.x, y: source.y + exitTo.y };
    const approach: CircuitPathPoint = { x: sink.x + approachFrom.x, y: sink.y + approachFrom.y };
    if (samePoint(source, sink)) return undefined;
    if (samePoint(exit, sink) || samePoint(approach, source)) {
      return adjacent(source, sink) ? wirePathToCells([source, sink]) : this.#routePath(source, sink, bounds);
    }
    if (this.#pinFree(exit.x, exit.y, bounds) && this.#pinFree(approach.x, approach.y, bounds)) {
      const spine = samePoint(exit, approach)
        ? [exit]
        : this.#routePath(exit, approach, bounds, [source, sink])?.map((cell) => ({ x: cell.x, y: cell.y }));
      if (spine) return wirePathToCells([source, ...spine, sink]);
    }
    return this.#routePath(source, sink, bounds);
  }

  /**
   * Shortest orthogonal route from one cell to another over cells that are not
   * chips or keep-out, bounded by a visit cap. Wires may cross one another, so a
   * route exists whenever the endpoints share free space. Uses a generation
   * -stamped BFS on reused buffers with a head-pointer queue, so no allocation
   * or full-array reset happens per route on the hot re-routing path. Cells in
   * `blocked` are treated as walls for the duration of the search.
   */
  #routePath(
    source: CircuitPathPoint,
    sink: CircuitPathPoint,
    bounds: Rectangle,
    blocked: readonly CircuitPathPoint[] = [],
  ): CircuitTraceCell[] | undefined {
    const restore: Array<[index: number, value: number]> = [];
    for (const point of blocked) {
      if (point.x < 0 || point.x >= bounds.width || point.y < 0 || point.y >= bounds.height) continue;
      const index = point.y * bounds.width + point.x;
      restore.push([index, this.#occupancy[index]!]);
      this.#occupancy[index] = 1;
    }
    try {
      return this.#searchRoute(source, sink, bounds);
    } finally {
      for (const [index, value] of restore) this.#occupancy[index] = value;
    }
  }

  #searchRoute(source: CircuitPathPoint, sink: CircuitPathPoint, bounds: Rectangle): CircuitTraceCell[] | undefined {
    const { width, height } = bounds;
    const size = width * height;
    if (this.#routeSeen.length !== size) {
      this.#routeSeen = new Uint32Array(size);
      this.#routePrev = new Int32Array(size);
      this.#routeQueue = new Int32Array(size);
      this.#routeGeneration = 0;
    }
    const passable = (index: number): boolean => this.#occupancy[index] !== 1 && this.#keepOut[index] === 0;
    const sourceIndex = source.y * width + source.x;
    const sinkIndex = sink.y * width + sink.x;
    if (!passable(sourceIndex) || !passable(sinkIndex)) return undefined;

    const seen = this.#routeSeen;
    const previous = this.#routePrev;
    const queue = this.#routeQueue;
    const generation = ++this.#routeGeneration;
    const rotation = Math.floor(this.#random() * 4);
    let head = 0;
    let tail = 0;
    queue[tail++] = sourceIndex;
    seen[sourceIndex] = generation;
    previous[sourceIndex] = -1;
    let found = false;
    const visitCap = routeVisitCap(bounds);
    while (head < tail && head <= visitCap) {
      const index = queue[head++]!;
      if (index === sinkIndex) {
        found = true;
        break;
      }
      const x = index % width;
      const y = (index - x) / width;
      for (let turn = 0; turn < 4; turn += 1) {
        const direction = (turn + rotation) % 4;
        const nx = x + DIR_DX[direction]!;
        const ny = y + DIR_DY[direction]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbour = ny * width + nx;
        if (seen[neighbour] === generation || !passable(neighbour)) continue;
        seen[neighbour] = generation;
        previous[neighbour] = index;
        queue[tail++] = neighbour;
      }
    }
    if (!found) return undefined;
    const path: CircuitPathPoint[] = [];
    for (let index = sinkIndex; index !== -1; index = previous[index]!) {
      path.push({ x: index % width, y: Math.floor(index / width) });
    }
    path.reverse();
    if (path.length < 2) return undefined;
    return wirePathToCells(path);
  }

  /**
   * The opening circuit: a short chain of gates rooted on the generators. The
   * first gate combines the clocks, and every later seed gate reads an earlier
   * gate plus one more signal. Small, complete, and already satisfying the
   * invariant growth has to preserve. Without a generator there is no signal to
   * compute with, so the board stays bare rather than faking one.
   */
  #buildSeedCircuit(bounds: Rectangle): void {
    if (this.#oscillators.length === 0) return;
    for (let index = 0; index < SEED_GATE_COUNT; index += 1) {
      if (!this.#chipFitsBoard(bounds)) return;
      const previous = this.#chips[this.#chips.length - 1];
      const stage = previous ? previous.stage + 1 : 1;
      const spot = this.#findChipSpot(this.#stageColumn(stage, bounds), bounds, -1);
      if (!spot) return;
      const inputs: LogicRef[] = previous
        ? [{ kind: "chip", id: previous.id }]
        : [{ kind: "osc", id: this.#oscillators[0]!.id }];
      const extra = this.#pickDriver(spot.x, spot.y, inputs, () => false);
      if (extra) inputs.push(extra);
      this.#chips.push(this.#createChip(spot.x, spot.y, stage, inputs));
      this.#markChip(this.#chips.length - 1, 1);
    }
  }

  /**
   * One evolution step: grow the circuit by exactly one gate, either spliced
   * into an existing wire or appended to an existing output. Both moves leave
   * every pre-existing connection intact and give the new gate a full set of
   * drivers, so the board is a valid circuit before and after.
   */
  #growCircuit(bounds: Rectangle): boolean {
    if (this.#chips.length === 0) {
      const before = this.#chips.length;
      this.#buildSeedCircuit(bounds);
      if (this.#chips.length === before) return false;
      this.#connectIdleClocks();
      this.#wireOutputs();
      this.#logicChipCount = this.#chips.length;
      this.#wiresDirty = true;
      return true;
    }
    if (this.#chips.length >= this.#chipCeiling(bounds)) return false;
    const grown = this.#chips.length >= 2 && this.#random() < SPLICE_CHANCE
      ? this.#spliceGate(bounds) || this.#appendGate(bounds)
      : this.#appendGate(bounds);
    if (!grown) return false;
    this.#connectIdleClocks();
    this.#wireOutputs();
    this.#logicChipCount = this.#chips.length;
    this.#wiresDirty = true;
    return true;
  }

  /** Hangs a new gate off an existing output, one stage further right. */
  #appendGate(bounds: Rectangle): boolean {
    const driver = this.#chips[Math.floor(this.#random() * this.#chips.length)]!;
    if (!this.#chipFitsBoard(bounds)) return false;
    const stage = driver.stage + 1;
    // Sit just downstream of the gate being extended rather than in an abstract
    // stage band: chains then march rightward across the whole board instead of
    // piling into the first few columns.
    const spot = this.#findChipSpot(this.#downstreamColumn(driver, bounds), bounds, -1);
    if (!spot) return false;
    // Nothing consumes the new gate yet, so any driver is cycle-free by
    // construction; it only inherits, never feeds back.
    const inputs: LogicRef[] = [{ kind: "chip", id: driver.id }];
    const want = MIN_GATE_INPUTS + (this.#random() < 0.35 ? MAX_GATE_INPUTS - MIN_GATE_INPUTS : 0);
    while (inputs.length < want) {
      const extra = this.#pickDriver(spot.x, spot.y, inputs, () => false);
      if (!extra) break;
      inputs.push(extra);
    }
    this.#chips.push(this.#createChip(spot.x, spot.y, stage, inputs));
    this.#markChip(this.#chips.length - 1, 1);
    return true;
  }

  /**
   * Cuts an existing wire and drops a new gate into the gap: the old driver now
   * feeds the new gate, and the new gate feeds the pin the wire used to reach.
   * The consumer keeps exactly as many inputs as before, so nothing floats, and
   * the second driver is chosen from outside the consumer's fan-out so the
   * splice cannot close a combinational loop.
   */
  #spliceGate(bounds: Rectangle): boolean {
    const wires = this.#traces.filter((trace) =>
      trace.kind === "wire" && trace.consumerChipId !== undefined && isLogicRef(trace.driver)
    );
    if (wires.length === 0) return false;
    const wire = wires[Math.floor(this.#random() * wires.length)]!;
    const wireDriver = isLogicRef(wire.driver) ? wire.driver : undefined;
    const consumer = this.#chips.find((chip) => chip.id === wire.consumerChipId);
    if (!consumer || !wireDriver) return false;
    const slot = consumer.inputs.findIndex((input) => sameLogicRef(input, wireDriver));
    if (slot < 0) return false;
    if (!this.#chipFitsBoard(bounds)) return false;

    const driver = wireDriver;
    const driverStage = driver.kind === "chip" ? this.#chips.find((chip) => chip.id === driver.id)?.stage ?? 0 : 0;
    // Between the two gates it is being spliced between, where the wire it cuts
    // already ran.
    const driverChip = driver.kind === "chip" ? this.#chips.find((chip) => chip.id === driver.id) : undefined;
    const between = driverChip
      ? Math.round((driverChip.x + driverChip.width + consumer.x) / 2)
      : this.#downstreamColumn(undefined, bounds);
    const spot = this.#findChipSpot(between, bounds, -1);
    if (!spot) return false;

    const inputs: LogicRef[] = [wireDriver];
    const downstream = (chip: CircuitChip): boolean => chip.id === consumer.id || this.#dependsOn(chip.id, consumer.id);
    const extra = this.#pickDriver(spot.x, spot.y, inputs, downstream);
    if (extra) inputs.push(extra);

    const chip = this.#createChip(spot.x, spot.y, driverStage + 1, inputs);
    this.#chips.push(chip);
    this.#markChip(this.#chips.length - 1, 1);
    consumer.inputs[slot] = { kind: "chip", id: chip.id };
    consumer.stage = Math.max(consumer.stage, chip.stage + 1);
    return true;
  }

  /**
   * Picks one more driver for a node at `x,y`: any gate that `excluded` does not
   * veto, a clock, or a rail. Candidates are scored by distance with a penalty
   * for sitting to the right, so wiring prefers a nearby upstream node and the
   * board keeps reading left to right; one of the three best is taken at random
   * so equally good boards still differ.
   */
  #pickDriver(
    x: number,
    y: number,
    taken: readonly LogicRef[],
    excluded: (chip: CircuitChip) => boolean,
  ): LogicRef | undefined {
    const centerY = y + CHIP_HEIGHT / 2;
    const scored: Array<{ ref: LogicRef; score: number }> = [];
    const consider = (ref: LogicRef, anchorX: number, anchorY: number): void => {
      if (taken.some((entry) => sameLogicRef(entry, ref))) return;
      const penalty = anchorX >= x ? STAGE_PITCH * 4 : 0;
      scored.push({ ref, score: Math.abs(anchorX - x) + Math.abs(anchorY - centerY) + penalty });
    };
    for (const chip of this.#chips) {
      if (excluded(chip)) continue;
      consider({ kind: "chip", id: chip.id }, chip.x + chip.width, chip.y + chip.height / 2);
    }
    for (const oscillator of this.#oscillators) {
      consider({ kind: "osc", id: oscillator.id }, oscillator.x + SOURCE_LABEL_WIDTH, oscillator.y);
    }
    if (scored.length === 0) return undefined;
    scored.sort((a, b) => a.score - b.score);
    const pool = scored.slice(0, Math.min(3, scored.length));
    return pool[Math.floor(this.#random() * pool.length)]!.ref;
  }

  /** True when `chipId`'s input cone contains `targetId`, so feeding it back would loop. */
  #dependsOn(chipId: number, targetId: number): boolean {
    const seen = new Set<number>();
    const stack = [chipId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === targetId) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      const chip = this.#chips.find((candidate) => candidate.id === current);
      if (!chip) continue;
      for (const input of chip.inputs) {
        if (input.kind === "chip" && !seen.has(input.id)) stack.push(input.id);
      }
    }
    return false;
  }

  /** Chips the board may hold at this size before growth stops. */
  #chipCeiling(bounds: Rectangle): number {
    return clampInteger(
      Math.round((SEED_GATE_COUNT + (bounds.width * bounds.height) / CELLS_PER_CHIP) * this.#density),
      SEED_GATE_COUNT,
      MAX_BOARD_CHIPS,
    );
  }

  /** How long to wait before the next gate: short while the board is bare. */
  #growInterval(bounds: Rectangle): number {
    const fill = Math.min(1, this.#chips.length / Math.max(1, this.#chipCeiling(bounds)));
    return CIRCUIT_GROW_INTERVAL_MS * (EMPTY_BOARD_GROW_FACTOR + (1 - EMPTY_BOARD_GROW_FACTOR) * fill);
  }

  /** True while the board is big enough to seat one gate package. */
  #chipFitsBoard(bounds: Rectangle): boolean {
    return bounds.width - 2 * CHIP_MARGIN >= CHIP_WIDTH && bounds.height - 2 * CHIP_MARGIN >= CHIP_HEIGHT;
  }

  /**
   * Where a gate hanging off `driver` prefers to sit: one gap downstream of it,
   * wrapping back to the first band when that runs off the right edge so growth
   * keeps covering the board instead of stalling against the margin.
   */
  #downstreamColumn(driver: CircuitChip | undefined, bounds: Rectangle): number {
    const first = SOURCE_COLUMN_WIDTH + 1;
    if (!driver) return first;
    const next = driver.x + driver.width + CHIP_SPACING + 2;
    return next + CHIP_WIDTH + CHIP_MARGIN <= bounds.width ? next : first;
  }

  /** Left edge of the vertical band a gate of this depth prefers to sit in. */
  #stageColumn(stage: number, bounds: Rectangle): number {
    const first = SOURCE_COLUMN_WIDTH + 1;
    const usable = bounds.width - first - CHIP_WIDTH - CHIP_MARGIN;
    const bands = Math.max(1, Math.floor(usable / STAGE_PITCH) + 1);
    // Deep circuits wrap back to the first band rather than marching off-board.
    return first + (Math.max(0, stage - 1) % bands) * STAGE_PITCH;
  }

  /** Free spot for a chip, preferring its stage band and falling back to open board. */
  #findChipSpot(
    preferredX: number,
    bounds: Rectangle,
    ignoreChipIndex: number,
  ): CircuitPathPoint | undefined {
    // Gates keep two columns to their left: one for the input pins themselves and
    // one for the wires to turn into them from the west.
    const minX = Math.max(CHIP_MARGIN, INPUT_APPROACH_COLUMNS);
    const maxX = bounds.width - CHIP_WIDTH - CHIP_MARGIN;
    const maxY = bounds.height - CHIP_HEIGHT - CHIP_MARGIN;
    if (maxX < minX || maxY < CHIP_MARGIN) return undefined;
    const spanY = maxY - CHIP_MARGIN + 1;
    for (let attempt = 0; attempt < NEARBY_PLACE_ATTEMPTS; attempt += 1) {
      const jitter = Math.floor((this.#random() - 0.5) * STAGE_PITCH);
      const x = clampInteger(preferredX + jitter, minX, maxX);
      const y = CHIP_MARGIN + Math.floor(this.#random() * spanY);
      if (this.#chipFits(x, y, ignoreChipIndex)) return { x, y };
    }
    // The spot next to the driver is taken, so fall back to the emptiest part of
    // the board rather than squeezing in beside it. Sampling the whole board and
    // keeping the candidate furthest from any existing gate is what stops the
    // circuit bunching up in one corner and leaving the rest bare.
    let best: CircuitPathPoint | undefined;
    let bestClearance = -1;
    for (let attempt = 0; attempt < EMPTY_REGION_SAMPLES; attempt += 1) {
      const x = minX + Math.floor(this.#random() * (maxX - minX + 1));
      const y = CHIP_MARGIN + Math.floor(this.#random() * spanY);
      if (!this.#chipFits(x, y, ignoreChipIndex)) continue;
      const clearance = this.#nearestChipDistance(x, y, ignoreChipIndex);
      if (clearance <= bestClearance) continue;
      bestClearance = clearance;
      best = { x, y };
    }
    return best;
  }

  /** Distance from a candidate placement to the nearest other gate's centre. */
  #nearestChipDistance(x: number, y: number, ignoreChipIndex: number): number {
    let nearest = Infinity;
    for (let index = 0; index < this.#chips.length; index += 1) {
      if (index === ignoreChipIndex) continue;
      const other = this.#chips[index]!;
      const distance = Math.abs(other.x + other.width / 2 - (x + CHIP_WIDTH / 2)) +
        Math.abs(other.y + other.height / 2 - (y + CHIP_HEIGHT / 2));
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  /**
   * Pins the sources to the corners of the board: VCC top-left, GND bottom-right
   * and a CLK generator in each of the other two, so power spans the diagonal and
   * the clock arrives from both sides. A board with room for a third generator
   * gets it dead centre. Their cells are reserved so nothing else claims them.
   */
  #placeSources(bounds: Rectangle): void {
    const area = bounds.width * bounds.height;
    const corners = bounds.width >= 2 * SOURCE_LABEL_WIDTH + 4 && bounds.height >= 4;
    const right = Math.max(0, bounds.width - SOURCE_LABEL_WIDTH);
    const bottom = Math.max(0, bounds.height - 1);
    this.#power = this.#placeSourceNode(bounds, POWER_LABEL, 0, 0) ??
      { x: 0, y: 0, homeX: 0, homeY: 0, label: POWER_LABEL };
    if (corners) {
      this.#addOscillator(bounds, right, 0);
      this.#addOscillator(bounds, 0, bottom);
    } else if (area >= 400) {
      this.#addOscillator(bounds, 0, bottom);
    }
    // The odd generator out sits in the middle of the board rather than doubling
    // up a corner, so a large board is clocked from its centre as well as its edges.
    if (corners && area >= CENTER_CLOCK_CELLS && this.#oscillators.length < MAX_OSCILLATORS) {
      this.#addOscillator(
        bounds,
        Math.floor((bounds.width - SOURCE_LABEL_WIDTH) / 2),
        Math.floor(bounds.height / 2),
      );
    }
    this.#ground = this.#placeSourceNode(bounds, GROUND_LABEL, right, bottom) ??
      { x: right, y: bottom, homeX: right, homeY: bottom, label: GROUND_LABEL };
  }

  /**
   * Lays the indicator array across the top middle of the board: evenly spaced
   * lamps, each with two free columns to its left for its own input pin and the
   * turn into it. A board too narrow for the full row carries fewer lamps.
   */
  #placeLeds(bounds: Rectangle): void {
    const row = bounds.height > LED_ROW + 2 ? LED_ROW : 0;
    const usable = bounds.width - 2 * INPUT_APPROACH_COLUMNS;
    const count = clampInteger(Math.floor((usable + LED_SPACING - 1) / LED_SPACING), 0, LED_COUNT);
    if (count <= 0) return;
    const span = (count - 1) * LED_SPACING + 1;
    const start = Math.max(INPUT_APPROACH_COLUMNS, Math.floor((bounds.width - span) / 2));
    for (let index = 0; index < count; index += 1) {
      const x = start + index * LED_SPACING;
      if (x < 0 || x >= bounds.width) continue;
      const cell = row * bounds.width + x;
      if (this.#occupancy[cell] !== 0) continue;
      this.#occupancy[cell] = 1;
      this.#leds.push({ id: this.#nextLedId++, x, y: row, connected: false, state: false });
    }
  }

  /**
   * Gives every gate somewhere for its output to go and every lamp something to
   * show. A gate nothing listens to takes a free lamp when there is one, and
   * otherwise feeds the nearest gate downstream of it that has a spare input and
   * cannot loop back; a lamp nobody drives adopts the nearest gate's output.
   */
  #wireOutputs(): void {
    if (this.#chips.length === 0) return;
    const consumed = new Set<number>();
    for (const chip of this.#chips) {
      for (const input of chip.inputs) {
        if (input.kind === "chip") consumed.add(input.id);
      }
    }
    for (const led of this.#leds) {
      if (led.driver?.kind === "chip") consumed.add(led.driver.id);
    }

    for (const chip of this.#chips) {
      if (consumed.has(chip.id)) continue;
      const lamp = this.#leds.find((led) => led.driver === undefined);
      if (lamp) {
        lamp.driver = { kind: "chip", id: chip.id };
        consumed.add(chip.id);
        continue;
      }
      // No free lamp, so hand the output to a gate that cannot feed back into it.
      const sink = this.#chips
        .filter((other) =>
          other.id !== chip.id && other.inputs.length < MAX_GATE_FANIN && !this.#dependsOn(chip.id, other.id) &&
          !other.inputs.some((input) => input.kind === "chip" && input.id === chip.id)
        )
        .sort((a, b) => gateDistance(a, chip) - gateDistance(b, chip))[0];
      if (sink) {
        sink.inputs.push({ kind: "chip", id: chip.id });
        consumed.add(chip.id);
        continue;
      }
      // Every gate is full or would loop back, so take over a lamp whose signal
      // is already visible elsewhere. Nothing goes dark and the new gate drives
      // something, which is the invariant that matters.
      const reassignable = this.#reassignableLamp();
      if (!reassignable) continue;
      reassignable.driver = { kind: "chip", id: chip.id };
      reassignable.connected = false;
      reassignable.state = false;
      consumed.add(chip.id);
    }

    // Remaining lamps adopt the nearest gate that is not already on show, so the
    // array reads as eight signals rather than eight copies of one. With fewer
    // gates than lamps the cycle simply starts over.
    const shown = new Set<number>();
    for (const led of this.#leds) {
      if (led.driver?.kind === "chip") shown.add(led.driver.id);
    }
    for (const led of this.#leds) {
      if (led.driver !== undefined) continue;
      const ordered = this.#chips.slice().sort((a, b) => sourceDistance(a, led) - sourceDistance(b, led));
      if (ordered.length === 0) continue;
      if (ordered.every((chip) => shown.has(chip.id))) shown.clear();
      const driver = ordered.find((chip) => !shown.has(chip.id)) ?? ordered[0]!;
      led.driver = { kind: "chip", id: driver.id };
      shown.add(driver.id);
    }
  }

  /**
   * A lamp that can be handed to another gate without losing a signal: its
   * current driver is watched by a second lamp or feeds a gate, so re-pointing
   * this one leaves nothing unobserved.
   */
  #reassignableLamp(): CircuitLed | undefined {
    const lampCounts = new Map<number, number>();
    for (const led of this.#leds) {
      if (led.driver?.kind !== "chip") continue;
      lampCounts.set(led.driver.id, (lampCounts.get(led.driver.id) ?? 0) + 1);
    }
    const feedsGate = new Set<number>();
    for (const chip of this.#chips) {
      for (const input of chip.inputs) {
        if (input.kind === "chip") feedsGate.add(input.id);
      }
    }
    let fallback: CircuitLed | undefined;
    for (const led of this.#leds) {
      if (led.driver?.kind !== "chip") continue;
      if ((lampCounts.get(led.driver.id) ?? 0) > 1) return led;
      if (feedsGate.has(led.driver.id)) fallback ??= led;
    }
    return fallback;
  }

  /** Places one CLK generator at a target cell, if the board has room for it. */
  #addOscillator(bounds: Rectangle, targetX: number, targetY: number): void {
    const spot = this.#placeSourceNode(bounds, OSCILLATOR_LABEL, targetX, targetY);
    if (!spot) return;
    this.#oscillators.push({
      id: this.#nextOscId++,
      x: spot.x,
      y: spot.y,
      homeX: targetX,
      homeY: targetY,
      label: OSCILLATOR_LABEL,
      periodTicks: OSC_MIN_PERIOD_TICKS +
        Math.floor(this.#random() * (OSC_MAX_PERIOD_TICKS - OSC_MIN_PERIOD_TICKS + 1)),
      phase: Math.floor(this.#random() * OSC_MAX_PERIOD_TICKS),
      state: this.#random() < 0.5,
    });
  }

  /**
   * Reserves one 3-cell source label as close to a target cell as it fits,
   * searching outward row by row so a blocked corner slides inward rather than
   * dropping the source entirely.
   */
  #placeSourceNode(bounds: Rectangle, label: string, targetX: number, targetY: number): CircuitRail | undefined {
    const seat = this.#findSourceSeat(bounds, targetX, targetY);
    if (!seat) return undefined;
    this.#markSource(bounds, seat.x, seat.y, 1);
    return { x: seat.x, y: seat.y, homeX: targetX, homeY: targetY, label };
  }

  /** Nearest free 3-cell seat to a target, searched outward row by row. */
  #findSourceSeat(bounds: Rectangle, targetX: number, targetY: number): CircuitPathPoint | undefined {
    const maxX = Math.max(0, bounds.width - SOURCE_LABEL_WIDTH);
    for (let rowOffset = 0; rowOffset < bounds.height; rowOffset += 1) {
      const y = rowOffset % 2 === 0 ? targetY + (rowOffset >> 1) : targetY - ((rowOffset + 1) >> 1);
      if (y < 0 || y >= bounds.height) continue;
      for (let columnOffset = 0; columnOffset <= maxX; columnOffset += 1) {
        const x = columnOffset % 2 === 0 ? targetX + (columnOffset >> 1) : targetX - ((columnOffset + 1) >> 1);
        if (x < 0 || x > maxX) continue;
        if (this.#railFits(x, y, bounds)) return { x, y };
      }
    }
    return undefined;
  }

  /** Reserves or releases the cells one source label occupies. */
  #markSource(bounds: Rectangle, x: number, y: number, value: number): void {
    if (y < 0 || y >= bounds.height) return;
    for (let column = x; column < x + SOURCE_LABEL_WIDTH; column += 1) {
      if (column < 0 || column >= bounds.width) continue;
      this.#occupancy[y * bounds.width + column] = value;
    }
  }

  /**
   * Keeps the source nodes out of the windows. One covered by a keep-out zone
   * slides to the nearest free seat, and one that had to move earlier returns to
   * its corner as soon as the window releases it.
   */
  #reseatSources(bounds: Rectangle): boolean {
    let moved = false;
    const nodes: Array<CircuitRail | CircuitOscillator> = [
      ...(this.#power ? [this.#power] : []),
      ...(this.#ground ? [this.#ground] : []),
      ...this.#oscillators,
    ];
    for (const node of nodes) {
      const home = node.x === node.homeX && node.y === node.homeY;
      if (home && !this.#sourceCovered(bounds, node.x, node.y)) continue;
      this.#markSource(bounds, node.x, node.y, 0);
      const seat = this.#findSourceSeat(bounds, node.homeX, node.homeY);
      if (seat && (seat.x !== node.x || seat.y !== node.y)) {
        node.x = seat.x;
        node.y = seat.y;
        moved = true;
      }
      this.#markSource(bounds, node.x, node.y, 1);
    }
    return moved;
  }

  /** True while any cell of a source label sits inside a window keep-out zone. */
  #sourceCovered(bounds: Rectangle, x: number, y: number): boolean {
    if (y < 0 || y >= bounds.height) return false;
    for (let column = x; column < x + SOURCE_LABEL_WIDTH; column += 1) {
      if (column < 0 || column >= bounds.width) continue;
      if (this.#keepOut[y * bounds.width + column] !== 0) return true;
    }
    return false;
  }

  /** Applies the frame's obstacle list; tears down anything newly in a keep-out zone. */
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

    this.#activeObstacleIndex = undefined;
    const active = options.activeObstacle ? normalizeBounds(options.activeObstacle) : undefined;
    if (active) {
      const target: Rectangle = {
        column: active.column - bounds.column,
        row: active.row - bounds.row,
        width: active.width,
        height: active.height,
      };
      const index = local.findIndex((rectangle) => sameRect(rectangle, target));
      if (index >= 0) this.#activeObstacleIndex = index;
    }

    const key = local
      .map((rectangle) => `${rectangle.column},${rectangle.row},${rectangle.width},${rectangle.height}`)
      .join(";");
    if (key === this.#obstacleKey) return false;
    this.#obstacleKey = key;
    this.#obstacles = local;
    return this.#applyObstacleChange(bounds);
  }

  /** Rebuilds the keep-out mask, drops taps caught in it, and re-routes wires. */
  #applyObstacleChange(bounds: Rectangle): boolean {
    const { width, height } = bounds;
    if (this.#keepOut.length !== width * height) this.#keepOut = new Uint8Array(width * height);
    else this.#keepOut.fill(0);
    for (const rectangle of this.#obstacles) {
      const x0 = Math.max(0, rectangle.column - OBSTACLE_MARGIN);
      const y0 = Math.max(0, rectangle.row - OBSTACLE_MARGIN);
      const x1 = Math.min(width - 1, rectangle.column + rectangle.width - 1 + OBSTACLE_MARGIN);
      const y1 = Math.min(height - 1, rectangle.row + rectangle.height - 1 + OBSTACLE_MARGIN);
      for (let y = y0; y <= y1; y += 1) this.#keepOut.fill(1, y * width + x0, y * width + x1 + 1);
    }

    // A window changed shape, so every wire has to be re-routed to weave around
    // the new keep-out. Tap traces still recover in place when their route stays
    // clear, and are dropped for regrowth otherwise. The source nodes move out
    // of the way first, so the wires re-route to wherever they end up.
    this.#reseatSources(bounds);
    this.#wiresDirty = true;
    for (let index = this.#traces.length - 1; index >= 0; index -= 1) {
      const trace = this.#traces[index]!;
      if (trace.kind !== "tap") continue;
      const obstacleIndex = trace.obstacleRect
        ? this.#obstacles.findIndex((rectangle) => sameRect(rectangle, trace.obstacleRect!))
        : -1;
      if (obstacleIndex >= 0 && this.#tapRouteClear(trace, bounds)) {
        trace.obstacleIndex = obstacleIndex;
        continue;
      }
      this.#clearTraceOccupancy(trace, bounds);
      this.#traces.splice(index, 1);
    }

    for (const chip of this.#chips) {
      if (this.#chipHitsKeepOut(chip, bounds)) this.#enqueueJob({ kind: "relocate-chip", chipId: chip.id });
    }
    for (const rectangle of this.#obstacles) {
      const hasTap = this.#traces.some((trace) =>
        trace.kind === "tap" && trace.obstacleRect !== undefined && sameRect(trace.obstacleRect, rectangle)
      );
      if (!hasTap) this.#enqueueJob({ kind: "grow-taps", rect: { ...rectangle } });
    }
    return true;
  }

  /** Runs a bounded number of queued layout reactions so changes stagger deterministically. */
  #processLayoutJobs(bounds: Rectangle): boolean {
    let changed = false;
    for (let step = 0; step < LAYOUT_JOBS_PER_FRAME && this.#pendingJobs.length > 0; step += 1) {
      const job = this.#pendingJobs.shift()!;
      if (job.kind === "relocate-chip") {
        if (this.#relocateChip(job.chipId, bounds)) changed = true;
      } else {
        const obstacleIndex = this.#obstacles.findIndex((rectangle) => sameRect(rectangle, job.rect));
        if (obstacleIndex < 0) continue;
        const hasTap = this.#traces.some((trace) =>
          trace.kind === "tap" && trace.obstacleRect !== undefined && sameRect(trace.obstacleRect, job.rect)
        );
        if (!hasTap && this.#growTapsForObstacle(obstacleIndex, bounds)) changed = true;
      }
    }
    return changed;
  }

  #enqueueJob(job: CircuitLayoutJob): void {
    if (this.#pendingJobs.length >= MAX_PENDING_JOBS) return;
    for (const pending of this.#pendingJobs) {
      if (pending.kind !== job.kind) continue;
      if (job.kind === "grow-taps" && pending.kind === "grow-taps" && sameRect(pending.rect, job.rect)) return;
      if (job.kind === "relocate-chip" && pending.kind === "relocate-chip" && pending.chipId === job.chipId) return;
    }
    this.#pendingJobs.push(job);
  }

  /** Moves a chip caught inside a keep-out zone to free space, or despawns it. */
  #relocateChip(chipId: number, bounds: Rectangle): boolean {
    const chipIndex = this.#chips.findIndex((chip) => chip.id === chipId);
    if (chipIndex < 0) return false;
    const chip = this.#chips[chipIndex]!;
    if (!this.#chipHitsKeepOut(chip, bounds)) return false;

    const tapRects: Rectangle[] = [];
    for (let index = this.#traces.length - 1; index >= 0; index -= 1) {
      const trace = this.#traces[index]!;
      if (trace.chipIndex !== chipIndex) continue;
      if (trace.kind === "tap" && trace.obstacleRect) tapRects.push({ ...trace.obstacleRect });
      this.#clearTraceOccupancy(trace, bounds);
      this.#traces.splice(index, 1);
    }
    this.#markChip(chipIndex, 0);

    // Keep the gate in its own stage band when it can still fit there, so a
    // window shoving chips around does not scramble the left-to-right reading.
    const spot = this.#findChipSpot(this.#stageColumn(chip.stage, bounds), bounds, chipIndex);
    if (spot) {
      chip.x = spot.x;
      chip.y = spot.y;
      this.#markChip(chipIndex, 1);
    } else {
      this.#despawnChip(chipIndex, bounds);
    }
    // The chip moved or vanished, so its wires no longer connect; re-route all.
    this.#wiresDirty = true;
    for (const rectangle of tapRects) this.#enqueueJob({ kind: "grow-taps", rect: rectangle });
    return true;
  }

  /** Removes a chip that has nowhere to go; surviving trace indices are re-pointed. */
  #despawnChip(chipIndex: number, bounds: Rectangle): void {
    if (this.#chips[chipIndex]?.id === this.#selectedChipId) this.#selectedChipId = undefined;
    for (let index = this.#traces.length - 1; index >= 0; index -= 1) {
      const trace = this.#traces[index]!;
      if (trace.chipIndex === chipIndex) {
        this.#clearTraceOccupancy(trace, bounds);
        this.#traces.splice(index, 1);
      } else if (trace.chipIndex > chipIndex) {
        trace.chipIndex -= 1;
      }
    }
    this.#chips.splice(chipIndex, 1);
  }

  /** Grows the 1-3 deterministic tap traces owed to one window obstacle. */
  #growTapsForObstacle(obstacleIndex: number, bounds: Rectangle): boolean {
    const count = 1 + Math.floor(this.#random() * 3);
    let grown = false;
    for (let index = 0; index < count; index += 1) {
      if (this.#growTap(obstacleIndex, bounds)) grown = true;
    }
    return grown;
  }

  /**
   * Routes one tap from the nearest chip edge flush onto the window border via
   * a deterministic BFS over free cells: seeds are the free cells around the
   * chip perimeter, the goal is any free cell of the window's 1-cell margin
   * ring, and the trace terminates on the adjacent border cell with a via.
   */
  #growTap(obstacleIndex: number, bounds: Rectangle): boolean {
    const obstacle = this.#obstacles[obstacleIndex];
    if (!obstacle || this.#chips.length === 0) return false;
    const obstacleCenterX = obstacle.column + obstacle.width / 2;
    const obstacleCenterY = obstacle.row + obstacle.height / 2;
    let chipIndex = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < this.#chips.length; index += 1) {
      const candidate = this.#chips[index]!;
      const distance = Math.abs(candidate.x + candidate.width / 2 - obstacleCenterX) +
        Math.abs(candidate.y + candidate.height / 2 - obstacleCenterY);
      if (distance < bestDistance) {
        bestDistance = distance;
        chipIndex = index;
      }
    }
    if (chipIndex < 0) return false;
    const chip = this.#chips[chipIndex]!;
    const { width, height } = bounds;

    const inOwnRect = (x: number, y: number): boolean =>
      x >= obstacle.column && x <= obstacle.column + obstacle.width - 1 &&
      y >= obstacle.row && y <= obstacle.row + obstacle.height - 1;
    const inOwnRing = (x: number, y: number): boolean =>
      !inOwnRect(x, y) &&
      x >= obstacle.column - OBSTACLE_MARGIN && x <= obstacle.column + obstacle.width - 1 + OBSTACLE_MARGIN &&
      y >= obstacle.row - OBSTACLE_MARGIN && y <= obstacle.row + obstacle.height - 1 + OBSTACLE_MARGIN;

    const rotation = Math.floor(this.#random() * 4);
    const previous = new Int32Array(width * height).fill(-2);
    const queue: number[] = [];
    const trySeed = (x: number, y: number): void => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const index = y * width + x;
      if (previous[index] !== -2 || this.#occupancy[index] !== 0) return;
      if (this.#keepOut[index] !== 0 && !inOwnRing(x, y)) return;
      previous[index] = -1;
      queue.push(index);
    };
    for (let x = chip.x; x < chip.x + chip.width; x += 1) {
      trySeed(x, chip.y - 1);
      trySeed(x, chip.y + chip.height);
    }
    for (let y = chip.y; y < chip.y + chip.height; y += 1) {
      trySeed(chip.x - 1, y);
      trySeed(chip.x + chip.width, y);
    }

    let goal = -1;
    let viaIndex = -1;
    for (let head = 0; head < queue.length && goal < 0; head += 1) {
      const index = queue[head]!;
      const x = index % width;
      const y = Math.floor(index / width);
      if (inOwnRing(x, y)) {
        for (let turn = 0; turn < 4; turn += 1) {
          const direction = (turn + rotation) % 4;
          const nx = x + DIR_DX[direction]!;
          const ny = y + DIR_DY[direction]!;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || !inOwnRect(nx, ny)) continue;
          const neighborIndex = ny * width + nx;
          if (this.#occupancy[neighborIndex] !== 0) continue;
          goal = index;
          viaIndex = neighborIndex;
          break;
        }
        continue;
      }
      for (let turn = 0; turn < 4; turn += 1) {
        const direction = (turn + rotation) % 4;
        const nx = x + DIR_DX[direction]!;
        const ny = y + DIR_DY[direction]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighborIndex = ny * width + nx;
        if (previous[neighborIndex] !== -2 || this.#occupancy[neighborIndex] !== 0) continue;
        if (this.#keepOut[neighborIndex] !== 0 && !inOwnRing(nx, ny)) continue;
        previous[neighborIndex] = index;
        queue.push(neighborIndex);
      }
    }
    if (goal < 0 || viaIndex < 0) return false;

    const reversed: number[] = [];
    for (let index = goal; index !== -1; index = previous[index]!) reversed.push(index);
    const path: CircuitPathPoint[] = [];
    for (let index = reversed.length - 1; index >= 0; index -= 1) {
      const cellIndex = reversed[index]!;
      path.push({ x: cellIndex % width, y: Math.floor(cellIndex / width) });
    }
    path.push({ x: viaIndex % width, y: Math.floor(viaIndex / width) });
    if (path.length < 2) return false;

    for (const point of path) this.#occupancy[point.y * width + point.x] = 2;
    const cells = pathToTraceCells(path);
    const pulseCount = 2 + Math.floor(this.#random() * 3);
    const pulses: CircuitPulse[] = Array.from({ length: pulseCount }, () => ({
      index: Math.floor(this.#random() * cells.length),
      accumulator: 0,
    }));
    this.#traces.push({
      chipIndex,
      kind: "tap",
      // A tap carries the source gate's output onto the window border.
      driver: { kind: "chip", id: chip.id },
      obstacleIndex,
      obstacleRect: { ...obstacle },
      cells,
      pulses,
    });
    return true;
  }

  /** True while every non-terminal tap cell stays outside foreign keep-out zones. */
  #tapRouteClear(trace: CircuitTrace, bounds: Rectangle): boolean {
    const own = trace.obstacleRect;
    if (!own) return false;
    const { width } = bounds;
    for (const cell of trace.cells) {
      if (this.#keepOut[cell.y * width + cell.x] === 0) continue;
      if (
        cell.x >= own.column - OBSTACLE_MARGIN && cell.x <= own.column + own.width - 1 + OBSTACLE_MARGIN &&
        cell.y >= own.row - OBSTACLE_MARGIN && cell.y <= own.row + own.height - 1 + OBSTACLE_MARGIN
      ) continue;
      return false;
    }
    return true;
  }

  #chipHitsKeepOut(chip: CircuitChip, bounds: Rectangle): boolean {
    const { width, height } = bounds;
    for (let row = chip.y; row < chip.y + chip.height; row += 1) {
      if (row < 0 || row >= height) continue;
      for (let column = chip.x; column < chip.x + chip.width; column += 1) {
        if (column < 0 || column >= width) continue;
        if (this.#keepOut[row * width + column] !== 0) return true;
      }
    }
    return false;
  }

  #driftOneChip(bounds: Rectangle): boolean {
    if (this.#chips.length === 0) return false;
    const chipIndex = Math.floor(this.#random() * this.#chips.length);
    const chip = this.#chips[chipIndex]!;
    const direction = Math.floor(this.#random() * 4);

    // The chip's taps must regrow from its new position; its wires re-route.
    for (let index = this.#traces.length - 1; index >= 0; index -= 1) {
      const trace = this.#traces[index]!;
      if (trace.kind !== "tap" || trace.chipIndex !== chipIndex) continue;
      if (trace.obstacleRect) this.#enqueueJob({ kind: "grow-taps", rect: { ...trace.obstacleRect } });
      this.#clearTraceOccupancy(trace, bounds);
      this.#traces.splice(index, 1);
    }
    this.#markChip(chipIndex, 0);
    const nextX = chip.x + DIR_DX[direction]!;
    const nextY = chip.y + DIR_DY[direction]!;
    if (this.#chipFits(nextX, nextY, chipIndex)) {
      chip.x = nextX;
      chip.y = nextY;
    }
    this.#markChip(chipIndex, 1);
    this.#wiresDirty = true;
    return true;
  }

  #chipFits(x: number, y: number, ignoreChipIndex: number): boolean {
    const bounds = this.#bounds;
    if (!bounds) return false;
    // Every gate keeps two columns to its left, whether it was placed there or
    // drifted there: one for its input pins, one for wires to turn into them.
    if (
      x < Math.max(CHIP_MARGIN, INPUT_APPROACH_COLUMNS) || y < CHIP_MARGIN ||
      x + CHIP_WIDTH > bounds.width - CHIP_MARGIN || y + CHIP_HEIGHT > bounds.height - CHIP_MARGIN
    ) return false;
    for (let index = 0; index < this.#chips.length; index += 1) {
      if (index === ignoreChipIndex) continue;
      const other = this.#chips[index]!;
      if (
        x < other.x + other.width + CHIP_SPACING && other.x < x + CHIP_WIDTH + CHIP_SPACING &&
        y < other.y + other.height + CHIP_SPACING && other.y < y + CHIP_HEIGHT + CHIP_SPACING
      ) return false;
    }
    for (let row = y; row < y + CHIP_HEIGHT; row += 1) {
      for (let column = x; column < x + CHIP_WIDTH; column += 1) {
        const cellIndex = row * bounds.width + column;
        if (this.#occupancy[cellIndex] !== 0 || this.#keepOut[cellIndex] !== 0) return false;
      }
    }
    return true;
  }

  #markChip(chipIndex: number, value: number): void {
    const bounds = this.#bounds;
    const chip = this.#chips[chipIndex];
    if (!bounds || !chip) return;
    for (let row = chip.y; row < chip.y + chip.height; row += 1) {
      if (row < 0 || row >= bounds.height) continue;
      for (let column = chip.x; column < chip.x + chip.width; column += 1) {
        if (column < 0 || column >= bounds.width) continue;
        this.#occupancy[row * bounds.width + column] = value;
      }
    }
  }

  #clearTraceOccupancy(trace: CircuitTrace, bounds: Rectangle): void {
    for (const cell of trace.cells) {
      if (cell.x < 0 || cell.x >= bounds.width || cell.y < 0 || cell.y >= bounds.height) continue;
      this.#occupancy[cell.y * bounds.width + cell.x] = 0;
    }
  }

  #ensureCellBuffer(width: number, height: number): void {
    if (this.#cells.length === height && (this.#cells[0]?.length ?? -1) === width) {
      for (const row of this.#cells) row.fill(undefined);
      return;
    }
    this.#cells = Array.from(
      { length: height },
      () => new Array<ExomuxBackgroundCell | undefined>(width).fill(undefined),
    );
  }

  /** Builds one gate around a known input list, typed so its output actually moves. */
  #createChip(x: number, y: number, stage: number, inputs: readonly LogicRef[]): CircuitChip {
    const gate = this.#pickGateType();
    return {
      id: this.#nextChipId++,
      x,
      y,
      width: CHIP_WIDTH,
      height: CHIP_HEIGHT,
      label: gate,
      gate,
      inputs: [...inputs],
      stage,
      state: this.#random() < 0.5,
      nextState: false,
    };
  }

  /**
   * Picks a gate kind, preferring one the board is not already showing so the
   * population stays varied. Every input is a live signal now that the rails are
   * supply-only, so no kind can be pinned constant by its own wiring.
   */
  #pickGateType(): GateType {
    const shown = new Set(this.#chips.map((chip) => chip.gate));
    const fresh = GATE_TYPES.filter((gate) => !shown.has(gate));
    const choices = fresh.length > 0 ? fresh : GATE_TYPES;
    return choices[Math.floor(this.#random() * choices.length)]!;
  }

  #railFits(x: number, y: number, bounds: Rectangle): boolean {
    if (y < 0 || y >= bounds.height) return false;
    for (let column = x; column < x + SOURCE_LABEL_WIDTH; column += 1) {
      if (column < 0 || column >= bounds.width) return false;
      const cell = y * bounds.width + column;
      if (this.#occupancy[cell] !== 0 || this.#keepOut[cell] !== 0) return false;
    }
    return true;
  }

  /**
   * Restores the circuit invariant after the layout removed or moved a gate:
   * drops references to chips that no longer exist, refills any gate left short
   * of its minimum inputs, re-ties every cone to VCC, GND and CLK, and recomputes
   * the stage bands. Existing healthy wiring is left exactly as it was — growth
   * is the only thing that deliberately changes the netlist.
   */
  #repairCircuit(): void {
    const chips = this.#chips;
    this.#logicChipCount = chips.length;
    if (chips.length === 0) return;
    const chipIds = new Set(chips.map((chip) => chip.id));
    const oscIds = new Set(this.#oscillators.map((oscillator) => oscillator.id));
    for (const chip of chips) {
      const kept: LogicRef[] = [];
      for (const input of chip.inputs) {
        if (input.kind === "chip" && (!chipIds.has(input.id) || input.id === chip.id)) continue;
        if (input.kind === "osc" && !oscIds.has(input.id)) continue;
        if (kept.some((entry) => sameLogicRef(entry, input))) continue;
        kept.push(input);
      }
      chip.inputs = kept;
    }
    // A lamp whose gate despawned goes dark until `#wireOutputs` adopts another.
    for (const led of this.#leds) {
      if (led.driver?.kind === "chip" && !chipIds.has(led.driver.id)) {
        led.driver = undefined;
        led.connected = false;
        led.state = false;
      }
    }
    for (const chip of chips) {
      while (chip.inputs.length < MIN_GATE_INPUTS) {
        const extra = this.#pickDriver(
          chip.x,
          chip.y,
          chip.inputs,
          (other) => other.id === chip.id || this.#dependsOn(other.id, chip.id),
        );
        if (!extra) break;
        chip.inputs.push(extra);
      }
    }
    this.#connectIdleClocks();
    this.#wireOutputs();
    // A gate that lost every driver has nothing left to compute, so it goes
    // rather than lingering with a floating input pin.
    for (let index = this.#chips.length - 1; index >= 0; index -= 1) {
      if (this.#chips[index]!.inputs.length > 0) continue;
      this.#markChip(index, 0);
      this.#despawnChip(index, this.#bounds ?? { column: 0, row: 0, width: 0, height: 0 });
    }
    this.#logicChipCount = this.#chips.length;
    this.#restage();
  }

  /**
   * Which gates each generator reaches through the signal graph. Every gate must
   * be fed by one: the generators are the board's only free signals, so a gate
   * they cannot reach has nothing driving it. The rails are not consulted — they
   * are supply, not signal.
   */
  #clockReach(): Map<number, boolean> {
    const reach = new Map<number, boolean>();
    for (const chip of this.#chips) reach.set(chip.id, false);
    for (let pass = 0; pass <= this.#chips.length; pass += 1) {
      let changed = false;
      for (const chip of this.#chips) {
        if (reach.get(chip.id) === true) continue;
        for (const input of chip.inputs) {
          if (input.kind !== "osc" && reach.get(input.id) !== true) continue;
          reach.set(chip.id, true);
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
    return reach;
  }

  /** Counts gates that both rails physically run to. */
  #countSuppliedGates(): number {
    const powered = new Set<number>();
    const grounded = new Set<number>();
    for (const trace of this.#traces) {
      if (trace.kind !== "rail" || trace.consumerChipId === undefined) continue;
      if (trace.driver.kind === "power") powered.add(trace.consumerChipId);
      if (trace.driver.kind === "ground") grounded.add(trace.consumerChipId);
    }
    return this.#chips.reduce(
      (count, chip) => count + (powered.has(chip.id) && grounded.has(chip.id) ? 1 : 0),
      0,
    );
  }

  /** Recomputes each gate's depth from the sources; stages only ever deepen. */
  #restage(): void {
    for (const chip of this.#chips) chip.stage = 1;
    for (let pass = 0; pass < this.#chips.length; pass += 1) {
      let changed = false;
      for (const chip of this.#chips) {
        for (const input of chip.inputs) {
          if (input.kind !== "chip") continue;
          const driver = this.#chips.find((candidate) => candidate.id === input.id);
          if (!driver || driver.stage + 1 <= chip.stage) continue;
          chip.stage = driver.stage + 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  /**
   * Wires any generator nothing listens to into the nearest gate with a spare
   * input, so a corner or centre CLK never sits blinking on its own with no
   * trace leaving it.
   */
  #connectIdleClocks(): void {
    if (this.#chips.length === 0) return;
    for (const oscillator of this.#oscillators) {
      const ref: LogicRef = { kind: "osc", id: oscillator.id };
      if (this.#chips.some((chip) => chip.inputs.some((input) => sameLogicRef(input, ref)))) continue;
      const candidates = this.#chips
        .filter((chip) => chip.inputs.length < MAX_GATE_INPUTS)
        .sort((a, b) => sourceDistance(a, oscillator) - sourceDistance(b, oscillator));
      const gate = candidates[0];
      if (!gate) continue;
      gate.inputs.push(ref);
    }
  }

  /**
   * One synchronous logic step: gates read the previous tick's outputs (of other
   * gates and of the oscillators), then every output commits at once, and the
   * oscillators advance for the next tick. Reading previous state everywhere is
   * what lets feedback loops oscillate rather than race.
   */
  #tickLogic(): boolean {
    const chips = this.#chips;
    if (chips.length === 0) return false;
    const chipById = new Map<number, CircuitChip>();
    for (const chip of chips) chipById.set(chip.id, chip);
    const oscById = new Map<number, CircuitOscillator>();
    for (const oscillator of this.#oscillators) oscById.set(oscillator.id, oscillator);
    for (const chip of chips) {
      let high = 0;
      let total = 0;
      for (const input of chip.inputs) {
        total += 1;
        const live = input.kind === "osc" ? oscById.get(input.id)?.state : chipById.get(input.id)?.state;
        if (live) high += 1;
      }
      chip.nextState = evaluateGate(chip.gate, high, total);
    }
    // Lamps read the same previous-tick state the gates do, so the array shows
    // one coherent snapshot of the board rather than a half-updated one.
    let changed = false;
    for (const led of this.#leds) {
      // No complete path, no current: an unwired lamp cannot light.
      const next = led.connected && led.driver !== undefined && this.#driverState(led.driver);
      if (next !== led.state) changed = true;
      led.state = next;
    }
    for (const chip of chips) {
      if (chip.nextState !== chip.state) changed = true;
      chip.state = chip.nextState;
    }
    // Advance the free-running generators for the next tick.
    for (const oscillator of this.#oscillators) {
      oscillator.phase += 1;
      if (oscillator.phase >= oscillator.periodTicks) {
        oscillator.phase = 0;
        oscillator.state = !oscillator.state;
        changed = true;
      }
    }
    return changed;
  }

  #random(): number {
    this.#randomState = (Math.imul(this.#randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this.#randomState / 0x1_0000_0000;
  }
}

/** Identity of the net a trace belongs to; traces sharing one are electrically joined. */
function circuitNetKey(driver: CircuitDriver): string {
  return driver.kind === "chip" || driver.kind === "osc" ? `${driver.kind}:${driver.id}` : driver.kind;
}

/** Narrows a trace driver to a logic signal; the rails are supply, not signal. */
function isLogicRef(driver: CircuitDriver): driver is LogicRef {
  return driver.kind === "chip" || driver.kind === "osc";
}

/** True when two logic references name the same driver. */
function sameLogicRef(a: LogicRef, b: LogicRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "chip" && b.kind === "chip") return a.id === b.id;
  if (a.kind === "osc" && b.kind === "osc") return a.id === b.id;
  return true;
}

/** Manhattan distance from a gate's centre to a source or lamp. */
function sourceDistance(chip: CircuitChip, node: { x: number; y: number }): number {
  return Math.abs(chip.x + chip.width / 2 - node.x) + Math.abs(chip.y + chip.height / 2 - node.y);
}

/** Manhattan distance between two gate centres, penalising a sink to the west. */
function gateDistance(sink: CircuitChip, driver: CircuitChip): number {
  const westward = sink.x < driver.x ? STAGE_PITCH * 4 : 0;
  return Math.abs(sink.x - driver.x) + Math.abs(sink.y - driver.y) + westward;
}

function samePoint(a: CircuitPathPoint, b: CircuitPathPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function adjacent(a: CircuitPathPoint, b: CircuitPathPoint): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** Evaluates one gate from the count of high inputs out of the total wired. */
function evaluateGate(gate: GateType, high: number, total: number): boolean {
  if (total === 0) return false;
  switch (gate) {
    case "AND":
      return high === total;
    case "OR":
      return high > 0;
    case "NAND":
      return high !== total;
    case "NOR":
      return high === 0;
    case "XOR":
      return (high & 1) === 1;
    case "XNOR":
      return (high & 1) === 0;
  }
}

/** Converts a routed wire path to drawn cells, with line glyphs at both ends. */
function wirePathToCells(path: readonly CircuitPathPoint[]): CircuitTraceCell[] {
  const cells: CircuitTraceCell[] = [];
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]!;
    const arrival = index === 0 ? pathDirection(path[0]!, path[1]!) : pathDirection(path[index - 1]!, point);
    const exit = index === path.length - 1 ? arrival : pathDirection(point, path[index + 1]!);
    cells.push({ x: point.x, y: point.y, glyph: TRACE_GLYPHS[arrival * 4 + exit]! });
  }
  return cells;
}

function pathToTraceCells(path: readonly CircuitPathPoint[]): CircuitTraceCell[] {
  const cells: CircuitTraceCell[] = [];
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]!;
    const arrival = index === 0 ? pathDirection(path[0]!, path[1]!) : pathDirection(path[index - 1]!, point);
    const lastCell = index === path.length - 1;
    const exit = lastCell ? arrival : pathDirection(point, path[index + 1]!);
    const glyph = lastCell ? VIA_GLYPH : TRACE_GLYPHS[arrival * 4 + exit]!;
    cells.push({ x: point.x, y: point.y, glyph });
  }
  return cells;
}

function pathDirection(from: CircuitPathPoint, to: CircuitPathPoint): number {
  if (to.y < from.y) return 0;
  if (to.x > from.x) return 1;
  if (to.y > from.y) return 2;
  return 3;
}

function sameRect(a: Rectangle, b: Rectangle): boolean {
  return a.column === b.column && a.row === b.row && a.width === b.width && a.height === b.height;
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

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(finite(value, minimum))));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
