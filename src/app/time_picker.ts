// Copyright 2023 Im-Beast. MIT license.

// WID-002: time, duration, and time-zone pickers. Times are civil values
// with step constraints; durations parse/format as typed second counts;
// and local-time resolution against an IANA zone classifies every wall
// time as unique, gap (spring-forward: the time does not exist), or fold
// (fall-back: it exists twice). Gaps and folds NEVER resolve implicitly —
// converting to an instant requires an explicit choice, and the result
// round-trips as a typed { epochMs, timeZone } value.

import type { CivilDate } from "./calendar.ts";

/** One civil wall-clock time. */
export interface CivilTime {
  readonly hour: number;
  readonly minute: number;
  readonly second?: number;
}

/** Time-picker step constraints. */
export interface TimeStepOptions {
  readonly minuteStep?: number;
  readonly min?: CivilTime;
  readonly max?: CivilTime;
}

function timeToMinutes(time: CivilTime): number {
  return time.hour * 60 + time.minute;
}

function minutesToTime(total: number): CivilTime {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

/** Steps a time by whole steps, clamping into [min, max] when given. */
export function stepTime(time: CivilTime, steps: number, options: TimeStepOptions = {}): CivilTime {
  const step = Math.max(1, Math.floor(options.minuteStep ?? 1));
  const snapped = Math.round(timeToMinutes(time) / step) * step + steps * step;
  let next = options.min || options.max ? snapped : ((snapped % 1440) + 1440) % 1440;
  if (options.min !== undefined) next = Math.max(timeToMinutes(options.min), next);
  if (options.max !== undefined) next = Math.min(timeToMinutes(options.max), next);
  return minutesToTime(next);
}

/** Parses "1h 30m 15s" / "90m" / "01:30" duration text to whole seconds. */
export function parseDuration(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const clock = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);
  if (clock) {
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0);
  }
  const pattern = /(\d+(?:\.\d+)?)\s*(h|m|s)/g;
  let total = 0;
  let matchedLength = 0;
  for (const match of trimmed.matchAll(pattern)) {
    const value = Number(match[1]);
    total += match[2] === "h" ? value * 3600 : match[2] === "m" ? value * 60 : value;
    matchedLength += match[0].length;
  }
  const residue = trimmed.replace(pattern, "").trim();
  if (matchedLength === 0 || residue !== "") return undefined;
  return Math.round(total);
}

/** Formats whole seconds as compact "1h 30m 15s". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const parts: string[] = [];
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (rest > 0 || parts.length === 0) parts.push(`${rest}s`);
  return parts.join(" ");
}

/** A resolved typed instant. */
export interface ZonedInstant {
  readonly epochMs: number;
  readonly timeZone: string;
}

/** Classification of one wall time in one zone. */
export type WallTimeResolution =
  | { readonly kind: "unique"; readonly instant: ZonedInstant }
  | {
    /** Spring-forward: the wall time does not exist. */
    readonly kind: "gap";
    readonly timeZone: string;
    /** The instant just before the gap and the shifted equivalent after. */
    readonly before: ZonedInstant;
    readonly after: ZonedInstant;
  }
  | {
    /** Fall-back: the wall time exists twice. */
    readonly kind: "fold";
    readonly earlier: ZonedInstant;
    readonly later: ZonedInstant;
  };

/** The zone's UTC offset (minutes east) at one instant. */
export function offsetMinutesAt(timeZone: string, epochMs: number): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return Math.round((asUtc - epochMs) / 60_000);
}

/**
 * Resolves one civil date+time in a zone. Gap and fold results demand an
 * explicit choice via {@linkcode chooseInstant} — there is no implicit
 * "pick one" path.
 */
export function resolveWallTime(date: CivilDate, time: CivilTime, timeZone: string): WallTimeResolution {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second ?? 0);
  const offsets = [
    ...new Set([
      offsetMinutesAt(timeZone, asUtc - 86_400_000),
      offsetMinutesAt(timeZone, asUtc),
      offsetMinutesAt(timeZone, asUtc + 86_400_000),
    ]),
  ];
  const valid: number[] = [];
  for (const offset of offsets) {
    const candidate = asUtc - offset * 60_000;
    if (offsetMinutesAt(timeZone, candidate) === offset) valid.push(candidate);
  }
  valid.sort((a, b) => a - b);
  if (valid.length === 1) return { kind: "unique", instant: { epochMs: valid[0]!, timeZone } };
  if (valid.length >= 2) {
    return {
      kind: "fold",
      earlier: { epochMs: valid[0]!, timeZone },
      later: { epochMs: valid[valid.length - 1]!, timeZone },
    };
  }
  // Gap: the clock jumped forward, so the offset INCREASED across it —
  // the pre-transition interpretation uses the smaller offset.
  const beforeOffset = Math.min(...offsets);
  const afterOffset = Math.max(...offsets);
  return {
    kind: "gap",
    timeZone,
    before: { epochMs: asUtc - beforeOffset * 60_000, timeZone },
    after: { epochMs: asUtc - afterOffset * 60_000, timeZone },
  };
}

/** Explicit resolutions for ambiguous wall times. */
export type WallTimeChoice = "earlier" | "later" | "before-gap" | "after-gap";

/**
 * Turns a resolution into a typed instant. Unique times need no choice;
 * folds require earlier/later; gaps require before-gap/after-gap. A
 * missing or mismatched choice yields undefined — never a silent pick.
 */
export function chooseInstant(resolution: WallTimeResolution, choice?: WallTimeChoice): ZonedInstant | undefined {
  if (resolution.kind === "unique") return resolution.instant;
  if (resolution.kind === "fold") {
    if (choice === "earlier") return resolution.earlier;
    if (choice === "later") return resolution.later;
    return undefined;
  }
  if (choice === "before-gap") return resolution.before;
  if (choice === "after-gap") return resolution.after;
  return undefined;
}
