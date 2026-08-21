// The compositor arithmetic behind graphics clipping: the visible area of a
// window as disjoint rectangles, with covers subtracted.

import { assert, assertEquals } from "./deps.ts";
import { subtractRectangles } from "../app.ts";

const area = (rects: readonly { width: number; height: number }[]) =>
  rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);

Deno.test("no covers leaves the base whole", () => {
  const base = { column: 5, row: 5, width: 40, height: 20 };
  assertEquals(subtractRectangles(base, []), [base]);
});

Deno.test("a corner cover leaves an L of two disjoint rectangles", () => {
  const base = { column: 0, row: 0, width: 10, height: 10 };
  const pieces = subtractRectangles(base, [{ column: 5, row: 5, width: 10, height: 10 }]);
  assertEquals(area(pieces), 100 - 25);
  // Disjoint: no two pieces overlap.
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const a = pieces[i]!;
      const b = pieces[j]!;
      const overlap = a.column < b.column + b.width && b.column < a.column + a.width &&
        a.row < b.row + b.height && b.row < a.row + a.height;
      assert(!overlap, "pieces overlap");
    }
  }
});

Deno.test("a full cover leaves nothing", () => {
  const base = { column: 2, row: 2, width: 8, height: 4 };
  assertEquals(subtractRectangles(base, [{ column: 0, row: 0, width: 20, height: 20 }]), []);
});

Deno.test("a strip through the middle splits into two", () => {
  const base = { column: 0, row: 0, width: 30, height: 10 };
  const pieces = subtractRectangles(base, [{ column: 10, row: 0, width: 5, height: 10 }]);
  assertEquals(pieces.length, 2);
  assertEquals(area(pieces), 300 - 50);
});

Deno.test("the piece cap errs toward hiding, never toward painting over a window", () => {
  const base = { column: 0, row: 0, width: 100, height: 100 };
  // A diagonal of small covers shards the region hard.
  const covers = Array.from({ length: 40 }, (_, index) => ({
    column: index * 2,
    row: index * 2,
    width: 3,
    height: 3,
  }));
  const pieces = subtractRectangles(base, covers, 24);
  assert(pieces.length <= 24);
  assert(area(pieces) <= 100 * 100 - 0, "never more area than exists");
});
