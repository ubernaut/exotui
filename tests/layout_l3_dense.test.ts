// Copyright 2023 Im-Beast. MIT license.

// 036 L3: dense placement with deterministic document/focus order and
// declared accessibility semantics.

import { assert, assertEquals } from "./deps.ts";
import {
  applyCssCascade,
  createMarkupLayout,
  GRID_DENSE_PLACEMENT_SEMANTICS,
  parseCssStylesheet,
  parseTuiMarkup,
} from "../mod.ts";

const MARKUP = `
  <window id="main">
    <panel id="wide"></panel>
    <panel id="second"></panel>
    <panel id="small"></panel>
  </window>
`;

function place(dense: boolean) {
  return createMarkupLayout({
    markup: MARKUP,
    css: `
      #main { display: grid; grid-template-columns: 10 10 10; grid-auto-flow: row${dense ? " dense" : ""}; }
      #wide { grid-column: span 2; }
      #second { grid-column: 2 / span 2; grid-row: 1; }
      #small {}
    `,
    bounds: { column: 0, row: 0, width: 30, height: 9 },
    widgets: false,
  });
}

Deno.test("sparse flow leaves the hole; dense backfills it", () => {
  // #second occupies row 0 columns 1-2, pushing #wide (span 2) to row 1
  // and leaving row 0 column 0 empty. #small placed after wide: sparse
  // keeps moving forward; dense returns to fill the hole.
  const sparse = place(false);
  const dense = place(true);
  const sparseSmall = sparse.layout.byId.get("small")!.rect;
  const denseSmall = dense.layout.byId.get("small")!.rect;
  assertEquals([denseSmall.column, denseSmall.row], [0, 0]); // backfilled into the hole
  assert(sparseSmall.row > 0 || sparseSmall.column > 0, "sparse must not backfill row 0 col 0");
  assert(sparseSmall.row >= sparse.layout.byId.get("wide")!.rect.row, "sparse cursor only moves forward");
});

Deno.test("dense reorders nothing but geometry: document order is source order", () => {
  const dense = place(true);
  // The layout result lists boxes in source order regardless of where
  // dense placed them visually — that IS the focus order contract.
  const ids = [...dense.layout.byId.keys()];
  assertEquals(ids.indexOf("wide") < ids.indexOf("second"), true);
  assertEquals(ids.indexOf("second") < ids.indexOf("small"), true);
});

Deno.test("the accessibility semantics are declared, frozen data", () => {
  assert(Object.isFrozen(GRID_DENSE_PLACEMENT_SEMANTICS));
  assertEquals(GRID_DENSE_PLACEMENT_SEMANTICS.visualOnly, true);
  assertEquals(GRID_DENSE_PLACEMENT_SEMANTICS.focusOrder, "source order, always");
});

Deno.test("bare 'dense' implies row flow; flow word alone stays sparse", () => {
  const styled = applyCssCascade(
    parseTuiMarkup(`<window id="main"><panel id="a"></panel></window>`).root,
    parseCssStylesheet(`#main { display: grid; grid-auto-flow: dense; }`),
  );
  assertEquals(styled.style.gridAutoFlow, "row");
  assertEquals(styled.style.gridAutoFlowDense, true);
});
