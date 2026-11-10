// Copyright 2023 Im-Beast. MIT license.
import { assertEquals, assertThrows } from "./deps.ts";
import {
  generatedCounterDirectives,
  GeneratedCounterLedger,
  type GeneratedCounterNode,
} from "../src/content/mermaid_counters.ts";

const directives = (reset = "none", increment = "none", set = "none") =>
  generatedCounterDirectives(reset, increment, set);
const node = (parent?: GeneratedCounterNode): GeneratedCounterNode => ({ parent });

Deno.test("computed counter directives retain repeated order, escapes, combined increments and reversed initial state", () => {
  assertEquals([...directives(String.raw`x 2 x 4 \31 name -3 reversed(y)`, "x 2 x 3 z", "x 9 x 8")], [
    ["x", { reset: 4, reversed: false, increment: 5, set: 8 }],
    ["1name", { reset: -3, reversed: false }],
    ["y", { reset: undefined, reversed: true }],
    ["z", { increment: 1 }],
  ]);
  assertThrows(() => directives("url(x)"), TypeError);
  assertThrows(() => directives("none 2"), TypeError);
  assertThrows(() => directives("", "reversed(x)"), TypeError);
  assertThrows(() => directives("x 9007199254740993"), RangeError);
});

Deno.test("counter ledger uses ancestors before siblings, nested resets and outer-to-inner detached snapshots", () => {
  const ledger = new GeneratedCounterLedger(),
    root = node(),
    parent = node(root),
    first = node(parent),
    next = node(parent);
  ledger.enter(parent, directives("x 2"));
  ledger.enter(first, directives("x 4"));
  const captured = ledger.values(node(first), "x");
  assertEquals(captured, [2, 4]);
  ledger.leave(first, directives("x 4"));
  ledger.enter(next, directives("", "x"));
  assertEquals(ledger.values(node(next), "x"), [3]);
  assertEquals(captured, [2, 4], "later increments cannot mutate an original side's saved values");
});

Deno.test("a preceding sibling reset persists until its parent's scope is left and another sibling reset replaces it", () => {
  const ledger = new GeneratedCounterLedger(), root = node(), first = node(root), next = node(root), final = node(root);
  ledger.enter(first, directives("x 4"));
  ledger.leave(first, directives("x 4"));
  ledger.enter(next, directives("", "x"));
  assertEquals(ledger.values(node(next), "x"), [5]);
  ledger.enter(final, directives("x 9"));
  assertEquals(ledger.values(node(final), "x"), [9]);
  assertEquals(ledger.values(node(), "x"), [0], "an unrelated scope must not inherit the old sibling");
});

Deno.test("counter style containment isolates writes while reads retain outer instances", () => {
  const ledger = new GeneratedCounterLedger(), outer = node(), boundary = node(outer), inner = node(boundary);
  ledger.enter(outer, directives("x 4"));
  ledger.enter(boundary, directives("", "x 2"));
  ledger.contain();
  assertEquals(ledger.values(inner, "x"), [6]);
  ledger.enter(inner, directives("", "x"));
  assertEquals(ledger.values(node(inner), "x"), [6, 1]);
  ledger.contain();
  ledger.enter(node(inner), directives("", "x 3 fresh 2"));
  ledger.releaseContainment();
  assertEquals(ledger.values(node(inner), "x"), [6, 1]);
  assertEquals(ledger.values(node(inner), "fresh"), [0]);
  ledger.releaseContainment();
  assertEquals(ledger.values(node(outer), "x"), [6]);
});

Deno.test("current layout profile combines reset then increment and gives counter-set precedence", () => {
  const ledger = new GeneratedCounterLedger(),
    root = node(),
    current = node(root),
    before = node(current),
    after = node(current);
  ledger.enter(current, directives("x 4", "x 3", "x 9"));
  assertEquals(ledger.values(before, "x"), [9]);
  ledger.enter(before, directives("", "x 2"));
  assertEquals(ledger.values(after, "x"), [11]);
  ledger.enter(after, directives("", "x 7", "x 3"));
  assertEquals(ledger.values(node(after), "x"), [3]);
});

Deno.test("overflowing increments are ignored, combined resets clamp, reversed initialization is explicit", () => {
  const ledger = new GeneratedCounterLedger(), root = node(), current = node(root), before = node(current);
  ledger.enter(current, directives("x 2147483647", "x 3"));
  ledger.enter(before, directives("", "x 1"));
  assertEquals(ledger.values(node(before), "x"), [2147483647]);
  ledger.enter(before, directives("reversed(y)", "y -1"), () => 4);
  assertEquals(ledger.values(node(before), "y"), [3]);
  assertThrows(() => ledger.enter(node(current), directives("reversed(z)")), TypeError);
});

Deno.test("counter inheritance, ancestors and computed-token work have bounded refusal and fresh recovery", () => {
  const ledger = new GeneratedCounterLedger();
  let current = node();
  for (let depth = 0; depth < 128; depth++) {
    current = node(current);
    ledger.enter(current, directives("x 1"));
  }
  assertThrows(() => ledger.enter(node(current), directives("x 1")), RangeError);
  assertThrows(() => directives("x 1 ".repeat(129)), RangeError);
  const fresh = new GeneratedCounterLedger(), root = node();
  fresh.enter(root, directives("x 5"));
  assertEquals(fresh.values(node(root), "x"), [5]);
});
