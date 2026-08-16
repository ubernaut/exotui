// Copyright 2023 Im-Beast. MIT license.

// QAL-010: a flaky test retains all failing artifacts and a named
// owner/review date; quarantine never silently passes a required gate.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createFlakeDetector } from "../mod.testing.ts";

Deno.test("classification distinguishes stable-pass, stable-fail, and flaky", () => {
  const detector = createFlakeDetector();
  const pass = detector.detect({ name: "solid", run: (seed) => (seed % 7) + 1 }, { runs: 10 });
  assertEquals(pass.classification, "stable-pass");
  assert(pass.gatePassed);
  assert(pass.timing.minMs >= 1 && pass.timing.maxMs <= 7 && pass.timing.p95Ms >= pass.timing.meanMs - 7);

  const fail = detector.detect({
    name: "broken",
    run: () => {
      throw new Error("always");
    },
  }, { runs: 5 });
  assertEquals(fail.classification, "stable-fail");
  assertEquals(fail.failures, 5);

  const flaky = detector.detect({
    name: "sometimes",
    run: (seed) => {
      if (seed % 3 === 0) throw new Error(`failed under seed ${seed}`);
      return 2;
    },
  }, { runs: 12 });
  assertEquals(flaky.classification, "flaky");
  assert(flaky.failures > 0 && flaky.failures < 12);
});

Deno.test("failing runs retain seed, error, and resource snapshots", () => {
  const detector = createFlakeDetector();
  let leakedHandles = 0;
  const report = detector.detect({
    name: "leaky",
    run: (seed) => {
      if (seed % 2 === 1) {
        leakedHandles += 1;
        throw new Error(`crash at seed ${seed}`);
      }
      return 1;
    },
    snapshotResources: () => ({ leakedHandles }),
  }, { runs: 6, seedBase: 1 });

  assert(report.artifacts.length > 0);
  for (const artifact of report.artifacts) {
    assert(artifact.error.includes(`seed ${artifact.seed}`)); // reproducible from the artifact
    assert((artifact.resources as { leakedHandles: number }).leakedHandles > 0);
  }
  // Deterministic rotation: the same options reproduce the same seeds.
  const again = detector.detect({
    name: "leaky",
    run: (seed) => {
      if (seed % 2 === 1) throw new Error(`crash at seed ${seed}`);
      return 1;
    },
  }, { runs: 6, seedBase: 1 });
  assertEquals(again.artifacts.map((artifact) => artifact.seed), report.artifacts.map((artifact) => artifact.seed));
});

Deno.test("quarantine labels but never passes a required gate", () => {
  const detector = createFlakeDetector();
  assertThrows(() => detector.quarantine("x", { owner: "", reviewByMs: 1 }), TypeError, "named owner");
  assertThrows(() => detector.quarantine("x", { owner: "cos", reviewByMs: NaN }), TypeError, "review date");

  detector.quarantine("required-flake", { owner: "cos", reviewByMs: 1_800_000_000_000, note: "tracking #42" });
  const requiredReport = detector.detect({
    name: "required-flake",
    run: (seed) => {
      if (seed % 2 === 1) throw new Error("flake");
      return 1;
    },
  }, { runs: 4 });
  assertEquals(requiredReport.quarantine?.owner, "cos"); // labeled
  assertEquals(requiredReport.gatePassed, false); // but still red

  // A NON-required subject may be labeled through while quarantined.
  detector.quarantine("optional-flake", { owner: "cos", reviewByMs: 1_800_000_000_000 });
  const optionalReport = detector.detect({
    name: "optional-flake",
    required: false,
    run: (seed) => {
      if (seed % 2 === 1) throw new Error("flake");
      return 1;
    },
  }, { runs: 4 });
  assert(optionalReport.gatePassed);
  assertEquals(optionalReport.classification, "flaky"); // honesty retained
});
