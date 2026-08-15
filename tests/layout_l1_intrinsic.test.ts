// Copyright 2023 Im-Beast. MIT license.

// L1 intrinsic sizing: min-content, max-content, fit-content keywords and
// content-derived minimums for text and measured widgets (036 L1).

import { assert, assertEquals } from "./deps.ts";
import {
  createMarkupLayout,
  measureTerminalTextMinContentWidth,
  parseLayoutLength,
  SIMPLE_LAYOUT_SOLVER_CAPABILITIES,
  YOGA_LAYOUT_SOLVER_CAPABILITIES,
} from "../mod.ts";

// Words: alpha(5) wideword(8) beta(4); unwrapped line = 19 cells.
const TEXT = "alpha wideword beta";

Deno.test("L1 intrinsic keywords parse and measure text min-content width", () => {
  assertEquals(parseLayoutLength("min-content"), { unit: "min-content", value: 0 });
  assertEquals(parseLayoutLength("max-content"), { unit: "max-content", value: 0 });
  assertEquals(parseLayoutLength("fit-content"), { unit: "fit-content", value: 0 });

  assertEquals(measureTerminalTextMinContentWidth(TEXT, { breakWords: false }), 8);
  // Arbitrary word breaking reduces the floor to the widest single cluster.
  assertEquals(measureTerminalTextMinContentWidth(TEXT, { breakWords: true }), 1);
  assertEquals(measureTerminalTextMinContentWidth("", { breakWords: false }), 1);
});

Deno.test("L1 intrinsic keywords size block text through the simple solver", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="maxc">${TEXT}</panel>
        <panel id="minc">${TEXT}</panel>
        <panel id="fit">${TEXT}</panel>
        <panel id="floor">${TEXT}</panel>
      </window>
    `,
    css: `
      #maxc { width: max-content; }
      #minc { width: min-content; }
      #fit { width: fit-content; }
      #floor { width: 2; min-width: min-content; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 16 },
    widgets: false,
  });

  // max-content: the unwrapped line; min-content: the longest word, and the
  // text wraps to three rows inside it.
  assertEquals(result.layout.byId.get("maxc")!.rect.width, 19);
  const minc = result.layout.byId.get("minc")!;
  assertEquals(minc.rect.width, 8);
  assertEquals(minc.rect.height, 3);

  // fit-content clamps the available size between the two.
  assertEquals(result.layout.byId.get("fit")!.rect.width, 19);

  // min-width: min-content is the content-derived floor: an authored width of
  // 2 cannot squeeze below the longest word.
  assertEquals(result.layout.byId.get("floor")!.rect.width, 8);
});

Deno.test("L1 fit-content follows a narrow container down to the content floor", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="narrow"><panel id="fit">${TEXT}</panel></panel>
      </window>
    `,
    css: `
      #narrow { width: 12; }
      #fit { width: fit-content; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 12 },
    widgets: false,
  });
  // available 12 sits between min-content 8 and max-content 19.
  assertEquals(result.layout.byId.get("fit")!.rect.width, 12);
});

Deno.test("L1 flex items refuse to shrink below a min-content minimum", () => {
  const result = createMarkupLayout({
    markup: `
      <window id="root">
        <panel id="protected">${TEXT}</panel>
        <panel id="greedy">x</panel>
      </window>
    `,
    css: `
      #root { display: flex; flex-direction: row; }
      #protected { flex-shrink: 1; min-width: min-content; }
      #greedy { flex-grow: 1; flex-basis: 20; }
    `,
    bounds: { column: 0, row: 0, width: 16, height: 8 },
    widgets: false,
  });
  // The content-derived minimum (longest word, 8 cells) holds under pressure.
  assert(result.layout.byId.get("protected")!.rect.width >= 8);
});

Deno.test("L1 intrinsic keywords are classified per solver", () => {
  for (const unit of ["min-content", "max-content", "fit-content"] as const) {
    assertEquals(SIMPLE_LAYOUT_SOLVER_CAPABILITIES.lengthUnits[unit], "partial");
    assertEquals(YOGA_LAYOUT_SOLVER_CAPABILITIES.lengthUnits[unit], "unsupported");
  }
  assert(
    SIMPLE_LAYOUT_SOLVER_CAPABILITIES.notes.some((note) => note.includes("min-content")),
    "the simple profile documents the intrinsic-sizing subset",
  );
});
