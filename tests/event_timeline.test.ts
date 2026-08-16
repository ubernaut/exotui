// Copyright 2023 Im-Beast. MIT license.

// WID-010: out-of-order events insert deterministically without moving a
// user who paused live-tail.

import { assert, assertEquals } from "./deps.ts";
import { createEventTimelineController, type TimelineEvent } from "../mod.ts";

function event(id: string, atMs: number, group = "today"): TimelineEvent {
  return { id, atMs, group, text: `event ${id}` };
}

function visibleIds(view: { rows: readonly ({ kind: string } & Record<string, unknown>)[] }): string[] {
  return view.rows
    .filter((row): row is { kind: "event"; event: TimelineEvent } => row.kind === "event")
    .map((row) => row.event.id);
}

Deno.test("out-of-order arrivals land deterministically by (time, id)", () => {
  const build = (order: TimelineEvent[]) => {
    const timeline = createEventTimelineController();
    for (const entry of order) timeline.insert(entry);
    return visibleIds(timeline.view(10));
  };
  const events = [event("a", 100), event("b", 50), event("c", 100), event("d", 75)];
  const sorted = build(events);
  assertEquals(sorted, ["b", "d", "a", "c"]); // time asc, id tie-break
  // Any arrival order produces the identical timeline.
  assertEquals(build([...events].reverse()), sorted);
  assertEquals(build([events[2]!, events[0]!, events[3]!, events[1]!]), sorted);
});

Deno.test("live tail follows the newest; pausing anchors by identity", () => {
  const timeline = createEventTimelineController();
  for (let index = 0; index < 10; index += 1) timeline.insert(event(`e${index}`, index * 10));
  assert(timeline.liveTail());
  assertEquals(visibleIds(timeline.view(3)), ["e7", "e8", "e9"]);

  timeline.insert(event("e10", 100));
  assertEquals(visibleIds(timeline.view(3)), ["e8", "e9", "e10"]); // tail moved

  assert(timeline.pauseAt("e5"));
  assertEquals(visibleIds(timeline.view(3)), ["e3", "e4", "e5"]);

  // A LATER event arrives: the paused window does not move.
  timeline.insert(event("e11", 110));
  assertEquals(visibleIds(timeline.view(3)), ["e3", "e4", "e5"]);
  // An EARLIER out-of-order event above the anchor also does not move it.
  timeline.insert(event("early", 5));
  assertEquals(visibleIds(timeline.view(3)), ["e3", "e4", "e5"]);

  timeline.resumeLiveTail();
  assertEquals(visibleIds(timeline.view(3)), ["e9", "e10", "e11"]);
});

Deno.test("group headers interleave and the sticky header tracks the window", () => {
  const timeline = createEventTimelineController();
  timeline.insert(event("m1", 100, "morning"));
  timeline.insert(event("m2", 110, "morning"));
  timeline.insert(event("a1", 200, "afternoon"));
  timeline.insert(event("a2", 210, "afternoon"));

  const full = timeline.view(10);
  assertEquals(full.rows.map((row) => row.kind), ["header", "event", "event", "header", "event", "event"]);

  // A window cut inside the afternoon group carries "afternoon" sticky.
  const tail = timeline.view(1);
  assertEquals(tail.sticky, "afternoon");
  timeline.pauseAt("m2");
  assertEquals(timeline.view(1).sticky, "morning");
});

Deno.test("jump-to-event pauses there and eviction keeps the buffer bounded", () => {
  const timeline = createEventTimelineController({ maxEvents: 5 });
  for (let index = 0; index < 8; index += 1) timeline.insert(event(`e${index}`, index));
  assertEquals(timeline.inspect().events, 5);
  assertEquals(timeline.inspect().evicted, 3);
  assertEquals(timeline.jumpTo("e0"), false); // evicted
  assert(timeline.jumpTo("e5"));
  assert(!timeline.liveTail());
  assertEquals(visibleIds(timeline.view(2)), ["e4", "e5"]);
});
