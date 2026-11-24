// Copyright 2023 Im-Beast. MIT license.
import { assertEquals } from "./deps.ts";
import {
  encodeTerminalFocusEvent,
  encodeTerminalKeyPress,
  type TerminalKeyEncodingOptions,
} from "../src/app/terminal_input.ts";
import { decodeBuffer } from "../src/input_reader/mod.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Host bytes in, child bytes out: the whole path a key takes through an embedding terminal. */
function relay(hostBytes: string, options?: TerminalKeyEncodingOptions): string | undefined {
  const [event] = [...decodeBuffer(encoder.encode(hostBytes), true)];
  if (!event || event.key === "mouse" || event.key === "paste" || event.key === "focus" || event.key === "apc") {
    throw new Error(`Expected a key press for ${JSON.stringify(hostBytes)}`);
  }
  const bytes = encodeTerminalKeyPress({ ...event }, options);
  return bytes ? decoder.decode(bytes) : undefined;
}

Deno.test("a legacy host and a legacy child exchange the host's bytes unchanged", () => {
  for (const bytes of ["a", "A", "\r", "\x03", "\x1b", "\x1bm", "\x1b[A", "\x1b[1;4A", "\x1b[Z", "\x1b\r", "\x1bOP"]) {
    assertEquals(relay(bytes), bytes);
  }
});

Deno.test("a child that asked for the kitty keyboard protocol gets disambiguated chords", () => {
  const kitty = { kittyFlags: 1 };
  assertEquals(relay("\x1b", kitty), "\x1b[27u");
  assertEquals(relay("\x03", kitty), "\x1b[99;5u");
  assertEquals(relay("\x1bm", kitty), "\x1b[109;3u");
  assertEquals(relay("\x1bM", kitty), "\x1b[109;4u");
  assertEquals(relay("\x1b\r", kitty), "\x1b[13;3u");
  // Text, and the keys the protocol leaves in their legacy form, stay as they were.
  assertEquals(relay("a", kitty), "a");
  assertEquals(relay("A", kitty), "A");
  assertEquals(relay("?", kitty), "?");
  assertEquals(relay("\r", kitty), "\r");
  assertEquals(relay("\t", kitty), "\t");
  assertEquals(relay("\x1b[1;5C", kitty), "\x1b[1;5C");
  assertEquals(relay("\x1b[Z", kitty), "\x1b[Z");
  // An enhanced host passes the chords a legacy host cannot report at all.
  assertEquals(relay("\x1b[13;2u", kitty), "\x1b[13;2u");
  assertEquals(relay("\x1b[122;6u", kitty), "\x1b[122;6u");
  assertEquals(relay("\x1b[27;2;13~", kitty), "\x1b[13;2u");
  // Flag 1 alone omits alternate-key subfields.
  assertEquals(relay("\x1b[47:63;6u", kitty), "\x1b[47;6u");
  assertEquals(relay("\x1b[1072::97;5u", kitty), "\x1b[1072;5u");
});

Deno.test("kitty flag 4 reports shifted and base-layout alternate keys and downgrades cleanly for legacy children", () => {
  const kittyAlt = { kittyFlags: 5 };
  assertEquals(relay("\x1bM", kittyAlt), "\x1b[109:77;4u");
  assertEquals(relay("\x1b[122;6u", kittyAlt), "\x1b[122:90;6u");
  assertEquals(relay("\x1b?", kittyAlt), "\x1b[47:63;4u");
  assertEquals(relay("\x1b[47:63;6u", kittyAlt), "\x1b[47:63;6u");
  assertEquals(relay("\x1b[1072::97;5u", kittyAlt), "\x1b[1072::97;5u");
  // Plain shifted punctuation without Ctrl/Alt stays plain text under flags 1 | 4.
  assertEquals(relay("?", kittyAlt), "?");
  // Legacy child receives the shifted symbol when host reports CSI-u alternate keys.
  assertEquals(relay("\x1b[47:63;4u"), "\x1b?");
  assertEquals(relay("\x1b[47:63;6u", { modifyOtherKeys: 2 }), "\x1b[27;6;63~");
});

Deno.test("a legacy child never sees the enhanced form its host reports in", () => {
  assertEquals(relay("\x1b[27u"), "\x1b");
  assertEquals(relay("\x1b[99;5u"), "\x03");
  assertEquals(relay("\x1b[110;5u"), "\x0e");
  assertEquals(relay("\x1b[13;2u"), "\r");
  assertEquals(relay("\x1b[9;2u"), "\x1b[Z");
  assertEquals(relay("\x1b[109;3u"), "\x1bm");
  assertEquals(relay("\x1b[109;4u"), "\x1bM");
  assertEquals(relay("\x1b[122;6u"), "\x1a");
  assertEquals(relay("\x1b[127;5u"), "\b");
  assertEquals(relay("\x1b[32;5u"), "\x00");
  assertEquals(relay("\x1b[27;5;13~"), "\r");
});

Deno.test("a child that set modifyOtherKeys gets only the chords legacy bytes cannot express", () => {
  const level2 = { modifyOtherKeys: 2 };
  assertEquals(relay("\x1b[13;2u", level2), "\x1b[27;2;13~");
  assertEquals(relay("\x1b[122;6u", level2), "\x1b[27;6;122~");
  assertEquals(relay("\x1b[27;5;13~", level2), "\x1b[27;5;13~");
  assertEquals(relay("\x03", level2), "\x03");
  assertEquals(relay("\x1bm", level2), "\x1bm");
  assertEquals(relay("\x1b[Z", level2), "\x1b[Z");
  assertEquals(relay("\x1b[9;2u", level2), "\x1b[Z");
  assertEquals(relay("a", level2), "a");
  // Kitty wins when a child set both, as agy does.
  assertEquals(relay("\x1b[13;2u", { kittyFlags: 1, modifyOtherKeys: 2 }), "\x1b[13;2u");
});

Deno.test("DECCKM translates unmodified cursor and Home/End keys between CSI and SS3", () => {
  const appMode = { applicationCursorKeys: true };
  const normalMode = { applicationCursorKeys: false };
  for (
    const [csi, ss3] of [
      ["\x1b[A", "\x1bOA"],
      ["\x1b[B", "\x1bOB"],
      ["\x1b[C", "\x1bOC"],
      ["\x1b[D", "\x1bOD"],
      ["\x1b[H", "\x1bOH"],
      ["\x1b[F", "\x1bOF"],
    ] as const
  ) {
    assertEquals(relay(csi, appMode), ss3);
    assertEquals(relay(ss3, appMode), ss3);
    assertEquals(relay(ss3, normalMode), csi);
    assertEquals(relay(csi, normalMode), csi);
    // Without explicit DECCKM mode, host bytes pass through unchanged.
    assertEquals(relay(csi), csi);
    assertEquals(relay(ss3), ss3);
  }
  // Modified cursor keys remain CSI even when DECCKM is active.
  assertEquals(relay("\x1b[1;2A", appMode), "\x1b[1;2A");
  assertEquals(relay("\x1b[1;5C", appMode), "\x1b[1;5C");
  assertEquals(relay("\x1b[1;3D", appMode), "\x1b[1;3D");
  // Kitty disambiguation still honors DECCKM for unmodified arrows.
  assertEquals(relay("\x1b[A", { kittyFlags: 1, applicationCursorKeys: true }), "\x1bOA");
  assertEquals(relay("\x1bOA", { kittyFlags: 1, applicationCursorKeys: false }), "\x1b[A");
});

Deno.test("encodeTerminalFocusEvent encodes DECSET 1004 focus-in and focus-out reports", () => {
  assertEquals(decoder.decode(encodeTerminalFocusEvent(true)), "\x1b[I");
  assertEquals(decoder.decode(encodeTerminalFocusEvent(false)), "\x1b[O");
});
