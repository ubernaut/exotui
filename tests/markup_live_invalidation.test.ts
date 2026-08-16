// Copyright 2023 Im-Beast. MIT license.

// D1 third slice: signal changes and tree mutations mark nodes dirty, and
// flush() coalesces the marks to the nearest dirty ancestors with merged,
// stably-ordered reasons.

import { assertEquals } from "./deps.ts";
import { createLiveMarkupInvalidator, createLiveMarkupTree, parseTuiMarkup, Signal } from "../mod.ts";

const DOCUMENT = `
<div id="app">
  <div id="sidebar"><span id="label">files</span></div>
  <div id="content"><span id="body">text</span></div>
</div>`;

function fixture() {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  return { tree, invalidator: createLiveMarkupInvalidator(tree) };
}

Deno.test("flush coalesces dirty descendants into the nearest dirty ancestor", () => {
  const { invalidator } = fixture();
  invalidator.mark("sidebar", "layout");
  invalidator.mark("label", "style"); // descendant of a dirty node: subsumed
  invalidator.mark("body", "render"); // separate subtree: own root

  const roots = invalidator.flush();
  assertEquals(roots, [
    { id: "sidebar", reasons: ["style", "layout"], subsumed: ["label"] },
    { id: "body", reasons: ["render"], subsumed: [] },
  ]);
  assertEquals(invalidator.dirtyCount, 0);
  assertEquals(invalidator.flush(), []); // flush cleared everything
});

Deno.test("journal sync maps mutation kinds to reasons at the right nodes", () => {
  const { tree, invalidator } = fixture();
  tree.setAttribute("content", "role", "main"); // style at the node
  tree.setText("label", "docs"); // layout at the node
  tree.mount("sidebar", `<span id="extra"></span>`); // tree+layout at the parent

  assertEquals(invalidator.syncFromJournal(), 3);
  const roots = invalidator.flush();
  assertEquals(roots, [
    { id: "sidebar", reasons: ["tree", "layout"], subsumed: ["label"] },
    { id: "content", reasons: ["style"], subsumed: [] },
  ]);
  // The journal was acknowledged: a second sync consumes nothing.
  assertEquals(invalidator.syncFromJournal(), 0);
});

Deno.test("signal bindings mark on change but not on the tracking run", async () => {
  const { invalidator } = fixture();
  const width = new Signal(10);
  const off = invalidator.bindSignal(() => width.value, "content", "layout");
  await Promise.resolve(); // dependency tracking settles asynchronously
  assertEquals(invalidator.dirtyCount, 0);

  width.value = 20;
  await Promise.resolve();
  assertEquals(invalidator.flush(), [{ id: "content", reasons: ["layout"], subsumed: [] }]);

  off();
  width.value = 30;
  await Promise.resolve();
  assertEquals(invalidator.dirtyCount, 0);
  invalidator.dispose();
});
