// Copyright 2023 Im-Beast. MIT license.

// 036 L3: Block auto sizing, margin collapsing, replaced-widget
// measurement, and nested overflow propagation.

import { assert, assertEquals } from "./deps.ts";
import { createLayoutNode, createMarkupLayout, defaultComputedLayoutStyle, simpleLayoutSolver } from "../mod.ts";

function layout(markup: string, css: string, width = 30, height = 20) {
  return createMarkupLayout({
    markup,
    css,
    bounds: { column: 0, row: 0, width, height },
    widgets: false,
  });
}

Deno.test("adjacent sibling margins collapse to the larger, only without a gap", () => {
  const collapsed = layout(
    `<window id="main"><panel id="a">a</panel><panel id="b">b</panel></window>`,
    `#a { margin-bottom: 3; } #b { margin-top: 2; }`,
  );
  const a = collapsed.layout.byId.get("a")!.rect;
  const b = collapsed.layout.byId.get("b")!.rect;
  assertEquals(b.row - (a.row + a.height), 3); // max(3,2), not 5

  const gapped = layout(
    `<window id="main"><panel id="a">a</panel><panel id="b">b</panel></window>`,
    `#main { gap: 1; } #a { margin-bottom: 3; } #b { margin-top: 2; }`,
  );
  const ga = gapped.layout.byId.get("a")!.rect;
  const gb = gapped.layout.byId.get("b")!.rect;
  assertEquals(gb.row - (ga.row + ga.height), 6); // 3 + gap 1 + 2 — no collapse
});

Deno.test("block auto sizing: auto height wraps content, auto margins center", () => {
  const result = layout(
    `<window id="main"><panel id="card">one line of wrapping text content</panel></window>`,
    `#card { width: 10; margin: 0 auto; }`,
  );
  const card = result.layout.byId.get("card")!.rect;
  assertEquals(card.width, 10);
  assert(card.height >= 3, `auto height should wrap: ${card.height}`); // 32 chars at width 10
  assertEquals(card.column, 10); // (30 - 10) / 2 → centered by auto margins
});

Deno.test("replaced widgets derive the missing intrinsic axis from aspect-ratio", () => {
  // width declared, height derived: max-content width consults the
  // intrinsic measurement, where the completion happens.
  const imgStyle = defaultComputedLayoutStyle();
  imgStyle.aspectRatio = 2; // width / height
  imgStyle.width = { unit: "max-content", value: 0 };
  const img = createLayoutNode({ id: "img", tag: "panel", style: imgStyle, intrinsic: { width: 12 } });
  const root = createLayoutNode({ id: "root", tag: "window", children: [img] });
  const solved = simpleLayoutSolver().solve({ root, bounds: { column: 0, row: 0, width: 40, height: 20 } });
  const box = solved.root.children[0]!;
  assertEquals(box.rect.width, 12);
  assertEquals(box.rect.height, 6); // 12 / (2/1)

  // height declared, width derived: a max-content GRID column measures
  // the replaced child and sees the ratio-derived width.
  const gridStyle = defaultComputedLayoutStyle();
  gridStyle.display = "grid";
  gridStyle.gridTemplateColumns = [{ unit: "max-content", value: 0 }, { unit: "fr", value: 1 }];
  const tallStyle = defaultComputedLayoutStyle();
  tallStyle.aspectRatio = 2;
  const tall = createLayoutNode({ id: "tall", tag: "panel", style: tallStyle, intrinsic: { height: 5 } });
  const filler = createLayoutNode({ id: "filler", tag: "panel" });
  const rootTall = createLayoutNode({ id: "root", tag: "window", style: gridStyle, children: [tall, filler] });
  const solvedTall = simpleLayoutSolver().solve({
    root: rootTall,
    bounds: { column: 0, row: 0, width: 40, height: 20 },
  });
  assertEquals(solvedTall.root.children[0]!.rect.width, 10); // 5 * 2 sized the track
});

Deno.test("nested overflow: visible children spill upward, clipping children do not", () => {
  const visible = layout(
    `<window id="main"><panel id="inner"><panel id="tall"></panel></panel></window>`,
    `#main { height: 6; overflow: auto; }
     #inner { height: 4; overflow: visible; }
     #tall { height: 12; }`,
  );
  const main = visible.layout.byId.get("main")!;
  assert(main.scrollHeight >= 12, `visible child overflow must propagate: ${main.scrollHeight}`);

  const clipped = layout(
    `<window id="main"><panel id="inner"><panel id="tall"></panel></panel></window>`,
    `#main { height: 6; overflow: auto; }
     #inner { height: 4; overflow: hidden; }
     #tall { height: 12; }`,
  );
  const clippedMain = clipped.layout.byId.get("main")!;
  assert(clippedMain.scrollHeight <= 6, `clipped child overflow must NOT propagate: ${clippedMain.scrollHeight}`);
});
