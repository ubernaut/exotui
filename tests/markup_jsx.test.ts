// Copyright 2023 Im-Beast. MIT license.

// 036 K1 evaluation slice: a Deno-native JSX layer — data-only automatic
// runtime (jsx/jsxs), classic h factory, and a reconciler applying minimal
// keyed mutations to the live markup tree. No framework required.

import { assert, assertEquals } from "./deps.ts";
import { createJsxReconciler, createLiveMarkupTree, Fragment, h, jsx, parseTuiMarkup } from "../mod.ts";

const DOCUMENT = `<div id="app"><div id="host"></div></div>`;

function makeTree() {
  return createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
}

Deno.test("jsx factories build frozen data elements and flatten fragments", () => {
  const element = jsx("panel", {
    title: "Files",
    open: true,
    skip: false,
    children: [
      "hello",
      42,
      null,
      jsx(Fragment, { children: [jsx("row", null), jsx("row", null)] }),
    ],
  });
  assertEquals(element.tag, "panel");
  assertEquals(element.props, { title: "Files", open: true });
  assertEquals(element.children.length, 4); // "hello", "42", row, row
  assertEquals(element.children[1], "42");
  assert(Object.isFrozen(element) && Object.isFrozen(element.props));

  const classic = h("list", { key: "k1", class: "wide" }, h("item", null, "a"));
  assertEquals(classic.key, "k1");
  assertEquals(classic.props, { class: "wide" });
});

Deno.test("initial render mounts, re-render applies minimal diffs", () => {
  const tree = makeTree();
  const reconciler = createJsxReconciler(tree, "host");

  reconciler.render(
    h("panel", { title: "Files" }, h("row", null, "alpha"), h("row", null, "beta")),
  );
  const host = tree.node("host")!;
  assertEquals(host.children.length, 1);
  const panel = host.children[0]!;
  assertEquals(panel.tag, "panel");
  assertEquals(panel.attributes["title"], "Files");
  assertEquals(panel.children.map((node) => node.text), ["alpha", "beta"]);
  const mountRevision = tree.revision;

  // Update: change one text, one attribute; structure survives in place.
  reconciler.render(
    h("panel", { title: "Buffers" }, h("row", null, "alpha"), h("row", null, "gamma")),
  );
  assertEquals(tree.node("host")!.children[0], panel); // same node object — updated, not remounted
  assertEquals(panel.attributes["title"], "Buffers");
  assertEquals(panel.children.map((node) => node.text), ["alpha", "gamma"]);
  const sinceUpdate = tree.mutations().entries.filter((entry) => entry.revision > mountRevision);
  assertEquals(sinceUpdate.filter((entry) => entry.kind === "mount").length, 0); // pure diff, no remount
});

Deno.test("keyed children reorder with moves and departures are removed", () => {
  const tree = makeTree();
  const reconciler = createJsxReconciler(tree, "host");
  reconciler.render([
    h("item", { key: "a" }, "A"),
    h("item", { key: "b" }, "B"),
    h("item", { key: "c" }, "C"),
  ]);
  const [nodeA, nodeB, nodeC] = tree.node("host")!.children;

  reconciler.render([
    h("item", { key: "c" }, "C"),
    h("item", { key: "a" }, "A"),
  ]);
  const after = tree.node("host")!.children;
  assertEquals(after.length, 2);
  assertEquals(after[0], nodeC); // moved, not recreated
  assertEquals(after[1], nodeA);
  assertEquals(tree.node(nodeB!.id), undefined); // departed key removed
});

Deno.test("attribute removal and nested reconciliation reach the live tree", () => {
  const tree = makeTree();
  const reconciler = createJsxReconciler(tree, "host");
  reconciler.render(h("box", { pad: "2" }, h("inner", { deep: "yes" })));
  const box = tree.node("host")!.children[0]!;
  assertEquals(box.attributes["pad"], "2");

  reconciler.render(h("box", null, h("inner", { deep: "no" })));
  assertEquals("pad" in box.attributes, false); // removed prop removed live
  assertEquals(box.children[0]!.attributes["deep"], "no");
});
