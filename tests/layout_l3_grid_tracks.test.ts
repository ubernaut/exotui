// Copyright 2023 Im-Beast. MIT license.

// 036 L3: minmax(), fit-content(), auto-fill/auto-fit repetition,
// content-based tracks, and richer implicit-track sizing.

import { assert, assertEquals } from "./deps.ts";
import { createMarkupLayout, parseGridTemplateTrackList, parseLayoutLength } from "../mod.ts";

function grid(css: string, markup: string, width = 40, height = 10) {
  return createMarkupLayout({
    markup,
    css,
    bounds: { column: 0, row: 0, width, height },
    widgets: false,
  });
}

Deno.test("parse: minmax and fit-content(limit) carry their bounds; fr minimum refuses", () => {
  assertEquals(parseLayoutLength("minmax(4, 1fr)"), {
    unit: "minmax",
    value: 0,
    minTrack: { unit: "cell", value: 4 },
    maxTrack: { unit: "fr", value: 1 },
  });
  assertEquals(parseLayoutLength("fit-content(12)"), {
    unit: "fit-content",
    value: 0,
    limitTrack: { unit: "cell", value: 12 },
  });
  assertEquals(parseLayoutLength("minmax(1fr, 2)", { unit: "auto", value: 0 }), { unit: "auto", value: 0 });
});

Deno.test("parse: repeat(auto-fill/auto-fit) records ONE auto repeat; a second refuses", () => {
  const template = parseGridTemplateTrackList("10 repeat(auto-fill, minmax(8, 1fr)) 6");
  assertEquals(template.tracks, [{ unit: "cell", value: 10 }, { unit: "cell", value: 6 }]);
  assertEquals(template.autoRepeat!.mode, "auto-fill");
  assertEquals(template.autoRepeat!.insertAt, 1);
  assertEquals(template.autoRepeat!.tracks[0]!.unit, "minmax");
  // Numeric repeats still expand inline, even with minmax inside.
  assertEquals(parseGridTemplateTrackList("repeat(2, minmax(2, 4) 1fr)").tracks.length, 4);
  assertEquals(parseGridTemplateTrackList("repeat(auto-fill, 4) repeat(auto-fit, 4)").tracks, []);
});

Deno.test("minmax floors hold under pressure and fr maxima share the remainder", () => {
  const result = grid(
    `#main { display: grid; grid-template-columns: minmax(10, 1fr) minmax(4, 2fr); }
     #a { grid-column: 1; } #b { grid-column: 2; }`,
    `<window id="main"><panel id="a"></panel><panel id="b"></panel></window>`,
    30,
  );
  const a = result.layout.byId.get("a")!.rect;
  const b = result.layout.byId.get("b")!.rect;
  // Floors 10+4 leave 16; shared 1:2 → a=10+5, b=4+11 (last flex takes the rest).
  assertEquals(a.width + b.width, 30);
  assert(a.width >= 10 && b.width >= 4);
  assert(b.width > a.width - 5); // the 2fr side got the larger share of growth
});

Deno.test("fit-content(limit) grows to its content but never past the limit", () => {
  const result = grid(
    `#main { display: grid; grid-template-columns: fit-content(8) 1fr; }
     #a { grid-column: 1; } #b { grid-column: 2; }`,
    `<window id="main"><panel id="a">wide content here</panel><panel id="b">x</panel></window>`,
    40,
  );
  const a = result.layout.byId.get("a")!.rect;
  assert(a.width <= 8, `fit-content exceeded its limit: ${a.width}`);
  assert(a.width >= 4, `fit-content ignored its content: ${a.width}`);
});

Deno.test("content-based tracks: min-content and max-content size from the item", () => {
  const result = grid(
    `#main { display: grid; grid-template-columns: max-content 1fr; }
     #a { grid-column: 1; } #b { grid-column: 2; }`,
    `<window id="main"><panel id="a">abcdef</panel><panel id="b">x</panel></window>`,
    40,
  );
  const a = result.layout.byId.get("a")!.rect;
  assertEquals(a.width, 6); // exactly the unwrapped content
});

Deno.test("auto-fill packs as many repetitions as the axis holds", () => {
  const result = grid(
    `#main { display: grid; grid-template-columns: repeat(auto-fill, minmax(10, 1fr)); }
     #a {} #b {} #c {}`,
    `<window id="main"><panel id="a"></panel><panel id="b"></panel><panel id="c"></panel></window>`,
    32,
  );
  // 32 cells hold three 10-minimum tracks; leftovers stretch the frs.
  const a = result.layout.byId.get("a")!.rect;
  const b = result.layout.byId.get("b")!.rect;
  const c = result.layout.byId.get("c")!.rect;
  assertEquals(a.row, b.row);
  assertEquals(b.row, c.row); // all three fit on one row
  assert(a.width >= 10 && b.width >= 10 && c.width >= 10);
});

Deno.test("auto-fit collapses the empty repeat tracks so content takes the space", () => {
  const fill = grid(
    `#main { display: grid; grid-template-columns: repeat(auto-fill, minmax(10, 1fr)); }
     #a {}`,
    `<window id="main"><panel id="a"></panel></window>`,
    32,
  );
  const fit = grid(
    `#main { display: grid; grid-template-columns: repeat(auto-fit, minmax(10, 1fr)); }
     #a {}`,
    `<window id="main"><panel id="a"></panel></window>`,
    32,
  );
  const fillWidth = fill.layout.byId.get("a")!.rect.width;
  const fitWidth = fit.layout.byId.get("a")!.rect.width;
  assert(fillWidth <= 11, `auto-fill should keep empty tracks: ${fillWidth}`);
  assertEquals(fitWidth, 32); // collapsed empties hand the whole axis over
});

Deno.test("implicit tracks accept minmax: richer implicit-track sizing", () => {
  const result = grid(
    `#main { display: grid; grid-template-columns: 1fr; grid-auto-rows: minmax(2, 4); }
     #a { grid-row: 1; } #b { grid-row: 2; }`,
    `<window id="main"><panel id="a"></panel><panel id="b"></panel></window>`,
    20,
    12,
  );
  const a = result.layout.byId.get("a")!.rect;
  const b = result.layout.byId.get("b")!.rect;
  assert(a.height >= 2 && a.height <= 4, `implicit minmax row out of bounds: ${a.height}`);
  assert(b.height >= 2 && b.height <= 4, `implicit minmax row out of bounds: ${b.height}`);
});
