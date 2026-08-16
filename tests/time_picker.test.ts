// Copyright 2023 Im-Beast. MIT license.

// WID-002: step constraints, typed durations, and DST gaps/folds that
// require an explicit resolution and round-trip to a typed value.

import { assert, assertEquals } from "./deps.ts";
import { chooseInstant, formatDuration, offsetMinutesAt, parseDuration, resolveWallTime, stepTime } from "../mod.ts";

Deno.test("time stepping honors step, wrap, and min/max clamps", () => {
  assertEquals(stepTime({ hour: 9, minute: 0 }, 1, { minuteStep: 15 }), { hour: 9, minute: 15 });
  assertEquals(stepTime({ hour: 9, minute: 7 }, 1, { minuteStep: 15 }), { hour: 9, minute: 15 }); // snaps
  assertEquals(stepTime({ hour: 23, minute: 45 }, 1, { minuteStep: 30 }), { hour: 0, minute: 30 }); // wraps
  assertEquals(
    stepTime({ hour: 17, minute: 0 }, 5, { minuteStep: 60, max: { hour: 18, minute: 0 } }),
    { hour: 18, minute: 0 },
  );
  assertEquals(
    stepTime({ hour: 9, minute: 0 }, -5, { minuteStep: 60, min: { hour: 8, minute: 0 } }),
    { hour: 8, minute: 0 },
  );
});

Deno.test("durations parse and format as typed second counts", () => {
  assertEquals(parseDuration("1h 30m 15s"), 5415);
  assertEquals(parseDuration("90m"), 5400);
  assertEquals(parseDuration("01:30"), 5400);
  assertEquals(parseDuration("01:30:15"), 5415);
  assertEquals(parseDuration("2.5h"), 9000);
  assertEquals(parseDuration("nonsense"), undefined);
  assertEquals(parseDuration("5x"), undefined);
  assertEquals(parseDuration(""), undefined);
  assertEquals(formatDuration(5415), "1h 30m 15s");
  assertEquals(formatDuration(5400), "1h 30m");
  assertEquals(formatDuration(0), "0s");
  assertEquals(parseDuration(formatDuration(86_461)), 86_461); // round-trip
});

Deno.test("unique wall times resolve to typed instants without a choice", () => {
  const resolution = resolveWallTime({ year: 2026, month: 6, day: 15 }, { hour: 12, minute: 0 }, "America/New_York");
  assert(resolution.kind === "unique");
  // June: EDT = UTC-4 → noon local = 16:00Z.
  assertEquals(resolution.instant.epochMs, Date.UTC(2026, 5, 15, 16));
  assertEquals(resolution.instant.timeZone, "America/New_York");
  assertEquals(chooseInstant(resolution), resolution.instant);
  assertEquals(offsetMinutesAt("America/New_York", resolution.instant.epochMs), -240);
});

Deno.test("spring-forward gaps demand an explicit before/after choice", () => {
  // 2026-03-08 02:30 does not exist in New York.
  const gap = resolveWallTime({ year: 2026, month: 3, day: 8 }, { hour: 2, minute: 30 }, "America/New_York");
  assert(gap.kind === "gap");
  assertEquals(chooseInstant(gap), undefined); // no silent pick
  assertEquals(chooseInstant(gap, "earlier"), undefined); // fold choices refused
  const before = chooseInstant(gap, "before-gap")!;
  const after = chooseInstant(gap, "after-gap")!;
  // Interpreted with the pre-transition offset (EST): 02:30 -> 07:30Z;
  // with the post-transition offset (EDT): 02:30 -> 06:30Z.
  assertEquals(before.epochMs, Date.UTC(2026, 2, 8, 7, 30));
  assertEquals(after.epochMs, Date.UTC(2026, 2, 8, 6, 30));
});

Deno.test("fall-back folds demand an explicit earlier/later choice", () => {
  // 2026-11-01 01:30 exists twice in New York.
  const fold = resolveWallTime({ year: 2026, month: 11, day: 1 }, { hour: 1, minute: 30 }, "America/New_York");
  assert(fold.kind === "fold");
  assertEquals(chooseInstant(fold), undefined);
  assertEquals(chooseInstant(fold, "before-gap"), undefined);
  const earlier = chooseInstant(fold, "earlier")!;
  const later = chooseInstant(fold, "later")!;
  assertEquals(earlier.epochMs, Date.UTC(2026, 10, 1, 5, 30)); // EDT (-4)
  assertEquals(later.epochMs, Date.UTC(2026, 10, 1, 6, 30)); // EST (-5)
  assertEquals(later.epochMs - earlier.epochMs, 3_600_000);
  // The typed value round-trips to the same wall time in its zone.
  assertEquals(offsetMinutesAt(earlier.timeZone, earlier.epochMs), -240);
  assertEquals(offsetMinutesAt(later.timeZone, later.epochMs), -300);
});
