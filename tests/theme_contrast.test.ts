// Copyright 2023 Im-Beast. MIT license.

// THEM-004: repairs are deterministic, reported as a diff, and never
// alter locked brand tokens.

import { assert, assertEquals } from "./deps.ts";
import { contrastRatio, enforceContrastConstraints, relativeLuminance } from "../mod.ts";

const COLORS = {
  brand: [16, 120, 200],
  fg: [90, 90, 90],
  bg: [80, 80, 80],
  surface: [250, 250, 250],
} as const;

Deno.test("WCAG math matches known anchors", () => {
  assertEquals(relativeLuminance([255, 255, 255]), 1);
  assertEquals(relativeLuminance([0, 0, 0]), 0);
  assertEquals(contrastRatio([255, 255, 255], [0, 0, 0]), 21);
  assert(Math.abs(contrastRatio([255, 255, 255], [119, 119, 119]) - 4.48) < 0.02);
});

Deno.test("error mode reports violations without touching colors", () => {
  const report = enforceContrastConstraints(COLORS, [
    { foreground: "fg", background: "bg", minRatio: 4.5 },
    { foreground: "brand", background: "surface", minRatio: 3 },
  ], { mode: "error" });
  assert(!report.ok);
  assertEquals(report.violations.length, 1);
  assertEquals(report.violations[0]!.constraint.foreground, "fg");
  assert(report.violations[0]!.actualRatio < 1.3);
  assertEquals(report.repairs, []);
  assertEquals(report.colors, COLORS); // untouched
});

Deno.test("repair mode fixes deterministically and reports the diff", () => {
  const run = () =>
    enforceContrastConstraints(COLORS, [
      { foreground: "fg", background: "bg", minRatio: 4.5 },
    ], { mode: "repair" });
  const first = run();
  assert(first.ok);
  assertEquals(first.repairs.length, 1);
  const repair = first.repairs[0]!;
  assertEquals(repair.token, "fg");
  assertEquals(repair.before, [90, 90, 90]);
  assert(repair.achievedRatio >= 4.5);
  assertEquals(first.colors["fg"], repair.after);
  assertEquals(first.colors["bg"], [80, 80, 80]); // background untouched
  assertEquals(first, run()); // deterministic
});

Deno.test("locked brand tokens shift repair duty and can make pairs unrepairable", () => {
  // Foreground locked: the background moves instead.
  const shifted = enforceContrastConstraints(COLORS, [
    { foreground: "fg", background: "bg", minRatio: 4.5 },
  ], { mode: "repair", locked: ["fg"] });
  assert(shifted.ok);
  assertEquals(shifted.repairs[0]!.token, "bg");
  assertEquals(shifted.colors["fg"], [90, 90, 90]); // locked stays exact

  // Both locked: reported unrepairable, both untouched.
  const stuck = enforceContrastConstraints(COLORS, [
    { foreground: "fg", background: "bg", minRatio: 4.5 },
  ], { mode: "repair", locked: ["fg", "bg"] });
  assert(!stuck.ok);
  assert(stuck.violations[0]!.unrepairable);
  assertEquals(stuck.colors["fg"], [90, 90, 90]);
  assertEquals(stuck.colors["bg"], [80, 80, 80]);
});
