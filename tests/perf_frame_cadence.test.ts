// Copyright 2023 Im-Beast. MIT license.

// PER-006: a synthetic workload meets input-latency floors and becomes
// idle without polling.

import { assert, assertEquals } from "./deps.ts";
import { createFrameCadenceController } from "../mod.ts";

Deno.test("a synthetic workload keeps every input under the latency floor", () => {
  const cadence = createFrameCadenceController({
    minFrameIntervalMs: 16,
    maxInputLatencyMs: 50,
  });
  const inputTimes = [10, 22, 100, 400, 401, 402];
  const frames: Array<{ at: number; forInput?: number }> = [];
  let now = 0;
  let inputIndex = 0;
  // Drive a virtual loop to t=600.
  while (now <= 600) {
    while (inputIndex < inputTimes.length && inputTimes[inputIndex]! <= now) {
      cadence.markInput(inputTimes[inputIndex]!);
      inputIndex += 1;
    }
    const due = cadence.nextFrameAt();
    if (due !== undefined && due <= now) {
      frames.push({ at: now });
      cadence.frameRendered(now);
    }
    now += 1;
  }
  // Every input was reflected by a frame within 50ms.
  for (const inputAt of inputTimes) {
    const serving = frames.find((frame) => frame.at >= inputAt && frame.at <= inputAt + 50);
    assert(serving, `input at ${inputAt} missed the latency floor`);
  }
  // The fps cap held: no two frames closer than 16ms.
  for (let index = 1; index < frames.length; index += 1) {
    assert(frames[index]!.at - frames[index - 1]!.at >= 16);
  }
  // After the workload ends the controller is idle: NO next frame exists.
  assertEquals(cadence.nextFrameAt(), undefined);
});

Deno.test("background and pressure stretch cadence but never the input floor", () => {
  const cadence = createFrameCadenceController({
    minFrameIntervalMs: 10,
    maxInputLatencyMs: 40,
    backgroundIntervalMs: 500,
    pressureFactor: 4,
  });
  cadence.frameRendered(1000);

  cadence.markDirty(1001);
  assertEquals(cadence.nextFrameAt(), 1010); // ordinary cap
  cadence.setSinkPressure(true);
  assertEquals(cadence.nextFrameAt(), 1040); // stretched 4x
  cadence.setBackground(true);
  assertEquals(cadence.nextFrameAt(), 1500); // background interval wins

  // Input cuts through both: floor 40ms from the input, cap respected.
  cadence.markInput(1005);
  const due = cadence.nextFrameAt()!;
  assert(due <= 1045, `input frame at ${due} violates the floor`);
  assert(due >= 1010); // still never faster than the fps cap
});

Deno.test("idle means idle: a clean controller schedules nothing", () => {
  const cadence = createFrameCadenceController();
  assertEquals(cadence.nextFrameAt(), undefined); // fresh: nothing to do
  cadence.markDirty(5);
  assert(cadence.nextFrameAt() !== undefined);
  cadence.frameRendered(20);
  assertEquals(cadence.nextFrameAt(), undefined); // clean again — no polling
  assertEquals(cadence.inspect().dirty, false);
});
