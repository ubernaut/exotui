// Copyright 2023 Im-Beast. MIT license.

// 036 V1 ScrollBox audit closures: sticky edges, culling, acceleration,
// scrollChildIntoView, nested routing.

import { assert, assertEquals } from "./deps.ts";
import {
  cullToViewport,
  routeNestedScroll,
  ScrollAreaController,
  scrollChildIntoView,
  StickyEdgeScroll,
  WheelAcceleration,
} from "../mod.ts";

function area(content: [number, number], viewport: [number, number]) {
  return new ScrollAreaController({
    contentWidth: content[0],
    contentHeight: content[1],
    viewportWidth: viewport[0],
    viewportHeight: viewport[1],
  });
}

Deno.test("sticky bottom follows growth only while pinned", () => {
  const log = area([10, 20], [10, 5]);
  const sticky = new StickyEdgeScroll(log, "bottom");
  log.scrollTo(0, 15); // max rows = 15 → pinned
  assert(sticky.pinned());
  sticky.contentResized(10, 30);
  assertEquals(log.offset.peek().rows, 25); // followed to the new bottom

  log.scrollTo(0, 3); // user scrolled away → unpinned
  assert(!sticky.pinned());
  sticky.contentResized(10, 40);
  assertEquals(log.offset.peek().rows, 3); // growth did NOT yank the view
  log.dispose();
});

Deno.test("viewport culling returns exactly the intersecting children", () => {
  const children = [
    { column: 0, row: 0, width: 10, height: 2 },
    { column: 0, row: 6, width: 10, height: 2 },
    { column: 0, row: 40, width: 10, height: 2 },
    { column: 30, row: 7, width: 5, height: 1 }, // off to the right
  ];
  assertEquals(cullToViewport(children, { columns: 0, rows: 5 }, 20, 5), [1]);
  assertEquals(cullToViewport(children, { columns: 25, rows: 5 }, 20, 5), [3]);
});

Deno.test("scrollChildIntoView moves minimally on both axes and respects margin", () => {
  const view = area([100, 100], [20, 10]);
  scrollChildIntoView(view, { column: 50, row: 40, width: 5, height: 3 });
  assertEquals(view.offset.peek(), { columns: 35, rows: 33 }); // right/bottom minimal
  scrollChildIntoView(view, { column: 30, row: 30, width: 2, height: 2 }, { margin: 1 });
  assertEquals(view.offset.peek(), { columns: 29, rows: 29 }); // top/left with margin
  const before = view.offset.peek();
  scrollChildIntoView(view, { column: 31, row: 31, width: 2, height: 2 }); // already visible
  assertEquals(view.offset.peek(), before);
  view.dispose();
});

Deno.test("wheel acceleration ramps within the window and resets outside it", () => {
  const wheel = new WheelAcceleration({ windowMs: 100, maxMultiplier: 3, rampPerTick: 1 });
  assertEquals(wheel.tick(0), 1);
  assertEquals(wheel.tick(50), 2);
  assertEquals(wheel.tick(100), 3);
  assertEquals(wheel.tick(150), 3); // capped
  assertEquals(wheel.tick(1000), 1); // window elapsed → reset
});

Deno.test("nested routing chains only the unconsumed leftover, unless contained", () => {
  const inner = area([10, 20], [10, 5]); // max rows 15
  const outer = area([10, 60], [10, 10]);
  inner.scrollTo(0, 13);
  const routed = routeNestedScroll(inner, outer, { columns: 0, rows: 5 });
  assertEquals(routed.consumedByInner.rows, 2); // 13 → 15 clamped
  assertEquals(routed.chainedToOuter.rows, 3); // leftover reached the parent
  assertEquals(outer.offset.peek().rows, 3);

  const contained = routeNestedScroll(inner, outer, { columns: 0, rows: 4 }, { contain: true });
  assertEquals(contained.consumedByInner.rows, 0); // inner already at edge
  assertEquals(contained.chainedToOuter.rows, 0); // contain stops the chain
  assertEquals(outer.offset.peek().rows, 3);
  inner.dispose();
  outer.dispose();
});
