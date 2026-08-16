// Copyright 2023 Im-Beast. MIT license.

// 036 T3: focus order and announcements are specified for every listed
// transition.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { FOCUS_TRANSITION_SPEC, type FocusTransitionKind, resolveTransition } from "../mod.ts";

const ALL_KINDS: FocusTransitionKind[] = [
  "modal-open",
  "modal-close",
  "window-focus",
  "window-move",
  "menu-open",
  "menu-close",
  "tab-switch",
  "tree-expand",
  "tree-collapse",
  "table-sort",
  "virtual-jump",
];

Deno.test("every workbench transition has a focus rule and template", () => {
  assertEquals(Object.keys(FOCUS_TRANSITION_SPEC).sort(), [...ALL_KINDS].sort());
  for (const kind of ALL_KINDS) {
    const spec = FOCUS_TRANSITION_SPEC[kind];
    assert(
      ["first-focusable-in-target", "restore-previous", "container", "preserve"].includes(spec.focus),
      `${kind}: unknown focus rule`,
    );
    assert(spec.announcement.length > 0);
  }
  // The spec encodes the important invariants directly.
  assertEquals(FOCUS_TRANSITION_SPEC["modal-close"].focus, "restore-previous"); // never strands focus
  assertEquals(FOCUS_TRANSITION_SPEC["window-move"].focus, "preserve"); // moving never steals focus
  assertEquals(FOCUS_TRANSITION_SPEC["tree-expand"].focus, "preserve");
});

Deno.test("announcements fill their templates and fail closed on gaps", () => {
  assertEquals(
    resolveTransition("tab-switch", { title: "Terminal", index: "2", count: "5" }),
    { focus: "container", announcement: "Terminal tab, 2 of 5" },
  );
  assertEquals(
    resolveTransition("table-sort", { column: "Name", direction: "descending" }).announcement,
    "sorted by Name, descending",
  );
  assertEquals(resolveTransition("menu-close", {}).announcement, "menu closed");

  const error = assertThrows(() => resolveTransition("modal-open", {}), TypeError);
  assert(error.message.includes('"{title}"')); // half-empty announcements cannot ship
});
