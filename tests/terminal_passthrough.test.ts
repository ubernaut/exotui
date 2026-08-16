// Copyright 2023 Im-Beast. MIT license.

// TERM-010: golden streams round-trip through simulated multiplexer
// layers without double escaping.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  decodeTmuxPassthrough,
  diagnosePassthrough,
  encodeTmuxPassthrough,
  PassthroughError,
  SCREEN_CHUNK_BYTES,
  unwrapPassthrough,
  wrapPassthrough,
} from "../mod.ts";

const GOLDEN_STREAMS = [
  "\x1b[1;31mred\x1b[0m", // SGR chain
  "\x1b]52;c;SGVsbG8=\x07", // clipboard OSC (BEL)
  "\x1b]8;;https://x\x1b\\link\x1b]8;;\x1b\\", // hyperlink with ST
  "\x1bPq#0;2;0;0;0#0~~\x1b\\", // sixel-ish DCS
  "plain text with no escapes",
  "\x1b\x1b double escape ahead \x1b[H",
];

Deno.test("golden streams round-trip each single layer byte-exactly", () => {
  for (const stream of GOLDEN_STREAMS) {
    for (const layer of ["tmux", "screen"] as const) {
      const wrapped = wrapPassthrough(stream, [layer]);
      assertEquals(unwrapPassthrough(wrapped, [layer]), stream, `${layer} mangled ${JSON.stringify(stream)}`);
    }
  }
});

Deno.test("tmux inside screen round-trips; ESC doubling never compounds", () => {
  for (const stream of GOLDEN_STREAMS) {
    const wrapped = wrapPassthrough(stream, ["tmux", "screen"]);
    assertEquals(unwrapPassthrough(wrapped, ["tmux", "screen"]), stream);
  }
  // No double escaping: wrapping twice through tmux and unwrapping twice
  // is still exact (the doubling is per-layer, perfectly inverted).
  const twice = encodeTmuxPassthrough(encodeTmuxPassthrough("\x1b[H"));
  assertEquals(decodeTmuxPassthrough(decodeTmuxPassthrough(twice)!), "\x1b[H");
});

Deno.test("screen chunking splits long payloads and reassembles exactly", () => {
  const long = "\x1b[31m" + "x".repeat(SCREEN_CHUNK_BYTES * 2 + 100) + "\x1b[0m";
  const wrapped = wrapPassthrough(long, ["screen"]);
  assert(wrapped.split("\x1b\\").length - 1 >= 3); // three chunks
  assertEquals(unwrapPassthrough(wrapped, ["screen"]), long);
});

Deno.test("capability diagnostics name unsupported combinations", () => {
  assertEquals(diagnosePassthrough(["tmux"]).supported, true);
  assertEquals(diagnosePassthrough(["tmux", "screen"]).supported, true);
  const inside = diagnosePassthrough(["screen", "tmux"]);
  assert(!inside.supported && inside.reason!.includes("collide"));
  const deep = diagnosePassthrough(["tmux", "tmux", "tmux"]);
  assert(!deep.supported && deep.reason!.includes("nesting depth 3"));
  assertEquals(diagnosePassthrough([]).supported, false);
  assertThrows(() => wrapPassthrough("x", ["screen", "tmux"]), PassthroughError, "collide");
});

Deno.test("malformed tmux bodies are rejected, not silently unmangled", () => {
  assertEquals(decodeTmuxPassthrough("\x1bPtmux;lone\x1besc\x1b\\"), undefined);
  assertEquals(decodeTmuxPassthrough("not wrapped"), undefined);
});
