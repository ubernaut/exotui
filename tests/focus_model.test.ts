// Copyright 2023 Im-Beast. MIT license.

// 044: focus and selection are different facts. These pin the two halves of
// that — a focus authority that respects `disabled`, and the resolver that
// tells "this is the current item" apart from "this is where your typing goes".

import { assertEquals } from "./deps.ts";
import { type Focusable, FocusManager, isFocusDisabled, resolveSelectionPaint } from "../src/focus.ts";
import { Signal } from "../src/signals/mod.ts";
import type { ComponentState } from "../src/component.ts";

function target(state: ComponentState = "base"): Focusable {
  return { state: new Signal<ComponentState>(state) };
}

Deno.test("tab traversal skips a disabled control instead of landing on it", () => {
  const manager = new FocusManager();
  const first = target();
  const middle = target("disabled");
  const last = target();
  manager.registerAll([first, middle, last]);

  assertEquals(manager.next(), first);
  assertEquals(manager.next(), last, "the disabled control is not a focus stop");
  assertEquals(manager.next(), first, "and traversal still wraps");
});

Deno.test("focusing never paints over a disabled control's own state", () => {
  const manager = new FocusManager();
  const enabled = target();
  const disabled = target("disabled");
  manager.registerAll([enabled, disabled]);

  manager.next();
  assertEquals(disabled.state.peek(), "disabled", "it kept its look without being focused");

  manager.clear();
  assertEquals(disabled.state.peek(), "disabled", "and clearing focus does not enable it either");
});

Deno.test("a disabled control refuses focus asked for by name", () => {
  const manager = new FocusManager();
  const enabled = target();
  const disabled = target("disabled");
  manager.registerAll([enabled, disabled]);
  manager.focus(enabled);

  manager.focus(disabled);
  assertEquals(manager.current(), enabled, "focus stayed where it was");
  assertEquals(disabled.state.peek(), "disabled");
});

Deno.test("every control being disabled leaves focus where it is rather than spinning", () => {
  const manager = new FocusManager();
  const only = target("disabled");
  manager.register(only);

  assertEquals(manager.next(), undefined);
  assertEquals(manager.previous(), undefined);
  assertEquals(manager.index, -1);
});

Deno.test("removing the focused control moves focus rather than losing it", () => {
  const manager = new FocusManager();
  const first = target();
  const second = target();
  const third = target();
  manager.registerAll([first, second, third]);
  manager.focus(second);

  manager.unregister(second);
  assertEquals(manager.current(), third, "the position is kept, so the next control takes it");
  assertEquals(third.state.peek(), "focused");
});

Deno.test("isFocused answers for one control without callers reading the index", () => {
  const manager = new FocusManager();
  const first = target();
  const second = target();
  manager.registerAll([first, second]);
  manager.focus(first);

  assertEquals(manager.isFocused(first), true);
  assertEquals(manager.isFocused(second), false);
  assertEquals(isFocusDisabled(second), false);
});

Deno.test("a selected row paints differently depending on who holds the keyboard", () => {
  // The bug this exists for: three lists on screen, three accent rows, and no
  // way to see which one the arrow keys move.
  assertEquals(resolveSelectionPaint({ selected: true, collectionFocused: true }), "selected");
  assertEquals(
    resolveSelectionPaint({ selected: true, collectionFocused: false }),
    "selected-unfocused",
    "still the current item, but not where typing goes",
  );
  assertEquals(resolveSelectionPaint({ selected: false, collectionFocused: true }), "unselected");
  assertEquals(resolveSelectionPaint({ selected: false, collectionFocused: false }), "unselected");
});
