// Copyright 2023 Im-Beast. MIT license.

// SEC-009: per-subsystem budgets — breaches degrade or stop only the owning
// scope with classified diagnostics; siblings never notice.

import { assert, assertEquals } from "./deps.ts";
import { createResourceLimitRegistry } from "../mod.ts";

Deno.test("soft breaches degrade, hard breaches stop, siblings stay ok", () => {
  const limits = createResourceLimitRegistry();
  limits.declare("gpu-renderer", { "output-bytes": { soft: 100, hard: 200 } });
  limits.declare("term-parser", { "control-strings": { soft: 10, hard: 20 } });

  assertEquals(limits.charge("gpu-renderer", "output-bytes", 90, 0), "ok");
  assertEquals(limits.charge("gpu-renderer", "output-bytes", 30, 10), "degraded"); // 120 > soft
  assertEquals(limits.charge("gpu-renderer", "output-bytes", 100, 20), "stopped"); // 220 > hard
  // The sibling scope is untouched by the breach.
  assertEquals(limits.state("term-parser"), "ok");

  const kinds = limits.diagnostics().map((entry) => `${entry.scope}:${entry.dimension}:${entry.classification}`);
  assertEquals(kinds, [
    "gpu-renderer:output-bytes:soft-breach",
    "gpu-renderer:output-bytes:hard-breach",
  ]);
  assertEquals(limits.diagnostics()[1]!.observed, 220);
});

Deno.test("releases recover degraded scopes; stopped scopes need explicit reset", () => {
  const limits = createResourceLimitRegistry();
  limits.declare("cache", { "cache-entries": { soft: 2, hard: 5 } });
  limits.charge("cache", "cache-entries", 3, 0); // degraded
  assertEquals(limits.state("cache"), "degraded");
  limits.release("cache", "cache-entries", 2); // back under soft
  assertEquals(limits.state("cache"), "ok");

  limits.charge("cache", "cache-entries", 10, 5); // stopped
  limits.release("cache", "cache-entries", 10);
  assertEquals(limits.state("cache"), "stopped"); // stays stopped
  assert(limits.reset("cache"));
  assertEquals(limits.state("cache"), "ok");
});

Deno.test("windowed dimensions rate-limit restarts on virtual time", () => {
  const limits = createResourceLimitRegistry();
  limits.declare("worker-pool", { restarts: { soft: 2, hard: 3, windowMs: 1000 } });
  assertEquals(limits.charge("worker-pool", "restarts", 1, 0), "ok");
  assertEquals(limits.charge("worker-pool", "restarts", 1, 100), "ok");
  assertEquals(limits.charge("worker-pool", "restarts", 1, 200), "degraded"); // 3 in window > soft 2
  assertEquals(limits.charge("worker-pool", "restarts", 1, 300), "stopped"); // 4 > hard 3
  limits.reset("worker-pool");
  // Outside the window the same rate is fine again.
  assertEquals(limits.charge("worker-pool", "restarts", 1, 5000), "ok");
});
