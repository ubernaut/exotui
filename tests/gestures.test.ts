// Copyright 2023 Im-Beast. MIT license.

// INP-007: bounded gesture recognizers — configurable thresholds,
// caller-clock long-press, cancellation releasing capture, mouse-compatible
// single-pointer flows, and no hiding of raw events.

import { assert, assertEquals } from "./deps.ts";
import { createGestureRecognizer, type GestureEvent } from "../mod.ts";

function harness(options = {}) {
  const gestures: GestureEvent[] = [];
  const recognizer = createGestureRecognizer(options);
  recognizer.onGesture((gesture) => gestures.push(gesture));
  return { recognizer, gestures };
}

Deno.test("tap and long-press separate on the caller's clock", () => {
  const { recognizer, gestures } = harness({ longPressMs: 500, tapSlop: 2 });
  recognizer.handle({ pointerId: 1, type: "down", x: 5, y: 5, at: 0 });
  recognizer.advance(300); // not held long enough
  recognizer.handle({ pointerId: 1, type: "up", x: 6, y: 5, at: 350 });
  assertEquals(gestures, [{ kind: "tap", x: 5, y: 5 }]);

  gestures.length = 0;
  recognizer.handle({ pointerId: 1, type: "down", x: 8, y: 8, at: 1000 });
  recognizer.advance(1600); // held past the threshold
  recognizer.handle({ pointerId: 1, type: "up", x: 8, y: 8, at: 1700 });
  assertEquals(gestures, [{ kind: "long-press", x: 8, y: 8 }]); // no tap after long-press
});

Deno.test("pan starts past its threshold and streams deltas; no tap afterwards", () => {
  const { recognizer, gestures } = harness({ panThreshold: 3 });
  recognizer.handle({ pointerId: 1, type: "down", x: 0, y: 0, at: 0 });
  recognizer.handle({ pointerId: 1, type: "move", x: 1, y: 0, at: 20 }); // under threshold
  assertEquals(gestures, []);
  recognizer.handle({ pointerId: 1, type: "move", x: 4, y: 0, at: 40 });
  recognizer.handle({ pointerId: 1, type: "move", x: 6, y: 2, at: 60 });
  recognizer.handle({ pointerId: 1, type: "up", x: 6, y: 2, at: 80 });
  assertEquals(gestures, [
    { kind: "pan", deltaX: 3, deltaY: 0 },
    { kind: "pan", deltaX: 2, deltaY: 2 },
  ]);
});

Deno.test("two pointers pinch; cancellation releases capture", () => {
  const released: number[] = [];
  const { recognizer, gestures } = harness({ releaseCapture: (id: number) => released.push(id) });
  recognizer.handle({ pointerId: 1, type: "down", x: 0, y: 0, at: 0 });
  recognizer.handle({ pointerId: 2, type: "down", x: 10, y: 0, at: 10 });
  recognizer.handle({ pointerId: 2, type: "move", x: 20, y: 0, at: 30 });
  assertEquals(gestures, [{ kind: "pinch", scale: 2 }]);

  recognizer.handle({ pointerId: 1, type: "cancel", x: 0, y: 0, at: 50 });
  assertEquals(released, [1]);
  assertEquals(gestures.at(-1), { kind: "cancelled" });
  assertEquals(recognizer.inspect().activePointers, 1);
});
