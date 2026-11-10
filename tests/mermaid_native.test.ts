// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import { mermaidNativeLines, type MermaidScene, renderMermaidNativeFrame } from "../mod.mermaid.ts";

function fixture(): MermaidScene {
  return {
    width: 120,
    height: 64,
    title: "Measured scene",
    description: "Styled geometry and actual text.",
    diagnostics: [],
    items: [{
      kind: "path",
      points: [{ x: 4, y: 4 }, { x: 112, y: 4 }, { x: 112, y: 56 }, { x: 4, y: 56 }, { x: 4, y: 4 }],
      closed: true,
      paint: { fill: "rgb(16, 32, 48)", stroke: "rgb(0, 255, 255)", strokeWidth: 2, dash: [], opacity: 1 },
    }, {
      kind: "text",
      text: "Readable ❤",
      x: 12,
      y: 20,
      width: 88,
      height: 16,
      color: "rgb(255, 255, 255)",
      fontWeight: "700",
      fontStyle: "italic",
      href: "product:readable",
    }],
  };
}

Deno.test("native Mermaid scene preserves vector shape, real text, resolved colors, emphasis and links", () => {
  const scene = fixture();
  const frame = renderMermaidNativeFrame(scene);
  const lines = mermaidNativeLines(frame);
  assertStringIncludes(lines.join("\n"), "Readable ❤");
  assert(/[┌┐└┘│─]/.test(lines.join("\n")));
  assertEquals(
    frame.cells[0]![0]!.char,
    "┌",
    "a closed rectangle must retain its first corner, not a slash or endpoint",
  );
  const cells = frame.cells.flat();
  const first = cells.find((cell) => cell.char === "R")!;
  assertEquals(first.foreground, "rgb(255, 255, 255)");
  assertEquals(first.bold, true);
  assertEquals(first.italic, true);
  assertEquals(first.href, "product:readable");
  assert(cells.some((cell) => cell.background === "rgb(16, 32, 48)"));
  assertEquals(frame.diagnostics, []);
});

Deno.test("native Mermaid thick and dashed paths remain distinct instead of collapsing to ordinary traces", () => {
  const scene = fixture();
  const path = scene.items[0]!;
  if (path.kind !== "path") throw new Error("fixture");
  const ordinary = mermaidNativeLines(renderMermaidNativeFrame(scene)).join("\n");
  path.paint.dash = [0, 0];
  assertEquals(mermaidNativeLines(renderMermaidNativeFrame(scene)).join("\n"), ordinary);
  path.paint.strokeWidth = 4;
  const thick = mermaidNativeLines(renderMermaidNativeFrame(scene)).join("\n");
  assert(thick !== ordinary);
  assert(/[═║╔╗╚╝]/.test(thick));
  path.paint.dash = [3, 3];
  const dashed = mermaidNativeLines(renderMermaidNativeFrame(scene)).join("\n");
  assert(dashed !== thick);
  assert(/[┅┇]/.test(dashed), "thick dashed strokes must keep their thickness");
  path.paint.dash = [0, 3];
  path.paint.strokeWidth = 1;
  assert(!renderMermaidNativeFrame(scene).cells.flat().some((cell) => cell.foreground === path.paint.stroke));
  path.paint.lineCap = "round";
  assert(/[┄┆]/.test(mermaidNativeLines(renderMermaidNativeFrame(scene)).join("\n")));
});

Deno.test("native Mermaid forwards extraction gaps, reports image work and bounds allocation", () => {
  const scene = fixture();
  scene.diagnostics = ["SVG markers need scene expansion."];
  scene.items = [...scene.items, {
    kind: "image",
    href: "data:image/png;base64,test",
    x: 10,
    y: 10,
    width: 20,
    height: 20,
  }];
  const frame = renderMermaidNativeFrame(scene);
  assert(frame.diagnostics.includes("SVG markers need scene expansion."));
  assert(frame.diagnostics.some((message) => message.includes("image-capable")));
  assertThrows(() => renderMermaidNativeFrame(scene, { maxCells: 1 }), RangeError);
  assertThrows(() => renderMermaidNativeFrame(scene, { columnUnits: 0 }), RangeError);
  assertThrows(() => renderMermaidNativeFrame({ ...scene, width: Infinity }), RangeError);
  const invalid = fixture();
  const path = invalid.items[0]!;
  if (path.kind !== "path") throw new Error("fixture");
  path.points = [{ x: 0, y: 0 }, { x: 1e12, y: 0 }];
  const clipped = renderMermaidNativeFrame(invalid);
  assertEquals(clipped.cells.length, clipped.rows);
  assert(mermaidNativeLines(clipped)[0]!.includes("─"));
  path.points = [{ x: 0, y: 0 }, { x: Infinity, y: 0 }];
  assertThrows(() => renderMermaidNativeFrame(invalid), RangeError);
});

Deno.test("native compound paths preserve disconnected strokes and winding-rule holes", () => {
  const outer = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }, { x: 10, y: 10 }];
  const inner = [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }, { x: 30, y: 30 }];
  const scene: MermaidScene = {
    width: 100,
    height: 100,
    title: "Contours",
    description: "",
    diagnostics: [],
    items: [{
      kind: "path",
      points: outer,
      closed: true,
      subpaths: [{ points: outer, closed: true }, { points: inner, closed: true }],
      paint: { fill: "red", stroke: "none", strokeWidth: 0, dash: [], opacity: 1, fillRule: "evenodd" },
    }],
  };
  const options = { columnUnits: 5, rowUnits: 10 };
  assertEquals(renderMermaidNativeFrame(scene, options).cells[5]![10]!.background, undefined);
  const item = scene.items[0]!;
  if (item.kind !== "path") throw new Error("fixture");
  item.paint.fillRule = "nonzero";
  assertEquals(renderMermaidNativeFrame(scene, options).cells[5]![10]!.background, "red");
  item.subpaths = [{ points: outer, closed: true }, { points: [...inner].reverse(), closed: true }];
  assertEquals(renderMermaidNativeFrame(scene, options).cells[5]![10]!.background, undefined);
  item.paint.fill = "none";
  item.paint.stroke = "blue";
  item.paint.strokeWidth = 1;
  item.subpaths = [{ points: [{ x: 10, y: 20 }, { x: 30, y: 20 }], closed: false }, {
    points: [{ x: 70, y: 20 }, { x: 90, y: 20 }],
    closed: false,
  }];
  const frame = renderMermaidNativeFrame(scene, options);
  assert(frame.cells[2]!.slice(7, 14).every((cell) => !cell.foreground));
  assert(frame.cells[2]!.some((cell) => cell.foreground === "blue"));
});
