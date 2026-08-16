// Copyright 2023 Im-Beast. MIT license.

// D1 second slice: selector-routed dispatch with capture/target/bubble
// phases, stopPropagation, and preventDefault over the live markup tree.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createLiveMarkupDispatcher, createLiveMarkupTree, parseTuiMarkup } from "../mod.ts";

const DOCUMENT = `
<div id="app">
  <div id="panel" class="pane">
    <button id="save" class="primary">save</button>
  </div>
</div>`;

function fixture() {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  return { tree, dispatcher: createLiveMarkupDispatcher(tree) };
}

Deno.test("dispatch walks capture, target, then bubble in DOM order", () => {
  const { dispatcher } = fixture();
  const seen: string[] = [];
  dispatcher.on("div", "press", (_e, c) => seen.push(`capture:${c.currentTarget.id}:${c.phase}`), { capture: true });
  dispatcher.on("div", "press", (_e, c) => seen.push(`bubble:${c.currentTarget.id}:${c.phase}`));
  dispatcher.on("button", "press", (_e, c) => seen.push(`target:${c.currentTarget.id}:${c.phase}`));

  const result = dispatcher.dispatch("save", { type: "press" });
  assertEquals(seen, [
    "capture:app:capture",
    "capture:panel:capture",
    "target:save:target",
    "bubble:panel:bubble",
    "bubble:app:bubble",
  ]);
  assertEquals(result, { invoked: 5, defaultPrevented: false, stopped: false });
});

Deno.test("selector routing sees ancestors; wrong types and ids never fire", () => {
  const { dispatcher } = fixture();
  const seen: string[] = [];
  dispatcher.on(".pane .primary", "press", (_e, c) => seen.push(c.currentTarget.id));
  dispatcher.on("button", "hover", () => seen.push("wrong-type"));
  dispatcher.dispatch("save", { type: "press" });
  dispatcher.dispatch("missing", { type: "press" });
  assertEquals(seen, ["save"]);
});

Deno.test("stopPropagation halts after the current node; preventDefault is reported", () => {
  const { dispatcher } = fixture();
  const seen: string[] = [];
  dispatcher.on("#panel", "press", (_e, c) => {
    seen.push("panel-capture");
    c.stopPropagation();
    c.preventDefault();
  }, { capture: true });
  dispatcher.on("#panel", "press", (_e, c) => {
    // Same node, same phase: still runs despite stopPropagation.
    seen.push(`panel-second(defaultPrevented=${c.defaultPrevented})`);
  }, { capture: true });
  dispatcher.on("button", "press", () => seen.push("target-must-not-run"));

  const result = dispatcher.dispatch("save", { type: "press" });
  assertEquals(seen, ["panel-capture", "panel-second(defaultPrevented=true)"]);
  assertEquals(result, { invoked: 2, defaultPrevented: true, stopped: true });
});

Deno.test("dispatch resolves the path live; disposers and dispose are terminal", () => {
  const { tree, dispatcher } = fixture();
  const seen: string[] = [];
  const off = dispatcher.on("div", "press", (_e, c) => seen.push(c.currentTarget.id));

  // Move the button under the root: the panel leaves its path.
  tree.move("save", "app");
  dispatcher.dispatch("save", { type: "press" });
  assertEquals(seen, ["app"]);

  off();
  assertEquals(dispatcher.handlerCount, 0);
  dispatcher.dispatch("save", { type: "press" });
  assertEquals(seen, ["app"]);

  dispatcher.dispose();
  assertThrows(() => dispatcher.on("div", "press", () => {}));
  assert(dispatcher.dispatch !== undefined);
  assertThrows(() => dispatcher.dispatch("save", { type: "press" }));
});
