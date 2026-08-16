// Copyright 2023 Im-Beast. MIT license.

// C1: a bounded, renderer-neutral transition/timeline API for numeric, color,
// and offset-like style values. Deterministic by construction: the caller
// advances time explicitly (a RenderLoop tick, a test clock) — the timeline
// owns no timers, so identical advance sequences produce identical values.

/** Interpolatable values: scalars and fixed-length numeric tuples (colors, offsets). */
export type TimelineValue = number | readonly number[];

/** Easing name or a custom curve mapping [0,1] to [0,1]. */
export type TimelineEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | ((t: number) => number);

/** Options for one tween track. */
export interface TimelineTweenOptions<T extends TimelineValue> {
  readonly from: T;
  readonly to: T;
  readonly durationMs: number;
  readonly delayMs?: number;
  readonly easing?: TimelineEasing;
  /** Extra plays after the first (Infinity allowed); default 0. */
  readonly repeat?: number;
  /** Reverse direction on every other play. */
  readonly alternate?: boolean;
  readonly onUpdate: (value: T, progress: number) => void;
  readonly onComplete?: () => void;
}

/** Handle to one running tween. */
export interface TimelineTween {
  readonly id: number;
  readonly done: boolean;
  cancel(): void;
}

/** Bounded inspection of a timeline's state. */
export interface TimelineInspection {
  readonly active: number;
  readonly started: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly lastAdvanceAt: number | undefined;
}

const MAX_TIMELINE_TRACKS = 256;

function resolveEasing(easing: TimelineEasing | undefined): (t: number) => number {
  if (typeof easing === "function") return easing;
  switch (easing) {
    case "ease-in":
      return (t) => t * t;
    case "ease-out":
      return (t) => 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return (t) => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    default:
      return (t) => t;
  }
}

function interpolate<T extends TimelineValue>(from: T, to: T, t: number): T {
  if (typeof from === "number") return (from + ((to as number) - from) * t) as T;
  const target = to as readonly number[];
  return from.map((channel, index) => channel + ((target[index] ?? channel) - channel) * t) as unknown as T;
}

interface TimelineTrack {
  readonly id: number;
  readonly options: TimelineTweenOptions<TimelineValue>;
  readonly ease: (t: number) => number;
  startedAt: number | undefined;
  playsDone: number;
  done: boolean;
}

/**
 * A deterministic tween scheduler. `advance(nowMs)` steps every active track
 * against the caller's clock; a track past its duration fires its final value
 * exactly once per play and completes (or replays per `repeat`/`alternate`).
 */
export class Timeline {
  #tracks: TimelineTrack[] = [];
  #nextId = 1;
  #started = 0;
  #completed = 0;
  #cancelled = 0;
  #lastAdvanceAt: number | undefined;
  #disposed = false;

  /** Registers a tween; its clock starts at the next advance() call. */
  tween<T extends TimelineValue>(options: TimelineTweenOptions<T>): TimelineTween {
    if (this.#disposed) throw new Error("Timeline is disposed");
    if (this.#tracks.length >= MAX_TIMELINE_TRACKS) {
      throw new RangeError(`timeline holds ${MAX_TIMELINE_TRACKS} tracks; cancel some before adding more`);
    }
    if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) {
      throw new RangeError("durationMs must be a positive finite number");
    }
    const track: TimelineTrack = {
      id: this.#nextId++,
      options: options as unknown as TimelineTweenOptions<TimelineValue>,
      ease: resolveEasing(options.easing),
      startedAt: undefined,
      playsDone: 0,
      done: false,
    };
    this.#tracks.push(track);
    this.#started += 1;
    return {
      id: track.id,
      get done() {
        return track.done;
      },
      cancel: () => {
        if (track.done) return;
        track.done = true;
        this.#cancelled += 1;
        this.#prune();
      },
    };
  }

  /** Steps every active track to `nowMs`. Never moves values backwards. */
  advance(nowMs: number): void {
    if (this.#disposed || !Number.isFinite(nowMs)) return;
    this.#lastAdvanceAt = nowMs;
    for (const track of [...this.#tracks]) {
      if (track.done) continue;
      const { options } = track;
      track.startedAt ??= nowMs;
      const delay = Math.max(0, options.delayMs ?? 0);
      const elapsed = nowMs - track.startedAt - delay;
      if (elapsed < 0) continue;
      const play = Math.min(Math.floor(elapsed / options.durationMs), repeatCount(options));
      const within = Math.min(1, Math.max(0, (elapsed - play * options.durationMs) / options.durationMs));
      const finished = elapsed >= (repeatCount(options) + 1) * options.durationMs;
      const progress = finished ? 1 : within;
      const reversed = options.alternate === true && play % 2 === 1;
      const eased = track.ease(reversed ? 1 - progress : progress);
      options.onUpdate(interpolate(options.from, options.to, eased), progress);
      if (finished) {
        track.done = true;
        this.#completed += 1;
        options.onComplete?.();
      }
      track.playsDone = play;
    }
    this.#prune();
  }

  inspect(): TimelineInspection {
    return Object.freeze({
      active: this.#tracks.length,
      started: this.#started,
      completed: this.#completed,
      cancelled: this.#cancelled,
      lastAdvanceAt: this.#lastAdvanceAt,
    });
  }

  dispose(): void {
    this.#disposed = true;
    for (const track of this.#tracks) {
      if (!track.done) this.#cancelled += 1;
      track.done = true;
    }
    this.#tracks = [];
  }

  #prune(): void {
    this.#tracks = this.#tracks.filter((track) => !track.done);
  }
}

function repeatCount(options: TimelineTweenOptions<TimelineValue>): number {
  const repeat = options.repeat ?? 0;
  if (repeat === Number.POSITIVE_INFINITY) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(repeat));
}

/** Creates a deterministic caller-advanced timeline. */
export function createTimeline(): Timeline {
  return new Timeline();
}
