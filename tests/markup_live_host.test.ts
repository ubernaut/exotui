// Copyright 2023 Im-Beast. MIT license.

// D1 final slice: the composed live host — commit() keeps styles and
// hydration consistent without resetting untouched widgets, dispatch runs
// selector phases before the widget controller (preventDefault gates it),
// and dropdowns/windows/tooltips stay inspectable through their existing
// controllers.

import { assert, assertEquals } from "./deps.ts";
import { type ComboBoxController, createLiveMarkupHost, type InputController } from "../mod.ts";

const MARKUP = `
<div id="app" tooltip="application">
  <window id="main-window">
    <scroll-area id="scroller" viewport-width="20" viewport-height="5" content-height="40">
      <input id="name" value="cos" />
    </scroll-area>
    <select id="fruit" expanded="false">
      <option>apple</option>
      <option selected>plum</option>
    </select>
    <button id="save" tooltip="save the form">save</button>
  </window>
  <modal id="confirm"></modal>
</div>`;

const CSS = `.urgent { color: red; }`;

Deno.test("commit keeps widget state through unrelated mutations and restyles incrementally", () => {
  const host = createLiveMarkupHost(MARKUP, CSS);
  const input = host.hydration.byId.get("name")!.controller as InputController;
  input.setText("collin");

  host.tree.mount("main-window", `<button id="cancel">cancel</button>`);
  host.tree.addClass("save", "urgent");
  const commit = host.commit();

  assertEquals(commit.restyle.mode, "incremental");
  assert(commit.rehydration.created.includes("cancel"));
  assertEquals(commit.rehydration.disposed, []);
  const after = host.hydration.byId.get("name")!.controller as InputController;
  assert(after === input, "unrelated mutations must not reset the input");
  assertEquals(after.text.peek(), "collin");
  host.dispose();
});

Deno.test("dispatch runs selector phases first; preventDefault gates the controller", () => {
  const host = createLiveMarkupHost(MARKUP, CSS);
  const combo = host.hydration.byId.get("fruit")!.controller as ComboBoxController;
  assertEquals(host.openDropdowns(), []);

  // Uncontested press toggles the dropdown open via its controller.
  const first = host.dispatch("fruit", { type: "press" });
  assertEquals([first.defaultPrevented, first.widgetHandled], [false, true]);
  assertEquals(host.openDropdowns(), ["fruit"]);
  assert(combo.expanded.peek());

  // A capture handler that prevents default keeps the controller closed.
  combo.setExpanded(false);
  host.dispatcher.on("window select", "press", (_event, context) => context.preventDefault());
  const second = host.dispatch("fruit", { type: "press" });
  assertEquals([second.defaultPrevented, second.widgetHandled], [true, false]);
  assertEquals(host.openDropdowns(), []);
  host.dispose();
});

Deno.test("windows, modals, and tooltips resolve from the live tree", () => {
  const host = createLiveMarkupHost(MARKUP, CSS);
  assertEquals(host.windowNodes().map((node) => node.id), ["main-window", "confirm"]);

  assertEquals(host.tooltipFor("save"), "save the form"); // own attribute wins
  assertEquals(host.tooltipFor("name"), "application"); // inherited from #app
  assertEquals(host.tooltipFor("missing"), undefined);

  // A live mutation is visible after commit without touching the scroller.
  const scroller = host.hydration.byId.get("scroller")!.controller;
  host.tree.remove("confirm");
  const commit = host.commit();
  assertEquals(host.windowNodes().map((node) => node.id), ["main-window"]);
  assert(host.hydration.byId.get("scroller")!.controller === scroller);
  assertEquals(commit.rehydration.disposed, []); // the modal had no controller
  host.dispose();
});
