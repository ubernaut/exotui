// Copyright 2023 Im-Beast. MIT license.

// INP-002: composition events and a preedit range that never mutates the
// committed value prematurely; whole compositions undo as one transaction
// and grapheme boundaries survive commit placement.

import { assert, assertEquals } from "./deps.ts";
import { createCompositionController } from "../mod.ts";

const FAMILY = "\u{1F469}‍\u{1F469}‍\u{1F467}‍\u{1F466}"; // one ZWJ-family grapheme

Deno.test("start/update never touch the committed value; commit splices once", () => {
  const events: string[] = [];
  const controller = createCompositionController({
    value: "hello world",
    onEvent: (event) => events.push(`${event.type}:${event.preedit}`),
  });

  assert(controller.start(5));
  assert(controller.update("に"));
  assert(controller.update("にほ"));
  assertEquals(controller.state.committed, "hello world"); // untouched mid-composition
  assertEquals(controller.state.display, "helloにほ world");
  assertEquals(controller.state.preeditRange, { start: 5, end: 7 });

  const transaction = controller.commit("日本")!;
  assertEquals(controller.state.committed, "hello日本 world");
  assertEquals(transaction, {
    kind: "commit",
    before: "hello world",
    after: "hello日本 world",
    inserted: "日本",
    at: 5,
  });
  assertEquals(events, ["start:", "update:に", "update:にほ", "commit:日本"]);
  // The journal holds exactly one entry for the whole composition.
  assertEquals(controller.transactions().length, 1);
});

Deno.test("cancel restores the display and records a no-op transaction", () => {
  const controller = createCompositionController({ value: "abc" });
  controller.start(3);
  controller.update("xyz");
  assertEquals(controller.state.display, "abcxyz");
  const transaction = controller.cancel()!;
  assertEquals(controller.state.display, "abc");
  assertEquals([transaction.kind, transaction.before, transaction.after], ["cancel", "abc", "abc"]);
  // No further updates without a new start; no double start while active.
  assertEquals(controller.update("q"), false);
  assert(controller.start());
  assertEquals(controller.start(), false);
});

Deno.test("a commit inside a grapheme cluster snaps to its boundary", () => {
  const controller = createCompositionController({ value: `a${FAMILY}b` });
  // Offset 3 lands inside the ZWJ family (which starts at offset 1).
  controller.start(3);
  assertEquals(controller.state.preeditStart, 1);
  controller.update("X");
  const transaction = controller.commit()!;
  assertEquals(transaction.after, `aX${FAMILY}b`); // the family is intact
  assertEquals([...transaction.after].length, [...`aX${FAMILY}b`].length);
});
