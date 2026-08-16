// Copyright 2023 Im-Beast. MIT license.

// C1 bounded transitions: a deterministic caller-advanced timeline for
// numeric, color, and offset values — no hidden timers.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createTimeline } from "../mod.ts";

Deno.test("timeline tweens numbers deterministically under a caller clock", () => {
  const timeline = createTimeline();
  const values: number[] = [];
  const tween = timeline.tween({
    from: 0,
    to: 10,
    durationMs: 100,
    onUpdate: (value) => values.push(value),
  });
  timeline.advance(0);
  timeline.advance(50);
  timeline.advance(100);
  timeline.advance(150); // past the end: no further updates
  assertEquals(values, [0, 5, 10]);
  assert(tween.done);
  assertEquals(timeline.inspect().completed, 1);
  assertEquals(timeline.inspect().active, 0);
});

Deno.test("timeline interpolates colors and applies easing, delay, and repeat", () => {
  const timeline = createTimeline();
  const colors: number[][] = [];
  timeline.tween({
    from: [0, 0, 0] as const,
    to: [200, 100, 50] as const,
    durationMs: 100,
    delayMs: 50,
    easing: "ease-in",
    onUpdate: (value) => colors.push([...value]),
  });
  timeline.advance(0);
  timeline.advance(25); // still inside the delay
  assertEquals(colors, []);
  timeline.advance(100); // 50ms in: ease-in(0.5) = 0.25
  assertEquals(colors, [[50, 25, 12.5]]);

  const bounce: number[] = [];
  let completed = 0;
  timeline.tween({
    from: 0,
    to: 4,
    durationMs: 100,
    repeat: 1,
    alternate: true,
    onUpdate: (value) => bounce.push(value),
    onComplete: () => completed += 1,
  });
  timeline.advance(200); // starts the track's clock
  timeline.advance(250); // first play, halfway
  timeline.advance(350); // second play (reversed), halfway
  timeline.advance(420); // done
  assertEquals(bounce, [0, 2, 2, 0]);
  assertEquals(completed, 1);
});

Deno.test("timeline bounds, cancellation, and disposal", () => {
  const timeline = createTimeline();
  assertThrows(() => timeline.tween({ from: 0, to: 1, durationMs: 0, onUpdate: () => {} }), RangeError);
  const updates: number[] = [];
  const tween = timeline.tween({ from: 0, to: 1, durationMs: 100, onUpdate: (value) => updates.push(value) });
  timeline.advance(0);
  tween.cancel();
  timeline.advance(50);
  assertEquals(updates, [0]);
  assertEquals(timeline.inspect().cancelled, 1);
  timeline.dispose();
  assertThrows(() => timeline.tween({ from: 0, to: 1, durationMs: 10, onUpdate: () => {} }));
});
