// Copyright 2023 Im-Beast. MIT license.

// THEM-003: cycles and unsupported functions fail during compilation, not
// during render.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { type ColorExpression, compileThemeExpressions, ThemeExpressionError } from "../mod.ts";

const BASE = {
  accent: [30, 200, 180],
  surface: [10, 20, 30],
} as const;

Deno.test("reference, mix, alpha, lighten, darken evaluate exactly", () => {
  const compiled = compileThemeExpressions(BASE, {
    "chart:line": { op: "ref", token: "accent" },
    "chart:half": { op: "mix", a: { op: "ref", token: "accent" }, b: { op: "ref", token: "surface" }, t: 0.5 },
    "chart:glow": {
      op: "alpha",
      value: { op: "ref", token: "accent" },
      over: { op: "ref", token: "surface" },
      alpha: 0.25,
    },
    "chart:bright": { op: "lighten", value: { op: "color", rgb: [100, 100, 100] }, amount: 0.5 },
    "chart:dim": { op: "darken", value: { op: "color", rgb: [100, 100, 100] }, amount: 0.5 },
  });
  assertEquals(compiled.evaluate("chart:line", "truecolor"), [30, 200, 180]);
  assertEquals(compiled.evaluate("chart:half", "truecolor"), [20, 110, 105]);
  assertEquals(compiled.evaluate("chart:glow", "truecolor"), [15, 65, 68]); // 25% accent over surface
  assertEquals(compiled.evaluate("chart:bright", "truecolor"), [178, 178, 178]);
  assertEquals(compiled.evaluate("chart:dim", "truecolor"), [50, 50, 50]);
  assertEquals(compiled.evaluate("accent", "ansi16"), [30, 200, 180]); // base passes through
});

Deno.test("depth conditionals pick the declared variant with fallthrough", () => {
  const compiled = compileThemeExpressions(BASE, {
    "status:ok": {
      op: "depth",
      truecolor: { op: "color", rgb: [0, 255, 128] },
      ansi256: { op: "color", rgb: [0, 215, 135] },
      ansi16: { op: "color", rgb: [0, 128, 0] },
    },
    "status:fallthrough": { op: "depth", truecolor: { op: "color", rgb: [1, 2, 3] } },
  });
  assertEquals(compiled.evaluate("status:ok", "truecolor"), [0, 255, 128]);
  assertEquals(compiled.evaluate("status:ok", "ansi256"), [0, 215, 135]);
  assertEquals(compiled.evaluate("status:ok", "ansi16"), [0, 128, 0]);
  assertEquals(compiled.evaluate("status:fallthrough", "ansi16"), [1, 2, 3]);
});

Deno.test("cycles, unknown refs, and unsupported functions fail at compile", () => {
  const cycleError = assertThrows(
    () =>
      compileThemeExpressions(BASE, {
        "a:x": { op: "ref", token: "b:y" },
        "b:y": { op: "ref", token: "a:x" },
      }),
    ThemeExpressionError,
  );
  assert(cycleError.message.includes("cycle"));

  assertThrows(
    () => compileThemeExpressions(BASE, { "bad:ref": { op: "ref", token: "ghost" } }),
    ThemeExpressionError,
    'unknown token "ghost"',
  );

  assertThrows(
    () =>
      compileThemeExpressions(BASE, {
        "bad:fn": { op: "saturate", value: { op: "color", rgb: [0, 0, 0] } } as unknown as ColorExpression,
      }),
    ThemeExpressionError,
    'unsupported function "saturate"',
  );

  // Compiled themes are total: evaluation never throws, even off-catalog.
  const compiled = compileThemeExpressions(BASE, {});
  assertEquals(compiled.evaluate("never-declared", "truecolor"), [0, 0, 0]);
});
