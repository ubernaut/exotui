// Copyright 2023 Im-Beast. MIT license.

// REM-008: presentation quality adapts, logical layout NEVER does. The
// quality ladder orders presentation-only levels (frame rate, color
// depth, compression, optional graphics — no columns, no rows, no layout
// field exists in the type); measured latency/bandwidth samples drive a
// HYSTERETIC controller that degrades after N consecutive bad samples
// and upgrades only after a longer run of good ones, so quality never
// flaps. Host-set floors clamp adaptation from below, every transition
// is journaled with its reason, and the whole state is inspectable.

/** Color depths presentation can degrade through. */
export type QualityColorDepth = "truecolor" | "ansi256" | "ansi16";

/** One presentation-only quality level. There is no layout field. */
export interface QualityLevel {
  readonly name: string;
  readonly frameRate: number;
  readonly colorDepth: QualityColorDepth;
  readonly compression: "none" | "rle";
  readonly graphics: boolean;
}

/** Best-to-worst default ladder. */
export const DEFAULT_QUALITY_LADDER: readonly QualityLevel[] = [
  { name: "full", frameRate: 30, colorDepth: "truecolor", compression: "none", graphics: true },
  { name: "smooth", frameRate: 30, colorDepth: "truecolor", compression: "rle", graphics: true },
  { name: "lean", frameRate: 15, colorDepth: "ansi256", compression: "rle", graphics: true },
  { name: "thin", frameRate: 10, colorDepth: "ansi256", compression: "rle", graphics: false },
  { name: "minimal", frameRate: 5, colorDepth: "ansi16", compression: "rle", graphics: false },
];

/** Host-set quality floors adaptation may never cross. */
export interface QualityFloors {
  readonly minFrameRate?: number;
  readonly minColorDepth?: QualityColorDepth;
}

/** One link measurement. */
export interface LinkSample {
  readonly latencyMs: number;
  readonly bandwidthKbps: number;
}

/** One journaled transition. */
export interface QualityTransition {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly atMs: number;
}

/** Controller options. */
export interface AdaptiveQualityOptions {
  readonly ladder?: readonly QualityLevel[];
  readonly floors?: QualityFloors;
  /** Consecutive bad samples before degrading (default 3). */
  readonly degradeAfter?: number;
  /** Consecutive good samples before upgrading (default 8 — sticky). */
  readonly upgradeAfter?: number;
  /** A sample is bad above this latency (default 250ms). */
  readonly badLatencyMs?: number;
  /** A sample is bad below this bandwidth (default 256kbps). */
  readonly badBandwidthKbps?: number;
}

const DEPTH_RANK: Readonly<Record<QualityColorDepth, number>> = { ansi16: 0, ansi256: 1, truecolor: 2 };

/** The adaptive quality controller. */
export class AdaptiveQualityController {
  readonly #ladder: readonly QualityLevel[];
  readonly #floorIndex: number;
  readonly #degradeAfter: number;
  readonly #upgradeAfter: number;
  readonly #badLatencyMs: number;
  readonly #badBandwidthKbps: number;
  readonly #transitions: QualityTransition[] = [];
  #index = 0;
  #badStreak = 0;
  #goodStreak = 0;

  constructor(options: AdaptiveQualityOptions = {}) {
    this.#ladder = options.ladder ?? DEFAULT_QUALITY_LADDER;
    this.#degradeAfter = Math.max(1, options.degradeAfter ?? 3);
    this.#upgradeAfter = Math.max(this.#degradeAfter + 1, options.upgradeAfter ?? 8);
    this.#badLatencyMs = options.badLatencyMs ?? 250;
    this.#badBandwidthKbps = options.badBandwidthKbps ?? 256;
    // The floor is the worst ladder index still satisfying the host floors.
    const floors = options.floors ?? {};
    let floorIndex = this.#ladder.length - 1;
    while (floorIndex > 0) {
      const level = this.#ladder[floorIndex]!;
      const frameOk = floors.minFrameRate === undefined || level.frameRate >= floors.minFrameRate;
      const depthOk = floors.minColorDepth === undefined ||
        DEPTH_RANK[level.colorDepth] >= DEPTH_RANK[floors.minColorDepth];
      if (frameOk && depthOk) break;
      floorIndex -= 1;
    }
    this.#floorIndex = floorIndex;
  }

  /** The active presentation level. */
  level(): QualityLevel {
    return this.#ladder[this.#index]!;
  }

  /** Feeds one measurement; returns the (possibly unchanged) level. */
  report(sample: LinkSample, nowMs: number): QualityLevel {
    const bad = sample.latencyMs > this.#badLatencyMs || sample.bandwidthKbps < this.#badBandwidthKbps;
    if (bad) {
      this.#badStreak += 1;
      this.#goodStreak = 0;
      if (this.#badStreak >= this.#degradeAfter && this.#index < this.#floorIndex) {
        this.#move(this.#index + 1, `degraded after ${this.#badStreak} bad samples`, nowMs);
        this.#badStreak = 0;
      }
    } else {
      this.#goodStreak += 1;
      this.#badStreak = 0;
      if (this.#goodStreak >= this.#upgradeAfter && this.#index > 0) {
        this.#move(this.#index - 1, `upgraded after ${this.#goodStreak} good samples`, nowMs);
        this.#goodStreak = 0;
      }
    }
    return this.level();
  }

  /** Full inspectable state. */
  inspect(): {
    level: QualityLevel;
    floor: QualityLevel;
    badStreak: number;
    goodStreak: number;
    transitions: readonly QualityTransition[];
  } {
    return {
      level: this.level(),
      floor: this.#ladder[this.#floorIndex]!,
      badStreak: this.#badStreak,
      goodStreak: this.#goodStreak,
      transitions: [...this.#transitions],
    };
  }

  #move(index: number, reason: string, atMs: number): void {
    const from = this.level().name;
    this.#index = index;
    if (this.#transitions.length >= 64) this.#transitions.shift();
    this.#transitions.push({ from, to: this.level().name, reason, atMs });
  }
}

/** Creates an adaptive quality controller. */
export function createAdaptiveQualityController(options: AdaptiveQualityOptions = {}): AdaptiveQualityController {
  return new AdaptiveQualityController(options);
}
