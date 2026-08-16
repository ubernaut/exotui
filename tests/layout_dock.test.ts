// Copyright 2023 Im-Beast. MIT license.

// C1 dock: docked children leave normal flow, pin to their container's
// content edges in document order, and reserve their strip — siblings flow
// in the remaining area. Textual semantics on the simple solver.

import { assertEquals } from "./deps.ts";
import {
  applyLayoutDeclarations,
  createLayoutEngine,
  createLayoutNode,
  defaultComputedLayoutStyle,
  resolvedLayoutDeclarationFields,
} from "../mod.ts";
import type { ComputedLayoutBox, LayoutNode } from "../mod.ts";

function solve(root: LayoutNode, width: number, height: number) {
  return createLayoutEngine().layout({ root, bounds: { column: 0, row: 0, width, height } });
}

function styled(declarations: ReadonlyArray<readonly [string, string]>): ReturnType<typeof defaultComputedLayoutStyle> {
  return applyLayoutDeclarations(defaultComputedLayoutStyle(), declarations);
}

function byId(box: ComputedLayoutBox, id: string): ComputedLayoutBox | undefined {
  if (box.id === id) return box;
  for (const child of box.children) {
    const found = byId(child, id);
    if (found) return found;
  }
  return undefined;
}

function fixture(): LayoutNode {
  return createLayoutNode({
    id: "root",
    tag: "div",
    children: [
      createLayoutNode({ id: "status", tag: "div", style: styled([["dock", "top"], ["height", "1"]]) }),
      createLayoutNode({ id: "nav", tag: "div", style: styled([["dock", "left"], ["width", "10"]]) }),
      createLayoutNode({ id: "footer", tag: "div", style: styled([["dock", "bottom"], ["height", "2"]]) }),
      createLayoutNode({ id: "content", tag: "div", style: styled([["height", "100h"]]) }),
    ],
  });
}

Deno.test("docks pin to edges in document order and flow gets the remainder", () => {
  const result = solve(fixture(), 40, 12);
  const status = byId(result.root, "status")!;
  const nav = byId(result.root, "nav")!;
  const footer = byId(result.root, "footer")!;
  const content = byId(result.root, "content")!;

  // Top dock spans the full width at the top.
  assertEquals(status.rect, { column: 0, row: 0, width: 40, height: 1 });
  // Left dock spans the height remaining below the top dock.
  assertEquals(nav.rect, { column: 0, row: 1, width: 10, height: 11 });
  // Bottom dock spans the width remaining right of the left dock.
  assertEquals(footer.rect, { column: 10, row: 10, width: 30, height: 2 });
  // Normal flow fills what is left.
  assertEquals(content.rect, { column: 10, row: 1, width: 30, height: 9 });
});

Deno.test("dock parses, clears with none, and reports its capability", () => {
  const docked = styled([["dock", "right"]]);
  assertEquals(docked.dock, "right");
  assertEquals(applyLayoutDeclarations(docked, [["dock", "none"]]).dock, undefined);
  // A junk value leaves the style untouched.
  assertEquals(applyLayoutDeclarations(docked, [["dock", "sideways"]]).dock, "right");
  assertEquals(resolvedLayoutDeclarationFields("dock", "top"), ["dock"]);
});

Deno.test("docked children stay out of flex flow and hit regions stay consistent", () => {
  const root = createLayoutNode({
    id: "root",
    tag: "div",
    style: styled([["display", "flex"], ["flex-direction", "row"]]),
    children: [
      createLayoutNode({ id: "side", tag: "div", style: styled([["dock", "left"], ["width", "5"]]) }),
      createLayoutNode({ id: "a", tag: "div", style: styled([["width", "100w"]]) }),
    ],
  });
  const result = solve(root, 20, 4);
  const side = byId(result.root, "side")!;
  const a = byId(result.root, "a")!;
  assertEquals(side.rect, { column: 0, row: 0, width: 5, height: 4 });
  // The flex item sizes against the reduced flow area, not the full content.
  assertEquals(a.rect, { column: 5, row: 0, width: 15, height: 4 });
});
