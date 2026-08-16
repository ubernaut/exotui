// Copyright 2023 Im-Beast. MIT license.

// INP-009: large pastes stream through declared byte/line limits as one
// logical transaction — oversized input rejects or truncates by policy,
// chunk boundaries never split a grapheme, and delivery is caller-paced.

import { assert, assertEquals } from "./deps.ts";
import { openTerminalPasteTransaction, streamTerminalPaste, TerminalPasteStreamController } from "../mod.ts";

const FAMILY = "\u{1F469}‍\u{1F469}‍\u{1F467}‍\u{1F466}"; // 👩‍👩‍👧‍👦 (25 UTF-8 bytes)

Deno.test("paste within limits is one transaction whose chunks reassemble exactly", () => {
  const text = "hello\nworld";
  const transaction = openTerminalPasteTransaction(text, { maxBytes: 100, maxLines: 5, chunkBytes: 4 });
  assertEquals(transaction.policy, "within-limits");
  assertEquals(transaction.totalBytes, 11);
  assertEquals(transaction.totalLines, 2);
  assertEquals(transaction.chunks.join(""), text);
  assert(transaction.chunks.length > 1);
});

Deno.test("oversized paste rejects wholly under the reject policy", () => {
  const rejected = openTerminalPasteTransaction("abcdef", { maxBytes: 3 });
  assertEquals(rejected.policy, "rejected");
  assertEquals(rejected.text, "");
  assertEquals(rejected.chunks, []);
  assertEquals(rejected.totalBytes, 6);

  const lines = openTerminalPasteTransaction("a\nb\nc", { maxLines: 2 });
  assertEquals(lines.policy, "rejected");
});

Deno.test("truncation cuts on grapheme boundaries and line boundaries", () => {
  // Byte cut inside the ZWJ family must back off to before the whole cluster.
  const emoji = openTerminalPasteTransaction(`ab${FAMILY}cd`, { maxBytes: 10, overflow: "truncate" });
  assertEquals(emoji.policy, "truncated");
  assertEquals(emoji.text, "ab");

  const lines = openTerminalPasteTransaction("one\r\ntwo\r\nthree", { maxLines: 2, overflow: "truncate" });
  assertEquals(lines.text, "one\r\ntwo");
  assertEquals(lines.policy, "truncated");
});

Deno.test("chunking never splits a cluster and oversized clusters ship whole", () => {
  const text = FAMILY.repeat(4);
  // Target far below one cluster's byte size: each chunk is one whole family.
  const transaction = openTerminalPasteTransaction(text, { chunkBytes: 8 });
  assertEquals(transaction.chunks.length, 4);
  for (const chunk of transaction.chunks) assertEquals(chunk, FAMILY);
  assertEquals(transaction.chunks.join(""), text);
});

Deno.test("the controller paces delivery and cancellation drops the remainder", () => {
  const { transaction, controller } = streamTerminalPaste("abcdefgh", { chunkBytes: 2 }, { chunksPerTick: 2 });
  assertEquals(transaction.chunks.length, 4);
  assertEquals(controller.next(), ["ab", "cd"]);
  assertEquals(controller.done, false);
  assertEquals(controller.progress(), { delivered: 2, total: 4 });

  controller.cancel();
  assertEquals(controller.next(), []);
  assert(controller.done && controller.cancelled);

  const fresh = new TerminalPasteStreamController(transaction);
  let ticks = 0;
  while (!fresh.done) {
    fresh.next();
    ticks += 1;
  }
  assertEquals(ticks, 4); // one chunk per tick by default
});
