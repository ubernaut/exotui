// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { MemoryThemeStorage, ThemeLibrary } from "@ubernaut/deno-tui";
import {
  createExomuxTerminalOptions,
  type ExomuxAppMountRef,
  exomuxGlobalConfigLayout,
  exomuxThemeEditorLayout,
  exomuxThemeEditorRows,
  exomuxThemeEditorScrollTop,
} from "../app.ts";
import { createExomuxController, EXOMUX_THEME_EDITOR_WINDOW_ID } from "../controller.ts";
import { EXOMUX_THEMES, exomuxTheme, exomuxThemeCatalog, unregisterExomuxTheme } from "../model.ts";
import { exomuxThemeDocument } from "../theme_documents.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

// Plan 042 slice E, and the acceptance test for the whole plan: open the
// editor on the theme that is showing, change a colour, watch the desktop
// change, save it, and have the saved theme be the one that comes back.

const BOUNDS = { column: 0, row: 0, width: 100, height: 34 };

function library() {
  return new ThemeLibrary({
    storage: new MemoryThemeStorage(),
    builtIns: EXOMUX_THEMES.map((theme) => exomuxThemeDocument(theme)),
  });
}

Deno.test("opening the editor on a preset starts a new theme based on it", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: library() });
  try {
    await controller.ready;
    controller.setTheme("miami");
    const before = controller.theme.peek();

    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek();
    assert(editor, "opening the window creates an editor");
    assertEquals(controller.themeEditorVisible.peek(), true);
    // A preset is never edited in place: opening it gives a copy, named so it
    // does not collide, based on exactly what was showing.
    assertEquals(editor!.document.peek().name, `${before.label} custom`);
    assertEquals(editor!.editingPreset(), false, "the copy is savable");
    assertEquals(editor!.dirty.peek(), true, "and it is unsaved from the moment it exists");
    for (const token of ["accent", "surface", "foreground"]) {
      assertEquals(editor!.document.peek().tokens[token], exomuxThemeDocument(before).tokens[token]);
    }

    // Change the active title bar. The desktop's theme moves with it.
    editor!.selectToken("window:titlebar-background-active");
    editor!.picker.setColor([247, 101, 184]);
    const live = controller.theme.peek();
    assertEquals(live.controls?.["window:titlebar-background-active"], [247, 101, 184]);
    assertEquals(live.accent, before.accent, "and nothing else moved");
    assert(controller.themeRevision.peek() > 0, "the desktop was told to repaint");
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("saving keeps the edit across a restart", async () => {
  const shared = library();
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: shared });
  let savedId: string | undefined;
  try {
    await controller.ready;
    controller.setTheme("miami");
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    editor.selectToken("chrome:accent");
    editor.picker.setColor([247, 101, 184]);
    assertEquals(await controller.saveThemeEditor(), true);
    savedId = controller.themeId.peek();
    assertEquals(savedId, "miami-neon-custom", "saved as the copy, never over the preset");
    assertEquals(controller.theme.peek().accent, [247, 101, 184]);

    // What a fresh launch would load.
    const entries = await shared.list();
    const saved = entries.find((entry) => entry.id === savedId)!;
    assertEquals(saved.editable, true);
    const document = await shared.load(savedId);
    assertEquals(document!.tokens["chrome:accent"], [247, 101, 184]);
    // And the preset it came from is untouched, on disk and in the catalog.
    assertEquals((await shared.load("miami-neon"))!.tokens["chrome:accent"], undefined);
    assertEquals(exomuxTheme("miami").accent, exomuxThemeCatalogAccent("miami"));
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    if (savedId) unregisterExomuxTheme(savedId);
    await controller.dispose();
  }
});

function exomuxThemeCatalogAccent(id: string) {
  return EXOMUX_THEMES.find((theme) => theme.id === id)!.accent;
}

Deno.test("the built-in theme is untouched on disk and comes back when the copy is dropped", async () => {
  const shared = library();
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: shared });
  try {
    await controller.ready;
    controller.setTheme("matrix");
    const original = exomuxTheme("matrix").accent;
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    editor.selectToken("chrome:accent");
    editor.picker.setColor([1, 2, 3]);
    await controller.saveThemeEditor();
    const savedId = controller.themeId.peek();
    assertEquals(exomuxTheme(savedId).accent, [1, 2, 3]);

    assertEquals(await shared.remove(savedId), true);
    unregisterExomuxTheme(savedId);
    assertEquals(exomuxTheme("matrix").accent, original, "the shipped theme was never overwritten");
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("the editor's rows list every control, marked for inheritance and readability", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: library() });
  try {
    await controller.ready;
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    const rows = exomuxThemeEditorRows(editor);
    assert(rows.some((row) => row.kind === "heading" && row.label === "Windows"));
    const titlebar = rows.find((row) => row.token === "window:titlebar-background-active")!;
    assertEquals(titlebar.kind, "token");
    assertEquals(titlebar.inherited, true, "it inherits until someone sets it");
    assert(titlebar.color, "and it still has a colour to show");

    editor.selectToken("window:titlebar-background-active");
    editor.picker.setColor([9, 9, 9]);
    const edited = exomuxThemeEditorRows(editor).find((row) => row.token === "window:titlebar-background-active")!;
    assertEquals(edited.inherited, false);
    assertEquals(edited.color, [9, 9, 9]);
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("the window lays out beside the list when wide and stacks when narrow", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: library() });
  try {
    await controller.ready;
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    const rows = exomuxThemeEditorRows(editor);
    const swatches = editor.picker.inspect().swatches.length;

    const wide = exomuxThemeEditorLayout({ column: 0, row: 0, width: 72, height: 30 }, rows, swatches);
    assertEquals(wide.stacked, false);
    assert(wide.axisRows[0]!.rect.column > wide.tokenListRect.column + wide.tokenListRect.width - 1);
    assertEquals(wide.saveRect.row, wide.closeRect.row, "the buttons share a row when there is room");

    const narrow = exomuxThemeEditorLayout({ column: 0, row: 0, width: 34, height: 24 }, rows, swatches);
    assertEquals(narrow.stacked, true);
    assert(narrow.axisRows[0]!.rect.row > narrow.tokenListRect.row, "the picker moves below the list");
    for (const layout of [wide, narrow]) {
      for (const row of [...layout.tokenRows.map((entry) => entry.rect), ...layout.axisRows.map((a) => a.rect)]) {
        assert(row.column + row.width <= layout.rect.column + layout.rect.width, "nothing overflows the window");
      }
    }
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("the token list scrolls to keep the selection visible", () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    kind: "token" as const,
    token: `t:${index}`,
    label: `token ${index}`,
  }));
  assertEquals(exomuxThemeEditorScrollTop(rows, "t:0", 10, 0), 0);
  assertEquals(exomuxThemeEditorScrollTop(rows, "t:20", 10, 0), 11, "it scrolls down to reach it");
  assertEquals(exomuxThemeEditorScrollTop(rows, "t:5", 10, 30), 5, "and back up");
  assertEquals(exomuxThemeEditorScrollTop(rows, "t:45", 10, 40), 40, "a visible selection does not move the view");
  assertEquals(exomuxThemeEditorScrollTop(rows, "nope", 10, 7), 0);
});

Deno.test("clicking a token row selects it and clicking Close puts the window away", async () => {
  const sessions = [session("theme-shell", "zsh", 0)];
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions, themeLibrary: library() });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headless } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headless, size: { columns: 100, rows: 34 } });
  try {
    await harness.pilot.settle();
    await controller.openThemeEditor(mount.current!.bodyRect.peek());
    await harness.pilot.settle();
    const window = mount.current!.windowProjection.peek().windows.find((entry) =>
      entry.id === EXOMUX_THEME_EDITOR_WINDOW_ID
    );
    assert(window, "the editor window is on screen");

    const editor = controller.themeEditor.peek()!;
    const rows = exomuxThemeEditorRows(editor);
    const layout = exomuxThemeEditorLayout(window!.clientRect, rows, editor.picker.inspect().swatches.length, 0);
    const target = layout.tokenRows.find((row) => row.token !== editor.token.peek() && row.token.includes(":"))!;
    await harness.pilot.click(target.rect.column + 4, target.rect.row);
    await harness.pilot.settle();
    assertEquals(editor.token.peek(), target.token, "the click chose that control");

    await harness.pilot.click(layout.closeRect.column + 1, layout.closeRect.row);
    await harness.pilot.settle();
    assertEquals(controller.themeEditorVisible.peek(), false);
  } finally {
    harness.destroy();
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

// User direction (Aug 18 2026): the editor lives under Settings, presets are
// read-only, and opening it starts a new theme based on the selected one.

Deno.test("a preset refuses to be saved over, and says why", async () => {
  const shared = library();
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: shared });
  try {
    await controller.ready;
    controller.setTheme("matrix");
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;

    // Rename it back onto the preset and saving is refused rather than
    // quietly shadowing the theme everyone else can get back to.
    editor.setName("Matrix Phosphor");
    assertEquals(editor.editingPreset(), true);
    assertEquals(await controller.saveThemeEditor(), false);
    assertStringIncludes(controller.status.peek(), "preset");
    assertEquals((await shared.load("matrix-phosphor"))!.tokens["chrome:accent"], undefined);

    // Under any other name it saves.
    editor.setName("Matrix Mine");
    assertEquals(await controller.saveThemeEditor(), true);
    assertEquals(controller.themeId.peek(), "matrix-mine");
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    unregisterExomuxTheme("matrix-mine");
    await controller.dispose();
  }
});

Deno.test("copy makes another theme, and delete removes only the saved one", async () => {
  const shared = library();
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: shared });
  try {
    await controller.ready;
    controller.setTheme("amber");
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    assertEquals(await controller.saveThemeEditor(), true);
    const first = controller.themeId.peek();

    assertEquals(await controller.duplicateEditedTheme(), true);
    const copyName = controller.themeEditor.peek()!.document.peek().name;
    assert(copyName !== "Amber Glass custom", `expected a fresh name, got ${copyName}`);
    assertEquals(await controller.saveThemeEditor(), true);
    const second = controller.themeId.peek();
    assert(second !== first, "the copy is its own theme");
    assertEquals((await shared.list()).filter((entry) => entry.editable).length, 2);

    // Delete takes the copy away and leaves the first alone.
    assertEquals(await controller.deleteEditedTheme(), true);
    const remaining = (await shared.list()).filter((entry) => entry.editable).map((entry) => entry.id);
    assertEquals(remaining, [first]);
    assertEquals(controller.themeEditor.peek(), undefined, "and closes the editor it was editing");
    unregisterExomuxTheme(first);
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("a saved theme is selectable from the settings theme list", async () => {
  const shared = library();
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: shared });
  try {
    await controller.ready;
    controller.setTheme("paper");
    await controller.openThemeEditor(BOUNDS);
    await controller.saveThemeEditor();
    const savedId = controller.themeId.peek();

    // The list every picker reads, and the cycle the keyboard drives, both
    // include it — a theme you cannot select is a theme you cannot use.
    const catalog = exomuxThemeCatalog();
    assertEquals(catalog.some((theme) => theme.id === savedId), true);
    controller.setTheme("midnight");
    const seen = new Set<string>();
    for (let step = 0; step < catalog.length; step += 1) seen.add(controller.cycleTheme().id);
    assertEquals(seen.has(savedId), true, "cycling reaches it");
    unregisterExomuxTheme(savedId);
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("the settings window carries the button that opens the editor", async () => {
  const sessions = [session("settings-shell", "zsh", 0)];
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions, themeLibrary: library() });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headless } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headless, size: { columns: 110, rows: 36 } });
  try {
    await harness.pilot.settle();
    controller.openGlobalConfig(mount.current!.bodyRect.peek());
    await harness.pilot.settle();
    const settings = mount.current!.windowProjection.peek().windows.find((entry) => entry.id === "settings")!;
    const themeIndex = 0;
    const layout = exomuxGlobalConfigLayout(settings.clientRect, themeIndex, 0);
    assert(layout.themeEditorRect.width >= 6, "the button has room in a roomy window");

    await harness.pilot.click(layout.themeEditorRect.column + 2, layout.themeEditorRect.row);
    await harness.pilot.settle();
    await controller.openThemeEditor(mount.current!.bodyRect.peek());
    assertEquals(controller.themeEditorVisible.peek(), true, "clicking it opens the editor");
  } finally {
    harness.destroy();
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("the theme can be renamed from its header, and not onto a preset", async () => {
  const shared = library();
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: shared });
  try {
    await controller.ready;
    controller.setTheme("midnight");
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    assertEquals(editor.document.peek().name, "Midnight Ops custom");

    assertEquals(controller.beginThemeRename(), true);
    assertEquals(controller.themeNameDraft.peek(), "Midnight Ops custom");
    for (let index = 0; index < 30; index += 1) controller.backspaceThemeName();
    for (const character of "Deep Sea") controller.appendThemeName(character);
    assertEquals(controller.commitThemeRename(), true);
    assertEquals(editor.document.peek().name, "Deep Sea");
    assertEquals(controller.themeNameDraft.peek(), undefined);
    assertEquals(await controller.saveThemeEditor(), true);
    assertEquals(controller.themeId.peek(), "deep-sea");

    // A preset's name is refused, and the draft stays up so it can be fixed.
    controller.beginThemeRename();
    for (let index = 0; index < 30; index += 1) controller.backspaceThemeName();
    for (const character of "Midnight Ops") controller.appendThemeName(character);
    assertEquals(controller.commitThemeRename(), false);
    assertStringIncludes(controller.status.peek(), "preset");
    assertEquals(editor.document.peek().name, "Deep Sea", "the name did not change");
    controller.cancelThemeRename();
    assertEquals(controller.themeNameDraft.peek(), undefined);
    unregisterExomuxTheme("deep-sea");
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});

Deno.test("a name is bounded and an empty one is simply abandoned", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: library() });
  try {
    await controller.ready;
    await controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    const original = editor.document.peek().name;

    controller.beginThemeRename();
    for (let index = 0; index < 60; index += 1) controller.appendThemeName("x");
    assertEquals(controller.themeNameDraft.peek()!.length, 48);

    controller.beginThemeRename();
    for (let index = 0; index < 60; index += 1) controller.backspaceThemeName();
    assertEquals(controller.commitThemeRename(), false);
    assertEquals(editor.document.peek().name, original, "an empty name is not a name");
    assertEquals(controller.themeNameDraft.peek(), undefined);
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    await controller.dispose();
  }
});
