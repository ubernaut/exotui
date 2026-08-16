// Copyright 2023 Im-Beast. MIT license.

// D1 fourth slice: hydrated widget identity and state survive markup changes
// in unrelated branches — unchanged nodes keep their controllers, new nodes
// hydrate fresh, and removed or retagged nodes dispose theirs.

import { assert, assertEquals } from "./deps.ts";
import {
  createLiveMarkupTree,
  hydrateMarkupWidgets,
  InputController,
  parseTuiMarkup,
  rehydrateMarkupWidgets,
} from "../mod.ts";

const DOCUMENT = `
<div id="app">
  <input id="name" value="cos" />
  <div id="actions"><button id="save">save</button></div>
</div>`;

Deno.test("rehydration preserves controller identity and state across unrelated changes", () => {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  const first = hydrateMarkupWidgets(tree.root);
  const input = first.byId.get("name")!.controller as InputController;
  input.setText("collin"); // user state the rehydration must not reset

  // An unrelated branch changes: a new button mounts under #actions.
  tree.mount("actions", `<button id="cancel">cancel</button>`);
  const result = rehydrateMarkupWidgets(first, tree.root);

  assert(result.hydration.byId.get("name")!.controller === input, "controller identity must survive");
  assertEquals((result.hydration.byId.get("name")!.controller as InputController).text.peek(), "collin");
  assert(result.created.includes("cancel"));
  assert(result.reused.includes("name") && result.reused.includes("save"));
  assertEquals(result.disposed, []);
  // Focus order integrates old and new widgets in document order.
  assertEquals(result.hydration.focusOrder.includes("cancel"), true);
});

Deno.test("removed and retagged nodes dispose their controllers", () => {
  const tree = createLiveMarkupTree(parseTuiMarkup(DOCUMENT).root);
  const first = hydrateMarkupWidgets(tree.root);
  const saveController = first.byId.get("save")!.controller;

  tree.remove("save");
  const result = rehydrateMarkupWidgets(first, tree.root);
  assertEquals(result.disposed, ["save"]);
  assert(!result.hydration.byId.has("save"));
  assert(saveController !== undefined);

  // Retagging (same id, different tag) must not reuse the old controller.
  const second = result.hydration;
  const before = second.byId.get("name")!.controller;
  tree.node("name")!.tag = "button";
  const retagged = rehydrateMarkupWidgets(second, tree.root);
  assert(retagged.hydration.byId.get("name")!.controller !== before);
  assertEquals(retagged.disposed, ["name"]);
});
