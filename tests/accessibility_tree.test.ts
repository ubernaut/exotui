// Copyright 2023 Im-Beast. MIT license.

// 036 T3: a semantic accessibility tree for browser hosts, with the
// documented smaller terminal subset.

import { assert, assertEquals } from "./deps.ts";
import {
  type AccessibilityNode,
  TERMINAL_EXPOSABLE_SEMANTICS,
  toAriaAttributes,
  toAriaTree,
  toTerminalProjection,
} from "../mod.ts";

const TREE: AccessibilityNode = {
  role: "dialog",
  label: "Settings",
  children: [
    {
      role: "tablist",
      label: "Sections",
      children: [
        { role: "tab", label: "General", states: { selected: true } },
        { role: "tab", label: "Theme", states: { selected: false } },
      ],
    },
    {
      role: "list",
      label: "Options",
      children: [
        { role: "listitem", label: "Auto-save", states: { checked: true, focused: true } },
        { role: "listitem", label: "Telemetry", states: { checked: false, disabled: true } },
      ],
    },
  ],
};

Deno.test("browser projection serializes real ARIA attributes", () => {
  assertEquals(toAriaAttributes(TREE), { role: "dialog", "aria-label": "Settings" });
  const item = TREE.children![1]!.children![1]!;
  assertEquals(toAriaAttributes(item), {
    role: "listitem",
    "aria-label": "Telemetry",
    "aria-checked": "false",
    "aria-disabled": "true",
  });
  const aria = toAriaTree(TREE);
  assertEquals(aria.children.length, 2);
  assertEquals(aria.children[0]!.children[0]!.attributes["aria-selected"], "true");
});

Deno.test("the terminal projection is the documented smaller subset", () => {
  const projection = toTerminalProjection(TREE);
  assertEquals(projection.title, "Settings"); // dialog label → window title
  assertEquals(projection.announcement, "Settings (dialog), Options (list), Auto-save (listitem)");

  // No focus, no dialog: the projection is honestly empty.
  assertEquals(toTerminalProjection({ role: "group", children: [{ role: "button", label: "x" }] }), {});
});

Deno.test("terminal limits are stated canonically, never implied away", () => {
  assert(Object.isFrozen(TERMINAL_EXPOSABLE_SEMANTICS));
  assertEquals(TERMINAL_EXPOSABLE_SEMANTICS.notExposable, [
    "roles",
    "states",
    "relationships",
    "focus order metadata",
    "live regions",
  ]);
  assert(TERMINAL_EXPOSABLE_SEMANTICS.windowTitle.includes("no structure"));
});
