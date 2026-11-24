// Copyright 2023 Im-Beast. MIT license.

/** Public interface describing a render Loop Frame. */
export interface RenderLoopFrame {
  frame: number;
  startedAt: number;
  deltaMs: number;
}

/** Serializable inspection snapshot for render Loop. */
export interface RenderLoopInspection {
  running: boolean;
  frame: number;
  intervalMs: number;
  frameBudgetMs: number;
  lastStartedAt?: number;
  lastDurationMs?: number;
  averageDurationMs: number;
  maxDurationMs: number;
  overBudgetFrames: number;
  lastError?: unknown;
}

/** Public interface describing a render Loop Timer. */
export interface RenderLoopTimer {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/** Options for configuring render Loop. */
export interface RenderLoopOptions {
  intervalMs?: number;
  immediate?: boolean;
  timer?: RenderLoopTimer;
  onError?: (error: unknown) => void;
  tick: (frame: RenderLoopFrame) => void;
}

/** Serializable inspection snapshot for a microtask scheduler. */
export interface MicrotaskSchedulerInspection {
  scheduled: boolean;
  flushed: number;
  cancelled: number;
}

/** Options for coalescing multiple UI invalidations into one microtask. */
export interface MicrotaskSchedulerOptions {
  queueMicrotask?: (callback: () => void) => void;
  onError?: (error: unknown) => void;
}

/** Serializable inspection snapshot for a throttled frame scheduler. */
export interface FrameSchedulerInspection {
  scheduled: boolean;
  flushed: number;
  cancelled: number;
  intervalMs: number;
  lastFlushAt?: number;
}

/** Options for coalescing UI invalidations behind a minimum frame interval. */
export interface FrameSchedulerOptions {
  intervalMs?: number;
  timer?: RenderLoopTimer;
  onError?: (error: unknown) => void;
}

/** Returns the next frame delay after accounting for time already spent rendering the current frame. */
export function nextFrameDelay(intervalMs: number, frameStartedAt: number, now: number): number {
  const interval = Math.max(0, intervalMs);
  const elapsed = Math.max(0, now - frameStartedAt);
  return Math.max(0, interval - elapsed);
}

/** Coalesces repeated scheduling requests into one pending microtask. */
export class MicrotaskScheduler {
  readonly #queueMicrotask: (callback: () => void) => void;
  readonly #onError?: (error: unknown) => void;
  #scheduled = false;
  #callback: (() => void) | undefined;
  #flushed = 0;
  #cancelled = 0;

  constructor(options: MicrotaskSchedulerOptions = {}) {
    this.#queueMicrotask = options.queueMicrotask ?? queueMicrotask;
    this.#onError = options.onError;
  }

  get scheduled(): boolean {
    return this.#scheduled;
  }

  schedule(callback: () => void): boolean {
    this.#callback = callback;
    if (this.#scheduled) return false;
    this.#scheduled = true;
    this.#queueMicrotask(() => this.#flush());
    return true;
  }

  flush(): boolean {
    if (!this.#scheduled) return false;
    this.#flush();
    return true;
  }

  cancel(): boolean {
    if (!this.#scheduled) return false;
    this.#scheduled = false;
    this.#callback = undefined;
    this.#cancelled += 1;
    return true;
  }

  inspect(): MicrotaskSchedulerInspection {
    return {
      scheduled: this.#scheduled,
      flushed: this.#flushed,
      cancelled: this.#cancelled,
    };
  }

  #flush(): void {
    if (!this.#scheduled) return;
    const callback = this.#callback;
    this.#scheduled = false;
    this.#callback = undefined;
    this.#flushed += 1;
    try {
      callback?.();
    } catch (error) {
      this.#onError?.(error);
      if (!this.#onError) throw error;
    }
  }
}

/** Coalesces repeated UI invalidations and flushes them no faster than the configured frame interval. */
export class FrameScheduler {
  readonly #timer: RenderLoopTimer;
  readonly #onError?: (error: unknown) => void;
  readonly #intervalMs: number;
  #scheduled = false;
  #callback: (() => void) | undefined;
  #handle: unknown;
  #lastFlushAt: number | undefined;
  #flushed = 0;
  #cancelled = 0;

  constructor(options: FrameSchedulerOptions = {}) {
    this.#timer = options.timer ?? {
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      now: () => performance.now(),
    };
    this.#intervalMs = Math.max(0, options.intervalMs ?? 1000 / 30);
    this.#onError = options.onError;
  }

  get scheduled(): boolean {
    return this.#scheduled;
  }

  schedule(callback: () => void): boolean {
    this.#callback = callback;
    if (this.#scheduled) return false;
    this.#scheduled = true;

    const now = this.#timer.now();
    const delay = this.#lastFlushAt === undefined ? 0 : Math.max(0, this.#intervalMs - (now - this.#lastFlushAt));
    this.#handle = this.#timer.setTimeout(() => this.#flush(), delay);
    return true;
  }

  flush(): boolean {
    if (!this.#scheduled) return false;
    if (this.#handle !== undefined) {
      this.#timer.clearTimeout(this.#handle);
      this.#handle = undefined;
    }
    this.#flush();
    return true;
  }

  cancel(): boolean {
    if (!this.#scheduled) return false;
    this.#scheduled = false;
    this.#callback = undefined;
    if (this.#handle !== undefined) {
      this.#timer.clearTimeout(this.#handle);
      this.#handle = undefined;
    }
    this.#cancelled += 1;
    return true;
  }

  inspect(): FrameSchedulerInspection {
    return {
      scheduled: this.#scheduled,
      flushed: this.#flushed,
      cancelled: this.#cancelled,
      intervalMs: this.#intervalMs,
      lastFlushAt: this.#lastFlushAt,
    };
  }

  #flush(): void {
    if (!this.#scheduled) return;
    const callback = this.#callback;
    this.#scheduled = false;
    this.#callback = undefined;
    this.#handle = undefined;
    this.#flushed += 1;
    try {
      callback?.();
    } catch (error) {
      this.#onError?.(error);
      if (!this.#onError) throw error;
    } finally {
      this.#lastFlushAt = this.#timer.now();
    }
  }
}

/** Small start/stop render loop with injectable timers for terminal apps and tests. */
export class RenderLoop {
  readonly #tick: (frame: RenderLoopFrame) => void;
  readonly #timer: RenderLoopTimer;
  readonly #immediate: boolean;
  readonly #onError?: (error: unknown) => void;
  #intervalMs: number;
  #handle: unknown;
  #scheduledForAt: number | undefined;
  #pendingMinDelayMs = 0;
  #running = false;
  #frame = 0;
  #lastStartedAt: number | undefined;
  #lastDurationMs: number | undefined;
  #totalDurationMs = 0;
  #maxDurationMs = 0;
  #overBudgetFrames = 0;
  #lastError: unknown;

  constructor(options: RenderLoopOptions) {
    this.#tick = options.tick;
    this.#timer = options.timer ?? defaultRenderLoopTimer;
    this.#intervalMs = Math.max(0, options.intervalMs ?? 1000 / 60);
    this.#immediate = options.immediate ?? true;
    this.#onError = options.onError;
  }

  get running(): boolean {
    return this.#running;
  }

  get frame(): number {
    return this.#frame;
  }

  get intervalMs(): number {
    return this.#intervalMs;
  }

  set intervalMs(value: number) {
    this.#intervalMs = Math.max(0, value);
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    if (this.#immediate) {
      this.#run();
    } else {
      this.#schedule();
    }
  }

  stop(): void {
    if (this.#handle !== undefined) {
      this.#timer.clearTimeout(this.#handle);
      this.#handle = undefined;
    }
    this.#scheduledForAt = undefined;
    this.#pendingMinDelayMs = 0;
    this.#running = false;
  }

  /**
   * Pulls the next scheduled tick forward to fire within `maxDelayMs` (for
   * example, keeping interactive input snappy when output cadence is lowered).
   * Returns `true` when the pending timer was rescheduled earlier.
   */
  requestSoon(maxDelayMs = 16): boolean {
    if (!this.#running || this.#handle === undefined || this.#scheduledForAt === undefined) return false;
    const now = this.#timer.now();
    const targetDelay = Math.max(0, maxDelayMs);
    const targetAt = now + targetDelay;
    if (this.#scheduledForAt <= targetAt) return false;
    this.#timer.clearTimeout(this.#handle);
    this.#handle = undefined;
    this.#schedule(targetDelay);
    return true;
  }

  /**
   * Ensures the next scheduled frame waits at least `minDelayMs` (used to back
   * off gently after a degraded or saturated flush instead of immediately
   * retrying a full repaint).
   */
  deferNext(minDelayMs: number): void {
    const delay = Math.max(0, minDelayMs);
    if (delay > this.#pendingMinDelayMs) this.#pendingMinDelayMs = delay;
  }

  step(): void {
    this.#invokeTick();
  }

  inspect(): RenderLoopInspection {
    return {
      running: this.#running,
      frame: this.#frame,
      intervalMs: this.#intervalMs,
      frameBudgetMs: this.#intervalMs,
      lastStartedAt: this.#lastStartedAt,
      lastDurationMs: this.#lastDurationMs,
      averageDurationMs: this.#frame === 0 ? 0 : this.#totalDurationMs / this.#frame,
      maxDurationMs: this.#maxDurationMs,
      overBudgetFrames: this.#overBudgetFrames,
      lastError: this.#lastError,
    };
  }

  #run(): void {
    if (!this.#running) return;
    this.#handle = undefined;
    this.#scheduledForAt = undefined;
    try {
      this.#invokeTick();
      const frameStartedAt = this.#lastStartedAt ?? this.#timer.now();
      const baseDelay = nextFrameDelay(this.#intervalMs, frameStartedAt, this.#timer.now());
      const delay = Math.max(baseDelay, this.#pendingMinDelayMs);
      this.#pendingMinDelayMs = 0;
      this.#schedule(delay);
    } catch (error) {
      this.#lastError = error;
      this.#onError?.(error);
      this.stop();
    }
  }

  #invokeTick(): void {
    const startedAt = this.#timer.now();
    const deltaMs = this.#lastStartedAt === undefined ? 0 : startedAt - this.#lastStartedAt;
    this.#lastStartedAt = startedAt;
    this.#frame += 1;
    this.#tick({ frame: this.#frame, startedAt, deltaMs });
    const duration = Math.max(0, this.#timer.now() - startedAt);
    this.#lastDurationMs = duration;
    this.#totalDurationMs += duration;
    this.#maxDurationMs = Math.max(this.#maxDurationMs, duration);
    if (duration > this.#intervalMs) this.#overBudgetFrames += 1;
  }

  #schedule(delay = this.#intervalMs): void {
    if (!this.#running) return;
    const clamped = Math.max(0, delay);
    this.#scheduledForAt = this.#timer.now() + clamped;
    this.#handle = this.#timer.setTimeout(() => this.#run(), clamped);
  }
}

/** Creates an render Loop. */
export function createRenderLoop(options: RenderLoopOptions): RenderLoop {
  return new RenderLoop(options);
}

/** Public constant for a default Render Loop Timer. */
export const defaultRenderLoopTimer: RenderLoopTimer = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => performance.now(),
};
