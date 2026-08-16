// Copyright 2023 Im-Beast. MIT license.

// INP-003: Chromium- and WebKit-ordered IME traces both commit exactly once;
// plain typing echo pairs apply once; deletion is grapheme-aware.

import { assertEquals } from "./deps.ts";
import { type BrowserEditingEvent, createBrowserEditingAdapter } from "../mod.ts";

const FAMILY = "\u{1F469}‍\u{1F469}‍\u{1F467}‍\u{1F466}";

function run(events: readonly BrowserEditingEvent[], value = "") {
  const adapter = createBrowserEditingAdapter({ value });
  const actions: string[] = [];
  for (const event of events) {
    for (const action of adapter.handle(event)) actions.push(`${action.kind}${action.text ? `:${action.text}` : ""}`);
  }
  return { adapter, actions };
}

Deno.test("a Chromium-ordered IME trace commits exactly once", () => {
  const { adapter, actions } = run([
    { type: "compositionstart" },
    { type: "beforeinput", inputType: "insertCompositionText", data: "か" },
    { type: "compositionupdate", data: "か" },
    { type: "input", inputType: "insertCompositionText", data: "か" },
    { type: "beforeinput", inputType: "insertCompositionText", data: "漢" },
    { type: "compositionupdate", data: "漢" },
    { type: "input", inputType: "insertCompositionText", data: "漢" },
    { type: "compositionend", data: "漢" },
  ]);
  assertEquals(adapter.value, "漢");
  assertEquals(actions, [
    "composition-start",
    "composition-update:か",
    "composition-update:漢",
    "composition-commit:漢",
  ]);
});

Deno.test("a WebKit-ordered trace (commit before the final insert pair) does not double-insert", () => {
  const { adapter, actions } = run([
    { type: "compositionstart" },
    { type: "beforeinput", inputType: "insertCompositionText", data: "か" },
    { type: "compositionupdate", data: "か" },
    { type: "input", inputType: "insertCompositionText", data: "か" },
    { type: "compositionend", data: "漢" },
    { type: "beforeinput", inputType: "insertText", data: "漢" },
    { type: "input", inputType: "insertText", data: "漢" },
  ]);
  assertEquals(adapter.value, "漢");
  assertEquals(actions.filter((action) => action.startsWith("composition-commit")).length, 1);
  assertEquals(actions.filter((action) => action.startsWith("insert")).length, 0);
});

Deno.test("plain typing pairs apply once; cancelled compositions leave no text", () => {
  const { adapter, actions } = run([
    { type: "beforeinput", inputType: "insertText", data: "h" },
    { type: "input", inputType: "insertText", data: "h" },
    { type: "beforeinput", inputType: "insertText", data: "i" },
    { type: "input", inputType: "insertText", data: "i" },
    { type: "compositionstart" },
    { type: "compositionupdate", data: "や" },
    { type: "compositionend", data: "" }, // cancelled (e.g. Escape)
  ]);
  assertEquals(adapter.value, "hi");
  assertEquals(actions.at(-1), "composition-cancel");

  // The display projects the live preedit without touching the value.
  const preedit = createBrowserEditingAdapter({ value: "ab" });
  preedit.handle({ type: "selectionchange", selection: { start: 2, end: 2 } });
  preedit.handle({ type: "compositionstart" });
  preedit.handle({ type: "compositionupdate", data: "ね" });
  assertEquals(preedit.display, "abね");
  assertEquals(preedit.value, "ab");
});

Deno.test("backspace deletes one whole grapheme", () => {
  const { adapter } = run([
    { type: "selectionchange", selection: { start: 12, end: 12 } },
    { type: "beforeinput", inputType: "deleteContentBackward" },
    { type: "input", inputType: "deleteContentBackward" },
  ], `a${FAMILY}`);
  assertEquals(adapter.value, "a"); // the eleven-unit family went as one unit
});
