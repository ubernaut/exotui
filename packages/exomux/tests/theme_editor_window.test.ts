// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { MemoryThemeStorage, ThemeLibrary } from "@ubernaut/deno-tui";
import {
  createExomuxTerminalOptions,
  type ExomuxAppMountRef,
  exomuxThemeEditorLayout,
  exomuxThemeEditorRows,
  exomuxThemeEditorScrollTop,
} from "../app.ts";
import { createExomuxController, EXOMUX_THEME_EDITOR_WINDOW_ID } from "../controller.ts";
import { EXOMUX_THEMES, exomuxTheme, unregisterExomuxTheme } from "../model.ts";
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

Deno.test("the editor opens on the live theme and edits it in place", async () => {
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: library() });
  try {
    await controller.ready;
    controller.setTheme("miami");
    const before = controller.theme.peek();

    controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek();
    assert(editor, "opening the window creates an editor");
    assertEquals(controller.themeEditorVisible.peek(), true);
    assertEquals(editor!.document.peek().name, before.label, "on the theme that was showing");

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
    controller.openThemeEditor(BOUNDS);
    const editor = controller.themeEditor.peek()!;
    editor.selectToken("chrome:accent");
    editor.picker.setColor([247, 101, 184]);
    assertEquals(await controller.saveThemeEditor(), true);
    savedId = controller.themeId.peek();
    assertEquals(savedId, "miami-neon", "saved under the name it was opened with");
    assertEquals(controller.theme.peek().accent, [247, 101, 184]);

    // What a fresh launch would load.
    const entries = await shared.list();
    const saved = entries.find((entry) => entry.id === "miami-neon")!;
    assertEquals(saved.editable, true);
    const document = await shared.load("miami-neon");
    assertEquals(document!.tokens["chrome:accent"], [247, 101, 184]);
  } finally {
    unregisterExomuxTheme("theme-editor-preview");
    if (savedId) unregisterExomuxTheme(savedId);
    await controller.dispose();
  }
});

Deno.test("the built-in theme is untouched on disk and comes back when the copy is dropped", async () => {
  const shared = library();
  const client = new FakeExomuxClient([]);
  const controller = await createExomuxController({ client, initialSessions: [], themeLibrary: shared });
  try {
    await controller.ready;
    controller.setTheme("matrix");
    const original = exomuxTheme("matrix").accent;
    controller.openThemeEditor(BOUNDS);
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
    controller.openThemeEditor(BOUNDS);
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
    controller.openThemeEditor(BOUNDS);
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
    controller.openThemeEditor(mount.current!.bodyRect.peek());
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
