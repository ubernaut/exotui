// Copyright 2023 Im-Beast. MIT license.
import {
  extractMermaidScene,
  type MermaidSceneText,
  type MermaidStandardDiagram,
  type MermaidStandardRenderer,
  prepareMermaidMarkdown,
  renderMermaidNativeFrame,
} from "../../../mod.mermaid.ts";
import { measuredTextDecorations } from "../../../src/content/mermaid_text_decoration_dom.ts";
import { BrowserCellCanvasSink, parseAnsiCell } from "../../../src/web/cell_canvas_sink.ts";
import { parsePaintColor } from "../../../src/content/mermaid_paint.ts";
import { createAnsiStyle } from "../../../src/theme.ts";
import { WidgetSurface } from "../../../mod.app.ts";
import { MarkdownSurface } from "../../../mod.document.ts";
import { Signal } from "../../../src/signals/mod.ts";
import { TerminalScreen } from "../../../src/components/terminal_screen.ts";
import { TerminalScreenController } from "../../../src/runtime/terminal_screen.ts";
import { AnsiCanvasSink } from "../../../src/canvas/sink.ts";
import { terminalPaletteRgb } from "../../../src/runtime/terminal_palette.ts";
import { MermaidRemoteCells } from "./remote_cells.ts";
import { longAccentLabel, longKeycapLabel, unicodeWideLabels } from "./unicode_labels.ts";
import { MERMAID_STANDARD_FIXTURES } from "./catalogue.ts";

const unicodeGlyphs = [
  "界",
  "é",
  "🌈",
  "👩‍💻",
  "ạ́́",
  "क्ष",
  "क्‍ष",
  "각",
  "1️⃣",
  longAccentLabel,
  longKeycapLabel,
  ...unicodeWideLabels,
] as const;
const wideUnicodeGlyphs: ReadonlySet<string> = new Set([
  "界",
  "🌈",
  "👩‍💻",
  "각",
  "1️⃣",
  longKeycapLabel,
  ...unicodeWideLabels,
]);

const html = (body: string) =>
  `<foreignObject width="280" height="180"><div xmlns="http://www.w3.org/1999/xhtml" style="font:20px monospace;color:red">${body}</div></foreignObject>`;
const fixtures = [
  { name: "own", body: html("<u>Sample</u>"), underline: true, strike: false },
  {
    name: "ancestor-none",
    body: html('<u><span style="text-decoration:none">Sample</span></u>'),
    underline: true,
    strike: false,
  },
  {
    name: "atomic",
    body: html('<u><span style="display:inline-block">Sample</span></u>'),
    underline: false,
    strike: false,
  },
  {
    name: "atomic-own",
    body: html('<u><span style="display:inline-block;text-decoration:underline">Sample</span></u>'),
    underline: true,
    strike: false,
  },
  {
    name: "absolute",
    body: html('<u><span style="position:absolute;top:20px;left:0">Sample</span></u>'),
    underline: false,
    strike: false,
  },
  { name: "float", body: html('<u><span style="float:left">Sample</span></u>'), underline: false, strike: false },
  {
    name: "contents",
    body: html('<span style="display:contents;text-decoration:underline">Sample</span>'),
    underline: false,
    strike: false,
  },
  { name: "combined", body: html("<u><del>Sample</del></u>"), underline: true, strike: true },
  {
    name: "svg-group",
    body:
      '<g fill="red" style="color:red;text-decoration:underline"><text x="10" y="40" fill="red" font-size="20">Sample</text></g>',
    underline: true,
    strike: false,
  },
  {
    name: "svg-tspan",
    body:
      '<text x="10" y="40" fill="red" style="color:red;text-decoration:underline" font-size="20"><tspan style="text-decoration:line-through">Sample</tspan></text>',
    underline: true,
    strike: true,
  },
  {
    name: "positioned-unicode",
    body:
      '<text x="80" y="80" transform="rotate(-90 80 80)" fill="red" style="color:red;text-decoration:underline" font-size="20">界😀</text>',
    underline: true,
    strike: false,
  },
  {
    name: "svg-fill-not-css-color",
    body: '<text x="10" y="40" fill="red" font-size="20" style="color:blue;text-decoration:underline">Sample</text>',
    underline: true,
    strike: false,
    ink: "255,0,0",
  },
  {
    name: "svg-explicit-css-color",
    body:
      '<text x="10" y="40" fill="red" font-size="20" style="color:blue;text-decoration:underline lime">Sample</text>',
    underline: true,
    strike: false,
    ink: "255,0,0",
  },
  {
    name: "svg-parent-fill",
    body:
      '<text x="10" y="40" fill="red" font-size="20" style="color:lime;text-decoration:underline"><tspan fill="blue">Sample</tspan></text>',
    underline: true,
    strike: false,
    ink: "255,0,0",
  },
  {
    name: "html-explicit-css-color",
    body: html('<span style="color:blue;text-decoration:underline lime">Sample</span>'),
    underline: true,
    strike: false,
    ink: "0,255,0",
  },
  {
    name: "local-use",
    body:
      '<defs><text id="decoration-instance" x="10" y="40" fill="red" font-size="20" style="color:blue;text-decoration:underline">Sample</text></defs><use href="#decoration-instance" x="20"/>',
    underline: true,
    strike: false,
    ink: "255,0,0",
  },
  {
    name: "local-marker",
    body:
      '<defs><marker id="decoration-marker" markerUnits="userSpaceOnUse" markerWidth="90" markerHeight="30" refX="0" refY="10" viewBox="0 0 90 30"><text x="0" y="20" fill="red" font-size="20" style="color:blue;text-decoration:underline">Sample</text></marker></defs><path d="M10 30L120 30" fill="none" stroke="none" marker-end="url(#decoration-marker)"/>',
    underline: true,
    strike: false,
    ink: "255,0,0",
  },
  ...["double", "wavy", "dotted", "dashed"].flatMap((style) => [
    {
      name: `svg-${style}`,
      body:
        `<text x="10" y="40" fill="red" font-size="20" style="text-decoration:underline ${style}"><tspan fill="blue">Sample</tspan></text>`,
      underline: true,
      strike: false,
      underlineStyle: style,
      ink: "255,0,0",
    },
    {
      name: `html-${style}`,
      body: html(`<span style="color:blue;text-decoration:underline ${style} lime">Sample</span>`),
      underline: true,
      strike: false,
      underlineStyle: style,
      ink: "0,255,0",
    },
  ]),
  {
    name: "svg-overline",
    body: '<text x="10" y="40" fill="red" font-size="20" style="text-decoration:overline">Sample</text>',
    underline: false,
    strike: false,
    overline: true,
    ink: "255,0,0",
  },
  {
    name: "html-overline",
    body: html('<div style="padding-top:30px"><span style="text-decoration:overline">Sample</span></div>'),
    underline: false,
    strike: false,
    overline: true,
    ink: "255,0,0",
  },
  {
    name: "svg-anchor-html",
    body: `<a fill="white" stroke="mediumpurple" style="color:black;text-decoration:underline">${html("Sample")}</a>`,
    underline: true,
    strike: false,
    ink: "0,0,0",
  },
  {
    name: "svg-anchor-html-explicit-color",
    body: `<a fill="white" stroke="mediumpurple" style="color:blue;text-decoration:underline lime">${
      html("Sample")
    }</a>`,
    underline: true,
    strike: false,
    ink: "0,255,0",
  },
  {
    name: "svg-anchor-html-none",
    body: `<a fill="white" stroke="mediumpurple" style="color:black;text-decoration:underline">${
      html('<span style="text-decoration:none">Sample</span>')
    }</a>`,
    underline: true,
    strike: false,
    ink: "0,0,0",
  },
  {
    name: "svg-anchor-html-atomic",
    body: `<a fill="white" stroke="mediumpurple" style="color:black;text-decoration:underline">${
      html('<span style="display:inline-block">Sample</span>')
    }</a>`,
    underline: false,
    strike: false,
  },
  {
    name: "svg-mixed-target-context",
    body:
      '<a fill="red" stroke="none" style="color:blue;text-decoration:underline lime"><text x="10" y="40" font-size="20">SVG</text><foreignObject y="70" width="280" height="100"><div xmlns="http://www.w3.org/1999/xhtml" style="font:20px monospace;color:red">HTML</div></foreignObject></a>',
    underline: true,
    strike: false,
    inks: { SVG: "255,0,0", HTML: "0,255,0" },
  },
];
let host: HTMLElement | undefined;
let current = 0;

/** Original markup is mounted before the driver captures any native data. */
export function mountTextDecorationOriginal(index: number) {
  host?.remove();
  current = index;
  const fixture = fixtures[index]!;
  host = document.createElement("div");
  host.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">${fixture.body}</svg>`;
  document.body.append(host);
  return {
    name: fixture.name,
    painted: fixture.underline || fixture.strike || "overline" in fixture,
    count: fixtures.length,
    ink: "ink" in fixture ? fixture.ink : undefined,
    inks: "inks" in fixture && fixture.inks ? Object.values(fixture.inks) : undefined,
  };
}

/** Source/native/JSON and read-only ownership checks, independent of the original screenshot oracle. */
export function captureTextDecorationOriginal() {
  const svg = host!.querySelector("svg")!, original = svg.outerHTML, fixture = fixtures[current]!;
  const scene = extractMermaidScene(svg), frame = renderMermaidNativeFrame(scene);
  const texts = scene.items.filter((item): item is MermaidSceneText => item.kind === "text");
  const cells = frame.cells.flat().filter((cell) => cell.char.trim());
  const expectedDiagnostics: string[] = [];
  if (
    svg.outerHTML !== original || !texts.length || !cells.length || scene.diagnostics.length ||
    JSON.stringify(frame.diagnostics) !== JSON.stringify(expectedDiagnostics) ||
    texts.some((item) => !!item.decorations?.some((value) => value.line === "underline") !== fixture.underline) ||
    texts.some((item) => !!item.decorations?.some((value) => value.line === "line-through") !== fixture.strike) ||
    cells.some((cell) => !!cell.underline !== fixture.underline || !!cell.strikethrough !== fixture.strike) ||
    cells.some((cell) =>
      !!cell.overline !== ("overline" in fixture) ||
      (cell.underlineStyle ?? "solid") !== ("underlineStyle" in fixture ? fixture.underlineStyle : "solid")
    ) ||
    JSON.stringify(renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)))) !== JSON.stringify(frame)
  ) throw new Error(`Original/native decoration differs: ${JSON.stringify({ fixture, scene, frame })}`);
  const ink = "ink" in fixture ? fixture.ink : undefined;
  if (
    ink && fixture.underline &&
    cells.some((cell) => parsePaintColor(cell.underlineColor ?? cell.foreground)?.rgb.join(",") !== ink)
  ) {
    throw new Error(`Native underline ink differs from original: ${fixture.name}`);
  }
  if (
    ink !== undefined &&
    texts.some((item) => item.decorations?.some((value) => value.color !== `rgb(${ink.replaceAll(",", ", ")})`))
  ) {
    throw new Error(`Decorating-owner paint differs: ${fixture.name}`);
  }
  if ("inks" in fixture && fixture.inks) {
    for (const [text, expected] of Object.entries(fixture.inks)) {
      const item = texts.find((item) => item.text === text);
      if (
        !item || item.decorations?.length !== 1 ||
        parsePaintColor(item.decorations[0]!.color)?.rgb.join(",") !== expected
      ) {
        throw new Error(`Rendered-context decoration ink differs: ${fixture.name}/${text}`);
      }
    }
  }
  return { name: fixture.name, cells: cells.length };
}

/** Disable decoration alone on the owned original; the driver measures real source pixels before/after. */
export function disableTextDecorationOriginal() {
  for (const element of host!.querySelectorAll("svg,svg *")) {
    if (getComputedStyle(element).textDecorationLine !== "none") {
      (element as HTMLElement).style.setProperty("text-decoration", "none", "important");
    }
  }
}

export function disposeTextDecorationOriginal() {
  host?.remove();
  host = undefined;
}

/** Actual Canvas2D ink, not just parsed attributes or mocked draw calls. */
export function verifyBrowserTextDecorations() {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
  const sink = new BrowserCellCanvasSink({
    canvas,
    cellWidth: 10,
    cellHeight: 20,
    font: "16px monospace",
    foreground: "red",
    background: "black",
    devicePixelRatio: 1,
  });
  sink.resize(4, 1);
  const color = (column: number, y: number) => [...context.getImageData(column * 10 + 5, y, 1, 1).data].join(",");
  sink.flush([
    { row: 0, column: 0, value: "\x1b[4mA" },
    { row: 0, column: 1, value: "\x1b[9m " },
    { row: 0, column: 2, value: "A" },
    { row: 0, column: 3, value: "\x1b[4;9m " },
  ], {} as never);
  if (
    [color(0, 19), color(1, 9), color(3, 19), color(3, 9)].some((value) => value !== "255,0,0,255") ||
    color(2, 19) !== "0,0,0,255"
  ) throw new Error("Browser decoration paint is missing or leaks into plain cells.");
  sink.flush(
    [{ row: 0, column: 0, value: "A" }, { row: 0, column: 1, value: " " }, { row: 0, column: 3, value: " " }],
    {} as never,
  );
  if ([color(0, 19), color(1, 9), color(3, 19), color(3, 9)].some((value) => value !== "0,0,0,255")) {
    throw new Error("Browser decoration paint survives a plain repaint.");
  }
  const plain = context.getImageData(20, 0, 10, 19).data;
  sink.flush([{ row: 0, column: 2, value: "\x1b[3mA" }], {} as never);
  const italic = context.getImageData(20, 0, 10, 19).data;
  const italicSamples = italic.reduce((count, value, index) => count + Number(value !== plain[index]), 0);
  if (!italicSamples) throw new Error("Browser italic font paints no changed pixels.");
  sink.flush([{ row: 0, column: 2, value: "A" }], {} as never);
  const restored = context.getImageData(20, 0, 10, 19).data;
  if (restored.some((value, index) => value !== plain[index])) {
    throw new Error("Browser italic font survives a plain repaint.");
  }
  const signatures = new Set<string>();
  let extendedPixels = 0;
  for (const underlineStyle of ["solid", "double", "wavy", "dotted", "dashed"] as const) {
    const value = createAnsiStyle({
      foreground: [0, 0, 255],
      background: [0, 0, 0],
      underline: true,
      underlineStyle,
      underlineColor: [0, 255, 0],
      overline: true,
    })(" ");
    sink.flush([{ row: 0, column: 0, value }, { row: 0, column: 1, value }], {} as never);
    const pixels = context.getImageData(0, 0, 20, 20).data;
    let green = 0, blue = 0;
    const mask: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] === 0 && pixels[index + 1] > 0 && pixels[index + 2] === 0) {
        green++;
        mask.push(index / 4);
      }
      if (pixels[index] === 0 && pixels[index + 1] === 0 && pixels[index + 2] === 255) blue++;
    }
    if (!green || blue !== 20) throw new Error(`Extended underline/overline pixels differ: ${underlineStyle}`);
    signatures.add(mask.join(","));
    extendedPixels += green + blue;
    const stable = [...pixels];
    sink.flush([{ row: 0, column: 1, value }], {} as never);
    if (context.getImageData(0, 0, 20, 20).data.some((value, index) => value !== stable[index])) {
      throw new Error("Partial repaint changes styled line phase.");
    }
    sink.flush([{ row: 0, column: 0, value: " " }, { row: 0, column: 1, value: " " }], {} as never);
    const clear = context.getImageData(0, 0, 20, 20).data;
    if (clear.some((value, index) => index % 4 !== 3 && value !== 0)) {
      throw new Error("Extended line survives plain repaint.");
    }
  }
  if (signatures.size !== 5) throw new Error("Five underline styles do not paint differently.");
  sink.flush([{ row: 0, column: 0, value: "\x1b[4;7;38;2;0;0;255;48;2;255;0;0;58;2;0;255;0m " }], {} as never);
  if (color(0, 19) !== "0,255,0,255" || color(0, 5) !== "0,0,255,255") {
    throw new Error("Inverse changes explicit underline ink or fails to reverse cell colors.");
  }
  sink.flush([{ row: 0, column: 0, value: "\x1b[4;7;38;2;0;0;255;48;2;255;0;0m " }], {} as never);
  if (color(0, 19) !== "255,0,0,255") throw new Error("Default underline ink does not follow reversed foreground.");
  return { pixels: 9, italicSamples, underlineStyles: signatures.size, extendedPixels };
}

/** Bounded ancestry, fresh recovery and borrowed Window, without source mutations or resource work. */
export function verifyTextDecorationGuards() {
  const host = document.createElement("div");
  host.innerHTML = `<svg width="300" height="200">${html("<u>Sample</u>")}</svg>`;
  document.body.append(host);
  try {
    const svg = host.querySelector("svg")!, node = svg.querySelector("u")!, before = svg.outerHTML;
    const read = measuredTextDecorations(svg);
    if (!read(node)?.length || svg.outerHTML !== before) {
      throw new Error("Decoration read changes source.");
    }
    for (let count = 0; count < 20_000; count++) read(node);
    if (svg.outerHTML !== before) throw new Error("Cached decoration reads change source.");
    const outer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    let inner = outer;
    for (let depth = 0; depth < 130; depth++) {
      const next = document.createElementNS("http://www.w3.org/2000/svg", "g");
      inner.append(next);
      inner = next;
    }
    svg.append(outer);
    let refused = false;
    try {
      measuredTextDecorations(svg)(inner);
    } catch (error) {
      refused = error instanceof RangeError;
    }
    outer.remove();
    if (!refused || !measuredTextDecorations(svg)(node)?.length) {
      throw new Error("Decoration ancestry refusal/recovery failed.");
    }
    const layered = document.createElementNS("http://www.w3.org/2000/svg", "g");
    inner = layered;
    for (let depth = 0; depth < 33; depth++) {
      const next = document.createElementNS("http://www.w3.org/2000/svg", "g");
      next.style.textDecoration = "underline";
      inner.append(next);
      inner = next;
    }
    svg.append(layered);
    refused = false;
    try {
      measuredTextDecorations(svg)(inner);
    } catch (error) {
      refused = error instanceof RangeError;
    }
    layered.remove();
    if (!refused || !measuredTextDecorations(svg)(node)?.length) {
      throw new Error("Decoration layers refuse/recover incorrectly.");
    }
    const mixed = document.createElementNS("http://www.w3.org/2000/svg", "a");
    mixed.setAttribute("fill", "red");
    mixed.style.cssText = "stroke:none;color:blue;text-decoration:underline lime";
    mixed.innerHTML =
      '<text x="0" y="20">SVG</text><foreignObject width="100" height="40"><span xmlns="http://www.w3.org/1999/xhtml">HTML</span></foreignObject>';
    svg.append(mixed);
    try {
      const svgTarget = mixed.querySelector("text")!, htmlTarget = mixed.querySelector("span")!;
      for (const order of [[svgTarget, htmlTarget], [htmlTarget, svgTarget]]) {
        const read = measuredTextDecorations(svg);
        const first = read(order[0]!)!, snapshot = JSON.stringify(first);
        read(order[1]!);
        const vector = read(svgTarget)!, html = read(htmlTarget)!;
        if (
          vector[0]?.color !== "rgb(255, 0, 0)" || vector[0]?.stroke !== "none" ||
          html[0]?.color !== "rgb(0, 255, 0)" || html[0]?.stroke !== undefined ||
          read(order[0]!) !== first || JSON.stringify(first) !== snapshot
        ) {
          throw new Error("Mixed decorating-owner caches leak SVG paint into HTML or mutate a sibling.");
        }
      }
    } finally {
      mixed.remove();
    }
    const frame = document.createElement("iframe");
    document.body.append(frame);
    try {
      const borrowed = frame.contentDocument!;
      borrowed.body.innerHTML = `<svg width="300" height="200">${html("<u>Borrowed</u>")}</svg>`;
      const svg = borrowed.querySelector("svg")!, markup = svg.outerHTML;
      const scene = extractMermaidScene(svg);
      if (
        svg.outerHTML !== markup || scene.diagnostics.length ||
        !scene.items.some((item) => item.kind === "text" && item.decorations?.length)
      ) {
        throw new Error("Borrowed-Window decoration capture differs.");
      }
    } finally {
      frame.remove();
    }
    return { checks: 7 };
  } finally {
    host.remove();
  }
}

/** Actual documented class qualifiers plus HTML/SVG flow underlines; raw caption presence alone is insufficient. */
export async function verifyMermaidTextDecorations(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  const source = "classDiagram\nclass Service{\n+run() int$\n+reset() int*\n+int shared$\n+plain() int\n}";
  for (const htmlLabels of [false, true]) {
    for (const look of ["classic", "neo"]) {
      const diagram = await renderer.compile(source, { config: { look, htmlLabels, class: { htmlLabels } } });
      const scene = diagram.scene!,
        texts = scene.items.filter((item): item is MermaidSceneText => item.kind === "text");
      const statics = texts.filter((item) => item.text.includes("+run()") || item.text.includes("shared"));
      const plain = texts.find((item) => item.text.includes("+plain()"))!,
        abstract = texts.find((item) => item.text.includes("+reset()"))!;
      const frame = renderMermaidNativeFrame(scene, { background: "black" });
      if (
        !statics.length || statics.some((item) => !item.decorations?.some((value) => value.line === "underline")) ||
        !plain || plain.decorations?.length || !abstract || abstract.fontStyle !== (htmlLabels ? "italic" : "normal") ||
        frame.diagnostics.length || !frame.cells.flat().some((cell) => cell.underline)
      ) {
        throw new Error(
          `Actual class qualifiers lost: ${
            JSON.stringify({ htmlLabels, look, texts, diagnostics: frame.diagnostics })
          }`,
        );
      }
      retained.push(JSON.parse(JSON.stringify(diagram)));
    }
    const diagram = await renderer.compile(
      htmlLabels ? 'flowchart LR\nA["<u>Underlined</u>"]' : "flowchart LR\nA[Underlined]",
      {
        config: {
          htmlLabels,
          flowchart: { htmlLabels },
          ...htmlLabels ? {} : { themeCSS: ".node text{text-decoration:underline}" },
        },
      },
    );
    const frame = renderMermaidNativeFrame(diagram.scene!, { background: "black" });
    if (frame.diagnostics.length || !frame.cells.flat().some((cell) => cell.underline)) {
      throw new Error("Actual flow underline missing.");
    }
    retained.push(JSON.parse(JSON.stringify(diagram)));
    const unicodeLabel = `Wide Unicode ${unicodeGlyphs.join(" ")}`;
    const unicode = await renderer.compile(
      `flowchart LR\nA["${htmlLabels ? `<u>${unicodeLabel}</u>` : unicodeLabel}"]`,
      {
        config: {
          htmlLabels,
          flowchart: { htmlLabels },
          ...htmlLabels ? {} : { themeCSS: ".node text{text-decoration:underline}" },
        },
      },
    );
    const unicodeFrame = renderMermaidNativeFrame(unicode.scene!, { background: "black" });
    for (const glyph of unicodeGlyphs) {
      const row = unicodeFrame.cells.find((row) => row.some((cell) => cell.char === glyph));
      const column = row?.findIndex((cell) => cell.char === glyph);
      if (
        !row || column === undefined || column < 0 || !row[column]!.underline ||
        (wideUnicodeGlyphs.has(glyph) && row[column + 1]?.char !== "")
      ) throw new Error(`Actual Unicode flow underline/follower lost: ${glyph}/${htmlLabels}`);
    }
    if (unicodeFrame.diagnostics.length) throw new Error("Actual Unicode flow reports fidelity diagnostics.");
    retained.push(JSON.parse(JSON.stringify(unicode)));
  }
  const fixture = MERMAID_STANDARD_FIXTURES.find((fixture) => fixture.name === "kanban-full")!;
  const kanban = await renderer.compile(fixture.source);
  const ticketTexts = kanban.scene!.items.filter((item): item is MermaidSceneText =>
    item.kind === "text" && /^MC-203[678]$/.test(item.text)
  );
  const ticketFrame = renderMermaidNativeFrame(kanban.scene!);
  if (
    ticketTexts.length !== 3 || ticketFrame.diagnostics.length ||
    ticketTexts.some((item) =>
      item.decorations?.length !== 1 || item.decorations[0]!.color !== "rgb(0, 0, 0)" ||
      item.decorations[0]!.stroke !== undefined ||
      !ticketFrame.cells.flat().some((cell) =>
        cell.href?.endsWith(item.text) && cell.underline &&
        parsePaintColor(cell.underlineColor ?? cell.foreground)?.rgb.join(",") === "0,0,0"
      )
    )
  ) throw new Error("Pinned Kanban ticket links lose actual HTML decoration paint.");
  retained.push(JSON.parse(JSON.stringify(kanban)));
  return { retained, decorationCases: retained.length };
}

/** Actual captured diagrams, after compiler disposal, through nested native terminal rendering. */
export async function verifyMermaidTerminalDecorations(retained: readonly MermaidStandardDiagram[]) {
  let diagrams = 0, decoratedCells = 0, sourceCells = 0, remoteCells = 0, remoteFrames = 0, ansiCells = 0;
  for (const diagram of retained) {
    const scene = diagram.scene!;
    if (!scene.items.some((item) => item.kind === "text" && item.decorations?.length)) continue;
    const frame = renderMermaidNativeFrame(scene);
    if (!frame.cells.flat().some((cell) => cell.underline || cell.overline || cell.strikethrough)) continue;
    const source = "```mermaid\nfixture\n```";
    const prepared = await prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
    const markdown = new MarkdownSurface({ source, render: prepared.render });
    const width = 120, height = 64, screen = new TerminalScreenController({ columns: width, rows: height });
    const surface = new WidgetSurface(width, height), revision = new Signal(0);
    const remote = new MermaidRemoteCells();
    try {
      await markdown.ready;
      const expected = markdown.renderCells(width, height);
      const received = remote.roundTrip(expected);
      screen.write(received.map((row) => row.join("")).join("\r\n"));
      // The controller is not its own oracle: compare every source Markdown
      // cell and empty wide follower before checking mounted paint/styles.
      const actual = screen.cellRows();
      for (const [row, cells] of expected.entries()) {
        for (const [column, value] of cells.entries()) {
          const text = parseAnsiCell(value).text, cell = actual[row]![column]!;
          if (text === "" ? !cell.continuation : cell.continuation || cell.char !== text) {
            throw new Error(
              `Nested terminal source grapheme differs: ${
                JSON.stringify({ source: diagram.source, row, column, text, cell })
              }`,
            );
          }
          sourceCells++;
        }
      }
      // Keep the original raw/source oracle above, then independently exercise
      // both actual addressed sinks on these disposed compiler/remote cells.
      const sink = new AnsiCanvasSink({
        stdout: {
          writeSync(data) {
            screen.write(data);
            return data.length;
          },
        },
      });
      const entries = (cell: object) => Object.entries(cell).sort(([a], [b]) => a.localeCompare(b));
      for (const mode of ["ranges", "updates"] as const) {
        screen.write("\x1b[0m");
        screen.clear();
        if (mode === "ranges") {
          sink.flushRanges(received.map((values, row) => ({ row, startColumn: 0, values })), {} as never);
        } else {
          sink.flush(received.flatMap((values, row) => values.map((value, column) => ({ row, column, value }))));
        }
        screen.flushInput();
        const addressed = screen.cellRows();
        for (let row = 0; row < height; row++) {
          for (let column = 0; column < width; column++) {
            if (JSON.stringify(entries(addressed[row]![column]!)) !== JSON.stringify(entries(actual[row]![column]!))) {
              throw new Error(`Actual ${mode} ANSI Mermaid cell differs: ${
                JSON.stringify({
                  source: diagram.source,
                  row,
                  column,
                  addressed: addressed[row]![column],
                  original: actual[row]![column],
                  value: received[row]![column],
                })
              }`);
            }
            ansiCells++;
          }
        }
      }
      surface.mount((tui) => [
        new TerminalScreen({
          parent: tui,
          zIndex: 1,
          rectangle: { column: 0, row: 0, width, height },
          screen,
          revision,
          colors: {
            defaultForeground: [255, 255, 255],
            defaultBackground: [0, 0, 0],
            cursorForeground: [0, 0, 0],
            cursorBackground: [255, 255, 255],
          },
          showCursor: false,
          contrastLift: false,
        }),
      ]);
      await surface.render();
      let marked = 0;
      for (const [row, cells] of screen.cellRows().entries()) {
        for (const [column, cell] of cells.entries()) {
          if (cell.continuation || (!cell.underline && !cell.overline && !cell.strikethrough)) continue;
          const value = surface.cellAt(row, column);
          const painted = parseAnsiCell(typeof value === "string" ? value : new TextDecoder().decode(value));
          const checks = ["bold", "dim", "italic", "underline", "overline", "strikethrough"] as const;
          if (
            painted.text !== cell.char || checks.some((key) => !!painted[key] !== !!cell[key]) ||
            (painted.underlineStyle ?? "solid") !== (cell.underlineStyle ?? "solid")
          ) {
            throw new Error(
              `Nested terminal typography differs: ${
                JSON.stringify({ source: diagram.source, row, column, cell, painted })
              }`,
            );
          }
          const ink = terminalPaletteRgb(cell.underlineColor, false);
          if (ink && painted.underlineColor !== `rgb(${ink.join(",")})`) {
            throw new Error("Nested terminal underline ink lost.");
          }
          marked++;
        }
      }
      if (!marked) {
        throw new Error(
          `Actual decorated Mermaid diagram never reached the nested terminal: ${
            JSON.stringify({
              source: diagram.source,
              scene: [scene.width, scene.height],
              frame: [frame.columns, frame.rows],
              rendered: markdown.component.controller.text(width),
              cells: screen.cellRows().flat().filter((cell) => cell.char.trim()).slice(0, 40),
            })
          }`,
        );
      }
      diagrams++;
      decoratedCells += marked;
      remoteCells += remote.cells;
      remoteFrames += remote.frames;
      screen.write("\x1b[H\x1b[0m\x1b[2J");
      revision.value++;
      await surface.render();
      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          const value = surface.cellAt(row, column);
          const painted = parseAnsiCell(typeof value === "string" ? value : new TextDecoder().decode(value));
          if (
            painted.italic || painted.underline || painted.overline || painted.strikethrough || painted.underlineColor
          ) {
            throw new Error("Nested terminal keeps stale Mermaid decoration after erase/repaint.");
          }
        }
      }
    } finally {
      markdown.dispose();
      surface.dispose();
    }
  }
  if (diagrams < 6 || decoratedCells < 6) {
    throw new Error("Terminal conformance omitted documented decorated diagrams.");
  }
  if (ansiCells !== sourceCells * 2) throw new Error("Actual addressed ANSI Mermaid cells were omitted.");
  return { diagrams, decoratedCells, sourceCells, remoteCells, remoteFrames, ansiCells };
}
