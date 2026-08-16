// Copyright 2023 Im-Beast. MIT license.

// AUT-003: structured progress — monotonic per phase, weighted nested
// children, and late events after settlement ignored.

import { assert, assertEquals } from "./deps.ts";
import { createCommandProgress } from "../mod.ts";

Deno.test("progress is monotonic per phase and phases reset the ramp", () => {
  const progress = createCommandProgress("deploy");
  const fractions: number[] = [];
  progress.onProgress((event) => {
    if (event.kind === "fraction") fractions.push(event.fraction!);
  });

  progress.phase("build");
  progress.report(0.5);
  progress.report(0.3); // regression: clamps, never goes backwards
  progress.report(0.8);
  assertEquals(fractions, [0.5, 0.5, 0.8]);
  assertEquals(progress.currentPhase, "build");

  progress.phase("upload"); // a new phase starts its own ramp
  progress.report(0.2);
  assertEquals(progress.fraction(), 0.2);
});

Deno.test("nested children roll up weighted into the root fraction", () => {
  const progress = createCommandProgress("pipeline");
  const compile = progress.child("compile", 3);
  const test = progress.child("test", 1);
  compile.report(1);
  test.report(0.5);
  // own(0)*1 + compile(1)*3 + test(0.5)*1 over weight 5.
  assertEquals(progress.fraction(), (0 + 3 + 0.5) / 5);

  const events: string[] = [];
  progress.onProgress((event) => events.push(`${event.path.join("/")}:${event.kind}`));
  test.message("running suite");
  assertEquals(events, ["pipeline/test:message"]);
  test.indeterminate();
  assert(test.isIndeterminate);
});

Deno.test("late events after settlement are ignored entirely", () => {
  const progress = createCommandProgress("job");
  const child = progress.child("step");
  const events: unknown[] = [];
  progress.onProgress((event) => events.push(event));

  progress.settle();
  assertEquals(progress.fraction(), 1); // settlement completes the scope
  assert(progress.settled && child.settled);

  child.report(0.1); // late: ignored
  progress.phase("zombie");
  progress.message("too late");
  assertEquals(events, []);
  assertEquals(progress.fraction(), 1);
  assertEquals(progress.currentPhase, undefined);
});
