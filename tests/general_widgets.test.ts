// Copyright 2023 Im-Beast. MIT license.

// 036 V1: masked input, selection list, content switcher/collapsible,
// and richer loading/digits surfaces.

import { assert, assertEquals } from "./deps.ts";
import {
  CollapsibleController,
  ContentSwitcherController,
  LoadingController,
  MaskedInputController,
  renderDigits,
  SelectionListController,
} from "../mod.ts";

Deno.test("masked input fills slots, auto-inserts literals, refuses mismatches", () => {
  const phone = new MaskedInputController("(###) ###-##");
  assert(!phone.type("x")); // letter refused in a digit slot
  for (const digit of "12345678") assert(phone.type(digit));
  assertEquals(phone.formatted(), "(123) 456-78");
  assertEquals(phone.raw(), "12345678");
  assert(phone.complete());
  assert(!phone.type("9")); // full

  phone.backspace();
  assertEquals(phone.formatted(), "(123) 456-7");
  const plate = new MaskedInputController("AA-##");
  assert(plate.type("a") && plate.type("B"));
  assert(!plate.type("Z")); // digit slot now
  assert(plate.type("7") && plate.type("0"));
  assertEquals(plate.formatted(), "aB-70");
});

Deno.test("selection list drives cursor and single/multi selection", () => {
  const single = new SelectionListController(["a", "b", "c"]);
  single.moveCursor(1);
  single.toggle();
  assertEquals(single.selected(), ["b"]);
  single.moveCursor(1);
  single.toggle(); // single mode replaces
  assertEquals(single.selected(), ["c"]);
  single.selectAll(); // no-op in single mode
  assertEquals(single.selected(), ["c"]);

  const multi = new SelectionListController(["a", "b", "c"], { multi: true });
  multi.toggle();
  multi.moveCursor(2);
  multi.toggle();
  assertEquals(multi.selected(), ["a", "c"]);
  multi.toggle(); // untoggle under cursor
  assertEquals(multi.selected(), ["a"]);
  multi.selectAll();
  assertEquals(multi.selected(), ["a", "b", "c"]);
  multi.moveCursor(99); // clamps
  assertEquals(multi.cursor(), 2);
});

Deno.test("content switcher shows exactly one panel; collapsibles toggle", () => {
  const switcher = new ContentSwitcherController(["files", "search", "settings"]);
  assertEquals(switcher.active(), "files");
  assert(switcher.switch("search"));
  assertEquals(switcher.visibility(), { files: false, search: true, settings: false });
  assert(!switcher.switch("ghost"));
  assertEquals(switcher.active(), "search");

  const section = new CollapsibleController();
  assertEquals(section.open(), false);
  assertEquals(section.toggle(), true);
  assertEquals(section.toggle(), false);
});

Deno.test("loading frames advance on the caller clock; digits render big", () => {
  const loading = new LoadingController({ startedAtMs: 1000, frames: ["a", "b", "c"], intervalMs: 100 });
  assertEquals(loading.frame(1000), "a");
  assertEquals(loading.frame(1150), "b");
  assertEquals(loading.frame(1310), "a"); // wraps at 3 frames
  assertEquals(loading.elapsedMs(1310), 310);

  const [top, middle, bottom] = renderDigits("42");
  assertEquals(top, "╷ ╷ ╶─┐");
  assertEquals(middle, "└─┤ ┌─┘");
  assertEquals(bottom, "  ╵ └─╴");
  assertEquals(renderDigits("?")[1], "?");
});
