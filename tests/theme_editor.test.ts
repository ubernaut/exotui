// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertRejects } from "./deps.ts";
import { MemoryThemeStorage, themeDocumentId, ThemeEditorController, ThemeLibrary } from "../src/app/theme_editor.ts";
import { createThemeDocument, formatHexColor, themeEntry } from "../src/theme_editor_model.ts";
import type { ThemeDocument } from "../src/theme_interchange.ts";
import type { Rgb } from "../src/theme_expressions.ts";

// Plan 042 slice D. The controller owns a document, a selection and a picker,
// and derives everything else. These tests exist to prove there is exactly one
// copy of each colour: move the picker, and the document moves.

const MIAMI = () =>
  createThemeDocument("Miami Neon", {
    foreground: [10, 45, 70],
    muted: [98, 204, 144],
    accent: [198, 24, 118],
    success: [8, 124, 76],
    warning: [163, 96, 0],
    danger: [186, 16, 44],
    surface: [240, 255, 254],
  });

const PINK: Rgb = [247, 101, 184];

Deno.test("moving the picker moves the document, and only the selected token", () => {
  const applied: ThemeDocument[] = [];
  const editor = new ThemeEditorController({ document: MIAMI(), onApply: (document) => applied.push(document) });
  try {
    assertEquals(editor.selectToken("window:titlebar-background-active"), true);
    assertEquals(editor.color(), [198, 24, 118], "it starts on the colour the token already paints with");
    assertEquals(editor.dirty.peek(), false, "selecting is not editing");
    assertEquals(applied.length, 0);

    editor.picker.setColor(PINK);
    assertEquals(editor.document.peek().tokens["window:titlebar-background-active"], PINK);
    assertEquals(editor.dirty.peek(), true);
    assertEquals(applied.at(-1)!.tokens["window:titlebar-background-active"], PINK, "the host saw it live");
    // A sibling that inherits from the chrome tier is untouched.
    assertEquals(themeEntry(editor.document.peek(), "menu:background-selected")!.color, [198, 24, 118]);
  } finally {
    editor.dispose();
  }
});

Deno.test("a new colour immediately becomes reusable", () => {
  const editor = new ThemeEditorController({ document: MIAMI() });
  try {
    editor.selectToken("window:border-active");
    editor.picker.setColor(PINK);
    const swatch = editor.picker.inspect().swatches.find((entry) => entry.hex === formatHexColor(PINK));
    assert(swatch, "the colour just chosen is offered for the next token");

    // And picking it for another token is one call, landing on the same value.
    editor.selectToken("menu:background-selected");
    const index = editor.picker.inspect().swatches.findIndex((entry) => entry.hex === formatHexColor(PINK));
    assertEquals(editor.picker.selectSwatch(index), true);
    assertEquals(editor.document.peek().tokens["menu:background-selected"], PINK);
  } finally {
    editor.dispose();
  }
});

Deno.test("clearing returns a token to what it inherits", () => {
  const editor = new ThemeEditorController({ document: MIAMI() });
  try {
    editor.selectToken("button:background-active");
    editor.picker.setColor(PINK);
    assertEquals(themeEntry(editor.document.peek(), "button:background-active")!.inherited, false);

    assertEquals(editor.clearToken(), true);
    const entry = themeEntry(editor.document.peek(), "button:background-active")!;
    assertEquals(entry.inherited, true);
    assertEquals(entry.color, [198, 24, 118]);
    assertEquals(editor.color(), [198, 24, 118], "and the picker followed it back");
    assertEquals(editor.clearToken(), false, "clearing what is already inherited does nothing");
  } finally {
    editor.dispose();
  }
});

Deno.test("the inspection reports the selected pair's contrast and the theme's failures", () => {
  const editor = new ThemeEditorController({ document: MIAMI() });
  try {
    editor.selectToken("chrome:on-accent");
    const before = editor.inspect();
    assert(before.contrast > 4.5, "the shipped theme reads");

    // Choose something unreadable and the editor says so straight away.
    editor.picker.setColor([200, 40, 130]);
    const after = editor.inspect();
    assert(after.contrast < 4.5, `expected an unreadable pair, measured ${after.contrast}`);
    assert(
      after.failures.some((verdict) => verdict.token === "chrome:on-accent"),
      "and lists it among the failures",
    );
  } finally {
    editor.dispose();
  }
});

Deno.test("revert throws away every change since the last save", () => {
  const editor = new ThemeEditorController({ document: MIAMI() });
  try {
    editor.selectToken("chrome:accent");
    editor.picker.setColor(PINK);
    editor.setName("Mine");
    assertEquals(editor.dirty.peek(), true);

    editor.revert();
    assertEquals(editor.document.peek().name, "Miami Neon");
    assertEquals(editor.document.peek().tokens["chrome:accent"], undefined);
    assertEquals(editor.dirty.peek(), false);
  } finally {
    editor.dispose();
  }
});

Deno.test("a preset is read-only, and saving under another name works", async () => {
  const storage = new MemoryThemeStorage();
  const library = new ThemeLibrary({ storage, builtIns: [MIAMI()] });
  const editor = new ThemeEditorController({ document: MIAMI(), library });
  try {
    editor.selectToken("chrome:accent");
    editor.picker.setColor(PINK);
    assertEquals(editor.dirty.peek(), true);

    // Presets are the floor everyone can get back to (user direction, Aug 18):
    // saving over one is refused rather than shadowing it.
    assertEquals(editor.editingPreset(), true);
    assertEquals(await editor.save(), undefined);
    assertEquals(editor.dirty.peek(), true, "and it stays unsaved, so nothing is lost quietly");
    assertEquals((await library.load("miami-neon"))!.tokens["chrome:accent"], undefined);
    await assertRejects(() => library.save(editor.document.peek()), TypeError, "preset");

    // Under any other name it saves, and reloading gets the edit back.
    editor.setName("Miami Mine");
    assertEquals(editor.editingPreset(), false);
    assertEquals(await editor.save(), "miami-mine");
    assertEquals(editor.dirty.peek(), false);
    assertEquals((await library.load("miami-mine"))!.tokens["chrome:accent"], PINK);
    const entries = await library.list();
    assertEquals(entries.find((entry) => entry.id === "miami-neon")!.editable, false, "the preset stays read-only");
    assertEquals(entries.find((entry) => entry.id === "miami-mine")!.editable, true);
  } finally {
    editor.dispose();
  }
});

Deno.test("a free name is found rather than colliding", async () => {
  const storage = new MemoryThemeStorage();
  const library = new ThemeLibrary({ storage, builtIns: [MIAMI()] });
  assertEquals(await library.uniqueName("Miami Neon"), "Miami Neon 2", "a preset's name is taken");
  assertEquals(await library.uniqueName("Something Else"), "Something Else");
  await library.save({ ...MIAMI(), name: "Miami Neon 2" });
  assertEquals(await library.uniqueName("Miami Neon"), "Miami Neon 3");
});

Deno.test("duplicating edits the copy and leaves the original saved theme alone", async () => {
  const storage = new MemoryThemeStorage();
  const library = new ThemeLibrary({ storage, builtIns: [MIAMI()] });
  const editor = new ThemeEditorController({ document: MIAMI(), library });
  try {
    editor.duplicate("Miami Mine");
    assertEquals(editor.document.peek().name, "Miami Mine");
    assertEquals(editor.dirty.peek(), true, "a copy that has never been saved is unsaved");
    editor.selectToken("chrome:accent");
    editor.picker.setColor(PINK);
    assertEquals(await editor.save(), "miami-mine");

    const original = await library.load("miami-neon");
    assertEquals(original!.tokens["chrome:accent"], undefined, "the built-in is untouched");
    const names = (await library.list()).map((entry) => entry.name);
    assertEquals(names.includes("Miami Neon"), true);
    assertEquals(names.includes("Miami Mine"), true);
  } finally {
    editor.dispose();
  }
});

Deno.test("the library skips a corrupt file rather than failing the whole list", async () => {
  const storage = new MemoryThemeStorage();
  await storage.write("broken", "{ not json");
  await storage.write("good", JSON.stringify({ version: 2, name: "Good", tokens: { accent: [1, 2, 3] } }));
  const library = new ThemeLibrary({ storage });
  assertEquals((await library.list()).map((entry) => entry.id), ["good"]);
  assertEquals(await library.load("broken"), undefined);
  assertEquals(await library.remove("nothing-here"), false);
  assertEquals(await library.remove("good"), true);
  assertEquals((await library.list()).length, 0);
});

Deno.test("theme ids are filename-safe and stable", () => {
  assertEquals(themeDocumentId("Miami Neon"), "miami-neon");
  assertEquals(themeDocumentId("  T2 / Neural Steel!  "), "t2-neural-steel");
  assertEquals(themeDocumentId("../../etc/passwd"), "etc-passwd");
  assertEquals(themeDocumentId("???"), "theme");
  assertEquals(themeDocumentId("x".repeat(200)).length, 48);
});
