// Copyright 2023 Im-Beast. MIT license.

// WID-001: civil-date calendar — locale week rules, min/max, disabled
// dates, keyboard range selection, and DST immunity by construction.

import { assert, assertEquals } from "./deps.ts";
import {
  addCivilDays,
  civilToJdn,
  civilWeekday,
  compareCivilDates,
  createCalendarController,
  jdnToCivil,
  localeWeekStart,
} from "../mod.ts";

Deno.test("civil arithmetic is exact across DST boundaries and leap days", () => {
  // US spring-forward 2026-03-08 and fall-back 2026-11-01: a day walk hits
  // every civil date exactly once — no skips, no doubles, no Date involved.
  let cursor = { year: 2026, month: 3, day: 7 };
  const seen: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    seen.push(`${cursor.month}/${cursor.day}`);
    cursor = addCivilDays(cursor, 1);
  }
  assertEquals(seen, ["3/7", "3/8", "3/9", "3/10"]);

  assertEquals(addCivilDays({ year: 2026, month: 10, day: 31 }, 2), { year: 2026, month: 11, day: 2 });
  assertEquals(addCivilDays({ year: 2024, month: 2, day: 28 }, 1), { year: 2024, month: 2, day: 29 });
  assertEquals(addCivilDays({ year: 2026, month: 2, day: 28 }, 1), { year: 2026, month: 3, day: 1 });
  // Round-trip through the day number is lossless for a whole year.
  const start = civilToJdn({ year: 2026, month: 1, day: 1 });
  for (let jdn = start; jdn < start + 365; jdn += 1) {
    assertEquals(civilToJdn(jdnToCivil(jdn)), jdn);
  }
  assertEquals(civilWeekday({ year: 2026, month: 8, day: 16 }), 0); // a Sunday
});

Deno.test("locale week rules shape the month grid", () => {
  assert(localeWeekStart("en-US") >= 0 && localeWeekStart("en-US") <= 6);
  const sundayFirst = createCalendarController({
    focus: { year: 2026, month: 8, day: 16 },
    weekStart: 0,
  });
  const grid = sundayFirst.monthGrid();
  // August 2026 starts on Saturday; Sunday-first grid leads with Jul 26.
  assertEquals(grid[0]![0]!.date, { year: 2026, month: 7, day: 26 });
  assert(!grid[0]![0]!.inMonth);
  assertEquals(grid[0]![6]!.date, { year: 2026, month: 8, day: 1 });
  assert(grid.every((week) => week.length === 7));

  const mondayFirst = createCalendarController({
    focus: { year: 2026, month: 8, day: 16 },
    weekStart: 1,
  });
  assertEquals(mondayFirst.monthGrid()[0]![0]!.date, { year: 2026, month: 7, day: 27 });
});

Deno.test("min/max clamp navigation and disabled dates refuse selection", () => {
  const calendar = createCalendarController({
    focus: { year: 2026, month: 8, day: 16 },
    weekStart: 1,
    min: { year: 2026, month: 8, day: 10 },
    max: { year: 2026, month: 8, day: 20 },
    disabled: (date) => civilWeekday(date) === 0, // Sundays closed
  });
  calendar.moveDays(-30);
  assertEquals(calendar.focus(), { year: 2026, month: 8, day: 10 }); // clamped
  calendar.moveWeeks(4);
  assertEquals(calendar.focus(), { year: 2026, month: 8, day: 20 });

  // Focus may rest on a disabled Sunday, but selecting refuses.
  calendar.moveDays(-4); // Aug 16 = Sunday
  assertEquals(calendar.select(), false);
  calendar.moveDays(1);
  assert(calendar.select());
  assertEquals(calendar.selected(), { year: 2026, month: 8, day: 17 });
});

Deno.test("keyboard range selection extends from the anchor like shift+arrow", () => {
  const calendar = createCalendarController({
    focus: { year: 2026, month: 8, day: 12 },
    weekStart: 1,
    disabled: (date) => date.day === 14,
  });
  assert(calendar.select()); // anchor Aug 12
  calendar.moveDays(1, { extend: true });
  assertEquals(calendar.range(), {
    start: { year: 2026, month: 8, day: 12 },
    end: { year: 2026, month: 8, day: 13 },
  });
  // The head refuses a disabled endpoint but focus still moves.
  calendar.moveDays(1, { extend: true });
  assertEquals(calendar.focus().day, 14);
  assertEquals(calendar.range()!.end.day, 13);
  calendar.moveDays(1, { extend: true });
  assertEquals(calendar.range()!.end.day, 15);
  // Extending backwards past the anchor reorders the range.
  calendar.moveWeeks(-1, { extend: true });
  assertEquals(calendar.range(), {
    start: { year: 2026, month: 8, day: 8 },
    end: { year: 2026, month: 8, day: 12 },
  });
  assert(compareCivilDates(calendar.range()!.start, calendar.range()!.end) < 0);
});
