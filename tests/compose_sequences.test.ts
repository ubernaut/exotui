// Copyright 2023 Im-Beast. MIT license.

// INP-005: dead-key/compose processing — success, invalid continuation,
// cancellation, and timeout all resolve deterministically with no keystroke
// silently lost.

import { assertEquals } from "./deps.ts";
import { createComposeSequenceProcessor } from "../mod.ts";

const TABLE = [
  [["dead-acute", "e"], "é"],
  [["dead-acute", "a"], "á"],
  [["compose", "o", "c"], "©"],
] as const;

const LITERALS = { "dead-acute": "´", compose: "" };

function processor() {
  return createComposeSequenceProcessor(TABLE, { timeoutMs: 500, literals: LITERALS });
}

Deno.test("successful compositions emit exactly the composed text", () => {
  const compose = processor();
  assertEquals(compose.key("dead-acute", 0), { kind: "pending", text: "", replay: [] });
  assertEquals(compose.key("e", 100), { kind: "composed", text: "é", replay: [] });
  // Three-token sequence with an intermediate pending state.
  assertEquals(compose.key("compose", 200).kind, "pending");
  assertEquals(compose.key("o", 300).kind, "pending");
  assertEquals(compose.key("c", 400), { kind: "composed", text: "©", replay: [] });
  // Non-sequence keys pass straight through.
  assertEquals(compose.key("x", 500), { kind: "passthrough", text: "x", replay: ["x"] });
});

Deno.test("invalid continuations flush literals and replay every token", () => {
  const compose = processor();
  compose.key("dead-acute", 0);
  assertEquals(compose.key("z", 100), { kind: "invalid", text: "´z", replay: ["dead-acute", "z"] });
  assertEquals(compose.pending, []);
});

Deno.test("timeouts and cancellation are deterministic under a fake clock", () => {
  const compose = processor();
  compose.key("dead-acute", 0);
  // Within the window: nothing fires.
  assertEquals(compose.tick(400), undefined);
  // Past the window: the pending dead key flushes as its literal.
  assertEquals(compose.tick(600), { kind: "timeout", text: "´", replay: ["dead-acute"] });

  // A late key first flushes, then processes the fresh token in one result.
  compose.key("dead-acute", 1000);
  assertEquals(compose.key("e", 2000), { kind: "timeout", text: "´e", replay: ["dead-acute", "e"] });

  compose.key("compose", 3000);
  compose.key("o", 3100);
  assertEquals(compose.cancel(), { kind: "cancelled", text: "o", replay: ["compose", "o"] });
  assertEquals(compose.cancel(), undefined);
});
