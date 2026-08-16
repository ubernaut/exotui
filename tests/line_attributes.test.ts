// Copyright 2023 Im-Beast. MIT license.

// TERM-008: screen inspection retains logical attributes even when a
// host renders a documented fallback.

import { assert, assertEquals } from "./deps.ts";
import { createLineAttributeScreen } from "../mod.ts";

Deno.test("logical capacity halves under double-width and clips per DEC", () => {
  const screen = createLineAttributeScreen(10, 3);
  screen.writeLine(0, "0123456789");
  assertEquals(screen.inspect(0)!.capacity, 10);

  screen.setLineAttribute(1, "double-width");
  assertEquals(screen.inspect(1)!.capacity, 5);
  screen.writeLine(1, "ABCDEFGH"); // clipped to 5 logical columns
  assertEquals(screen.inspect(1)!.text, "ABCDE");

  // Switching an overfull single row to double-width clips existing text.
  screen.writeLine(2, "0123456789");
  screen.setLineAttribute(2, "double-width");
  assertEquals(screen.inspect(2)!.text, "01234");
});

Deno.test("inspection keeps logical attributes through degraded rendering", () => {
  const screen = createLineAttributeScreen(10, 4);
  screen.writeLine(0, "plain");
  screen.setLineAttribute(1, "double-width");
  screen.writeLine(1, "WIDE");
  screen.setLineAttribute(2, "double-height-top");
  screen.setLineAttribute(3, "double-height-bottom");
  screen.writeLine(2, "BIG");
  screen.writeLine(3, "BIG");

  const rendered = screen.render();
  assertEquals(rendered[0], { cells: "plain" });
  assertEquals(rendered[1]!.degradation, "double-width-padded");
  assertEquals(rendered[1]!.cells, "W I D E ");
  assertEquals(rendered[2]!.degradation, "double-height-single");
  assertEquals(rendered[3]!.degradation, "double-height-single");

  // The DEGRADED rendering did not erase the logical truth.
  assertEquals(screen.inspect(1)!.attribute, "double-width");
  assertEquals(screen.inspect(1)!.text, "WIDE"); // logical text, unpadded
  assertEquals(screen.inspect(2)!.attribute, "double-height-top");
  assertEquals(screen.inspect(3)!.attribute, "double-height-bottom");
});

Deno.test("degradation is explicit in the output, never silent", () => {
  const screen = createLineAttributeScreen(8, 2);
  screen.setLineAttribute(0, "double-width");
  screen.writeLine(0, "AB");
  const rendered = screen.render();
  assert(rendered[0]!.degradation !== undefined); // the fallback is NAMED
  assertEquals(rendered[1]!.degradation, undefined); // single rows are not
});
