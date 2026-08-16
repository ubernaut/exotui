// Copyright 2023 Im-Beast. MIT license.

// PLG-002: resolution is deterministic and never chooses an incompatible
// plugin because it is newest.

import { assert, assertEquals } from "./deps.ts";
import { resolvePluginCompatibility } from "../mod.ts";

const HOST = { apiVersion: "1.6.2", features: ["slots", "webgpu"] };

Deno.test("the newest COMPATIBLE candidate wins, never a newer incompatible one", () => {
  const resolution = resolvePluginCompatibility([
    { id: "p", version: "1.0.0", hostApi: "^1.0.0" },
    { id: "p", version: "3.0.0", hostApi: "^2.0.0" }, // newest but incompatible
    { id: "p", version: "2.1.0", hostApi: "^1.5.0" },
    { id: "p", version: "2.0.0", hostApi: "^1.2.0" },
  ], HOST);
  assert(resolution.ok);
  assertEquals(resolution.selected.version, "2.1.0"); // not 3.0.0
  assertEquals(resolution.rejected, [
    { version: "3.0.0", reason: "requires host API ^2.0.0, host is 1.6.2" },
  ]);
});

Deno.test("feature requirements filter with explainable rejections", () => {
  const resolution = resolvePluginCompatibility([
    { id: "p", version: "2.0.0", hostApi: "^1.0.0", requiredFeatures: ["webgpu", "audio"] },
    { id: "p", version: "1.5.0", hostApi: "^1.0.0", requiredFeatures: ["webgpu"] },
  ], HOST);
  assert(resolution.ok);
  assertEquals(resolution.selected.version, "1.5.0");
  assertEquals(resolution.rejected[0]!.reason, "missing host feature(s): audio");
});

Deno.test("no compatible candidate explains every rejection deterministically", () => {
  const candidates = [
    { id: "p", version: "4.0.0", hostApi: "^3.0.0" },
    { id: "p", version: "5.0.0", hostApi: "~1.9.0" },
  ];
  const first = resolvePluginCompatibility(candidates, HOST);
  const second = resolvePluginCompatibility(candidates, HOST);
  assert(!first.ok);
  assertEquals(first, second); // deterministic
  assertEquals(first.rejected.length, 2);
  assert(first.rejected.every((rejection) => rejection.reason.includes("host API")));
});
