// Copyright 2023 Im-Beast. MIT license.

// THEM-002: theme validation identifies every missing token with component
// and state provenance.

import { assert, assertEquals } from "./deps.ts";
import {
  type ComponentTokenSchema,
  createSemanticTokenRegistry,
  resolveComponentToken,
  type Style,
  validateThemeTokenCoverage,
} from "../mod.ts";

const style = (tag: string): Style => (text) => `<${tag}>${text}</${tag}>`;

const registry = createSemanticTokenRegistry()
  .declare("button:bg", { fallback: "surface" })
  .declare("button:label", { fallback: "foreground" });

const BUTTON: ComponentTokenSchema = {
  component: "Button",
  required: [
    { token: "button:bg", states: ["base", "focused", "active"] },
    { token: "button:label" },
  ],
  optional: [{ token: "accent" }],
  defaults: { "button:label": style("default-label") },
};

const GAUGE: ComponentTokenSchema = {
  component: "Gauge",
  required: [{ token: "gauge:fill" }], // never declared in the registry
};

Deno.test("full coverage validates cleanly through fallback chains", () => {
  const theme = {
    base: { surface: style("surface"), foreground: style("fg"), accent: style("accent") },
    focused: { "button:bg": style("bg-focused") },
    active: { "button:bg": style("bg-active") },
  };
  const report = validateThemeTokenCoverage(theme, [BUTTON], registry);
  assert(report.complete);
  assertEquals(report.issues, []);
  assertEquals(report.checkedCells, 5); // 3 bg states + label + optional accent
});

Deno.test("gaps carry component, token, and state provenance", () => {
  const theme = {
    base: { surface: style("surface") }, // no foreground, no accent
    focused: {}, // focused/active fall back to base → still covered for bg
  };
  const report = validateThemeTokenCoverage(theme, [BUTTON, GAUGE], registry);
  assert(!report.complete);
  assertEquals(report.issues, [
    // label missing from theme but covered by the component default:
    { component: "Button", token: "button:label", state: "base", level: "default-applied" },
    { component: "Button", token: "accent", state: "base", level: "missing-optional" },
    // an unregistered token is a hard miss with provenance:
    { component: "Gauge", token: "gauge:fill", state: "base", level: "missing-required" },
  ]);
});

Deno.test("resolution prefers state, then base chain, then component default", () => {
  const theme = {
    base: { surface: style("surface"), foreground: style("fg") },
    focused: { "button:bg": style("bg-focused") },
  };
  assertEquals(
    resolveComponentToken(BUTTON, registry, theme, "button:bg", "focused")!("x"),
    "<bg-focused>x</bg-focused>",
  );
  assertEquals(resolveComponentToken(BUTTON, registry, theme, "button:bg", "active")!("x"), "<surface>x</surface>");
  assertEquals(resolveComponentToken(BUTTON, registry, theme, "button:label")!("x"), "<fg>x</fg>");
  const bare = { base: {} };
  assertEquals(resolveComponentToken(BUTTON, registry, bare, "button:label")!("x"), "<default-label>x</default-label>");
  assertEquals(resolveComponentToken(BUTTON, registry, bare, "button:bg"), undefined);
});
