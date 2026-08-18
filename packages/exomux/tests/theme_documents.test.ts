// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { EXOMUX_THEME_TOKEN_MAP, exomuxThemeDocument, exomuxThemeSpecFromDocument } from "../theme_documents.ts";
import {
  EXOMUX_THEMES,
  exomuxTheme,
  exomuxThemeCatalog,
  isExomuxUserTheme,
  registerExomuxTheme,
  unregisterExomuxTheme,
} from "../model.ts";
import { setThemeToken, themeEntry } from "@ubernaut/deno-tui/theme";

// Plan 042 slice E. Two shapes for the same thing: ten fields for the painter,
// named tokens for the person. The property that matters is that converting
// between them loses nothing, because the editor round-trips every theme the
// moment it is opened.

Deno.test("every built-in theme survives the round trip through a document", () => {
  for (const theme of EXOMUX_THEMES) {
    const document = exomuxThemeDocument(theme);
    const restored = exomuxThemeSpecFromDocument(theme.id, document, theme);
    for (const field of Object.keys(EXOMUX_THEME_TOKEN_MAP) as (keyof typeof EXOMUX_THEME_TOKEN_MAP)[]) {
      assertEquals(restored[field], theme[field], `${theme.id} lost its ${field}`);
    }
    assertEquals(restored.label, theme.label);
    assertEquals(document.name, theme.label);
  }
});

Deno.test("a document carries the finer controls the ten fields cannot say", () => {
  const miami = exomuxTheme("miami");
  const document = exomuxThemeDocument(miami);
  // Text on an accent fill was decided at paint time from the accent's
  // brightness; the document writes it down so it can be overruled.
  assertEquals(themeEntry(document, "chrome:on-accent")!.inherited, false);
  assertEquals(document.tokens["chrome:on-accent"], [255, 255, 255], "Miami's accent is dark, so the text is light");

  const restored = exomuxThemeSpecFromDocument("miami", document, miami);
  assert(restored.controls, "a theme from a document carries its control map");
  assertEquals(restored.controls!["chrome:on-accent"], [255, 255, 255]);
  // And every control resolves, including ones nobody set.
  assertEquals(restored.controls!["scrollbar:thumb"], miami.muted);
  assertEquals(restored.controls!["window:titlebar-background-active"], miami.accent);
});

Deno.test("editing one token in the document changes exactly one thing in the spec", () => {
  const midnight = exomuxTheme("midnight");
  const document = exomuxThemeDocument(midnight);
  const pink: [number, number, number] = [247, 101, 184];
  const edited = setThemeToken(document, "window:titlebar-background-active", pink);
  const spec = exomuxThemeSpecFromDocument("midnight", edited, midnight);

  assertEquals(spec.controls!["window:titlebar-background-active"], pink);
  // The ten fields are untouched: an active title bar is finer than any of them.
  for (const field of Object.keys(EXOMUX_THEME_TOKEN_MAP) as (keyof typeof EXOMUX_THEME_TOKEN_MAP)[]) {
    assertEquals(spec[field], midnight[field], `${field} should not have moved`);
  }
  // A sibling that inherits from the chrome tier is also untouched.
  assertEquals(spec.controls!["menu:background-selected"], midnight.accent);
});

Deno.test("a saved theme replaces the built-in it shares an id with, and giving it up restores it", () => {
  const miami = exomuxTheme("miami");
  const document = setThemeToken(exomuxThemeDocument(miami), "chrome:accent", [1, 2, 3]);
  const edited = exomuxThemeSpecFromDocument("miami", document, miami);
  try {
    registerExomuxTheme(edited);
    assertEquals(isExomuxUserTheme("miami"), true);
    assertEquals(exomuxTheme("miami").accent, [1, 2, 3]);
    assertEquals(
      exomuxThemeCatalog().filter((theme) => theme.id === "miami").length,
      1,
      "one entry, not two",
    );
    assertEquals(exomuxThemeCatalog().length, EXOMUX_THEMES.length, "and the catalog is the same size");
  } finally {
    unregisterExomuxTheme("miami");
  }
  assertEquals(exomuxTheme("miami").accent, miami.accent, "the shipped theme is back");
  assertEquals(isExomuxUserTheme("miami"), false);
});

Deno.test("a theme with an id of its own is appended to the catalog", () => {
  const mine = exomuxThemeSpecFromDocument(
    "mine",
    exomuxThemeDocument(exomuxTheme("matrix")),
    exomuxTheme("matrix"),
  );
  try {
    registerExomuxTheme(mine);
    assertEquals(exomuxThemeCatalog().length, EXOMUX_THEMES.length + 1);
    assertEquals(exomuxThemeCatalog().at(-1)!.id, "mine");
    assertEquals(exomuxTheme("mine").label, "Matrix Phosphor");
  } finally {
    unregisterExomuxTheme("mine");
  }
  assertEquals(exomuxTheme("mine").id, EXOMUX_THEMES[0]!.id, "an unknown id falls back to the first theme");
});
