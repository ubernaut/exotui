// Copyright 2023 Im-Beast. MIT license.

// 036 T3: a semantic accessibility tree for browser hosts, with the
// documented smaller terminal subset.

import { assert, assertEquals } from "./deps.ts";
import {
  type AccessibilityNode,
  TERMINAL_EXPOSABLE_SEMANTICS,
  toAriaAttributes,
  toAriaAttributesWithDescription,
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

Deno.test("ARIA projection retains its original callback, utility and bound-function signatures", () => {
  const nodes: AccessibilityNode[] = [
    { role: "group", label: "First", description: "Host must bind this explicitly." },
    { role: "button", label: "Second" },
  ];
  assertEquals(nodes.map(toAriaAttributes), [
    { role: "group", "aria-label": "First" },
    { role: "button", "aria-label": "Second" },
  ]);
  const args: Parameters<typeof toAriaAttributes> = [nodes[0]!];
  const expected: ReturnType<typeof toAriaAttributes> = { role: "group", "aria-label": "First" };
  assertEquals(toAriaAttributes(...args), expected);
  assertEquals(toAriaAttributes.bind(undefined, nodes[0]!)(), expected);
  assertEquals(toAriaAttributes.call(undefined, nodes[0]!), expected);
  assertEquals(toAriaAttributes.apply(undefined, args), expected);
  assertEquals(
    toAriaAttributesWithDescription(nodes[0]!, "owned-description")["aria-describedby"],
    "owned-description",
  );
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
