// Copyright 2023 Im-Beast. MIT license.

// PER-006: frame cadence is DEMAND-DRIVEN on the caller's clock. The
// controller schedules a next frame only when dirty work exists — a
// clean controller returns undefined and the host schedules NOTHING, so
// idle means idle, no polling. Input-triggered dirt renders as soon as
// the fps cap allows and always within the configured input-latency
// floor (sink pressure and background state may stretch ordinary
// cadence, but never past that floor); non-input dirt coalesces to the
// fps cap; background state slows to its own interval. Every decision
// is a pure function of recorded marks, so the synthetic-workload test
// drives the whole policy on virtual time.

/** Cadence configuration. */
export interface FrameCadenceOptions {
  /** Minimum interval between frames (fps cap), default 16ms. */
  readonly minFrameIntervalMs?: number;
  /** Input must be reflected within this, default 50ms. */
  readonly maxInputLatencyMs?: number;
  /** Interval while backgrounded, default 1000ms. */
  readonly backgroundIntervalMs?: number;
  /** Ordinary-cadence multiplier under sink pressure, default 4. */
  readonly pressureFactor?: number;
}

/** The cadence controller. */
export class FrameCadenceController {
  readonly #minInterval: number;
  readonly #inputFloor: number;
  readonly #backgroundInterval: number;
  readonly #pressureFactor: number;
  #lastFrameAt = -Infinity;
  #dirtyAt?: number;
  #inputAt?: number;
  #background = false;
  #pressure = false;

  constructor(options: FrameCadenceOptions = {}) {
    this.#minInterval = Math.max(1, options.minFrameIntervalMs ?? 16);
    this.#inputFloor = Math.max(this.#minInterval, options.maxInputLatencyMs ?? 50);
    this.#backgroundInterval = Math.max(this.#minInterval, options.backgroundIntervalMs ?? 1000);
    this.#pressureFactor = Math.max(1, options.pressureFactor ?? 4);
  }

  /** Non-input dirty work appeared. */
  markDirty(nowMs: number): void {
    this.#dirtyAt ??= nowMs;
  }

  /** Input arrived (implies dirty). */
  markInput(nowMs: number): void {
    this.#dirtyAt ??= nowMs;
    this.#inputAt ??= nowMs;
  }

  setBackground(background: boolean): void {
    this.#background = background;
  }

  setSinkPressure(pressure: boolean): void {
    this.#pressure = pressure;
  }

  /** A frame rendered: the controller is clean again. */
  frameRendered(nowMs: number): void {
    this.#lastFrameAt = nowMs;
    this.#dirtyAt = undefined;
    this.#inputAt = undefined;
  }

  /**
   * When should the next frame render? undefined = nothing dirty — the
   * host schedules nothing at all (idle without polling).
   */
  nextFrameAt(): number | undefined {
    if (this.#dirtyAt === undefined) return undefined;
    const fpsGate = this.#lastFrameAt + this.#minInterval;
    if (this.#inputAt !== undefined) {
      // Input: as soon as the cap allows, hard-bounded by the floor —
      // pressure and background may not stretch past it.
      return Math.min(Math.max(this.#dirtyAt, fpsGate), this.#inputAt + this.#inputFloor);
    }
    const interval = this.#background
      ? this.#backgroundInterval
      : this.#pressure
      ? this.#minInterval * this.#pressureFactor
      : this.#minInterval;
    return Math.max(this.#dirtyAt, this.#lastFrameAt + interval);
  }

  inspect(): { dirty: boolean; pendingInput: boolean; background: boolean; pressure: boolean } {
    return {
      dirty: this.#dirtyAt !== undefined,
      pendingInput: this.#inputAt !== undefined,
      background: this.#background,
      pressure: this.#pressure,
    };
  }
}

/** Creates a frame cadence controller. */
export function createFrameCadenceController(options: FrameCadenceOptions = {}): FrameCadenceController {
  return new FrameCadenceController(options);
}
