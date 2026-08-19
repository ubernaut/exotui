// Copyright 2023 Im-Beast. MIT license.

// The reachability gate's judgement, tested without walking a module graph.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  evaluateReachability,
  formatReachabilityReport,
  parseOrphanAllowlist,
  REACHABILITY_SCOPES,
} from "../scripts/orphan_modules.ts";

Deno.test("a module nothing imports fails unless it is knowingly allowed", () => {
  const results = [{ scope: "library", unreachable: ["src/orphan.ts", "src/known.ts"] }];
  const report = evaluateReachability(results, { allowed: ["src/known.ts"] });
  assertEquals(report.unexpected, ["src/orphan.ts"]);
  assertEquals(report.stale, []);
  assert(formatReachabilityReport(report).includes("fail reachability"));
});

Deno.test("an allowlist entry that became reachable is reported, not ignored", () => {
  // Otherwise the list only ever grows, and it stops describing the repository.
  const results = [{ scope: "library", unreachable: [] }];
  const report = evaluateReachability(results, { allowed: ["src/wired_up_since.ts"] });
  assertEquals(report.stale, ["src/wired_up_since.ts"]);
  assert(formatReachabilityReport(report).includes("fail reachability"));
});

Deno.test("everything reachable, or allowed, passes", () => {
  const report = evaluateReachability(
    [{ scope: "library", unreachable: ["src/known.ts"] }, { scope: "exomux", unreachable: [] }],
    { allowed: ["src/known.ts"] },
  );
  assertEquals(report.unexpected, []);
  assertEquals(report.stale, []);
  assert(formatReachabilityReport(report).includes("ok reachability"));
});

Deno.test("an allowlist that cannot be trusted is rejected rather than assumed empty", () => {
  // A malformed list defaulting to "allow nothing" would fail the gate loudly;
  // defaulting to "allow everything" would disable it silently. Neither: throw.
  assertThrows(() => parseOrphanAllowlist("{}"), Error, 'must contain an "allowed" array');
  assertThrows(() => parseOrphanAllowlist('{"allowed":[""]}'), Error, "invalid entry");
  assertEquals(parseOrphanAllowlist('{"allowed":["b.ts","a.ts"]}').allowed, ["a.ts", "b.ts"]);
});

Deno.test("every scope names a config, entrypoints and sources to judge", () => {
  assert(REACHABILITY_SCOPES.length > 0);
  for (const scope of REACHABILITY_SCOPES) {
    assert(scope.entrypoints.length > 0, `${scope.id} has no entrypoints`);
    assert(scope.sourceDirectories.length > 0, `${scope.id} judges no sources`);
    assert(scope.config.endsWith(".json") || scope.config.endsWith(".jsonc"), `${scope.id} config looks wrong`);
  }
});
