// Copyright 2023 Im-Beast. MIT license.

// 044: focus and selection are different facts. These pin the two halves of
// that — a focus authority that respects `disabled`, and the resolver that
// tells "this is the current item" apart from "this is where your typing goes".

import { assert, assertEquals } from "./deps.ts";
import { type Focusable, FocusManager, isFocusDisabled, resolveSelectionPaint } from "../src/focus.ts";
import { Signal } from "../src/signals/mod.ts";
import type { ComponentState } from "../src/component.ts";
import { resolveControlToken, resolveControlTokens } from "../src/theme_controls.ts";
import { themeEditorGroups } from "../src/theme_editor_model.ts";
import type { Rgb } from "../src/theme_expressions.ts";
import { THEME_INTERCHANGE_VERSION } from "../src/theme_interchange.ts";

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

// Slice B: the paint state above needs a colour, and naming one must cost an
// existing theme nothing.

/** A theme that knows only the original compatibility profile. */
const SEVEN: Readonly<Record<string, Rgb>> = Object.freeze({
  foreground: [230, 230, 230],
  muted: [140, 140, 140],
  accent: [80, 160, 255],
  success: [90, 200, 120],
  warning: [230, 180, 70],
  danger: [230, 90, 90],
  surface: [20, 20, 28],
});

Deno.test("the unfocused selection resolves for a theme that never heard of it", () => {
  const resolved = resolveControlTokens(SEVEN);
  assertEquals(
    resolved["control:background-selected-unfocused"],
    SEVEN.muted,
    "a muted surface, not the accent the focused selection uses",
  );
  assertEquals(resolved["control:background-selected"], SEVEN.accent, "which is left where it was");
  assertEquals(resolved["control:foreground-selected-unfocused"], SEVEN.foreground);
});

Deno.test("overriding the unfocused selection moves only itself", () => {
  const olive: Rgb = [88, 96, 60];
  const resolved = resolveControlTokens({ ...SEVEN, "control:background-selected-unfocused": olive });
  assertEquals(resolved["control:background-selected-unfocused"], olive);
  assertEquals(resolved["control:background-selected"], SEVEN.accent, "the focused selection is untouched");
  assertEquals(resolveControlToken("chrome:muted", { ...SEVEN }), SEVEN.muted, "and so is what it fell back to");
});

Deno.test("both unfocused-selection tokens are offered by the theme editor", () => {
  const entries = themeEditorGroups({ version: THEME_INTERCHANGE_VERSION, name: "seven", tokens: SEVEN })
    .flatMap((group) => group.entries.map((entry) => entry.token.name));
  assert(entries.includes("control:background-selected-unfocused"), "the editor lists the background");
  assert(entries.includes("control:foreground-selected-unfocused"), "and the text read against it");
});
