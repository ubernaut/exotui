// Copyright 2026 ExotUI contributors. MIT license.
import { extractMermaidScene, renderMermaidNativeFrame } from "../../../mod.mermaid.ts";
import type { MermaidScene } from "../../../mod.mermaid.ts";
import { extractFilter, invalidFilterReferencePolicy } from "../../../src/content/mermaid_filter_dom.ts";
import { checkMarkerBatch, expandMermaidMarker } from "../../../src/content/mermaid_marker_dom.ts";

const invertPrimitive = '<feColorMatrix values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"';
const greenFlood = '<feFlood flood-color="lime"/>';

export const FILTER_REFERENCE_CASES = [
  { name: "missing", filter: "url(#missing)" },
  { name: "missing-after-color", filter: "invert(1) url(#missing)", inverted: true },
  { name: "missing-before-color", filter: "url(#missing) invert(1)", inverted: true },
  { name: "missing-between-colors", filter: "invert(1) url(#missing) opacity(.2)", pale: true },
  { name: "wrong-svg-type", filter: "url(#wrong-type)" },
  { name: "wrong-html-namespace", filter: "url(#html-filter)" },
  { name: "valid", filter: "url(#valid)", green: true },
  { name: "valid-with-base", filter: "url(#valid)", base: true, green: true },
  { name: "borrowed", filter: "url(#borrowed)", borrowed: true, green: true },
  { name: "wrong-svg-in-chain", filter: "invert(1) url(#wrong-type)", inverted: true },
  { name: "wrong-html-in-chain", filter: "invert(1) url(#html-filter)", inverted: true },
  { name: "valid-before-missing", filter: "url(#valid) invert(1) url(#missing)", magenta: true },
  { name: "empty-url", filter: 'invert(1) url("")', inverted: true },
  { name: "encoded-space", filter: 'url("#filter%20space")', id: "filter space", green: true },
  { name: "encoded-unicode", filter: 'url("#caf%C3%A9")', id: "café", green: true },
  { name: "encoded-bom", filter: 'url("#%EF%BB%BFfilter")', id: "\ufefffilter", green: true },
  { name: "literal-percent", filter: 'url("#literal%zz%20id")', id: "literal%zz id", green: true },
  { name: "escaped-quote", filter: 'url("#quoted\\"id")', id: 'quoted"id', green: true },
  { name: "shadow-scope", filter: "url(#valid)", shadow: true, green: true },
  { name: "shadow-isolates-host-definition", filter: "url(#borrowed)", shadow: true, borrowed: true, isolated: true },
  { name: "duplicate-wrong-type", filter: "url(#valid)", duplicateWrong: true },
  { name: "duplicate-borrowed", filter: "url(#valid)", borrowed: true, duplicateBorrowed: true, green: true },
  { name: "absolute-local", filter: "url(#valid)", absolute: true, green: true },
  { name: "external-denied", filter: 'invert(1) url("/other-filter.svg#valid")', external: true, inverted: true },
  {
    name: "primitive-missing-first",
    filter: "url(#valid)",
    primitives: invertPrimitive + ' in="missing"/>',
    inverted: true,
  },
  {
    name: "primitive-forward-first",
    filter: "url(#valid)",
    primitives: invertPrimitive + ' in="later"/><feColorMatrix result="later"/>',
    inverted: true,
  },
  {
    name: "primitive-missing-previous",
    filter: "url(#valid)",
    primitives: greenFlood + invertPrimitive + ' in="missing"/>',
    magenta: true,
  },
  {
    name: "primitive-missing-second",
    filter: "url(#valid)",
    primitives: greenFlood + '<feComposite in="SourceGraphic" in2="missing" operator="arithmetic" k2=".5" k3=".5"/>',
    rgb: [100, 178, 25],
  },
  { name: "primitive-default-first", filter: "url(#valid)", primitives: invertPrimitive + "/>", inverted: true },
  {
    name: "primitive-default-previous",
    filter: "url(#valid)",
    primitives: greenFlood + invertPrimitive + "/>",
    magenta: true,
  },
  {
    name: "primitive-default-second",
    filter: "url(#valid)",
    primitives: greenFlood + '<feComposite in="SourceGraphic" operator="arithmetic" k2=".5" k3=".5"/>',
    rgb: [100, 178, 25],
  },
  {
    name: "primitive-explicit-source",
    filter: "url(#valid)",
    primitives: greenFlood + invertPrimitive + ' in="SourceGraphic"/>',
    inverted: true,
  },
  {
    name: "primitive-explicit-alpha",
    filter: "url(#valid)",
    primitives: greenFlood + invertPrimitive + ' in="SourceAlpha"/>',
    rgb: [255, 255, 255],
  },
  {
    name: "primitive-duplicate-result",
    filter: "url(#valid)",
    primitives: '<feFlood flood-color="red" result="again"/><feFlood flood-color="lime" result="again"/>' +
      invertPrimitive + ' in="again"/>',
    magenta: true,
  },
  {
    name: "primitive-forward-branch",
    filter: "url(#valid)",
    primitives: invertPrimitive +
      ' in="later" result="earlier"/><feColorMatrix in="SourceGraphic" result="later"/><feColorMatrix in="earlier"/>',
    inverted: true,
  },
  {
    name: "primitive-merge-missing",
    filter: "url(#valid)",
    primitives: greenFlood + '<feMerge><feMergeNode in="missing"/></feMerge>',
    green: true,
  },
  {
    name: "primitive-reserved-source-result",
    filter: "url(#valid)",
    primitives: '<feFlood flood-color="lime" result="SourceGraphic"/>' + invertPrimitive + ' in="SourceGraphic"/>',
    inverted: true,
  },
  {
    name: "primitive-reserved-alpha-result",
    filter: "url(#valid)",
    primitives: '<feFlood flood-color="lime" result="SourceAlpha"/>' + invertPrimitive + ' in="SourceAlpha"/>',
    rgb: [255, 255, 255],
  },
  {
    name: "buffer-left",
    filter: "url(#valid)",
    source: [-120, 20],
    primitives: '<feOffset dx="140"/>',
    region: [0, 0, 160, 120],
  },
  {
    name: "buffer-right",
    filter: "url(#valid)",
    source: [200, 20],
    primitives: '<feOffset dx="-180"/>',
    region: [0, 0, 160, 120],
  },
  {
    name: "buffer-top",
    filter: "url(#valid)",
    source: [20, -100],
    primitives: '<feOffset dy="120"/>',
    region: [0, 0, 160, 120],
  },
  {
    name: "buffer-bottom",
    filter: "url(#valid)",
    source: [20, 200],
    primitives: '<feOffset dy="-180"/>',
    region: [0, 0, 160, 120],
  },
  {
    name: "buffer-out-and-back",
    filter: "url(#valid)",
    primitives: '<feOffset dx="-180"/><feOffset dx="180"/>',
    region: [-200, -200, 600, 600],
  },
] as const;

const markerReferenceNames = new Set([
  "missing",
  "wrong-svg-type",
  "wrong-html-namespace",
  "valid",
  "valid-with-base",
  "borrowed",
  "empty-url",
  "encoded-space",
  "encoded-unicode",
  "encoded-bom",
  "literal-percent",
  "escaped-quote",
  "shadow-scope",
  "shadow-isolates-host-definition",
  "duplicate-wrong-type",
  "duplicate-borrowed",
  "absolute-local",
  "external-denied",
]);
/** Marker references share the original independent pixel grid; filter expectations remain unchanged. */
export const MARKER_REFERENCE_CASES = FILTER_REFERENCE_CASES.filter((fixture) => markerReferenceNames.has(fixture.name))
  .map((fixture) => ({
    ...fixture,
    marker: true as const,
    name: `marker-${fixture.name}`,
    filter: fixture.name === "empty-url"
      ? 'url("")'
      : fixture.name === "external-denied"
      ? 'url("/other-marker.svg#valid")'
      : fixture.filter,
  }));
export const SVG_REFERENCE_CASES = [...FILTER_REFERENCE_CASES, ...MARKER_REFERENCE_CASES];

let mounted: { container: HTMLDivElement; base?: HTMLBaseElement } | undefined;
let captured: { scene: MermaidScene; colors: (string | undefined)[][] } | undefined;

/** Release only fixture-owned markup; no borrowed host styles or definitions. */
export function disposeFilterReference() {
  mounted?.container.remove();
  mounted?.base?.remove();
  mounted = undefined;
}

/** Keep the original DOM mounted so the driver can sample original browser pixels. */
export function mountFilterReference(index: number) {
  disposeFilterReference();
  const fixture = SVG_REFERENCE_CASES[index]!;
  const base = "base" in fixture ? document.createElement("base") : undefined;
  if (base) {
    base.href = "/other-base/";
    document.head.append(base);
  }
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:0;top:0";
  const matrix = '<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 1 0"/>';
  const marker = (id: string, color = "lime") =>
    `<marker id="${id}" markerUnits="userSpaceOnUse" markerWidth="100" markerHeight="60" refX="0" refY="0" orient="0" overflow="visible"><rect width="100" height="60" fill="${color}"/></marker>`;
  if ("borrowed" in fixture) {
    const id = "duplicateBorrowed" in fixture ? "valid" : "borrowed";
    container.innerHTML = `<svg width="0" height="0"><defs>${
      "marker" in fixture ? marker(id) : `<filter id="${id}" color-interpolation-filters="sRGB">${matrix}</filter>`
    }</defs></svg>`;
  }
  if ("duplicateWrong" in fixture) container.innerHTML = '<svg width="0" height="0"><rect id="valid"/></svg>';
  if ("shadow" in fixture && !("borrowed" in fixture)) {
    container.innerHTML = `<svg width="0" height="0"><defs>${
      "marker" in fixture ? marker("valid", "red") : '<filter id="valid"><feFlood flood-color="red"/></filter>'
    }</defs></svg>`;
  }
  for (const borrowed of container.querySelectorAll("svg")) borrowed.style.position = "absolute";
  const stage = document.createElement("div");
  stage.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
    <defs><filter id="valid" color-interpolation-filters="sRGB">${matrix}</filter><rect id="wrong-type" width="1" height="1"/></defs>
    <foreignObject display="none"><filter xmlns="http://www.w3.org/1999/xhtml" id="html-filter"></filter></foreignObject>
    <rect width="160" height="120" fill="white"/>
    <rect x="20" y="20" width="100" height="60" fill="rgb(200,100,50)"/>
  </svg>`;
  if ("marker" in fixture) {
    stage.querySelector("defs filter")!.remove();
    stage.querySelector("defs")!.insertAdjacentHTML("beforeend", marker("valid"));
    const html = stage.querySelector("foreignObject filter")!;
    const wrong = document.createElementNS("http://www.w3.org/1999/xhtml", "marker");
    wrong.id = html.id;
    html.replaceWith(wrong);
  }
  if ("id" in fixture) stage.querySelector("marker" in fixture ? "defs marker" : "defs filter")!.id = fixture.id;
  if ("primitives" in fixture) {
    const filter = stage.querySelector("filter")!;
    filter.innerHTML = fixture.primitives;
    const region = "region" in fixture ? fixture.region : [20, 20, 100, 60];
    for (
      const [name, value] of Object.entries({
        filterUnits: "userSpaceOnUse",
        x: String(region[0]),
        y: String(region[1]),
        width: String(region[2]),
        height: String(region[3]),
      })
    ) {
      filter.setAttribute(name, value);
    }
  }
  stage.querySelector("svg")!.style.display = "block";
  const shape = stage.querySelector("svg")!.lastElementChild as SVGRectElement;
  if ("source" in fixture) {
    shape.setAttribute("x", String(fixture.source[0]));
    shape.setAttribute("y", String(fixture.source[1]));
  }
  if ("marker" in fixture) {
    const endpoint = document.createElementNS("http://www.w3.org/2000/svg", "path");
    endpoint.setAttribute("d", "M20 20 L20 20");
    endpoint.setAttribute("fill", "none");
    endpoint.setAttribute("stroke", "none");
    endpoint.style.markerEnd = "absolute" in fixture ? `url("${location.href.split("#")[0]}#valid")` : fixture.filter;
    stage.querySelector("svg")!.append(endpoint);
  } else {
    shape.style.filter = "absolute" in fixture ? `url("${location.href.split("#")[0]}#valid")` : fixture.filter;
  }
  if ("shadow" in fixture) {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).append(stage);
    container.append(host);
  } else container.append(stage);
  document.body.append(container);
  mounted = { container, base };
  try {
    const root = stage.querySelector("svg")!;
    const initial = container.innerHTML;
    const scene = extractMermaidScene(root);
    const portable = JSON.parse(JSON.stringify(scene));
    const frame = renderMermaidNativeFrame(portable, { columnUnits: 5, rowUnits: 10 });
    if (container.innerHTML !== initial) throw new Error("Filter reference capture mutated original markup.");
    const native = frame.cells[4]![8]!.background;
    const originalExpected = "marker" in fixture
      ? "green" in fixture ? [0, 255, 0] : [200, 100, 50]
      : "rgb" in fixture
      ? fixture.rgb
      : "green" in fixture
      ? [0, 255, 0]
      : "inverted" in fixture
      ? [55, 155, 205]
      : "pale" in fixture
      ? [215, 235, 245]
      : "magenta" in fixture
      ? [255, 0, 255]
      : [200, 100, 50];
    const denied = ("borrowed" in fixture && !("isolated" in fixture)) || "external" in fixture;
    const expected = denied ? "rgb(200, 100, 50)" : `rgb(${originalExpected.join(", ")})`;
    const samples = [0, 4, 8, 16, 23, 31].flatMap((column) =>
      [0, 2, 4, 7, 8, 11].map((row) => ({
        x: column * 5 + 2,
        y: row * 10 + 5,
        native: frame.cells[row]![column]!.background,
        originalExpected: column >= 4 && column < 24 && row >= 2 && row < 8 ? originalExpected : [255, 255, 255],
        nativeExpected: column >= 4 && column < 24 && row >= 2 && row < 8 ? expected : "rgb(255, 255, 255)",
      }))
    );
    captured = { scene: portable, colors: frame.cells.map((row) => row.map((cell) => cell.background)) };
    return {
      name: fixture.name,
      native,
      expected,
      originalExpected,
      diagnostics: [...new Set([...scene.diagnostics, ...frame.diagnostics])],
      expectedDiagnostics: denied
        ? [
          `External/unresolved SVG ${
            "marker" in fixture ? "markers" : "filters"
          } need host-controlled scene expansion.`,
        ]
        : [],
      rootFilters: root.querySelectorAll("filter").length,
      policy: invalidFilterReferencePolicy(document),
      samples,
    };
  } catch (error) {
    disposeFilterReference();
    throw error;
  }
}

/** Repaint the portable scene after removing every original measuring node. */
export function verifyFilterReferenceDisposal() {
  disposeFilterReference();
  if (!captured) throw new Error("Missing filter reference capture.");
  const frame = renderMermaidNativeFrame(captured.scene, { columnUnits: 5, rowUnits: 10 });
  if (
    JSON.stringify(frame.cells.map((row) => row.map((cell) => cell.background))) !== JSON.stringify(captured.colors)
  ) {
    throw new Error("Filter reference output depends on live original DOM.");
  }
  captured = undefined;
  return frame.columns * frame.rows;
}

/** Invalid references must not bypass the existing list cap or consume graph nodes. */
export function verifyFilterReferenceBounds() {
  mountFilterReference(FILTER_REFERENCE_CASES.length);
  let markers: { instances: number; nodes: number; styleBytes: number };
  try {
    const root = mounted!.container.querySelector("svg")!;
    const endpoint = root.lastElementChild as SVGPathElement;
    const budget = { vertices: 0, instances: 0, nodes: 0, styleBytes: 0, references: new Set<SVGMarkerElement>() };
    const before = root.outerHTML;
    const diagnostics = new Set<string>();
    checkMarkerBatch(root, new Array(257).fill("url(#missing)"), budget);
    const expanded = expandMermaidMarker(
      root,
      endpoint,
      { x: 20, y: 20, angle: 0, position: "end" },
      "url(#missing)",
      getComputedStyle(endpoint),
      1,
      {},
      new WeakMap(),
      budget,
      diagnostics,
    );
    if (!expanded || expanded.scope || diagnostics.size || budget.instances || budget.nodes || budget.styleBytes) {
      throw new Error("Missing marker references allocate or diagnose phantom instances.");
    }
    expanded.dispose();
    if (root.outerHTML !== before) throw new Error("Missing marker expansion changed original DOM.");
    markers = { instances: budget.instances, nodes: budget.nodes, styleBytes: budget.styleBytes };
  } finally {
    disposeFilterReference();
    captured = undefined;
  }
  mountFilterReference(1);
  try {
    const root = mounted!.container.querySelector("svg")!;
    const shape = root.lastElementChild as SVGRectElement;
    const diagnostics = new Set<string>();
    const budget = { filterNodes: 0 };
    shape.style.filter = "url(#missing) ".repeat(256);
    const before = root.outerHTML;
    extractMermaidScene(root);
    if (root.outerHTML !== before) throw new Error("Invalid filter list changed original DOM.");
    // The public extraction budgets are separately exercised by the full suite;
    // inspect this private count so no identity URL allocates phantom operations.
    const result = extractFilter(root, shape, diagnostics, budget);
    if (result || budget.filterNodes || diagnostics.size) {
      throw new Error("Missing filters allocate native graph nodes.");
    }
    shape.style.filter = "url(#missing) ".repeat(257);
    let rejected = false;
    try {
      extractMermaidScene(root);
    } catch (error) {
      rejected = error instanceof RangeError && error.message.includes("CSS filter-list budget");
    }
    if (!rejected) throw new Error("Invalid-reference filter list bypassed its existing budget.");
    return { accepted: 256, rejected: 257, nodes: budget.filterNodes, markers };
  } finally {
    disposeFilterReference();
    captured = undefined;
  }
}
