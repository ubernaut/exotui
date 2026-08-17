import { assert, assertEquals, assertNotEquals } from "../deps.ts";
import { MemoryStore } from "../../mod.ts";
import {
  applyGlyphEdits,
  compositeGlyphFrame,
  createGlyphForgeController,
  glyphFloodFillEdits,
  glyphForgeFixtureProject,
  glyphFrameToAnsi,
  glyphLinePoints,
  glyphRectPoints,
  normalizeGlyphForgeState,
  normalizeGlyphProject,
} from "../../examples/showcases/glyph_forge/mod.ts";

Deno.test("glyph geometry helpers produce exact deterministic point sets", () => {
  assertEquals(glyphLinePoints(0, 0, 3, 0), [
    { column: 0, row: 0 },
    { column: 1, row: 0 },
    { column: 2, row: 0 },
    { column: 3, row: 0 },
  ]);
  const diagonal = glyphLinePoints(0, 0, 3, 3);
  assertEquals(diagonal.length, 4);
  assertEquals(diagonal.at(-1), { column: 3, row: 3 });

  const outline = glyphRectPoints(1, 1, 4, 3);
  assertEquals(outline.length, 10, "a 4x3 outline has 10 cells");
  const filled = glyphRectPoints(1, 1, 4, 3, true);
  assertEquals(filled.length, 12, "a 4x3 filled rect has 12 cells");
});

Deno.test("flood fill stays inside matching regions", () => {
  const project = glyphForgeFixtureProject();
  const layer = project.frames[0]!.layers[0]!;
  // The sky region and the ground band are distinct fill regions.
  const skyFill = glyphFloodFillEdits(
    layer,
    0,
    0,
    { char: "#", fg: 1, bg: 2 },
    project.columns,
    project.rows,
  );
  assert(skyFill.length > 0);
  const groundRows = new Set(
    glyphFloodFillEdits(layer, 0, project.rows - 1, { char: "#", fg: 1, bg: 2 }, project.columns, project.rows)
      .map((edit) => edit.row),
  );
  for (const row of groundRows) assert(row >= project.rows - 3, "ground fill never leaks into the sky");
});

Deno.test("compositing honors layer order and visibility", () => {
  const project = glyphForgeFixtureProject();
  const composite = compositeGlyphFrame(project, 0);
  // The title layer paints over the sky: the NOVA art cell wins.
  assertEquals(composite[5]![12]!.char, "█");

  const hidden = {
    ...project,
    frames: project.frames.map((frame, index) =>
      index === 0
        ? {
          ...frame,
          layers: frame.layers.map((layer) => layer.id === "title" ? { ...layer, visible: false } : layer),
        }
        : frame
    ),
  };
  const withoutTitle = compositeGlyphFrame(hidden, 0);
  assertNotEquals(withoutTitle[5]![12]!.char, "█", "hidden layers do not composite");
});

Deno.test("ANSI export emits truecolor runs and resets per row", () => {
  const project = glyphForgeFixtureProject();
  const ansi = glyphFrameToAnsi(project, 0);
  const lines = ansi.split("\n");
  assertEquals(lines.length, project.rows);
  assert(ansi.includes("\x1b[38;2;"), "truecolor foreground SGR present");
  assert(ansi.includes("\x1b[0m"), "rows reset");
  assertEquals(glyphFrameToAnsi(project, 0), ansi, "export is deterministic");
});

Deno.test("project normalization rejects malformed documents", () => {
  const fallback = glyphForgeFixtureProject;
  assertEquals(normalizeGlyphProject(undefined, fallback).name, "nova-starter");
  assertEquals(normalizeGlyphProject({ schemaVersion: 2 }, fallback).name, "nova-starter");
  const project = glyphForgeFixtureProject();
  const roundTripped = normalizeGlyphProject(JSON.parse(JSON.stringify(project)), fallback);
  assertEquals(roundTripped, project, "a valid project round-trips exactly");

  const state = normalizeGlyphForgeState({
    schemaVersion: 1,
    project,
    frameIndex: 99,
    layerIndex: -3,
    tool: "chainsaw",
    foreground: 999,
    background: -1,
    brushChar: "toolong",
  });
  assertEquals(state.frameIndex, project.frames.length - 1);
  assertEquals(state.layerIndex, 0);
  assertEquals(state.tool, "pencil");
  assertEquals(state.brushChar, "█");
});

Deno.test("a drag stroke is one atomic history unit", async () => {
  const controller = createGlyphForgeController();
  try {
    await controller.kernel.ready;
    const before = JSON.stringify(controller.project());
    controller.pointerDown(2, 2);
    controller.pointerDrag(3, 2);
    controller.pointerDrag(4, 2);
    controller.pointerDrag(5, 2);
    controller.pointerUp();
    const painted = compositeGlyphFrame(controller.project(), 0);
    assertEquals(painted[2]![5]!.char, "█", "the drag painted its cells");
    assertEquals(controller.historyDepth().undo, 1, "one stroke, one history entry");

    controller.undo();
    assertEquals(JSON.stringify(controller.project()), before, "undo restores the whole stroke");
    controller.redo();
    assertEquals(compositeGlyphFrame(controller.project(), 0)[2]![5]!.char, "█", "redo replays it");
  } finally {
    await controller.dispose();
  }
});

Deno.test("line and rect gestures preview live and commit atomically", async () => {
  const controller = createGlyphForgeController();
  try {
    await controller.kernel.ready;
    controller.setTool("line");
    controller.pointerDown(1, 1);
    controller.pointerDrag(6, 1);
    assert(controller.gesturePreview(), "gesture previews while dragging");
    const preview = controller.compositeWithPreview();
    assertEquals(preview[1]![4]!.char, "█", "the preview shows the pending line");
    assertEquals(controller.historyDepth().undo, 0, "nothing committed mid-gesture");
    controller.pointerUp();
    assertEquals(controller.gesturePreview(), undefined);
    assertEquals(controller.historyDepth().undo, 1);
    assertEquals(compositeGlyphFrame(controller.project(), 0)[1]![4]!.char, "█");
  } finally {
    await controller.dispose();
  }
});

Deno.test("locked layers refuse edits and eyedropper picks styles", async () => {
  const controller = createGlyphForgeController();
  try {
    await controller.kernel.ready;
    controller.toggleLayerLocked();
    const lockHistory = controller.historyDepth().undo;
    controller.pointerDown(2, 2);
    controller.pointerUp();
    assertEquals(controller.historyDepth().undo, lockHistory, "a locked layer takes no stroke");
    controller.toggleLayerLocked();

    controller.setTool("eyedropper");
    controller.pointerDown(12, 5);
    const state = controller.state();
    assertEquals(state.brushChar, "█");
    assertEquals(state.foreground, 11, "picked the title color");
  } finally {
    await controller.dispose();
  }
});

Deno.test("frame duplication, layer toggles, and eraser edits work end to end", async () => {
  const controller = createGlyphForgeController();
  try {
    await controller.kernel.ready;
    const frames = controller.project().frames.length;
    controller.duplicateFrame();
    assertEquals(controller.project().frames.length, frames + 1);
    assertEquals(controller.state().frameIndex, 1, "the duplicate is selected");

    controller.setTool("eraser");
    controller.pointerDown(12, 5);
    controller.pointerUp();
    const composite = compositeGlyphFrame(controller.project(), 1);
    assertNotEquals(composite[5]![12]?.char ?? " ", "█", "the eraser removed the title cell");

    controller.toggleLayerVisible();
    const frame = controller.project().frames[1]!;
    assertEquals(frame.layers[controller.state().layerIndex]!.visible, false);
  } finally {
    await controller.dispose();
  }
});

Deno.test("studio state persists through the kernel and survives a relaunch", async () => {
  const store = new MemoryStore<unknown>();
  const first = createGlyphForgeController({ store });
  await first.kernel.ready;
  first.pointerDown(1, 1);
  first.pointerDrag(2, 1);
  first.pointerUp();
  first.setTool("rect");
  first.setForeground(3);
  await first.dispose();

  const second = createGlyphForgeController({ store });
  try {
    await second.kernel.ready;
    assertEquals(second.state().tool, "rect");
    assertEquals(second.state().foreground, 3);
    assertEquals(compositeGlyphFrame(second.project(), 0)[1]![2]!.char, "█", "painted cells survive relaunch");
  } finally {
    await second.dispose();
  }
});

Deno.test("edits apply immutably and out-of-bounds points are ignored", () => {
  const project = glyphForgeFixtureProject();
  const layer = project.frames[0]!.layers[1]!;
  const next = applyGlyphEdits(
    layer,
    [
      { column: 0, row: 0, cell: { char: "x", fg: 1, bg: 0 } },
      { column: -5, row: 0, cell: { char: "x", fg: 1, bg: 0 } },
      { column: 0, row: 999, cell: { char: "x", fg: 1, bg: 0 } },
    ],
    project.columns,
    project.rows,
  );
  assertEquals(next.cells[0]![0]!.char, "x");
  assertEquals(layer.cells[0]![0], null, "the source layer is untouched");
});

Deno.test("the bundled figlet fonts cover the full requested charset", async (test) => {
  const { GLYPH_TEXT_FONTS, renderGlyphText } = await import(
    "../../examples/showcases/glyph_forge/text_font.ts"
  );
  const corpus = "abcdefghijklmnopqrstuvwxyz" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "0123456789" +
    "`~!@#$%^&*()-_=+[]\\{}|:\";'<>?,./";
  for (const font of GLYPH_TEXT_FONTS) {
    await test.step(font.id, () => {
      for (const char of corpus) {
        const glyph = font.glyphs.get(char);
        assert(glyph, `${font.id} has "${char}"`);
        assertEquals(glyph.length, font.height);
      }
      const rows = renderGlyphText(font, corpus, "kern");
      assertEquals(rows.length, font.height);
      assert(rows[0]!.length > corpus.length, "rendered art is wider than its input");
      assertEquals(renderGlyphText(font, corpus, "kern"), rows, "rendering is deterministic");
    });
  }
});

Deno.test("the text tool previews, stamps atomically, and undoes as one unit", async () => {
  const controller = createGlyphForgeController();
  try {
    await controller.kernel.ready;
    const before = JSON.stringify(controller.project());
    controller.setTool("text");
    controller.pointerDown(1, 6);
    controller.textEntryAppend("H");
    controller.textEntryAppend("i");
    assert(controller.textEntry(), "typing session is live");
    const preview = controller.compositeWithPreview();
    const previewInk = preview.flat().filter((cell) => cell !== null).length;
    assertEquals(controller.historyDepth().undo, 0, "nothing committed while typing");

    controller.textEntryCommit();
    assertEquals(controller.textEntry(), undefined);
    assertEquals(controller.historyDepth().undo, 1, "one stamp, one history entry");
    const committed = compositeGlyphFrame(controller.project(), 0).flat()
      .filter((cell) => cell !== null).length;
    assert(committed > 0 && previewInk >= committed, "the stamp landed");

    controller.undo();
    assertEquals(JSON.stringify(controller.project()), before, "undo removes the whole stamp");

    // Escape cancels without touching the document or history.
    controller.pointerDown(1, 6);
    controller.textEntryAppend("X");
    controller.textEntryCancel();
    assertEquals(JSON.stringify(controller.project()), before);
    assertEquals(controller.historyDepth().undo, 0);
  } finally {
    await controller.dispose();
  }
});

Deno.test("font cycling persists and typing respects layer locks", async () => {
  const store = new MemoryStore<unknown>();
  const first = createGlyphForgeController({ store });
  await first.kernel.ready;
  assertEquals(first.fontId(), "standard");
  first.cycleFont();
  assertEquals(first.fontId(), "small");
  await first.dispose();

  const second = createGlyphForgeController({ store });
  try {
    await second.kernel.ready;
    assertEquals(second.fontId(), "small", "the chosen font survives relaunch");

    second.setTool("text");
    second.toggleLayerLocked();
    const history = second.historyDepth().undo;
    second.pointerDown(1, 1);
    assertEquals(second.textEntry(), undefined, "a locked layer refuses a typing session");
    assertEquals(second.historyDepth().undo, history);
  } finally {
    await second.dispose();
  }
});

Deno.test("the font-pack loader ingests a directory and skips broken files", async () => {
  const { loadGlyphFontPack, glyphFontIdFromFileName, parseFigletFont } = await import(
    "../../examples/showcases/glyph_forge/text_font.ts"
  );
  assertEquals(glyphFontIdFromFileName("ANSI Shadow.flf"), "ansi-shadow");

  const directory = await Deno.makeTempDir({ prefix: "glyph-fonts-" });
  try {
    // A minimal valid 2-row font covering the required range.
    let font = "flf2a$ 2 2 4 -1 1\ntiny test font\n";
    for (let code = 32; code <= 126; code += 1) {
      const char = code === 32 ? " " : String.fromCharCode(code);
      font += `${char}@\n${char}@@\n`;
    }
    await Deno.writeTextFile(`${directory}/Tiny Test.flf`, font);
    await Deno.writeTextFile(`${directory}/Broken.flf`, "not a font at all\n");
    await Deno.writeTextFile(`${directory}/Zipped.tlf`, "PK\u0003\u0004junk");
    await Deno.writeTextFile(`${directory}/notes.txt`, "ignored");

    const pack = await loadGlyphFontPack(directory);
    assertEquals(pack.fonts.length, 1);
    assertEquals(pack.fonts[0]!.id, "tiny-test");
    assertEquals(pack.fonts[0]!.height, 2);
    assertEquals(pack.skipped.length, 2, "broken and zipped files are reported");

    // A BOM-prefixed header still parses (several corpus fonts ship one).
    const bom = parseFigletFont("bom", "bom", "\uFEFF" + font);
    assertEquals(bom.height, 2);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("pack fonts join the picker and unknown ids fall back gracefully", async () => {
  const { parseFigletFont } = await import("../../examples/showcases/glyph_forge/text_font.ts");
  let source = "flf2a$ 2 2 4 -1 1\nx\n";
  for (let code = 32; code <= 126; code += 1) {
    const char = code === 32 ? " " : String.fromCharCode(code);
    source += `${char}@\n${char}@@\n`;
  }
  const extra = parseFigletFont("extra-pack", "Extra Pack", source);
  const controller = createGlyphForgeController({ fonts: [extra] });
  try {
    await controller.kernel.ready;
    assertEquals(controller.fontPosition().total, 3, "bundled two plus the pack font");
    controller.cycleFont(-1);
    assertEquals(controller.fontId(), "extra-pack", "cycling reaches pack fonts");
    controller.setTool("text");
    controller.pointerDown(0, 0);
    controller.textEntryAppend("A");
    controller.textEntryCommit();
    assertEquals(compositeGlyphFrame(controller.project(), 0)[0]![0]!.char, "A");
  } finally {
    await controller.dispose();
  }
});
