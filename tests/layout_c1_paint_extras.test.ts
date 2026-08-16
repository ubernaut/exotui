// Copyright 2023 Im-Beast. MIT license.

// C1 paint checkbox, remaining parts: named layers resolve to z-order in an
// engine post-pass, container `align` shifts block children into free space,
// and scrollbar styling plus border titles ride the normalized model as
// renderer-owned fields.

import { assertEquals } from "./deps.ts";
import {
  applyLayoutDeclarations,
  cloneComputedLayoutStyle,
  createLayoutEngine,
  createLayoutNode,
  defaultComputedLayoutStyle,
  resolvedLayoutDeclarationFields,
} from "../mod.ts";
import type { ComputedLayoutBox, LayoutNode } from "../mod.ts";

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

function solve(root: LayoutNode, width: number, height: number) {
  return createLayoutEngine().layout({ root, bounds: { column: 0, row: 0, width, height } });
}

Deno.test("layers, align, scrollbar, and border-title declarations parse and report fields", () => {
  const style = styled([
    ["layers", "base overlay top"],
    ["layer", "overlay"],
    ["align", "center middle"],
    ["scrollbar-color", "cyan"],
    ["scrollbar-background", "#223"],
    ["scrollbar-size", "2"],
    ["border-title", '"Session"'],
    ["border-subtitle", "detached"],
    ["border-title-align", "center"],
  ]);
  assertEquals(style.layers, ["base", "overlay", "top"]);
  assertEquals(style.layer, "overlay");
  assertEquals([style.alignHorizontal, style.alignVertical], ["center", "middle"]);
  assertEquals([style.scrollbarColor, style.scrollbarBackgroundColor, style.scrollbarSize], ["cyan", "#223", 2]);
  assertEquals([style.borderTitle, style.borderSubtitle, style.borderTitleAlign], ["Session", "detached", "center"]);

  assertEquals(applyLayoutDeclarations(style, [["layers", "none"]]).layers, undefined);
  assertEquals(applyLayoutDeclarations(style, [["layer", "none"]]).layer, undefined);
  assertEquals(applyLayoutDeclarations(style, [["align", "sideways up"]]).alignHorizontal, "center"); // junk rejected
  assertEquals(resolvedLayoutDeclarationFields("align", "left top"), ["alignHorizontal", "alignVertical"]);
  assertEquals(resolvedLayoutDeclarationFields("layers", "a b"), ["layers"]);

  const clone = cloneComputedLayoutStyle(style);
  assertEquals(clone.layers, style.layers);
  assertEquals(clone.layers === style.layers, false);
});

Deno.test("a node on a later layer rises above its siblings in z-order", () => {
  const root = createLayoutNode({
    id: "root",
    tag: "div",
    style: styled([["layers", "base overlay"]]),
    children: [
      createLayoutNode({ id: "under", tag: "div", style: styled([["height", "2"]]) }),
      createLayoutNode({
        id: "over",
        tag: "div",
        style: styled([["height", "2"], ["layer", "overlay"]]),
        children: [createLayoutNode({ id: "inner", tag: "div", style: styled([["height", "1"]]) })],
      }),
      createLayoutNode({ id: "unknown", tag: "div", style: styled([["height", "1"], ["layer", "missing"]]) }),
    ],
  });
  const result = solve(root, 20, 8);
  assertEquals(byId(result.root, "under")!.zIndex, 0);
  const over = byId(result.root, "over")!;
  assertEquals(over.zIndex, 1);
  assertEquals(over.hitRegions[0]!.zIndex, 1);
  assertEquals(byId(result.root, "inner")!.zIndex, 1); // the subtree rises together
  assertEquals(byId(result.root, "unknown")!.zIndex, 0); // undeclared layer: untouched
});

Deno.test("container align shifts block children into the free space", () => {
  const root = createLayoutNode({
    id: "root",
    tag: "div",
    style: styled([["align", "center middle"]]),
    children: [createLayoutNode({ id: "child", tag: "div", style: styled([["width", "4"], ["height", "2"]]) })],
  });
  assertEquals(byId(solve(root, 20, 10).root, "child")!.rect, { column: 8, row: 4, width: 4, height: 2 });

  const bottomRight = createLayoutNode({
    id: "root",
    tag: "div",
    style: styled([["align", "right bottom"]]),
    children: [createLayoutNode({ id: "child", tag: "div", style: styled([["width", "4"], ["height", "2"]]) })],
  });
  assertEquals(byId(solve(bottomRight, 20, 10).root, "child")!.rect, { column: 16, row: 8, width: 4, height: 2 });
});
