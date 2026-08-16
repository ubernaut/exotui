// Copyright 2023 Im-Beast. MIT license.

// TERM-003: consumers can audit behavior without reparsing raw bytes and
// unknown controls remain lossless.

import { assert, assertEquals } from "./deps.ts";
import { createTerminalOperationDecoder } from "../mod.ts";

Deno.test("recognized operations parse with names and defaulted params", () => {
  const decoder = createTerminalOperationDecoder();
  const events = decoder.write("hi\x1b[2A\x1b[H\x1b[1;31m\x1b[?1049h\x1b]2;title\x07\x1b7\r\n");
  const named = events.map((event) => `${event.classification}:${event.operation ?? event.detail}`);
  assertEquals(named, [
    "parsed:print",
    "parsed:cursor-up",
    "parsed:cursor-position",
    "parsed:sgr",
    "parsed:dec-private-set",
    "parsed:set-title",
    "parsed:save-cursor",
    "parsed:carriage-return",
    "parsed:line-feed",
  ]);
  assertEquals(events[1]!.params, [2]);
  assertEquals(events[2]!.params, [1]); // CSI H defaults to 1
  assertEquals(events[3]!.params, [1, 31]);
  assertEquals(events[4]!.params, [1049]);
  assert(events.every((event) => event.version === 1));
});

Deno.test("unknown controls classify unsupported and stay byte-lossless", () => {
  const decoder = createTerminalOperationDecoder();
  const exotic = "\x1b[3 q\x1b[>4;2m\x1bP+q544e\x1b\\\x1b_Ga=T\x1b\\\x1b]777;notify\x07\x0e";
  const events = decoder.write(exotic);
  assert(events.every((event) => event.classification !== "parsed"));
  // Losslessness: concatenating raw reproduces the input byte-exactly.
  assertEquals(events.map((event) => event.raw).join(""), exotic);
  const kinds = events.map((event) => event.classification);
  assertEquals(kinds, ["unsupported", "unsupported", "unsupported", "unsupported", "unsupported", "ignored"]);
  assert(events[2]!.detail!.includes("DCS"));
  assert(events[4]!.detail!.includes("OSC 777"));
});

Deno.test("parser bound breaches surface as malformed events", () => {
  const decoder = createTerminalOperationDecoder({ maxCsiParamBytes: 4 });
  const events = decoder.write("\x1b[1;2;3;4;5;6m ok");
  assertEquals(events[0]!.classification, "malformed");
  assert(events[0]!.detail!.includes("csi-params-exceeded"));
  // The stream recovers to ground; later text still parses.
  assert(events.some((event) => event.operation === "print"));
});

Deno.test("parsed events also reserialize losslessly", () => {
  const decoder = createTerminalOperationDecoder();
  const input = "abc\x1b[10;20H\x1b[0m\x1b]8;;https://x\x1b\\def";
  const events = decoder.write(input);
  assertEquals(events.map((event) => event.raw).join(""), input);
});
