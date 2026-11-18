// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertThrows } from "./deps.ts";
import { type MermaidScene, type MermaidSceneFilterNode, renderMermaidNativeFrame } from "../mod.mermaid.ts";
import { filterColorMatrix } from "../src/content/mermaid_filter_dom.ts";
import { parsePaintColor } from "../src/content/mermaid_paint.ts";
import { filterBufferGrid } from "../src/content/mermaid_filter_buffer.ts";
import { clipPredicate } from "../src/content/mermaid_clip.ts";
import { filterBufferExtent, filterCells } from "../src/content/mermaid_filter.ts";

const rectangle = (fill: string, x = 10, y = 10, width = 20, height = 20) => ({
  kind: "path" as const,
  points: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
  closed: true,
  paint: { fill, stroke: "none", strokeWidth: 0, dash: [], opacity: 1 },
});
const scene = (
  nodes: readonly MermaidSceneFilterNode[],
  items: MermaidScene["items"] = [rectangle("rgb(200,100,50)")],
): MermaidScene => ({
  width: 100,
  height: 100,
  title: "",
  description: "",
  items,
  diagnostics: [],
  composites: [{ start: 0, end: items.length, depth: 0, opacity: 1, blendMode: "normal", filter: { nodes } }],
});
const frame = (value: MermaidScene) => renderMermaidNativeFrame(value, { columnUnits: 5, rowUnits: 5 });
const color = (value: string | undefined) => parsePaintColor(value);
const rgba = (value: string | undefined) => {
  const parsed = color(value)!;
  return [...parsed.rgb.map(Math.round), Math.round(parsed.alpha * 1000) / 1000];
};
const semanticFrame = (value: ReturnType<typeof frame>) => ({
  ...value,
  cells: value.cells.map((row) =>
    row.map((cell) => ({
      ...cell,
      foreground: cell.foreground === undefined ? undefined : rgba(cell.foreground),
      background: cell.background === undefined ? undefined : rgba(cell.background),
    }))
  ),
});
const matrix = (kind: string, amount: number): MermaidSceneFilterNode => ({
  kind: "matrix",
  input: 0,
  values: filterColorMatrix(kind, amount)!,
  interpolation: "sRGB",
});

Deno.test("native photometric filters retain alpha and implement all CSS color functions", () => {
  assertEquals(rgba(frame(scene([matrix("brightness", .5)])).cells[3]![3]!.background), [100, 50, 25, 1]);
  assertEquals(rgba(frame(scene([matrix("invert", 1)])).cells[3]![3]!.background), [55, 155, 205, 1]);
  assertEquals(rgba(frame(scene([matrix("contrast", 2)])).cells[3]![3]!.background), [255, 73, 0, 1]);
  assertEquals(rgba(frame(scene([matrix("grayscale", 1)])).cells[3]![3]!.background), [118, 118, 118, 1]);
  assertEquals(rgba(frame(scene([matrix("saturate", 0)])).cells[3]![3]!.background), [118, 118, 118, 1]);
  assertEquals(rgba(frame(scene([matrix("sepia", 1)])).cells[3]![3]!.background), [165, 147, 114, 1]);
  assertEquals(rgba(frame(scene([matrix("hue-rotate", 360)])).cells[3]![3]!.background), [200, 100, 50, 1]);
  assertEquals(rgba(frame(scene([matrix("opacity", .25)])).cells[3]![3]!.background), [200, 100, 50, .25]);
  assertEquals(frame(scene([matrix("opacity", 0)])).cells[3]![3]!.background, undefined);
  assertEquals(filterColorMatrix("unknown", 1), undefined);
  assertEquals(frame(scene([{ kind: "flood", color: "transparent", opacity: 1 }])).cells[3]![3]!.background, undefined);
});

Deno.test("native SVG filter matrices use their resolved color space and transform foreground/background separately", () => {
  const node = matrix("brightness", .5);
  node.interpolation = "linearRGB";
  // Linear-light intermediate channels use the measured 8-bit filter format.
  assertEquals(rgba(frame(scene([node])).cells[3]![3]!.background), [147, 71, 34, 1]);
  const label = {
    kind: "text" as const,
    x: 15,
    y: 15,
    width: 5,
    height: 5,
    text: "A",
    color: "white",
    fontWeight: "bold",
    fontStyle: "normal",
    href: "product:label",
  };
  const result = frame(scene([matrix("invert", 1)], [rectangle("black"), label]));
  assertEquals(result.cells[3]![3]!.char, "A");
  assertEquals(rgba(result.cells[3]![3]!.foreground), [0, 0, 0, 1]);
  assertEquals(rgba(result.cells[3]![3]!.background), [255, 255, 255, 1]);
  assertEquals(result.cells[3]![3]!.href, "product:label");
});

Deno.test("filters process group overlap once before group opacity and later blend", () => {
  const value = scene([matrix("opacity", .5)], [rectangle("red"), rectangle("blue", 20)]);
  value.composites = [{ ...value.composites![0]!, opacity: .5 }];
  assertEquals(rgba(frame(value).cells[3]![5]!.background), [0, 0, 255, .25]);
});

Deno.test("native offset keeps sub-cell energy and moves glyph/link metadata without making shadow hit targets", () => {
  const value = scene([{ kind: "offset", input: 0, dx: 2.5, dy: 0 }], [rectangle("rgba(255,0,0,.8)")]);
  const result = frame(value);
  assertEquals(rgba(result.cells[3]![2]!.background), [255, 0, 0, .4]);
  assertEquals(rgba(result.cells[3]![3]!.background), [255, 0, 0, .8]);
  assertEquals(rgba(result.cells[3]![6]!.background), [255, 0, 0, .4]);
  const label = {
    kind: "text" as const,
    x: 10,
    y: 10,
    width: 5,
    height: 5,
    text: "A",
    color: "red",
    fontWeight: "400",
    fontStyle: "normal",
    href: "product:moved",
  };
  const moved = frame(scene([{ kind: "offset", input: 0, dx: 10, dy: 5 }], [label]));
  assertEquals(moved.cells[3]![4]!.char, "A");
  assertEquals(moved.cells[3]![4]!.href, "product:moved");
  assertEquals(moved.cells[2]![2]!.href, undefined);
});

Deno.test("native Gaussian filters conserve premultiplied color/energy and keep transparent neighbors colored correctly", () => {
  const result = frame(
    scene([{ kind: "blur", input: 0, sigmaX: 3, sigmaY: 3, interpolation: "sRGB" }], [
      rectangle("rgba(255,0,0,.5)", 45, 45, 5, 5),
    ]),
  );
  let alpha = 0;
  for (const row of result.cells) {
    for (const cell of row) {
      const sample = color(cell.background);
      if (!sample) continue;
      assertEquals(sample.rgb.map(Math.round), [255, 0, 0]);
      alpha += sample.alpha;
    }
  }
  assert(Math.abs(alpha - .5) < 1e-6);
  assert(color(result.cells[9]![10]!.background)!.alpha > 0);
});

Deno.test("native shadow graphs retain SourceGraphic and paint unlinked colored halos", () => {
  const result = frame(scene([
    { kind: "alpha", input: 0 },
    { kind: "offset", input: 1, dx: 20, dy: 0 },
    { kind: "flood", color: "black", opacity: .5 },
    { kind: "composite", input: 3, input2: 2, operator: "in" },
    { kind: "merge", inputs: [4, 0] },
  ], [{ ...rectangle("red"), href: "product:node" }]));
  assertEquals(rgba(result.cells[3]![3]!.background), [255, 0, 0, 1]);
  assertEquals(result.cells[3]![3]!.href, "product:node");
  assertEquals(rgba(result.cells[3]![7]!.background), [0, 0, 0, .5]);
  assertEquals(result.cells[3]![7]!.href, undefined);
});

Deno.test("SVG channel transfer supports table, discrete, gamma and linear rules", () => {
  const result = frame(scene([{
    kind: "transfer",
    input: 0,
    interpolation: "sRGB",
    channels: [
      { kind: "table", values: [1, 0] },
      { kind: "gamma", amplitude: 1, exponent: 2, offset: 0 },
      { kind: "linear", slope: 2, intercept: 0 },
      { kind: "discrete", values: [.25, .75] },
    ],
  }]));
  assertEquals(rgba(result.cells[3]![3]!.background), [55, 39, 100, .75]);
});

Deno.test("filter results honor dependency/merge order and Porter-Duff operators", () => {
  for (const [operator, alpha] of [["over", .8], ["in", .3], ["out", .2], ["atop", .6], ["xor", .5]] as const) {
    const result = frame(scene([
      { kind: "flood", color: "red", opacity: .5 },
      { kind: "flood", color: "blue", opacity: .6 },
      { kind: "composite", input: 1, input2: 2, operator, interpolation: "sRGB" },
    ]));
    assertEquals(color(result.cells[3]![3]!.background)!.alpha, alpha);
  }
  const merged = frame(
    scene([{ kind: "flood", color: "red", opacity: .5 }, { kind: "flood", color: "blue", opacity: .5 }, {
      kind: "merge",
      inputs: [1, 2],
      interpolation: "sRGB",
    }]),
  );
  assertEquals(rgba(merged.cells[3]![3]!.background), [85, 0, 170, .75]);
  const arithmetic = frame(
    scene([{ kind: "composite", input: 0, input2: 0, operator: "arithmetic", coefficients: [0, 0, 0, .25] }]),
  );
  assertEquals(rgba(arithmetic.cells[0]![0]!.background), [255, 255, 255, .25]);
});

Deno.test("native group clips apply after filtering and omit newly invisible links", () => {
  const value = scene([{ kind: "offset", input: 0, dx: 10, dy: 0 }], [{ ...rectangle("red"), href: "product:node" }]);
  const clip = {
    kind: "path" as const,
    contours: [rectangle("none", 25, 10, 10, 20).points],
    rule: "nonzero" as const,
  };
  value.composites = [{ ...value.composites![0]!, clip }];
  const result = frame(value);
  assertEquals(result.cells[3]![4]!.background, undefined);
  assertEquals(result.cells[3]![4]!.href, undefined);
  assertEquals(rgba(result.cells[3]![5]!.background), [255, 0, 0, 1]);
  assertEquals(result.cells[3]![5]!.href, "product:node");
});

Deno.test("native filter allocations reject retained graph intermediates before unbounded growth", () => {
  const value = scene([
    { kind: "flood", color: "red", opacity: 1 },
    { kind: "flood", color: "blue", opacity: 1 },
    { kind: "flood", color: "green", opacity: 1 },
    { kind: "merge", inputs: [1, 2, 3] },
  ]);
  assertThrows(
    () => renderMermaidNativeFrame(value, { columnUnits: 5, rowUnits: 5, maxCells: 500 }),
    RangeError,
    "filter-cell budget",
  );
});

Deno.test("native filters reject forward dependencies, excessive nodes/kernels/transfers and invalid parameters", () => {
  const check = (nodes: readonly MermaidSceneFilterNode[], message: string) =>
    assertThrows(() => frame(scene(nodes)), RangeError, message);
  check([{ kind: "offset", input: 1, dx: 0, dy: 0 }], "dependency");
  check(new Array(257).fill({ kind: "alpha", input: 0 }), "filter-node budget");
  check([{ kind: "blur", input: 0, sigmaX: 10000, sigmaY: 1 }], "kernel budget");
  check([{ kind: "blur", input: 0, sigmaX: NaN, sigmaY: 0 }], "deviation");
  check([{ kind: "matrix", input: 0, values: [NaN] }], "matrix");
  check([{ kind: "blend", input: 0, input2: 0, mode: "unknown" }], "blend mode");
  check([{ kind: "composite", input: 0, input2: 0, operator: "arithmetic", coefficients: [1] }], "composite");
  check([{
    kind: "transfer",
    input: 0,
    channels: new Array(4).fill({ kind: "table", values: new Array(4097).fill(1) }),
  }], "transfer");
  check([{ kind: "merge", inputs: new Array(257).fill(0) }], "merge-input budget");
});

Deno.test("native identity filters preserve low channel values instead of introducing color-space quantization", () => {
  for (
    const nodes of [[matrix("brightness", 1)], [{ ...matrix("brightness", 1), interpolation: "linearRGB" as const }], [{
      kind: "blur" as const,
      input: 0,
      sigmaX: 0,
      sigmaY: 0,
    }], [{ kind: "merge" as const, inputs: [0] }]]
  ) {
    assertEquals(rgba(frame(scene(nodes, [rectangle("rgb(6,6,6)")])).cells[3]![3]!.background), [6, 6, 6, 1]);
  }
});

Deno.test("filters retain SourceGraphic from all four sides without enlarging the output frame", () => {
  for (
    const [x, y, dx, dy, column, row] of [
      [-20, 10, 20, 0, 0, 3],
      [110, 10, -20, 0, 18, 3],
      [10, -20, 0, 20, 3, 0],
      [10, 110, 0, -20, 3, 18],
    ]
  ) {
    const result = frame(scene([{ kind: "offset", input: 0, dx: dx!, dy: dy! }], [rectangle("red", x, y, 10, 10)]));
    assertEquals([result.columns, result.rows], [21, 21]);
    assertEquals(rgba(result.cells[row!]![column!]!.background), [255, 0, 0, 1]);
    assertEquals(result.diagnostics, []);
  }
});

Deno.test("filter intermediates can leave the frame and return without losing color or blur energy", () => {
  const source = [rectangle("rgba(200,100,50,.5)", 45, 45, 5, 5)];
  const expected = frame(scene([{ kind: "blur", input: 0, sigmaX: 3, sigmaY: 3 }], source));
  const actual = frame(scene([
    { kind: "offset", input: 0, dx: -100, dy: -100 },
    { kind: "blur", input: 1, sigmaX: 3, sigmaY: 3 },
    { kind: "offset", input: 2, dx: 100, dy: 100 },
  ], source));
  assertEquals(actual, expected);
});

Deno.test("nested filters retain off-frame child output until the parent brings it back", () => {
  const value = scene([{ kind: "offset", input: 0, dx: 100, dy: 0 }]);
  value.composites = [value.composites![0]!, {
    ...value.composites![0]!,
    depth: 1,
    filter: { nodes: [{ kind: "offset", input: 0, dx: -100, dy: 0 }] },
  }];
  assertEquals(semanticFrame(frame(value)), semanticFrame(frame(scene([], value.items))));
});

Deno.test("off-frame glyphs keep wide followers, styling and host-controlled links after an offset", () => {
  for (const measured of [false, true]) {
    const label = {
      kind: "text" as const,
      x: -10,
      y: 10,
      width: 10,
      height: 5,
      text: "界",
      color: "red",
      fontWeight: "bold",
      fontStyle: "italic",
      href: "product:moved",
      ...(measured ? { layout: { columnUnits: 5, glyphs: [{ start: 0, end: 1, x: -7.5, y: 10 }] } } : {}),
    };
    const result = frame(scene([{ kind: "offset", input: 0, dx: 20, dy: 0 }], [label]));
    assertEquals(result.cells[2]![2]!.char, "界");
    assertEquals(result.cells[2]![3]!.char, "");
    assertEquals(result.cells[2]![2]!.href, "product:moved");
    assertEquals(result.cells[2]![2]!.bold, true);
    assertEquals(result.cells[2]![2]!.italic, true);
    assertEquals(result.diagnostics, []);
  }
});

Deno.test("off-frame thin and outlined strokes retain their native paint after an offset", () => {
  for (const width of [1, 8]) {
    const source = {
      ...rectangle("none", -20, 10, 10, 20),
      paint: {
        fill: "none",
        stroke: "red",
        strokeWidth: width,
        dash: [],
        opacity: 1,
        lineJoin: "round" as const,
        lineCap: "round" as const,
      },
    };
    const translated = { ...source, points: source.points.map(({ x, y }) => ({ x: x + 30, y })) };
    assertEquals(
      semanticFrame(frame(scene([{ kind: "offset", input: 0, dx: 30, dy: 0 }], [source]))),
      semanticFrame(frame(scene([], [translated]))),
    );
  }
});

Deno.test("off-frame raster buffers remain sparse and preserve work, coordinate and retained-cell limits", () => {
  // A million-cell empty gap is not a million-cell allocation.
  const far = scene([{ kind: "offset", input: 0, dx: 5_000_010, dy: 0 }], [rectangle("red", -5_000_000, 10, 5, 5)]);
  assertEquals(rgba(frame(far).cells[2]![2]!.background), [255, 0, 0, 1]);
  assertThrows(() => frame(scene([{ kind: "offset", input: 0, dx: Number.MAX_VALUE, dy: 0 }])), RangeError);
  assertThrows(
    () =>
      renderMermaidNativeFrame(scene([{ kind: "flood", color: "red", opacity: 1 }], far.items), {
        columnUnits: 5,
        rowUnits: 5,
        maxCells: 500,
      }),
    RangeError,
    "work budget",
  );
});

Deno.test("off-frame images preserve premultiplied pixels and links, then obey the final group clip", () => {
  const value = scene([{ kind: "offset", input: 0, dx: 20, dy: 0 }], [{
    kind: "image",
    href: "host:pixel",
    link: "product:image",
    image: 0,
    x: -20,
    y: 10,
    width: 10,
    height: 10,
    sampling: "pixelated",
  }]);
  value.images = [{
    href: "host:pixel",
    width: 1,
    height: 1,
    sourceWidth: 1,
    sourceHeight: 1,
    rgba: btoa(String.fromCharCode(200, 100, 50, 128)),
  }];
  value.composites = [{
    ...value.composites![0]!,
    clip: {
      kind: "path",
      rule: "nonzero",
      contours: [rectangle("none", 0, 10, 5, 10).points],
    },
  }];
  const result = frame(value);
  assertEquals(rgba(result.cells[2]![0]!.background), [200, 100, 50, .502]);
  assertEquals(result.cells[2]![0]!.href, "product:image");
  assertEquals(result.cells[2]![1]!.background, undefined);
  assertEquals(result.cells[2]![1]!.href, undefined);
  assertEquals(result.diagnostics, []);
});

Deno.test("Gaussian energy from off-frame source reaches the visible corner", () => {
  const nodes: MermaidSceneFilterNode[] = [{ kind: "blur", input: 0, sigmaX: 3, sigmaY: 3 }];
  const result = frame(scene(nodes, [rectangle("rgba(200,100,50,.5)", -5, -5, 5, 5)]));
  const reference = frame(scene(nodes, [rectangle("rgba(200,100,50,.5)", 45, 45, 5, 5)]));
  const actual = color(result.cells[0]![0]!.background)!;
  const expected = color(reference.cells[10]![10]!.background)!;
  assert(actual.alpha > 0);
  assertEquals(actual.rgb, expected.rgb);
  assertEquals(actual.alpha, expected.alpha);
  assertEquals(result.diagnostics, []);
});

Deno.test("filters generate off-frame paint inside primitive regions before later offsets", () => {
  const flood = frame(scene([
    {
      kind: "flood",
      color: "red",
      opacity: 1,
      clip: {
        kind: "path",
        rule: "nonzero",
        contours: [rectangle("none", -20, 10, 10, 10).points],
      },
    },
    { kind: "offset", input: 1, dx: 20, dy: 0 },
  ]));
  assertEquals(rgba(flood.cells[2]![0]!.background), [255, 0, 0, 1]);
  assertEquals(flood.cells[2]![2]!.background, undefined);
  const opaque = matrix("opacity", 0);
  if (opaque.kind !== "matrix") throw new Error("Expected matrix.");
  opaque.values = opaque.values.map((value, index) => index === 19 ? 1 : value);
  const generated = frame(scene([opaque, { kind: "offset", input: 1, dx: 20, dy: 0 }]));
  assertEquals(rgba(generated.cells[0]![0]!.background), [0, 0, 0, 1]);
  assertEquals(generated.diagnostics, []);
});

Deno.test("filter buffer planning excludes unrelated source and accumulates only nested support", () => {
  const items = [rectangle("red"), rectangle("red"), rectangle("none", -5_000_000)];
  const group = {
    start: 0,
    end: 1,
    depth: 0,
    opacity: 1,
    blendMode: "normal",
    filter: {
      nodes: [{ kind: "offset" as const, input: 0, dx: 100, dy: 0 }],
    },
  };
  const charge = () => {};
  const predicate = (clip?: Parameters<typeof clipPredicate>[0]) => clipPredicate(clip, charge);
  const base = filterBufferGrid(items, [], 21, 21, 5, 5, predicate, charge);
  assertEquals(base, { left: 0, top: 0, right: 20, bottom: 20, columns: 21, rows: 21 });
  const single = filterBufferGrid(items, [group], 21, 21, 5, 5, predicate, charge);
  const siblings = filterBufferGrid(items, [group, { ...group, start: 1, end: 2 }], 21, 21, 5, 5, predicate, charge);
  const nested = filterBufferGrid(items, [group, { ...group, depth: 1 }], 21, 21, 5, 5, predicate, charge);
  assertEquals(siblings, single);
  assertEquals(single.columns, 61);
  assertEquals(nested.columns, 101);
});

Deno.test("filter buffer planning validates cyclic primitive clips before walking their bounds", () => {
  const cycle: Extract<Parameters<typeof clipPredicate>[0], { kind: "intersection" }> = {
    kind: "intersection",
    children: [],
  };
  cycle.children = [cycle];
  const value = scene([{ kind: "offset", input: 0, dx: 10, dy: 0, clip: cycle }]);
  assertThrows(() => frame(value), RangeError, "clip exceeds its tree budget");
});

function countedClip() {
  let reads = 0;
  const clip = {
    kind: "path" as const,
    rule: "nonzero" as const,
    contours: [Array.from({ length: 512 }, (_, index) => ({
      get x() {
        reads++;
        return 100 + Math.cos(index / 512 * Math.PI * 2) * 20;
      },
      y: 100 + Math.sin(index / 512 * Math.PI * 2) * 20,
    }))],
  };
  const inside = clipPredicate(clip, () => {});
  reads = 0;
  return { clip, predicate: () => inside, reads: () => reads };
}

Deno.test("filter metadata bounds charge each actual point visit and reuse shared primitive regions", () => {
  const counted = countedClip();
  let work = 0;
  const result = filterBufferExtent(
    {
      nodes: Array.from({ length: 64 }, (_, input) => ({
        kind: "merge",
        inputs: [input],
        clip: counted.clip,
      })),
    },
    5,
    5,
    counted.predicate,
    (amount) => {
      work += amount;
    },
  );
  assert(work >= counted.reads(), `Only ${work} units charged for ${counted.reads()} point reads.`);
  assertEquals(result.regions.length, 1);
  assertEquals(counted.reads(), 512);
});

Deno.test("filter envelope metadata exhaustion rejects before reading the next contour", () => {
  const counted = countedClip();
  let remaining = 20;
  assertThrows(
    () =>
      filterBufferExtent(
        { nodes: [{ kind: "merge", inputs: [0], clip: counted.clip }] },
        5,
        5,
        counted.predicate,
        (amount) => {
          remaining -= amount;
          if (remaining < 0) throw new RangeError("Native Mermaid scene exceeds its work budget.");
        },
      ),
    RangeError,
    "work budget",
  );
  assertEquals(counted.reads(), 0);
});

Deno.test("filter paint domains charge metadata walks even when no clipped pixel is visible", () => {
  const counted = countedClip();
  let remaining = 20;
  assertThrows(
    () =>
      filterCells(new Map(), {
        nodes: [{
          kind: "flood",
          color: "red",
          opacity: 1,
          clip: counted.clip,
        }],
      }, {
        columns: 1,
        rows: 1,
        columnUnits: 5,
        rowUnits: 5,
        maxCells: 1,
        predicate: counted.predicate,
        charge: (amount) => {
          remaining -= amount;
          if (remaining < 0) throw new RangeError("Native Mermaid scene exceeds its work budget.");
        },
      }),
    RangeError,
    "work budget",
  );
  assertEquals(counted.reads(), 0);
});

Deno.test("filter paint domains reuse shared bounds across primitives and both paint planes", () => {
  const counted = countedClip();
  let work = 0;
  const result = filterCells(new Map(), {
    nodes: [
      { kind: "flood", color: "red", opacity: 1, clip: counted.clip },
      { kind: "flood", color: "blue", opacity: 1, clip: counted.clip },
    ],
  }, {
    columns: 1,
    rows: 1,
    columnUnits: 5,
    rowUnits: 5,
    maxCells: 1,
    predicate: counted.predicate,
    charge: (amount) => {
      work += amount;
    },
  });
  assertEquals(result.size, 0);
  assertEquals(counted.reads(), 512);
  assert(work >= counted.reads());
});
