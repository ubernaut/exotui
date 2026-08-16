// Copyright 2023 Im-Beast. MIT license.

// 036 L3: named grid lines and backend-neutral template areas; Yoga
// stays explicitly Flex-only.

import { assert, assertEquals } from "./deps.ts";
import {
  createMarkupLayout,
  parseGridPlacement,
  parseGridTemplateTrackList,
  resolveGridTemplateArea,
  resolveNamedGridPlacement,
  YOGA_LAYOUT_SOLVER_CAPABILITIES,
} from "../mod.ts";

Deno.test("parse: [name] groups collect per line; placement accepts names", () => {
  const template = parseGridTemplateTrackList("[side-start] 10 [side-end main-start] 1fr [main-end]");
  assertEquals(template.tracks.length, 2);
  assertEquals(template.lineNames, [["side-start"], ["side-end", "main-start"], ["main-end"]]);
  assertEquals(parseGridPlacement("side-start / main-end"), {
    startName: "side-start",
    endName: "main-end",
  });
  assertEquals(parseGridPlacement("main-start / span 2"), { startName: "main-start", span: 2 });
});

Deno.test("named lines resolve to numeric lines; area names contribute implicit lines", () => {
  const lineNames = [["side-start"], ["side-end", "main-start"], ["main-end"]];
  assertEquals(
    resolveNamedGridPlacement({ startName: "main-start", endName: "main-end" }, lineNames, [], "column"),
    { start: 2, end: 3, span: 1 },
  );
  const areas = [["nav", "body"], ["nav", "body"]];
  // No [name] declarations: the area generates nav-start/nav-end lines.
  assertEquals(
    resolveNamedGridPlacement({ startName: "body-start", endName: "body-end" }, undefined, areas, "column"),
    { start: 2, end: 3, span: 1 },
  );
  // A bare area name means the area's own extent.
  assertEquals(
    resolveNamedGridPlacement({ startName: "nav", endName: "nav" }, undefined, areas, "row"),
    { start: 1, end: 3, span: 2 },
  );
});

Deno.test("resolveGridTemplateArea is shared and refuses non-rectangular areas", () => {
  assertEquals(resolveGridTemplateArea([["a", "a"], ["a", "b"]], "a"), undefined); // L-shape refused
  assertEquals(resolveGridTemplateArea([["a", "a"], ["b", "b"]], "a"), {
    column: 0,
    row: 0,
    columnSpan: 2,
    rowSpan: 1,
  });
});

Deno.test("end-to-end: named-line placement drives real geometry", () => {
  const result = createMarkupLayout({
    markup: `<window id="main"><panel id="side"></panel><panel id="body"></panel></window>`,
    css: `
      #main { display: grid; grid-template-columns: [side-start] 10 [side-end body-start] 1fr [body-end]; }
      #side { grid-column: side-start / side-end; }
      #body { grid-column: body-start / body-end; }
    `,
    bounds: { column: 0, row: 0, width: 40, height: 6 },
    widgets: false,
  });
  const side = result.layout.byId.get("side")!.rect;
  const body = result.layout.byId.get("body")!.rect;
  assertEquals(side.width, 10);
  assertEquals(body.column, 10);
  assertEquals(body.width, 30);
});

Deno.test("Yoga remains explicitly Flex-only: grid is declared unsupported", () => {
  assertEquals(YOGA_LAYOUT_SOLVER_CAPABILITIES.displayModes.grid, "unsupported");
  assertEquals(YOGA_LAYOUT_SOLVER_CAPABILITIES.style.gridTemplateColumnsLineNames, "unsupported");
  assert(
    YOGA_LAYOUT_SOLVER_CAPABILITIES.limitations.gridTemplateColumns!.some((note) => note.includes("not mapped")),
  );
});
