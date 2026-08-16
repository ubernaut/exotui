// Copyright 2023 Im-Beast. MIT license.

// T1: solver fuzz/property tests. Seeded random layout trees run through the
// engine and must be deterministic, finite, and structurally sane; seeded
// random mutation sequences over a live tree must restyle incrementally to
// exactly the clean full cascade. Every failure message carries its seed —
// re-running with that seed reproduces the minimal failing fixture.

import { assert, assertEquals } from "./deps.ts";
import {
  applyCssCascade,
  applyLayoutDeclarations,
  createLayoutEngine,
  createLayoutNode,
  createLiveMarkupInvalidator,
  createLiveMarkupStyler,
  createLiveMarkupTree,
  defaultComputedLayoutStyle,
  parseCssStylesheet,
  parseTuiMarkup,
} from "../mod.ts";
import type { ComputedLayoutBox, LayoutNode } from "../mod.ts";

/** mulberry32: tiny deterministic PRNG, good enough for fixture generation. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

const WIDTHS = ["auto", "4", "8", "50%", "25w", "min-content"] as const;
const HEIGHTS = ["auto", "1", "2", "3", "40%"] as const;
const DISPLAYS = ["block", "block", "flex", "grid"] as const;

let fuzzNodeCounter = 0;

function generateNode(rng: () => number, depth: number): LayoutNode {
  const declarations: Array<readonly [string, string]> = [
    ["display", pick(rng, DISPLAYS)],
    ["width", pick(rng, WIDTHS)],
    ["height", pick(rng, HEIGHTS)],
  ];
  if (rng() < 0.3) declarations.push(["padding", String(Math.floor(rng() * 2))]);
  if (rng() < 0.3) declarations.push(["margin", String(Math.floor(rng() * 2))]);
  if (rng() < 0.2) declarations.push(["gap", "1"]);
  if (rng() < 0.15) declarations.push(["dock", pick(rng, ["top", "left", "bottom", "right"] as const)]);
  if (rng() < 0.15) declarations.push(["align", "center middle"]);
  if (rng() < 0.2) declarations.push(["flex-direction", pick(rng, ["row", "column"] as const)]);
  if (rng() < 0.15) declarations.push(["offset", `${Math.floor(rng() * 3) - 1} ${Math.floor(rng() * 3) - 1}`]);
  const childCount = depth > 0 ? Math.floor(rng() * 4) : 0;
  const children: LayoutNode[] = [];
  for (let index = 0; index < childCount; index += 1) children.push(generateNode(rng, depth - 1));
  return createLayoutNode({
    id: `fuzz-${++fuzzNodeCounter}`,
    tag: "div",
    style: applyLayoutDeclarations(defaultComputedLayoutStyle(), declarations),
    children,
  });
}

function collectRects(box: ComputedLayoutBox, out: Array<[string, string]>): void {
  out.push([box.id, JSON.stringify([box.rect, box.contentRect, box.zIndex])]);
  for (const child of box.children) collectRects(child, out);
}

Deno.test("fuzzed layout trees solve deterministically with finite integer boxes", () => {
  const engine = createLayoutEngine();
  for (let seed = 1; seed <= 40; seed += 1) {
    fuzzNodeCounter = 0;
    const rng = mulberry32(seed * 7919);
    const root = generateNode(rng, 3);
    const bounds = { column: 0, row: 0, width: 8 + Math.floor(rng() * 60), height: 4 + Math.floor(rng() * 24) };

    const first: Array<[string, string]> = [];
    collectRects(engine.layout({ root, bounds }).root, first);
    const second: Array<[string, string]> = [];
    collectRects(engine.layout({ root, bounds }).root, second);
    assertEquals(second, first, `seed ${seed}: layout must be deterministic`);

    for (const [id, encoded] of first) {
      const [rect] = JSON.parse(encoded) as [{ column: number; row: number; width: number; height: number }];
      for (const value of [rect.column, rect.row, rect.width, rect.height]) {
        assert(Number.isFinite(value) && Number.isInteger(value), `seed ${seed}: node ${id} has non-integer ${value}`);
      }
      assert(rect.width >= 0 && rect.height >= 0, `seed ${seed}: node ${id} has negative extent`);
    }
  }
});

const FUZZ_MARKUP = `
<div id="app">
  <div id="a" class="pane"><span id="a1">alpha</span><span id="a2">beta</span></div>
  <div id="b" class="pane active"><span id="b1">gamma</span></div>
  <div id="c"><span id="c1">delta</span></div>
</div>`;

const FUZZ_CSS = `
.pane { padding: 1; color: white; }
.pane.active { background: navy; }
.pane span { margin: 1; }
div span { color: grey; }
#c { border: 1; }
`;

function styleMap(root: LayoutNode): Record<string, string> {
  const map: Record<string, string> = {};
  const visit = (node: LayoutNode, path: string): void => {
    const key = `${path}/${node.id}`;
    map[key] = JSON.stringify(node.style);
    for (const child of node.children) visit(child, key);
  };
  visit(root, "");
  return map;
}

Deno.test("random mutation sequences restyle incrementally to the clean full cascade", () => {
  const stylesheet = parseCssStylesheet(FUZZ_CSS);
  for (let seed = 1; seed <= 25; seed += 1) {
    const rng = mulberry32(seed * 104729);
    const tree = createLiveMarkupTree(parseTuiMarkup(FUZZ_MARKUP).root);
    const invalidator = createLiveMarkupInvalidator(tree);
    const styler = createLiveMarkupStyler(tree, invalidator, stylesheet);
    styler.restyle();

    for (let step = 0; step < 8; step += 1) {
      const ids = ["a", "b", "c", "a1", "a2", "b1", "c1"].filter((id) => tree.node(id));
      if (ids.length === 0) break;
      const id = pick(rng, ids);
      switch (Math.floor(rng() * 6)) {
        case 0:
          tree.addClass(id, pick(rng, ["active", "pane", "extra"]));
          break;
        case 1:
          tree.removeClass(id, pick(rng, ["active", "pane"]));
          break;
        case 2:
          tree.setText(id, `text-${seed}-${step}`);
          break;
        case 3:
          tree.setAttribute(id, "data-step", String(step));
          break;
        case 4:
          if (id !== "app") tree.mount(id, `<span id="m${seed}x${step}">new</span>`);
          break;
        case 5: {
          const target = pick(rng, ids);
          if (id !== target) tree.move(id, target);
          break;
        }
      }
      const incremental = styler.restyle().styledRoot;
      const clean = applyCssCascade(tree.root, stylesheet);
      assertEquals(
        styleMap(incremental),
        styleMap(clean),
        `seed ${seed}, step ${step}: incremental restyle diverged from the clean cascade`,
      );
    }
  }
});
