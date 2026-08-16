// Copyright 2023 Im-Beast. MIT license.

// D1 fifth slice: incremental restyling matches a clean full recomputation
// exactly, recomputes only dirty subtrees, and keeps dirty reasons
// inspectable.

import { assert, assertEquals } from "./deps.ts";
import {
  applyCssCascade,
  createLiveMarkupInvalidator,
  createLiveMarkupStyler,
  createLiveMarkupTree,
  type LayoutNode,
  parseCssStylesheet,
  parseTuiMarkup,
} from "../mod.ts";

const DOCUMENT = `
<div id="app">
  <div id="sidebar" class="pane"><span id="label">files</span></div>
  <div id="content" class="pane"><span id="body">text</span></div>
</div>`;

const CSS = `
.pane { padding: 1; color: white; }
.pane.active { background: navy; color: yellow; }
.pane span { margin: 2; }
#content { border: 1; }
`;

function styleMap(root: LayoutNode): Record<string, string> {
  const map: Record<string, string> = {};
  // Path-keyed so structural drift (a stale child left behind) cannot hide
  // behind an id collision.
  const visit = (node: LayoutNode, path: string): void => {
    const key = `${path}/${node.id}`;
    map[key] = JSON.stringify(node.style);
    for (const child of node.children) visit(child, key);
  };
  visit(root, "");
  return map;
}

function fixture() {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  const invalidator = createLiveMarkupInvalidator(tree);
  const stylesheet = parseCssStylesheet(CSS);
  return { tree, invalidator, styler: createLiveMarkupStyler(tree, invalidator, stylesheet), stylesheet };
}

Deno.test("incremental restyle equals a clean full recomputation", () => {
  const { tree, styler, stylesheet } = fixture();
  const first = styler.restyle();
  assertEquals(first.mode, "full");

  // Mutate one branch: class change (style), text change (layout), and a mount.
  tree.addClass("content", "active");
  tree.setText("label", "documents");
  tree.mount("sidebar", `<span id="extra">new</span>`);
  const second = styler.restyle();
  assertEquals(second.mode, "incremental");

  const clean = applyCssCascade(tree.root, stylesheet);
  assertEquals(styleMap(second.styledRoot), styleMap(clean));
});

Deno.test("only dirty subtrees recompute and reasons stay inspectable", () => {
  const { tree, styler } = fixture();
  const total = styler.restyle().recomputed;
  assert(total >= 5);

  tree.addClass("content", "active");
  const pass = styler.restyle();
  assertEquals(pass.mode, "incremental");
  // Only #content's two-node subtree recomputes; the sidebar branch is reused.
  assertEquals(pass.recomputed, 2);
  assertEquals(pass.reused, total - 2);
  assertEquals(pass.dirtyRoots, [{ id: "content", reasons: ["style"], subsumed: [] }]);
  assertEquals(styler.inspect().lastDirtyRoots, pass.dirtyRoots);
  assertEquals(styler.inspect().incrementalRestyles, 1);

  // Nothing dirty: nothing recomputes.
  const idle = styler.restyle();
  assertEquals([idle.mode, idle.recomputed], ["incremental", 0]);
});

Deno.test("structural moves under a common parent restyle to the clean result", () => {
  const { tree, styler, stylesheet } = fixture();
  styler.restyle();
  tree.move("label", "content", 0);
  const pass = styler.restyle();
  const clean = applyCssCascade(tree.root, stylesheet);
  assertEquals(styleMap(pass.styledRoot), styleMap(clean));
});
