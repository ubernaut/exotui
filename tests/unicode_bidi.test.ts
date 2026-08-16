// Copyright 2023 Im-Beast. MIT license.

// TXT-008: UAX #9 — the official BidiCharacterTest corpus passes in full,
// and logical/visual hit-test mappings round-trip for mixed-direction text.

import { assert, assertEquals } from "./deps.ts";
import { bidiParagraph, bidiParagraphOfText, lookupBidiClass } from "../mod.ts";

Deno.test("the official BidiCharacterTest corpus passes completely", async () => {
  const text = await Deno.readTextFile(new URL("./fixtures/unicode/BidiCharacterTest-17.0.0.txt", import.meta.url));
  let total = 0;
  const failures: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [cps, dir, expLevel, expLevels, expOrder] = line.split(";");
    const codePoints = cps!.split(" ").map((hex) => parseInt(hex, 16));
    const direction = dir === "0" ? "ltr" : dir === "1" ? "rtl" : "auto";
    const result = bidiParagraph(codePoints, { direction: direction as "ltr" | "rtl" | "auto" });
    total += 1;
    const gotLevels = result.levels.map((level) => level < 0 ? "x" : String(level)).join(" ");
    const wantOrder = expOrder!.trim() === "" ? "" : expOrder!.split(" ").map(Number).join(" ");
    if (
      result.paragraphLevel !== Number(expLevel) || gotLevels !== expLevels ||
      result.visualOrder.join(" ") !== wantOrder
    ) {
      if (failures.length < 5) failures.push(line);
    }
  }
  assert(total > 91_000, `corpus loaded: ${total} lines`);
  assertEquals(failures, []);
});

Deno.test("classes resolve including block defaults for unassigned code points", () => {
  assertEquals(lookupBidiClass(0x0041), "L"); // A
  assertEquals(lookupBidiClass(0x05d0), "R"); // א
  assertEquals(lookupBidiClass(0x0627), "AL"); // ا
  assertEquals(lookupBidiClass(0x0031), "EN"); // 1
  assertEquals(lookupBidiClass(0x05ff), "R"); // unassigned in the Hebrew block
  assertEquals(lookupBidiClass(0x1eeff), "AL"); // unassigned in Arabic Math block
});

Deno.test("mixed-direction selection round-trips logical and visual positions", () => {
  // "abc" + Hebrew "אבג" + "123" under auto (LTR paragraph).
  const analysis = bidiParagraphOfText("abc אבג 123");
  const { logicalToVisual, visualToLogical, visualOrder } = analysis;

  // Bijective over visible characters: both compositions are identity.
  for (let logical = 0; logical < logicalToVisual.length; logical += 1) {
    const visual = logicalToVisual[logical]!;
    assert(visual >= 0);
    assertEquals(visualToLogical[visual], logical);
  }
  for (let visual = 0; visual < visualToLogical.length; visual += 1) {
    assertEquals(logicalToVisual[visualToLogical[visual]!], visual);
  }

  // The Hebrew span displays reversed while storage stays logical: the
  // visual neighbors of א (logical 4) are ב on its LEFT in visual order.
  assertEquals(visualOrder.length, 11);
  const hebrewVisual = [4, 5, 6].map((logical) => logicalToVisual[logical]!);
  assert(hebrewVisual[0]! > hebrewVisual[1]! && hebrewVisual[1]! > hebrewVisual[2]!, "RTL span reverses visually");

  // Runs partition the paragraph with alternating levels.
  const levels = new Set(analysis.runs.map((run) => run.level));
  assert(levels.has(0) && levels.has(1));
});
