// Copyright 2023 Im-Beast. MIT license.

import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
  createPointerGestureState,
  type PointerGestureEvent,
  type PointerGestureOutcome,
  type PointerGestureState,
  reducePointerGesture,
} from "../src/app/pointer_gestures.ts";

// Phase 5 of plan/todo/040. The click/drag/double-click decision used to live
// as ad-hoc flags across three files and could only be tested by mounting a
// desktop and sleeping past a 400ms timer. As a reducer it is a table.

interface Step {
  readonly at: number;
  readonly kind: PointerGestureEvent["kind"];
  readonly id?: string;
  readonly column?: number;
  readonly row?: number;
}

/** Replays a sequence and returns every non-empty outcome it produced. */
function play(steps: readonly Step[], doubleClickMs = 400): PointerGestureOutcome[] {
  let state: PointerGestureState = createPointerGestureState();
  const outcomes: PointerGestureOutcome[] = [];
  for (const step of steps) {
    const result = reducePointerGesture(state, {
      kind: step.kind,
      id: step.id,
      column: step.column ?? 0,
      row: step.row ?? 0,
      timestamp: step.at,
    }, { doubleClickMs });
    state = result.state;
    if (result.outcome.kind !== "none") outcomes.push(result.outcome);
  }
  return outcomes;
}

Deno.test("a press that lifts where it started is a click", () => {
  assertEquals(
    play([{ at: 0, kind: "down", id: "title" }, { at: 20, kind: "up" }]),
    [{ kind: "click", id: "title" }],
  );
});

Deno.test("a press that travels is a drag, and never becomes a click", () => {
  assertEquals(
    play([
      { at: 0, kind: "down", id: "title" },
      { at: 10, kind: "move", column: 4, row: 2 },
      { at: 20, kind: "move", column: 6, row: 3 },
      { at: 30, kind: "up", column: 6, row: 3 },
    ]),
    [{ kind: "drag", id: "title" }],
    "one drag outcome, no click on release",
  );
});

Deno.test("two quick clicks on the same thing are a double click", () => {
  assertEquals(
    play([
      { at: 0, kind: "down", id: "title" },
      { at: 10, kind: "up" },
      { at: 100, kind: "down", id: "title" },
      { at: 110, kind: "up" },
    ]),
    [{ kind: "click", id: "title" }, { kind: "double-click", id: "title" }],
  );
});

Deno.test("a click then a drag is a drag — the bug that stole every title-bar move", () => {
  // Click to focus, then immediately drag. Deciding on the second PRESS would
  // call this a double click and maximize the window instead of moving it.
  assertEquals(
    play([
      { at: 0, kind: "down", id: "title" },
      { at: 10, kind: "up" },
      { at: 60, kind: "down", id: "title" },
      { at: 70, kind: "move", column: 5, row: 2 },
      { at: 80, kind: "up", column: 5, row: 2 },
    ]),
    [{ kind: "click", id: "title" }, { kind: "drag", id: "title" }],
  );
});

Deno.test("the double-click window is honored at both edges", () => {
  const inside = play([
    { at: 0, kind: "down", id: "a" },
    { at: 0, kind: "up" },
    { at: 400, kind: "down", id: "a" },
    { at: 400, kind: "up" },
  ]);
  assertEquals(inside.at(-1), { kind: "double-click", id: "a" }, "exactly at the limit still doubles");

  const outside = play([
    { at: 0, kind: "down", id: "a" },
    { at: 0, kind: "up" },
    { at: 401, kind: "down", id: "a" },
    { at: 401, kind: "up" },
  ]);
  assertEquals(outside.at(-1), { kind: "click", id: "a" }, "one millisecond late is two clicks");
});

Deno.test("clicks on different things never pair", () => {
  assertEquals(
    play([
      { at: 0, kind: "down", id: "a" },
      { at: 10, kind: "up" },
      { at: 50, kind: "down", id: "b" },
      { at: 60, kind: "up" },
    ]),
    [{ kind: "click", id: "a" }, { kind: "click", id: "b" }],
  );
});

Deno.test("three quick clicks are a click, a double, then a fresh click", () => {
  assertEquals(
    play([
      { at: 0, kind: "down", id: "a" },
      { at: 5, kind: "up" },
      { at: 50, kind: "down", id: "a" },
      { at: 55, kind: "up" },
      { at: 100, kind: "down", id: "a" },
      { at: 105, kind: "up" },
    ]),
    [{ kind: "click", id: "a" }, { kind: "double-click", id: "a" }, { kind: "click", id: "a" }],
    "a double click consumes its history",
  );
});

Deno.test("a press while one is open reports the lost release", () => {
  // The terminal dropped an event: one of these used to wedge the desktop
  // until it was restarted, because the gesture stayed open forever.
  assertEquals(
    play([
      { at: 0, kind: "down", id: "title" },
      { at: 10, kind: "move", column: 3, row: 1 },
      { at: 500, kind: "down", id: "title" },
      { at: 510, kind: "up" },
    ]),
    [{ kind: "drag", id: "title" }, { kind: "recovered", id: "title" }, { kind: "click", id: "title" }],
    "the stale gesture is reported, and the new press proceeds normally",
  );
});

Deno.test("cancel drops the gesture without completing it", () => {
  assertEquals(
    play([
      { at: 0, kind: "down", id: "title" },
      { at: 10, kind: "cancel" },
      { at: 20, kind: "up" },
    ]),
    [],
  );
});

Deno.test("a press over nothing clears what was in flight", () => {
  assertEquals(
    play([
      { at: 0, kind: "down", id: "title" },
      { at: 10, kind: "down" },
      { at: 20, kind: "up" },
    ]),
    [],
    "an unowned press ends the sequence rather than attaching to it",
  );
});

Deno.test("moves and releases without a press are inert", () => {
  assertEquals(play([{ at: 0, kind: "move", column: 2, row: 2 }, { at: 5, kind: "up" }]), []);
});

Deno.test("the reducer never mutates the state it is given", () => {
  const state = createPointerGestureState();
  const first = reducePointerGesture(state, { kind: "down", id: "a", column: 0, row: 0, timestamp: 0 });
  assertEquals(state, {}, "the original is untouched");
  const second = reducePointerGesture(first.state, { kind: "move", column: 9, row: 9, timestamp: 5 });
  assertEquals(first.state.held?.moved, false, "the intermediate is untouched");
  assertEquals(second.outcome, { kind: "drag", id: "a" });
});
