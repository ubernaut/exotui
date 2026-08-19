// Copyright 2023 Im-Beast. MIT license.

// Field report (Aug 19): "deleting a custom theme does not remove it from the
// list". It did delete it. The editor's live preview registers under its own id
// but carries the edited document's NAME as its label, and the settings list
// painted every catalog entry — so after deleting "Miami Neon custom" a second
// entry reading "Miami Neon custom" was still sitting there.

import { assert, assertEquals } from "./deps.ts";
import { MemoryThemeStorage, ThemeLibrary } from "@ubernaut/deno-tui";
import { createExomuxController, EXOMUX_THEME_EDITOR_PREVIEW_ID } from "../controller.ts";
import { EXOMUX_THEMES, exomuxSelectableThemes, exomuxTheme, exomuxThemeCatalog } from "../model.ts";
import { exomuxThemeDocument } from "../theme_documents.ts";
import { FakeExomuxClient } from "./fakes.ts";

function library() {
  return new ThemeLibrary({
    storage: new MemoryThemeStorage(),
    builtIns: EXOMUX_THEMES.map((theme) => exomuxThemeDocument(theme)),
  });
}

const custom = (themes: readonly { id: string }[]) =>
  themes.map((theme) => theme.id).filter((id) => !EXOMUX_THEMES.some((builtIn) => builtIn.id === id));

Deno.test("a deleted theme leaves nothing behind in the list", async () => {
  const controller = await createExomuxController({
    client: new FakeExomuxClient([]),
    initialSessions: [],
    themeLibrary: library(),
  });
  try {
    await controller.ready;
    controller.setTheme("miami");
    await controller.openThemeEditor();
    assertEquals(await controller.saveThemeEditor(), true);

    const savedId = controller.themeId.peek();
    assert(custom(exomuxSelectableThemes()).includes(savedId), "the saved theme is offered");

    assertEquals(await controller.deleteTheme(savedId), true);
    assertEquals(
      custom(exomuxSelectableThemes()),
      [],
      "nothing user-made is left in the list — including anything wearing the deleted theme's name",
    );
  } finally {
    controller.dispose?.();
  }
});

Deno.test("the editor's preview paints but is never offered as a choice", async () => {
  const controller = await createExomuxController({
    client: new FakeExomuxClient([]),
    initialSessions: [],
    themeLibrary: library(),
  });
  try {
    await controller.ready;
    controller.setTheme("miami");
    await controller.openThemeEditor();

    // It has to resolve, or the desktop cannot show what you are editing...
    assert(
      exomuxThemeCatalog().some((theme) => theme.id === EXOMUX_THEME_EDITOR_PREVIEW_ID),
      "the preview resolves for painting",
    );
    // ...and it must not be selectable, because its label is the document's
    // name and a second entry with that name is indistinguishable from the real
    // theme.
    assertEquals(
      exomuxSelectableThemes().filter((theme) => theme.id === EXOMUX_THEME_EDITOR_PREVIEW_ID),
      [],
      "the preview is not one of the themes you can pick",
    );
    assertEquals(exomuxTheme(EXOMUX_THEME_EDITOR_PREVIEW_ID).id, EXOMUX_THEME_EDITOR_PREVIEW_ID);
  } finally {
    controller.dispose?.();
  }
});
