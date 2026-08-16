// Copyright 2023 Im-Beast. MIT license.

// PLG-003: activation order is stable and one failed optional peer does
// not block unrelated plugins.

import { assert, assertEquals } from "./deps.ts";
import { resolvePluginDependencies } from "../mod.ts";

Deno.test("dependencies activate before dependents in stable declaration-tie order", () => {
  const nodes = [
    { id: "ui", version: "1.0.0", dependencies: [{ id: "core", range: "^1.0.0" }] },
    { id: "core", version: "1.2.0" },
    { id: "themes", version: "1.0.0", dependencies: [{ id: "core", range: "^1.0.0" }] },
    { id: "board", version: "1.0.0", dependencies: [{ id: "ui", range: "^1.0.0" }] },
  ];
  const first = resolvePluginDependencies(nodes);
  assertEquals(first.activationOrder, ["core", "ui", "themes", "board"]);
  assertEquals(first.excluded, []);
  assertEquals(first, resolvePluginDependencies(nodes)); // stable
});

Deno.test("missing and conflicting hard deps exclude transitively with diagnostics", () => {
  const resolution = resolvePluginDependencies([
    { id: "a", version: "1.0.0", dependencies: [{ id: "ghost", range: "^1.0.0" }] },
    { id: "b", version: "1.0.0", dependencies: [{ id: "a", range: "^1.0.0" }] },
    { id: "c", version: "1.0.0", dependencies: [{ id: "old", range: "^2.0.0" }] },
    { id: "old", version: "1.5.0" },
    { id: "solo", version: "1.0.0" },
  ]);
  assertEquals(resolution.activationOrder, ["old", "solo"]);
  const reasons = Object.fromEntries(resolution.excluded.map((entry) => [entry.id, entry.reason]));
  assert(reasons["a"].includes("ghost"));
  assert(reasons["b"].includes('"a" is excluded')); // transitive, explained
  assert(reasons["c"].includes("version conflict"));
  const kinds = resolution.diagnostics.map((diagnostic) => diagnostic.kind).sort();
  assertEquals(kinds, ["dependent-excluded", "missing-dependency", "version-conflict"]);
});

Deno.test("cycles exclude their members with the cycle spelled out", () => {
  const resolution = resolvePluginDependencies([
    { id: "x", version: "1.0.0", dependencies: [{ id: "y", range: "^1.0.0" }] },
    { id: "y", version: "1.0.0", dependencies: [{ id: "x", range: "^1.0.0" }] },
    { id: "free", version: "1.0.0" },
  ]);
  assertEquals(resolution.activationOrder, ["free"]);
  assertEquals(resolution.excluded.length, 2);
  const cycle = resolution.diagnostics.find((diagnostic) => diagnostic.kind === "cycle");
  assert(cycle && cycle.detail.includes("x -> y") || cycle!.detail.includes("y -> x"));
});

Deno.test("a failed optional peer diagnoses but blocks nothing", () => {
  const resolution = resolvePluginDependencies([
    { id: "chart", version: "1.0.0", optionalPeers: [{ id: "themes", range: "^2.0.0" }] },
    { id: "themes", version: "1.0.0" }, // present but too old for the peer range
    { id: "grid", version: "1.0.0", optionalPeers: [{ id: "nonexistent", range: "^1.0.0" }] },
    { id: "other", version: "1.0.0" },
  ]);
  // Everyone activates; the peer failures are diagnostics only.
  assertEquals([...resolution.activationOrder].sort(), ["chart", "grid", "other", "themes"]);
  assertEquals(resolution.excluded, []);
  const peerIssues = resolution.diagnostics.filter((d) => d.kind === "optional-peer-unavailable");
  assertEquals(peerIssues.map((d) => d.pluginId).sort(), ["chart", "grid"]);

  // A SATISFIED optional peer orders before its consumer.
  const ordered = resolvePluginDependencies([
    { id: "chart", version: "1.0.0", optionalPeers: [{ id: "themes", range: "^1.0.0" }] },
    { id: "themes", version: "1.0.0" },
  ]);
  assertEquals(ordered.activationOrder, ["themes", "chart"]);
});
