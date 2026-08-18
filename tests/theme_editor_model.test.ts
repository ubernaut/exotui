// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import type { Rgb } from "../src/theme_expressions.ts";
import {
  clearThemeToken,
  createThemeDocument,
  duplicateThemeDocument,
  formatHexColor,
  missingCoreTokens,
  parseHexColor,
  renameThemeDocument,
  setThemeToken,
  THEME_CONTRAST_AA,
  themeContrastFailures,
  themeContrastReport,
  themeDocumentIsComplete,
  themeEditorGroups,
  themeEntry,
  themeOverrides,
  themeSwatches,
} from "../src/theme_editor_model.ts";

// Plan 042 slice B. The document is the only state; everything else here is a
// view of it. The contrast report exists because of a real failure: a palette
// picked by eye put a bright hot pink on a near-white ground, which measures
// 2.7:1 and is unreadable — the kind of thing you notice after shipping.

const MIDNIGHT: Readonly<Record<string, Rgb>> = Object.freeze({
  foreground: [224, 235, 246],
  muted: [132, 154, 178],
  accent: [76, 201, 240],
  success: [73, 209, 125],
  warning: [244, 190, 72],
  danger: [244, 104, 110],
  surface: [14, 21, 34],
});

const base = () => createThemeDocument("Midnight", MIDNIGHT);

Deno.test("hex round-trips, and half-typed input is not a colour", () => {
  assertEquals(formatHexColor([247, 101, 184]), "#f765b8");
  assertEquals(parseHexColor("#F765B8"), [247, 101, 184]);
  assertEquals(parseHexColor("f765b8"), [247, 101, 184]);
  assertEquals(parseHexColor("#abc"), [170, 187, 204]);
  for (const bad of ["", "#", "#12", "#12345", "#gggggg", "rebeccapurple", "#1234567"]) {
    assertEquals(parseHexColor(bad), undefined, `"${bad}" is not a colour`);
  }
  // Out-of-range channels are clamped rather than emitted as broken hex.
  assertEquals(formatHexColor([-20, 300, 12.6]), "#00ff0d");
});

Deno.test("a new document carries the seven core colours and resolves everything", () => {
  const document = base();
  assertEquals(document.name, "Midnight");
  assertEquals(Object.keys(document.tokens).sort(), [
    "accent",
    "danger",
    "foreground",
    "muted",
    "success",
    "surface",
    "warning",
  ]);
  assertEquals(themeDocumentIsComplete(document), true);
  assertEquals(missingCoreTokens(document), []);
  for (const group of themeEditorGroups(document)) {
    assert(group.entries.length > 0, `${group.id} resolved nothing`);
    for (const entry of group.entries) assert(entry.color, `${entry.token.name} has no colour`);
  }
});

Deno.test("an entry says where its colour came from", () => {
  const document = base();
  const inherited = themeEntry(document, "window:titlebar-background-active")!;
  assertEquals(inherited.color, MIDNIGHT.accent);
  assertEquals(inherited.source, "accent", "it inherited through the chrome tier");
  assertEquals(inherited.inherited, true);

  const pink: Rgb = [247, 101, 184];
  const edited = setThemeToken(document, "window:titlebar-background-active", pink);
  const own = themeEntry(edited, "window:titlebar-background-active")!;
  assertEquals(own.color, pink);
  assertEquals(own.source, "window:titlebar-background-active");
  assertEquals(own.inherited, false, "a token the document sets is not inherited");
  // Setting one token leaves its siblings alone.
  assertEquals(themeEntry(edited, "menu:background-selected")!.color, MIDNIGHT.accent);
});

Deno.test("clearing a token restores inheritance, and a core token cannot be cleared", () => {
  const pink: Rgb = [247, 101, 184];
  const edited = setThemeToken(base(), "button:background-active", pink);
  assertEquals(themeEntry(edited, "button:background-active")!.inherited, false);

  const cleared = clearThemeToken(edited, "button:background-active");
  const entry = themeEntry(cleared, "button:background-active")!;
  assertEquals(entry.color, MIDNIGHT.accent);
  assertEquals(entry.inherited, true);
  assertEquals("button:background-active" in cleared.tokens, false);

  // Something has to be at the end of every chain.
  const core = clearThemeToken(cleared, "accent");
  assertEquals(core.tokens.accent, MIDNIGHT.accent);
  assertEquals(themeDocumentIsComplete(core), true);
  // Clearing what is not set changes nothing at all.
  assertEquals(clearThemeToken(cleared, "menu:border"), cleared);
});

Deno.test("swatches dedupe by colour, count their uses, and lead with the most used", () => {
  const swatches = themeSwatches(base());
  const hexes = swatches.map((swatch) => swatch.hex);
  assertEquals(new Set(hexes).size, hexes.length, "a colour appears once");
  assertEquals(hexes.includes(formatHexColor(MIDNIGHT.accent!)), true);
  for (let index = 1; index < swatches.length; index += 1) {
    assert(swatches[index - 1]!.uses >= swatches[index]!.uses, "ordered by use, descending");
  }
  // The surface is the ground of nearly every control, so it leads.
  assertEquals(swatches[0]!.hex, formatHexColor(MIDNIGHT.surface!));
  assert(swatches[0]!.tokens.includes("surface"));

  // A colour introduced by one override becomes its own swatch.
  const pink: Rgb = [247, 101, 184];
  const edited = setThemeToken(base(), "window:border-active", pink);
  const swatch = themeSwatches(edited).find((entry) => entry.hex === "#f765b8");
  assert(swatch, "the new colour is offered for reuse");
  assertEquals(swatch!.tokens, ["window:border-active"]);
});

Deno.test("the contrast report catches the pair that a palette picked by eye gets wrong", () => {
  // A light theme with the neon accent used as text: exactly the Miami mistake.
  const light = createThemeDocument("Miami by eye", {
    foreground: [10, 45, 70],
    muted: [98, 204, 144],
    accent: [247, 101, 184],
    success: [8, 124, 76],
    warning: [163, 96, 0],
    danger: [186, 16, 44],
    surface: [240, 255, 254],
  });
  const failures = themeContrastFailures(light);
  const failed = failures.map((verdict) => verdict.token);
  assert(
    failed.includes("chrome:on-accent"),
    `expected the accent pair to fail, got ${failed.join(", ") || "nothing"}`,
  );
  const worst = failures[0]!;
  assert(worst.ratio < THEME_CONTRAST_AA, "the worst offender is below AA");
  assert(worst.ratio <= failures.at(-1)!.ratio, "worst first");

  // Every verdict names both sides and is reproducible from them.
  for (const verdict of themeContrastReport(light)) {
    assert(verdict.against.length > 0);
    assertEquals(verdict.passes, verdict.ratio + 1e-9 >= verdict.required);
  }

  // And the fix is checkable rather than a guess: white on that pink is
  // 2.8:1 and still fails, black is 7.5:1 and passes. Which is exactly the
  // question an editor should answer for you.
  assertEquals(
    themeContrastFailures(setThemeToken(light, "chrome:on-accent", [255, 255, 255]))
      .some((verdict) => verdict.token === "chrome:on-accent"),
    true,
  );
  const readable = setThemeToken(light, "chrome:on-accent", [0, 0, 0]);
  assertEquals(
    themeContrastFailures(readable).some((verdict) => verdict.token === "chrome:on-accent"),
    false,
  );
});

Deno.test("overrides list what the user changed, in vocabulary order", () => {
  const document = setThemeToken(
    setThemeToken(base(), "menu:border", [1, 2, 3]),
    "chrome:accent",
    [4, 5, 6],
  );
  const overrides = themeOverrides(document);
  assertEquals(overrides.slice(0, 7), [
    "foreground",
    "muted",
    "accent",
    "success",
    "warning",
    "danger",
    "surface",
  ]);
  assertEquals(overrides.indexOf("chrome:accent") < overrides.indexOf("menu:border"), true);
});

Deno.test("rename and duplicate leave the original alone", () => {
  const document = setThemeToken(base(), "chrome:accent", [1, 2, 3]);
  const renamed = renameThemeDocument(document, "Mine");
  assertEquals(renamed.name, "Mine");
  assertEquals(document.name, "Midnight", "the original is untouched");
  assertEquals(renamed.tokens["chrome:accent"], [1, 2, 3]);

  const copy = duplicateThemeDocument(document, "Copy");
  assertEquals(copy.name, "Copy");
  const edited = setThemeToken(copy, "chrome:accent", [9, 9, 9]);
  assertEquals(document.tokens["chrome:accent"], [1, 2, 3], "editing the copy does not reach the original");
  assertEquals(edited.tokens["chrome:accent"], [9, 9, 9]);
});

Deno.test("an incomplete document is reported rather than silently half-painting", () => {
  const partial = createThemeDocument("Partial", { foreground: [1, 1, 1], surface: [2, 2, 2] });
  assertEquals(themeDocumentIsComplete(partial), false);
  assertEquals(missingCoreTokens(partial), ["muted", "accent", "success", "warning", "danger"]);
  // What it CAN resolve still resolves; the rest is simply absent.
  const groups = themeEditorGroups(partial);
  const chrome = groups.find((group) => group.id === "chrome")!;
  assert(chrome.entries.some((entry) => entry.token.name === "chrome:foreground"));
  assertEquals(chrome.entries.some((entry) => entry.token.name === "chrome:accent"), false);
});
