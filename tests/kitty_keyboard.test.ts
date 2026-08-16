// Copyright 2023 Im-Beast. MIT license.

// 036 R1: structured Kitty press/repeat/release with base-layout
// metadata, keeping legacy input paths.

import { assert, assertEquals } from "./deps.ts";
import {
  createKittyKeyboardDecoder,
  KITTY_KEYBOARD_APP_FLAGS,
  kittyKeyboardEnterSequence,
  kittyKeyboardExitSequence,
  kittyShortcutKey,
  parseKittyKey,
} from "../mod.ts";

Deno.test("enter pushes the explicit flag set; exit pops it", () => {
  assertEquals(kittyKeyboardEnterSequence(), "\x1b[>7u"); // 1|2|4
  assertEquals(KITTY_KEYBOARD_APP_FLAGS, 7);
  assertEquals(kittyKeyboardExitSequence(), "\x1b[<u");
});

Deno.test("press, repeat, and release decode with full modifiers", () => {
  const press = parseKittyKey("\x1b[97;5u")!.event; // ctrl+a press
  assertEquals(press.eventType, "press");
  assert(press.modifiers.ctrl && !press.modifiers.shift);

  const repeat = parseKittyKey("\x1b[97;5:2u")!.event;
  assertEquals(repeat.eventType, "repeat");

  const release = parseKittyKey("\x1b[97;5:3u")!.event;
  assertEquals(release.eventType, "release");
  assertEquals(release.codepoint, 97);
});

Deno.test("base-layout metadata names the physical key for shortcuts", () => {
  // Cyrillic ф on a QWERTY 'a' key: key:shifted:base-layout.
  const event = parseKittyKey("\x1b[1092:1060:97;5u")!.event;
  assertEquals(event.codepoint, 1092);
  assertEquals(event.shiftedCodepoint, 1060);
  assertEquals(event.baseLayoutCodepoint, 97);
  assertEquals(kittyShortcutKey(event), "a"); // ctrl+a still matches
  // Without base layout the codepoint itself is the shortcut key.
  assertEquals(kittyShortcutKey(parseKittyKey("\x1b[98;1u")!.event), "b");
});

Deno.test("associated text decodes when reported", () => {
  const event = parseKittyKey("\x1b[97;1;97u")!.event;
  assertEquals(event.text, "a");
});

Deno.test("the decoder passes every non-kitty byte through unchanged", () => {
  const decoder = createKittyKeyboardDecoder();
  const first = decoder.feed("plain\x1b[97;5uafter\x1b[A");
  assertEquals(first.events.length, 1);
  assertEquals(first.passthrough, "plain" + "after\x1b[A"); // legacy path intact

  // A split sequence waits instead of leaking a partial escape.
  const second = decoder.feed("\x1b[97;5");
  assertEquals(second.events, []);
  assertEquals(second.passthrough, "");
  const third = decoder.feed(":3u");
  assertEquals(third.events[0]!.eventType, "release");
  assertEquals(third.passthrough, "");
});
