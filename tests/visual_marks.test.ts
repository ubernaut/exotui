// Copyright 2023 Im-Beast. MIT license.

// VIS-005: identical points map to identical logical coordinates and
// unsupported glyph sets degrade explicitly.

import { assert, assertEquals } from "./deps.ts";
import { createMarkCanvas, resolveMarkBackend } from "../mod.ts";

const ALL = { braille: true, sextants: true, quadrants: true };

Deno.test("one logical dot space is shared by every backend", () => {
  const canvas = createMarkCanvas({ width: 8, height: 8 });
  const points = [[0, 0], [3, 2], [7, 7], [4, 5]] as const;
  for (const [x, y] of points) canvas.plot(x, y);
  // The logical truth is backend-independent.
  for (const [x, y] of points) assert(canvas.hasDot(x, y));
  assert(!canvas.hasDot(1, 1));

  // Every backend rasterizes the SAME dots into its own cell geometry.
  const braille = canvas.render("braille", ALL);
  const quadrant = canvas.render("quadrant", ALL);
  const full = canvas.render("full-cell", ALL);
  assertEquals(braille.lines.length, 2); // 8 dots / 4 per cell
  assertEquals(quadrant.lines.length, 4); // 8 / 2
  assertEquals(full.lines.length, 8); // 8 / 1
  // Dot (0,0) lights the first cell in all of them.
  assert(braille.lines[0]![0] !== " ");
  assert(quadrant.lines[0]![0] !== " ");
  assertEquals(full.lines[0]![0], "█");
});

Deno.test("braille, sextant, and quadrant glyphs encode exact dot patterns", () => {
  const canvas = createMarkCanvas({ width: 2, height: 4 });
  canvas.plot(0, 0); // braille dot 1
  canvas.plot(1, 3); // braille dot 8
  assertEquals(canvas.render("braille", ALL).lines, ["⢁"]); // 0x2800 + 0x01 + 0x80

  const quad = createMarkCanvas({ width: 2, height: 2 });
  quad.plot(0, 0);
  quad.plot(1, 1);
  assertEquals(quad.render("quadrant", ALL).lines, ["▚"]);

  const sex = createMarkCanvas({ width: 2, height: 3 });
  sex.plot(0, 0);
  sex.plot(0, 1);
  sex.plot(0, 2); // left column = "▌", the sextant-block exception
  assertEquals(sex.render("sextant", ALL).lines, ["▌"]);
  sex.plot(1, 0);
  sex.plot(1, 1);
  sex.plot(1, 2);
  assertEquals(sex.render("sextant", ALL).lines, ["█"]);
});

Deno.test("unsupported glyph sets degrade explicitly, never silently", () => {
  assertEquals(resolveMarkBackend("braille", ALL), { backend: "braille", degraded: false });
  assertEquals(
    resolveMarkBackend("braille", { quadrants: true }),
    { backend: "quadrant", degraded: true },
  );
  assertEquals(resolveMarkBackend("sextant", {}), { backend: "full-cell", degraded: true });

  const canvas = createMarkCanvas({ width: 4, height: 4 });
  canvas.plot(1, 1);
  const render = canvas.render("braille", {}); // terminal supports nothing fancy
  assertEquals(render.requested, "braille");
  assertEquals(render.backend, "full-cell");
  assert(render.degraded); // named, visible degradation
  assertEquals(render.lines, ["    ", " █  ", "    ", "    "]);
});
