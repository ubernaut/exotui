// Copyright 2023 Im-Beast. MIT license.
/** Pinned Mermaid 12.1.0 general-purpose shape registry and documented look/theme features.
 * Registry: https://github.com/mermaid-js/mermaid/blob/21f72f07ea22c0af48a3149c550654e80d8e40cb/packages/mermaid/src/rendering-util/rendering-elements/shapes.ts
 * Special icon/image shapes have their own asset fixtures; this is not full flowchart coverage.
 */
import {
  extractMermaidScene,
  MermaidFlexMarkdownSurface,
  MermaidMarkdownCache,
  MermaidMarkdownController,
  type MermaidStandardDiagram,
  type MermaidStandardRenderer,
  renderMermaidNativeFrame,
} from "../../../mod.mermaid.ts";
import { MarkdownSurface } from "../../../mod.document.ts";
import { stripStyles, textWidth } from "../../../src/utils/strings.ts";

export const MERMAID_FLOW_SHAPES: readonly (readonly [string, readonly string[]])[] = [
  ["rect", ["proc", "process", "rectangle"]],
  ["rounded", ["event"]],
  ["stadium", ["terminal", "pill"]],
  ["fr-rect", ["subprocess", "subproc", "framed-rectangle", "subroutine"]],
  ["cyl", ["db", "database", "cylinder"]],
  ["datastore", ["data-store"]],
  ["folder", ["directory"]],
  ["bucket", []],
  ["console", []],
  ["browser", []],
  ["person", []],
  ["circle", ["circ"]],
  ["bang", []],
  ["cloud", []],
  ["diam", ["decision", "diamond", "question"]],
  ["hex", ["hexagon", "prepare"]],
  ["lean-r", ["lean-right", "in-out"]],
  ["lean-l", ["lean-left", "out-in"]],
  ["trap-b", ["priority", "trapezoid-bottom", "trapezoid"]],
  ["trap-t", ["manual", "trapezoid-top", "inv-trapezoid"]],
  ["dbl-circ", ["double-circle"]],
  ["text", []],
  ["notch-rect", ["card", "notched-rectangle"]],
  ["lin-rect", ["lined-rectangle", "lined-process", "lin-proc", "shaded-process"]],
  ["sm-circ", ["start", "small-circle"]],
  ["fr-circ", ["stop", "framed-circle"]],
  ["fork", ["join"]],
  ["hourglass", ["collate"]],
  ["brace", ["comment", "brace-l"]],
  ["brace-r", []],
  ["braces", []],
  ["bolt", ["com-link", "lightning-bolt"]],
  ["doc", ["document"]],
  ["delay", ["half-rounded-rectangle"]],
  ["h-cyl", ["das", "horizontal-cylinder"]],
  ["lin-cyl", ["disk", "lined-cylinder"]],
  ["curv-trap", ["curved-trapezoid", "display"]],
  ["div-rect", ["div-proc", "divided-rectangle", "divided-process"]],
  ["tri", ["extract", "triangle"]],
  ["win-pane", ["internal-storage", "window-pane"]],
  ["f-circ", ["junction", "filled-circle"]],
  ["notch-pent", ["loop-limit", "notched-pentagon"]],
  ["flip-tri", ["manual-file", "flipped-triangle"]],
  ["sl-rect", ["manual-input", "sloped-rectangle"]],
  ["docs", ["documents", "st-doc", "stacked-document"]],
  ["st-rect", ["procs", "processes", "stacked-rectangle"]],
  ["bow-rect", ["stored-data", "bow-tie-rectangle"]],
  ["cross-circ", ["summary", "crossed-circle"]],
  ["tag-doc", ["tagged-document"]],
  ["tag-rect", ["tagged-rectangle", "tag-proc", "tagged-process"]],
  ["flag", ["paper-tape"]],
  ["odd", []],
  ["lin-doc", ["lined-document"]],
];
const looks = ["classic", "neo", "handDrawn"];
const themes = [
  "redux-color",
  "redux-dark-color",
  "redux",
  "redux-dark",
  "default",
  "neutral",
  "dark",
  "forest",
  "neo",
  "neo-dark",
  "base",
];
const unlabelled = new Set(["sm-circ", "fr-circ", "fork", "hourglass", "bolt", "f-circ", "cross-circ"]);
const featureSource =
  'flowchart LR\naccTitle: Feature audit\naccDescr {\nTwo groups and styled Markdown labels.\n}\nsubgraph Parent[Platform]\n direction TB\n A["`**Bold** and _Italic_`"] e1@-->|Link label| B@{ shape: docs, label: "Files" }\nend\nB --> C((Output))\nclassDef node fill:#123456,stroke:#abcdef,stroke-width:3px;\nclass B node';
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Actual engine/native evidence for all registry names/aliases and look/theme/HTML-label combinations. */
export async function verifyMermaidFlowFeatures(renderer: Pick<MermaidStandardRenderer, "compile">) {
  let shapeCases = 0;
  let aliasCases = 0;
  const retained: MermaidStandardDiagram[] = [];
  for (const [canonical, aliases] of MERMAID_FLOW_SHAPES) {
    for (const name of [canonical, ...aliases]) {
      for (const look of name === canonical ? looks : ["classic"]) {
        const diagram = await renderer.compile(
          `flowchart LR\nA@{ shape: ${name}, label: "Shape label" }\nA-->B[Next]`,
          { config: { look, flowchart: { htmlLabels: false } } },
        );
        const scene = diagram.scene!;
        const frame = renderMermaidNativeFrame(scene);
        const caption = scene.items.filter((item) => item.kind === "text").map((item) => item.text).join("");
        require(
          scene.diagnostics.length === 0 && frame.diagnostics.length === 0,
          `${name}/${look}: unsupported native feature`,
        );
        require(caption.includes("Next"), `${name}/${look}: missing destination`);
        require(
          unlabelled.has(canonical) ? !diagram.svg.includes("Shape label") : caption.includes("Shape label"),
          `${name}/${look}: upstream/native caption mismatch`,
        );
        require(
          frame.cells.flat().some((cell) => cell.foreground || cell.background),
          `${name}/${look}: empty native scene`,
        );
        if (name === canonical) shapeCases++;
        else aliasCases++;
        if (name === canonical && look === "handDrawn") retained.push(JSON.parse(JSON.stringify(diagram)));
      }
    }
  }
  const palettes = new Set<string>();
  let featureCases = 0;
  for (const look of looks) {
    for (const theme of themes) {
      for (const htmlLabels of [false, true]) {
        const diagram = await renderer.compile(featureSource, { config: { look, theme, flowchart: { htmlLabels } } });
        const scene = diagram.scene!;
        const labels = scene.items.filter((item) => item.kind === "text");
        require(
          scene.title === "Feature audit" && scene.description === "Two groups and styled Markdown labels.",
          "Accessibility source metadata missing",
        );
        require(
          labels.some((item) => item.text === "Bold" && Number(item.fontWeight) >= 700) &&
            labels.some((item) => item.text === "Italic" && item.fontStyle === "italic"),
          "Markdown emphasis missing",
        );
        require(
          labels.some((item) => item.text === "Files") && labels.some((item) => item.text === "Platform"),
          "Shape/subgraph labels missing",
        );
        const paths = scene.items.filter((item) => item.kind === "path");
        require(paths.some((item) => item.paint.stroke === "rgb(171, 205, 239)"), "Class-authored stroke missing");
        palettes.add(paths.map((item) => item.paint.fill).join("|"));
        const frame = renderMermaidNativeFrame(scene);
        require(frame.diagnostics.length === 0, `${look}/${theme}/${htmlLabels}: native gap`);
        require(
          frame.cells.map((row) => row.map((cell) => cell.char).join("")).join("\n").includes("Files"),
          "Files caption missing from native paint",
        );
        featureCases++;
        retained.push(JSON.parse(JSON.stringify(diagram)));
      }
    }
  }
  require(palettes.size >= 6, "Theme combinations collapsed into one native palette");
  let invalidCases = 0;
  for (const source of ["flowchart LR\nA@{ shape: does-not-exist }", "flowchart LR\nA --> ["]) {
    let failed = false;
    try {
      await renderer.compile(source);
    } catch {
      failed = true;
    }
    require(failed, "Invalid shape/grammar silently accepted");
    invalidCases++;
  }
  const recovered = await renderer.compile("flowchart LR\nRecovered --> Ready");
  require(
    recovered.scene!.items.some((item) => item.kind === "text" && item.text === "Recovered"),
    "Feature rejection broke compiler recovery",
  );
  return { retained, shapeCases, aliasCases, featureCases, invalidCases, themePalettes: palettes.size };
}

/** Responsive native Markdown and flex scenes remain usable after JSON transport/compiler disposal. */
export async function verifyMermaidFlowTransport(retained: readonly MermaidStandardDiagram[]) {
  let snapshots = 0;
  for (const diagram of retained) {
    const cache = new MermaidMarkdownCache({ compile: () => Promise.resolve(diagram) });
    const source = `# Shapes\n\n\`\`\`mermaid\n${diagram.source}\n\`\`\`\n\nAfter shapes.`;
    const controller = new MermaidMarkdownController(cache, { source, width: 80 });
    const markdown = new MarkdownSurface({ controller });
    const flex = new MermaidFlexMarkdownSurface(cache, {
      sections: [{ id: "features", label: "Features", rows: [{ panels: [{ id: "diagram", source }] }] }],
    });
    try {
      await markdown.ready;
      await controller.settled();
      for (const width of [80, 16, 120, 80]) {
        markdown.render(width, 12);
        await controller.settled();
        await flex.settled(width);
        for (
          const { surface: host, controller: view } of [
            { surface: markdown, controller: markdown.component.controller },
            { surface: flex, controller: flex.controller },
          ]
        ) {
          view.scrollTo(0, width, 12);
          for (const offset of [0, 12]) {
            if (offset) { for (let wheel = 0; wheel < 4; wheel++) host.scroll(1); }
            const rows = host.render(width, 12).map(stripStyles);
            require(
              rows.length === 12 && rows.every((row) => textWidth(row) === width),
              "Transported flow scene row clipping mismatch",
            );
            snapshots++;
          }
        }
      }
    } finally {
      markdown.dispose();
      controller.dispose();
      flex.dispose();
      cache.dispose();
    }
  }
  return { diagrams: retained.length, nativeSnapshots: snapshots };
}

/** Independent browser arclength/dash probes for adaptive curves, loops, transforms and rough hatch contours. */
export function verifyMermaidBezierDOM() {
  const holder = document.createElement("div");
  const hatch = Array.from(
    { length: 400 },
    (_, index) =>
      `M10 ${20 + index * .5}C200 ${20 + index * .5 + .05} 400 ${20 + index * .5 - .05} 600 ${20 + index * .5}`,
  ).join(" ");
  holder.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="700" viewBox="0 0 800 700"><path d="${hatch}" fill="none" stroke="red" stroke-width="1"/><path d="M100 250C300 400 -50 400 100 250C300 250 -50 250 100 250" fill="none" stroke="blue"/><path d="M50 450c10 80 100 80 150 0s100 -80 150 0q50 80 100 0t100 0H650V550Z" fill="none" stroke="green" stroke-width="4" stroke-dasharray="17 13" stroke-dashoffset="-5" transform="translate(20 10) scale(1.1 .8)"/></svg>`;
  document.body.append(holder);
  try {
    const svg = holder.querySelector("svg")!;
    const original = holder.innerHTML;
    const scene = extractMermaidScene(svg);
    require(holder.innerHTML === original, "Curve extraction mutated the mounted source");
    const paths = scene.items.filter((item) => item.kind === "path");
    require(
      paths.length === 3,
      `Curve source paths not preserved: ${paths.length}; ${
        JSON.stringify(
          [...svg.querySelectorAll("path")].map((path) => ({
            length: path.getTotalLength(),
            display: getComputedStyle(path).display,
            visibility: getComputedStyle(path).visibility,
            d: getComputedStyle(path).getPropertyValue("d").slice(0, 80),
          })),
        )
      }`,
    );
    require(
      paths[0]!.subpaths?.length === 400 && paths[0]!.subpaths.every((path) => path.points.length === 2),
      "Nearly straight hatch contours were erased or oversampled",
    );
    let distanceComparisons = 0;
    for (const [index, element] of [...svg.querySelectorAll("path")].entries()) {
      if (index === 0) continue;
      const item = paths[index]!;
      const inverse = DOMMatrix.fromMatrix(element.getScreenCTM()!).inverse().multiply(
        DOMMatrix.fromMatrix(svg.getScreenCTM()!),
      );
      for (const point of item.points) {
        const local = new DOMPoint(point.x, point.y).matrixTransform(inverse);
        const measured = element.getPointAtLength(point.distance!);
        require(
          Math.hypot(local.x - measured.x, local.y - measured.y) < .12,
          `Browser arclength differs by ${Math.hypot(local.x - measured.x, local.y - measured.y)}`,
        );
        distanceComparisons++;
      }
    }
    const frame = renderMermaidNativeFrame(scene, { columnUnits: 2, rowUnits: 2 });
    require(frame.diagnostics.length === 0, "Adaptive source is not natively usable");
    const transported = renderMermaidNativeFrame(JSON.parse(JSON.stringify(scene)), { columnUnits: 2, rowUnits: 2 });
    require(JSON.stringify(frame) === JSON.stringify(transported), "Adaptive scene changed across JSON transport");
    let dashComparisons = 0;
    let gapComparisons = 0;
    const element = svg.querySelectorAll("path")[2]!;
    const root = DOMMatrix.fromMatrix(svg.getScreenCTM()!);
    const matrix = DOMMatrix.fromMatrix(element.getScreenCTM()!);
    const sceneMatrix = root.inverse().multiply(matrix);
    const inverse = matrix.inverse().multiply(root);
    const checked = new Set<string>();
    const length = element.getTotalLength();
    // Circuit glyphs trace the centerline, not a pixel-exact SVG stroke outline.
    // Compare centerline cells and stable dash interiors independently; the
    // full-width/cap/join outline capability remains a separate open requirement.
    for (let distance = 2; distance < length - 2; distance += .25) {
      const point = element.getPointAtLength(distance);
      const scenePoint = new DOMPoint(point.x, point.y).matrixTransform(sceneMatrix);
      const column = Math.round(scenePoint.x / 2);
      const row = Math.round(scenePoint.y / 2);
      if (Math.abs(scenePoint.x / 2 - column) > .2 || Math.abs(scenePoint.y / 2 - row) > .2) continue;
      const key = `${column},${row}`;
      if (checked.has(key)) continue;
      const cell = frame.cells[row]?.[column];
      if (!cell) continue;
      const votes = [-2, 0, 2].map((offset) => element.isPointInStroke(element.getPointAtLength(distance + offset)));
      if (votes.some((value) => value !== votes[0])) continue;
      if (votes[0]) {
        require(
          cell.char !== " ",
          `Curve centerline dash missing at ${key}: ${
            JSON.stringify({
              distance,
              scenePoint,
              local: { x: point.x, y: point.y },
              nearby: paths[2]!.points.filter((point) =>
                Math.hypot(point.x - scenePoint.x, point.y - scenePoint.y) < 12
              ),
            })
          }`,
        );
        dashComparisons++;
      } else {
        const stable = [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]].every(([dx, dy]) =>
          !element.isPointInStroke(new DOMPoint(column * 2 + dx!, row * 2 + dy!).matrixTransform(inverse))
        );
        if (!stable) continue;
        require(cell.char === " ", `Curve centerline gap filled at ${key}`);
        gapComparisons++;
      }
      checked.add(key);
    }
    require(
      distanceComparisons > 50 && dashComparisons > 30 && gapComparisons > 20,
      "Insufficient independent curve/dash samples",
    );
    const invalid = document.createElementNS("http://www.w3.org/2000/svg", "path");
    invalid.setAttribute("d", `M0 0${"C1 0 2 0 3 0".repeat(8192)}`);
    invalid.setAttribute("fill", "none");
    invalid.setAttribute("stroke", "red");
    svg.append(invalid);
    const failedSource = holder.innerHTML;
    let failed = false;
    try {
      extractMermaidScene(svg);
    } catch (error) {
      failed = error instanceof RangeError && /budget/.test(error.message);
    }
    require(failed && holder.innerHTML === failedSource, "Curve budget rejection leaked probes or did not reject");
    invalid.remove();
    require(extractMermaidScene(svg).items.length === scene.items.length, "Curve failure did not recover");
    return {
      hatchContours: 400,
      hatchPoints: 800,
      distanceComparisons,
      dashComparisons,
      gapComparisons,
      budgetCleanup: true,
    };
  } finally {
    holder.remove();
  }
}
