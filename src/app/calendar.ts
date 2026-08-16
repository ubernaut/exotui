// Copyright 2023 Im-Beast. MIT license.

// WID-001: calendar and date-range controllers on CIVIL dates. Every date
// is a {year, month, day} value and all arithmetic runs through Julian
// day numbers — pure integer math with no Date, no milliseconds, and no
// time zone, so a daylight-saving boundary structurally cannot change the
// selected civil date. Week layout follows locale week rules (Intl week
// info with an explicit override), min/max clamp navigation, disabled
// dates can hold focus but never become selections or range endpoints,
// and range selection is keyboard-first: extend-moves grow the range from
// its anchor exactly like shift+arrow.

/** One calendar date with no time or zone attached. */
export interface CivilDate {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
}

/** Days-since-epoch form of a civil date (proleptic Gregorian). */
export function civilToJdn(date: CivilDate): number {
  const a = Math.floor((14 - date.month) / 12);
  const y = date.year + 4800 - a;
  const m = date.month + 12 * a - 3;
  return date.day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) +
    Math.floor(y / 400) - 32045;
}

/** Inverse of {@linkcode civilToJdn}. */
export function jdnToCivil(jdn: number): CivilDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor(1461 * d / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

/** Adds whole civil days — integer math, immune to DST by construction. */
export function addCivilDays(date: CivilDate, days: number): CivilDate {
  return jdnToCivil(civilToJdn(date) + days);
}

/** Negative before, zero equal, positive after. */
export function compareCivilDates(left: CivilDate, right: CivilDate): number {
  return civilToJdn(left) - civilToJdn(right);
}

/** Weekday of a civil date: 0 = Sunday … 6 = Saturday. */
export function civilWeekday(date: CivilDate): number {
  return (civilToJdn(date) + 1) % 7;
}

/** Resolves a locale's first day of week (0 = Sunday … 6 = Monday-based). */
export function localeWeekStart(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as unknown as {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (typeof firstDay === "number") return firstDay % 7; // Intl: 1=Mon..7=Sun
  } catch {
    // fall through to the default below
  }
  return 1; // Monday, the most common rule
}

/** Calendar configuration. */
export interface CalendarOptions {
  /** Initial focused date (required so tests own their clock). */
  readonly focus: CivilDate;
  readonly locale?: string;
  /** Explicit first weekday, overriding the locale rule. */
  readonly weekStart?: number;
  readonly min?: CivilDate;
  readonly max?: CivilDate;
  readonly disabled?: (date: CivilDate) => boolean;
}

/** One month-grid cell. */
export interface CalendarCell {
  readonly date: CivilDate;
  readonly inMonth: boolean;
  readonly disabled: boolean;
}

/** An inclusive ordered civil-date range. */
export interface CivilDateRange {
  readonly start: CivilDate;
  readonly end: CivilDate;
}

/** Calendar controller with single and keyboard range selection. */
export class CalendarController {
  readonly #weekStart: number;
  readonly #min?: CivilDate;
  readonly #max?: CivilDate;
  readonly #disabled: (date: CivilDate) => boolean;
  #focus: CivilDate;
  #selected?: CivilDate;
  #anchor?: CivilDate;
  #head?: CivilDate;

  constructor(options: CalendarOptions) {
    this.#weekStart = options.weekStart ?? localeWeekStart(options.locale ?? "en-US");
    this.#min = options.min;
    this.#max = options.max;
    this.#disabled = options.disabled ?? (() => false);
    this.#focus = this.#clamp(options.focus);
  }

  focus(): CivilDate {
    return this.#focus;
  }

  weekStart(): number {
    return this.#weekStart;
  }

  selected(): CivilDate | undefined {
    return this.#selected;
  }

  /** The ordered selected range, when a range is active. */
  range(): CivilDateRange | undefined {
    if (!this.#anchor || !this.#head) return undefined;
    return compareCivilDates(this.#anchor, this.#head) <= 0
      ? { start: this.#anchor, end: this.#head }
      : { start: this.#head, end: this.#anchor };
  }

  /**
   * Moves focus by whole days (arrow keys: ±1; page: ±7 via moveWeeks).
   * With `extend`, the move grows the range from its anchor — shift+arrow.
   * Focus clamps to min/max and may rest on disabled dates.
   */
  moveDays(days: number, options: { extend?: boolean } = {}): CivilDate {
    const next = this.#clamp(addCivilDays(this.#focus, days));
    this.#focus = next;
    if (options.extend) this.#extendTo(next);
    return next;
  }

  moveWeeks(weeks: number, options: { extend?: boolean } = {}): CivilDate {
    return this.moveDays(weeks * 7, options);
  }

  /** Selects the focused date. Disabled and out-of-range dates refuse. */
  select(): boolean {
    if (!this.#selectable(this.#focus)) return false;
    this.#selected = this.#focus;
    this.#anchor = this.#focus;
    this.#head = this.#focus;
    return true;
  }

  /** Clears selection and range. */
  clear(): void {
    this.#selected = undefined;
    this.#anchor = undefined;
    this.#head = undefined;
  }

  /**
   * The focused month as week-aligned rows. Leading/trailing cells come from
   * adjacent months so every row is a complete week.
   */
  monthGrid(): CalendarCell[][] {
    const first: CivilDate = { year: this.#focus.year, month: this.#focus.month, day: 1 };
    const lead = (civilWeekday(first) - this.#weekStart + 7) % 7;
    let cursor = addCivilDays(first, -lead);
    const weeks: CalendarCell[][] = [];
    do {
      const week: CalendarCell[] = [];
      for (let day = 0; day < 7; day += 1) {
        week.push({
          date: cursor,
          inMonth: cursor.month === this.#focus.month && cursor.year === this.#focus.year,
          disabled: !this.#selectable(cursor),
        });
        cursor = addCivilDays(cursor, 1);
      }
      weeks.push(week);
    } while (cursor.month === this.#focus.month && cursor.year === this.#focus.year);
    return weeks;
  }

  #extendTo(date: CivilDate): void {
    if (!this.#anchor) this.#anchor = this.#selected ?? date;
    // Endpoints must be selectable; the head refuses to land on disabled.
    if (this.#selectable(date)) this.#head = date;
  }

  #selectable(date: CivilDate): boolean {
    if (this.#min && compareCivilDates(date, this.#min) < 0) return false;
    if (this.#max && compareCivilDates(date, this.#max) > 0) return false;
    return !this.#disabled(date);
  }

  #clamp(date: CivilDate): CivilDate {
    if (this.#min && compareCivilDates(date, this.#min) < 0) return this.#min;
    if (this.#max && compareCivilDates(date, this.#max) > 0) return this.#max;
    return date;
  }
}

/** Creates a calendar controller. */
export function createCalendarController(options: CalendarOptions): CalendarController {
  return new CalendarController(options);
}
