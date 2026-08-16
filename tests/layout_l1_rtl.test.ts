// Copyright 2023 Im-Beast. MIT license.

// 036 L1: logical start/end edges and direction/RTL under the one
// clear model — cells visual, logical names resolved at computed-value
// time, ordering and hit testing unchanged.

import { assert, assertEquals } from "./deps.ts";
import { createMarkupLayout, LOGICAL_EDGE_MODEL } from "../mod.ts";

function layout(css: string) {
  return createMarkupLayout({
    markup: `<window id="main"><panel id="card">x</panel></window>`,
    css,
    bounds: { column: 0, row: 0, width: 20, height: 4 },
    widgets: false,
  });
}

Deno.test("logical margins resolve to physical edges from the final direction", () => {
  const ltr = layout(`#card { margin-inline-start: 3; width: 5; height: 1; }`);
  assertEquals(ltr.layout.byId.get("card")!.rect.column, 3); // start = left

  const rtl = layout(`#main { direction: rtl; } #card { margin-inline-start: 3; width: 5; height: 1; }`);
  const card = rtl.layout.byId.get("card")!;
  assertEquals(card.margin.right, 3); // start = right under rtl
  assertEquals(card.margin.left, 0);
});

Deno.test("declaration order never matters: computed-value-time resolution", () => {
  // Logical edge declared BEFORE direction in the same rule still
  // resolves against the final direction.
  const result = layout(`#card { margin-inline-end: 4; direction: rtl; width: 5; height: 1; }`);
  const card = result.layout.byId.get("card")!;
  assertEquals(card.margin.left, 4); // end = left under rtl
});

Deno.test("direction inherits; children resolve against it", () => {
  const result = createMarkupLayout({
    markup: `<window id="main"><panel id="outer"><panel id="inner">x</panel></panel></window>`,
    css: `#main { direction: rtl; } #inner { padding-inline-start: 2; height: 1; }`,
    bounds: { column: 0, row: 0, width: 20, height: 4 },
    widgets: false,
  });
  assertEquals(result.layout.byId.get("inner")!.padding.right, 2); // inherited rtl
});

Deno.test("rtl flips the flex row axis only; order and hit testing stay put", () => {
  const css = (direction: string) => `
    #main { display: flex; ${direction} width: 20; height: 2; }
    #a { width: 5; height: 1; } #b { width: 5; height: 1; }
  `;
  const markup = `<window id="main"><panel id="a">a</panel><panel id="b">b</panel></window>`;
  const bounds = { column: 0, row: 0, width: 20, height: 4 };
  const ltr = createMarkupLayout({ markup, css: css(""), bounds, widgets: false });
  const rtl = createMarkupLayout({ markup, css: css("direction: rtl;"), bounds, widgets: false });
  assert(ltr.layout.byId.get("a")!.rect.column < ltr.layout.byId.get("b")!.rect.column);
  assert(rtl.layout.byId.get("a")!.rect.column > rtl.layout.byId.get("b")!.rect.column); // row from the right
  // Ordering: the layout result keeps source order either way.
  assertEquals([...rtl.layout.byId.keys()].indexOf("a") < [...rtl.layout.byId.keys()].indexOf("b"), true);
  // Hit testing: regions are physical rects that match the layout.
  const aRect = rtl.layout.byId.get("a")!.rect;
  const aRegion = rtl.layout.byId.get("a")!.hitRegions[0]!;
  assertEquals(aRegion.bounds.column, aRect.column);
});

Deno.test("the shared model is declared, frozen data", () => {
  assert(Object.isFrozen(LOGICAL_EDGE_MODEL));
  assertEquals(LOGICAL_EDGE_MODEL.cells, "visual, always");
  assert(LOGICAL_EDGE_MODEL.bidiText.includes("out of scope"));
});
