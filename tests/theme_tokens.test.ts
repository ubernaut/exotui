// Copyright 2023 Im-Beast. MIT license.

// THEM-001: packages declare namespaced tokens without weakening type
// checking or changing old themes.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createSemanticTokenRegistry, type Style } from "../mod.ts";

const style = (tag: string): Style => (text) => `<${tag}>${text}</${tag}>`;

Deno.test("declared namespaced tokens resolve directly or through fallbacks", () => {
  const registry = createSemanticTokenRegistry()
    .declare("chart:axis", { fallback: "muted" })
    .declare("chart:series-1", { fallback: "accent" })
    .declare("chart:series-emphasis", { fallback: "chart:series-1" });

  // A modern theme that styles the namespaced token wins directly.
  const modern = { "chart:axis": style("axis"), muted: style("muted"), accent: style("accent") };
  assertEquals(registry.style("chart:axis", modern)!("x"), "<axis>x</axis>");

  // An OLD seven-token theme satisfies every declared token via chains.
  const legacy = { muted: style("muted"), accent: style("accent") };
  assertEquals(registry.style("chart:axis", legacy)!("x"), "<muted>x</muted>");
  assertEquals(registry.style("chart:series-emphasis", legacy)!("x"), "<accent>x</accent>");
  assertEquals(registry.chain("chart:series-emphasis"), ["chart:series-emphasis", "chart:series-1", "accent"]);

  // Core tokens resolve as themselves — the compatibility profile is intact.
  assertEquals(registry.style("muted", legacy)!("x"), "<muted>x</muted>");
  assertEquals(registry.known().slice(0, 7), [
    "foreground",
    "muted",
    "accent",
    "success",
    "warning",
    "danger",
    "surface",
  ]);
});

Deno.test("declarations are strict: namespacing, collisions, unknown fallbacks", () => {
  const registry = createSemanticTokenRegistry();
  assertThrows(() => registry.declare("noNamespace" as `${string}:${string}`, { fallback: "muted" }), TypeError);
  assertThrows(
    () => registry.declare("chart:x", { fallback: "nope" as "muted" }),
    TypeError,
    'fallback "nope" is not a known token',
  );
  const once = registry.declare("chart:x", { fallback: "muted" });
  assertThrows(() => once.declare("chart:x", { fallback: "accent" }), TypeError, "already declared");

  // Declaring returns a NEW registry — the original stays narrow.
  assertEquals(registry.has("chart:x"), false);
  assertEquals(once.has("chart:x"), true);
});

Deno.test("type checking stays strict for unknown tokens", () => {
  const registry = createSemanticTokenRegistry().declare("log:error", { fallback: "danger" });
  // @ts-expect-error — "log:warn" was never declared on this registry.
  registry.style("log:warn", {});
  // @ts-expect-error — arbitrary names are not tokens.
  registry.chain("not-a-token");
  assert(registry.has("log:error"));
  assertEquals(registry.style("log:error", {}), undefined); // empty theme: undefined, never a throw
});
