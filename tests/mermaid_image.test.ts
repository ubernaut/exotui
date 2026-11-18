// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { decodeImageAsset, encodeImageBytes, imageDimensions, imageLimits } from "../src/content/mermaid_image.ts";
import { type MermaidScene, type MermaidSceneImageAsset, renderMermaidNativeFrame } from "../mod.mermaid.ts";

function asset(values = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0]): MermaidSceneImageAsset {
  return {
    href: "host:fixture",
    width: 2,
    height: 2,
    sourceWidth: 2,
    sourceHeight: 2,
    rgba: btoa(String.fromCharCode(...values)),
  };
}

function scene(): MermaidScene {
  return {
    width: 4,
    height: 4,
    title: "Image",
    description: "",
    diagnostics: [],
    images: [asset()],
    items: [{ kind: "image", href: "host:fixture", x: 0, y: 0, width: 4, height: 4, image: 0, sampling: "pixelated" }],
  };
}

function frame(input = scene()) {
  return renderMermaidNativeFrame(input, { columnUnits: 1, rowUnits: 1 });
}

Deno.test("Mermaid image limits validate every option and snapshot defaults", () => {
  const defaults = imageLimits();
  for (const key of Object.keys(defaults)) {
    for (const value of [0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
      assertThrows(() => imageLimits({ [key]: value }), RangeError);
    }
  }
  const limits = { maxImages: 2 };
  const frozen = imageLimits(limits);
  limits.maxImages = 3;
  assertEquals(frozen.maxImages, 2);
});

Deno.test("PNG image preflight reads big-endian IHDR bounds before decoding", () => {
  const body = new Uint8Array(33);
  body.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(body.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, 60_000);
  view.setUint32(20, 40_000);
  assertEquals(imageDimensions(body), { width: 60_000, height: 40_000 });
  assertThrows(() => imageDimensions(body.subarray(0, 25)), SyntaxError);
  view.setUint32(16, 0);
  assertThrows(() => imageDimensions(body), SyntaxError);
  assertEquals(imageDimensions(new Uint8Array([1, 2, 3])), undefined);
});

Deno.test("JPEG image preflight walks bounded segments and recognizes progressive frame dimensions", () => {
  const body = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 7, 8, 0xff, 0xff, 0xc2, 0, 8, 8, 0, 20, 0, 30, 1]);
  assertEquals(imageDimensions(body), { width: 30, height: 20 });
  const wrapped = new Uint8Array(body.length + 2);
  wrapped.set(body, 1);
  assertEquals(imageDimensions(wrapped.subarray(1, -1)), { width: 30, height: 20 });
  for (
    const malformed of [
      body.subarray(0, -1),
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 1]),
      new Uint8Array([0xff, 0xd8, 0xff, 0xda]),
    ]
  ) {
    assertThrows(() => imageDimensions(malformed), SyntaxError);
  }
});

Deno.test("portable Mermaid image encoding crosses chunk boundaries and rejects invalid raster data before allocation", () => {
  const bytes = Uint8Array.from({ length: 12_300 }, (_, index) => index % 256);
  const encoded = encodeImageBytes(bytes);
  assertEquals(decodeImageAsset({ ...asset(), width: 3075, height: 1, rgba: encoded }), bytes);
  assertThrows(() => decodeImageAsset({ ...asset(), width: 0 }), RangeError);
  assertThrows(() => decodeImageAsset({ ...asset(), width: 4_194_305, height: 1 }), RangeError);
  assertThrows(() => decodeImageAsset({ ...asset(), rgba: "?".repeat(24) }), SyntaxError);
  assertThrows(() => decodeImageAsset({ ...asset(), rgba: btoa("a".repeat(17)) }), SyntaxError);
});

Deno.test("native Mermaid paints captured pixels, transparency and host links without interpreting the resource as a link", () => {
  const input = scene();
  const item = input.items[0]!;
  if (item.kind !== "image") throw new Error("fixture");
  item.link = "product:detail";
  const actual = frame(JSON.parse(JSON.stringify(input)));
  assertEquals(actual.cells[0]![0]!.background, "rgb(255, 0, 0)");
  assertEquals(actual.cells[0]![2]!.background, "rgb(0, 255, 0)");
  assertEquals(actual.cells[2]![0]!.background, "rgb(0, 0, 255)");
  assertEquals(actual.cells[2]![2]!.background, undefined);
  assertEquals(actual.cells[0]![0]!.href, "product:detail");
  assertEquals(actual.diagnostics, []);
});

Deno.test("native Mermaid interpolates image colors with premultiplied alpha instead of transparent color halos", () => {
  const input = scene();
  input.images = [asset([255, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0, 255, 0, 255, 0, 0])];
  const item = input.items[0]!;
  if (item.kind !== "image") throw new Error("fixture");
  item.sampling = "smooth";
  assertEquals(frame(input).cells[1]![1]!.background, "rgba(255, 0, 0, 0.75)");
});

Deno.test("native Mermaid image opacity, clipping and source-over occlusion use the shared compositor", () => {
  const input = scene();
  input.items = [{
    kind: "text",
    text: "XY",
    x: 0,
    y: 0,
    width: 2,
    height: 1,
    color: "white",
    fontWeight: "400",
    fontStyle: "normal",
    href: "old",
  }, ...input.items];
  input.composites = [{ start: 1, end: 2, depth: 1, opacity: 0.5, blendMode: "normal" }];
  assertEquals(frame(input).cells[0]![0]!.char, "X");
  input.composites = [];
  assertEquals(frame(input).cells[0]![0]!.char, " ");
  assertEquals(frame(input).cells[0]![0]!.href, undefined);
  const item = input.items[1]!;
  if (item.kind !== "image") throw new Error("fixture");
  item.clip = {
    kind: "path",
    rule: "nonzero",
    contours: [[{ x: 1, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 1, y: 4 }]],
  };
  assertEquals(frame(input).cells[0]![0]!.char, "X");
  assertEquals(frame(input).cells[0]![1]!.background, "rgb(255, 0, 0)");
});

Deno.test("native Mermaid image affine mapping preserves mirrored placement and bounded offscreen work", () => {
  const input = scene();
  const item = input.items[0]!;
  if (item.kind !== "image") throw new Error("fixture");
  item.inverse = [-0.25, 0, 0, 0.25, 1, 0];
  assertEquals(frame(input).cells[0]![0]!.background, "rgb(0, 255, 0)");
  item.x = -1e12;
  item.width = 1e12 + 4;
  assertEquals(frame(input).rows, 5);
  item.inverse = [NaN, 0, 0, 1, 0, 0];
  assertThrows(() => frame(input), RangeError);
  input.images = new Array(257).fill(asset());
  assertThrows(() => frame(input), RangeError);
});

Deno.test("native Mermaid missing image assets remain explicit diagnostics", () => {
  const input = scene();
  input.images = [];
  assert(frame(input).diagnostics.some((message) => message.includes("capture pixels")));
});
