// Copyright 2023 Im-Beast. MIT license.
import { getMultiCodePointCharacters, textWidth } from "../../../src/utils/strings.ts";
import { extractMermaidScene } from "../../../src/content/mermaid_scene.ts";
import { renderMermaidNativeFrame } from "../../../src/content/mermaid_cells.ts";
import { clipPredicate } from "../../../src/content/mermaid_clip.ts";
import type { MermaidStandardDiagram, MermaidStandardRenderer } from "../../../mod.mermaid.ts";

let rootOriginal: HTMLDivElement | undefined;
/** Original SVG paint compared independently with its portable root clip. */
export function mountMermaidRootViewportOriginal(visible: boolean) {
  disposeMermaidRootViewportOriginal();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:320px;height:240px;background:white;z-index:1000000";
  host.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120" style="overflow:${
      visible ? "visible" : "hidden"
    }"><rect x="140" y="40" width="100" height="30" fill="rgb(0,128,0)"/></svg>`;
  document.body.append(host);
  rootOriginal = host;
  const svg = host.querySelector("svg")!, original = svg.outerHTML;
  const scene = extractMermaidScene(svg);
  const path = scene.items.find((item) => item.kind === "path")!;
  const inside = clipPredicate(path.clip, () => {});
  if (svg.outerHTML !== original || host.children.length !== 1) throw new Error("Root viewport capture changed DOM.");
  return {
    samples: [150, 180, 220].map((x) => ({ x, y: 50, painted: inside(x, 50) })),
    clipped: !!path.clip,
  };
}
export function disposeMermaidRootViewportOriginal() {
  rootOriginal?.remove();
  rootOriginal = undefined;
}

/** Independent browser Range geometry for transformed, Unicode and nested SVG labels. */
export function verifyMermaidTextDOM() {
  let glyphSamples = 0, nativeSamples = 0;
  for (const style of ["", "transform:rotate(17deg);transform-origin:50% 50%", "overflow:visible"]) {
    const host = document.createElement("div");
    host.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 50" style="${style}"><rect x="-100" y="-100" width="300" height="250" fill="red"/></svg>`;
    document.body.append(host);
    try {
      const svg = host.querySelector("svg")!, original = svg.outerHTML;
      const scene = extractMermaidScene(svg);
      const path = scene.items.find((item) => item.kind === "path")!;
      if (style === "overflow:visible") {
        if (path.clip) throw new Error("Visible root overflow was clipped.");
      } else {
        // A square viewport around a 2:1 meet viewBox has vertical letterboxes.
        // These bounds are independently specified, not the extraction probe.
        if (path.clip?.kind !== "path") throw new Error("Root SVG viewport clip is missing.");
        const corners = path.clip.contours[0]!;
        const expected = [[0, -25], [100, -25], [100, 75], [0, 75]];
        // Computed CSS serializes rotation matrices with six decimal places.
        // One thousandth of a CSS pixel covers that measured serialization,
        // far below native cells and the independent browser paint samples.
        if (
          corners.length !== expected.length ||
          corners.some((p, i) => Math.abs(p.x - expected[i]![0]!) > .001 || Math.abs(p.y - expected[i]![1]!) > .001)
        ) {
          throw new Error(`Root viewport clip differs: ${JSON.stringify(corners)}`);
        }
      }
      if (svg.outerHTML !== original || host.children.length !== 1) throw new Error("Root viewport probe leaked DOM.");
    } finally {
      host.remove();
    }
  }
  const cases = [
    ...[0, -90, 90, 45, 180].map((angle) => ({
      name: `rotate-${angle}`,
      attributes: `transform="translate(150 120) rotate(${angle})" text-anchor="middle"`,
      body: "Axis label",
    })),
    { name: "unicode", attributes: 'transform="translate(150 160) rotate(-90)"', body: "A😀é 界Z" },
    { name: "reflection", attributes: 'transform="translate(260 90) scale(-1 1)"', body: "Reflected" },
    { name: "skew", attributes: 'transform="translate(30 90) skewY(25)"', body: "Skew label" },
    {
      name: "nested-style",
      attributes: 'transform="translate(160 200) rotate(-90)"',
      body: 'A<tspan fill="blue" font-weight="bold"> B😀</tspan>C',
    },
    { name: "nested-position", attributes: 'x="80" y="90"', body: 'A<tspan x="140" dy="30"> B😀</tspan>C' },
    { name: "collapsed-space", attributes: 'transform="translate(160 200) rotate(-90)"', body: "  A   B\n C  " },
    {
      name: "preformatted-space",
      attributes: 'transform="translate(160 200) rotate(-90)" style="white-space:pre"',
      body: " A  B ",
    },
    {
      name: "hidden-run",
      attributes: 'transform="translate(160 200) rotate(-90)"',
      body: 'A<tspan style="display:none">hidden</tspan>B<tspan visibility="hidden">C</tspan>D',
    },
    { name: "vertical", attributes: 'x="140" y="50" style="writing-mode:vertical-rl"', body: "Vertical" },
    { name: "path", attributes: "", body: '<textPath href="#curve">Path labels</textPath>' },
    { name: "rtl", attributes: 'x="200" y="90" direction="rtl"', body: "שלום" },
    {
      name: "ordinary-tspan-line",
      attributes: 'x="30" y="100"',
      body: '<tspan x="30" y="90" dy="1.1em"><tspan>Custom</tspan><tspan> service</tspan></tspan>',
    },
    { name: "position-list", attributes: 'x="30 60 110 190" y="90"', body: "ABCD" },
    { name: "rotate-list", attributes: 'x="50" y="100" rotate="-20 20 -20 20"', body: "ABCD" },
    { name: "letter-spacing", attributes: 'x="50" y="100" style="letter-spacing:8px"', body: "ABCD" },
  ];
  for (const { name, attributes, body } of cases) {
    const host = document.createElement("div");
    host.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="280" viewBox="0 0 320 280"><defs><path id="curve" d="M40 160 Q160 20 280 160"/></defs><text font-family="monospace" font-size="16" fill="red" ${attributes}>${body}</text></svg>`;
    document.body.append(host);
    try {
      const svg = host.querySelector("svg")!, borrowed = svg.outerHTML;
      const scene = extractMermaidScene(svg);
      const matrix = DOMMatrix.fromMatrix(svg.getScreenCTM()!).inverse();
      const walker = document.createTreeWalker(svg.querySelector("text")!, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const item of scene.items) {
        if (item.kind !== "text") continue;
        if (item.width < 0 || item.height < 0) throw new Error(`Signed SVG text bounds: ${name}`);
        if (!item.layout) continue;
        const node = nodes.find((n) =>
          n.textContent === item.text || (n.textContent ?? "").replace(/[\t\r\n ]+/g, " ").trim() === item.text.trim()
        );
        if (!node) throw new Error(`SVG text run lost: ${name}/${item.text}`);
        for (const glyph of item.layout.glyphs) {
          // Range rectangles are a separate browser layout API, not the extraction helper's SVG character extents.
          if (name !== "collapsed-space") {
            const range = document.createRange();
            range.setStart(node, glyph.start);
            range.setEnd(node, glyph.end);
            const box = range.getBoundingClientRect();
            const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix);
            if (Math.abs(center.x - glyph.x) > .15 || Math.abs(center.y - glyph.y) > .15) {
              throw new Error(
                `Independent Range center mismatch: ${name}/${
                  item.text.slice(glyph.start, glyph.end)
                } ${center.x},${center.y} vs ${glyph.x},${glyph.y}`,
              );
            }
            glyphSamples++;
          }
        }
      }
      const frame = renderMermaidNativeFrame(scene, { columnUnits: 2, rowUnits: 4 });
      if (
        name === "ordinary-tspan-line" &&
        (scene.items.some((item) => item.kind === "text" && item.layout) ||
          !frame.cells.some((row) => row.map((cell) => cell.char).join("").includes("Custom")))
      ) {
        throw new Error("Ordinary line positioning inflated native letter spacing");
      }
      for (const item of scene.items) {
        if (item.kind !== "text" || !item.layout) continue;
        for (const glyph of item.layout.glyphs) {
          const char = item.text.slice(glyph.start, glyph.end), width = textWidth(char);
          if (!width || char === " ") continue;
          const x = Math.round(glyph.x / 2 - (width - 1) / 2), y = Math.round(glyph.y / 4);
          if (frame.cells[y]?.[x]?.char !== char) {
            throw new Error(`Measured native glyph missing: ${name}/${char}/${x},${y}`);
          }
          nativeSamples++;
        }
      }
      if (
        JSON.stringify(renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), { columnUnits: 2, rowUnits: 4 })) !==
          JSON.stringify(frame)
      ) throw new Error(`SVG text JSON changed: ${name}`);
      if (svg.outerHTML !== borrowed) throw new Error(`SVG text extraction mutated borrowed DOM: ${name}`);
    } finally {
      host.remove();
    }
  }
  const host = document.createElement("div");
  document.body.append(host);
  try {
    for (const body of ["X".repeat(65_537), "X".repeat(8193)]) {
      host.innerHTML = `<svg width="100" height="100"><text y="30">${body}</text></svg>`;
      const svg = host.querySelector("svg")!, borrowed = svg.outerHTML;
      let refused = false;
      try {
        extractMermaidScene(svg);
      } catch (error) {
        refused = error instanceof RangeError;
      }
      if (!refused || svg.outerHTML !== borrowed) throw new Error("SVG text budget refusal leaked or failed");
    }
    host.innerHTML =
      '<svg width="100" height="100"><text x="20" y="60" transform="rotate(-90 50 50)">Recover</text></svg>';
    if (!extractMermaidScene(host.querySelector("svg")!).items.length) {
      throw new Error("SVG text budget failure prevented recovery");
    }
  } finally {
    host.remove();
  }
  return { cases: cases.length, glyphSamples, nativeSamples, budgetCases: 2 };
}

/** Real upstream XY-chart axes: legibility, bounded density and portable scene ownership, not just parsing. */
export async function verifyMermaidTextFeatures(renderer: Pick<MermaidStandardRenderer, "compile">) {
  const retained: MermaidStandardDiagram[] = [];
  let glyphs = 0;
  for (
    const [orientation, title] of [["vertical", "Measured value"], ["horizontal", "Measured value"], [
      "vertical",
      "😀 Quantum é",
    ]]
  ) {
    const source = `xychart-beta
      title "XY labels"
      x-axis [September,October,November,December]
      y-axis "${title}" 0 --> 100
      line [20,40,10,60]`;
    const diagram = await renderer.compile(source, {
      trusted: true,
      config: { xyChart: { chartOrientation: orientation } },
    });
    const scene = diagram.scene!, axis = scene.items.find((item) => item.kind === "text" && item.text === title);
    if (!axis || axis.kind !== "text" || axis.width < 0 || axis.height < 0) {
      throw new Error(`Actual XY axis missing: ${orientation}`);
    }
    if (orientation === "vertical") {
      if (!axis.layout || axis.layout.glyphs.length !== getMultiCodePointCharacters(title!).length) {
        throw new Error("Actual vertical XY axis lost glyph layout");
      }
      glyphs += axis.layout.glyphs.length;
      const points = axis.layout.glyphs;
      if (points[0]!.y <= points.at(-1)!.y || Math.abs(points[0]!.x - points.at(-1)!.x) > .01) {
        throw new Error("XY axis direction changed");
      }
    }
    const frame = renderMermaidNativeFrame(scene);
    if (frame.columns > 200 || frame.rows > 200) {
      throw new Error(`Actual XY density inflated: ${frame.columns}x${frame.rows}`);
    }
    if (orientation === "vertical") {
      const approximateColumn = axis.layout!.glyphs[0]!.x / (scene.width / (frame.columns - 1));
      const left = Math.max(0, Math.floor(approximateColumn) - 1), right = Math.ceil(approximateColumn) + 2;
      const painted = frame.cells.map((row) => row.slice(left, right).map((cell) => cell.char).join("").trim())
        .reverse().join("").replace(/\s/g, "");
      if (!painted.includes(title!.replace(/\s/g, ""))) {
        throw new Error(`Actual XY axis lost native letters: ${painted}/${title}`);
      }
    }
    const copy = JSON.parse(JSON.stringify(diagram)) as MermaidStandardDiagram;
    if (JSON.stringify(renderMermaidNativeFrame(copy.scene!)) !== JSON.stringify(frame)) {
      throw new Error("Actual XY JSON changed");
    }
    retained.push(copy);
  }
  return { cases: retained.length, glyphs, retained };
}
