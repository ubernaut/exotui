// Copyright 2023 Im-Beast. MIT license.

// 036 R1: styled scrollback snapshots and streaming off-screen
// surfaces for Markdown, code, and process output.

import { assert, assertEquals } from "./deps.ts";
import {
  createCodeSurfaceWriter,
  createMarkdownSurfaceWriter,
  createPatternHighlighter,
  createProcessOutputWriter,
  OffscreenSurface,
  TerminalScreenController,
} from "../mod.ts";

Deno.test("the surface bounds history and snapshots report what was dropped", () => {
  const surface = new OffscreenSurface({ maxLines: 3 });
  for (let index = 0; index < 5; index += 1) surface.appendLine([{ text: `line-${index}` }]);
  const snapshot = surface.snapshot();
  assertEquals(snapshot.lines.length, 3);
  assertEquals(snapshot.dropped, 2); // never silently complete
  assertEquals(snapshot.lines[0]![0]!.text, "line-2");
  assert(Object.isFrozen(snapshot));
  assertEquals(surface.window(1, 2).map((line) => line[0]!.text), ["line-3", "line-4"]);
});

Deno.test("markdown streams across chunk boundaries into styled lines", () => {
  const surface = new OffscreenSurface();
  const writer = createMarkdownSurfaceWriter(surface);
  writer.write("## Rel");
  writer.write("ease\n- ship `v2` now\nplain **bold** end");
  writer.flush();
  const [heading, bullet, plain] = surface.snapshot().lines;
  assertEquals(heading, [{ text: "Release", style: { scope: "heading-2", bold: true } }]);
  assertEquals(bullet![0], { text: "• ", style: { scope: "bullet" } });
  assertEquals(bullet![2], { text: "v2", style: { scope: "code" } });
  assertEquals(plain![1], { text: "bold", style: { bold: true } });
});

Deno.test("code streams through a highlighter into scoped segments", () => {
  const surface = new OffscreenSurface();
  const writer = createCodeSurfaceWriter(
    surface,
    createPatternHighlighter([{ pattern: /\bconst\b/, scope: "keyword" }]),
  );
  writer.write("const a = 1\nno keywords");
  writer.flush();
  const [first, second] = surface.snapshot().lines;
  assertEquals(first![0], { text: "const", style: { scope: "keyword" } });
  assertEquals(second, [{ text: "no keywords" }]);
});

Deno.test("process output keeps SGR color/bold and drops other escapes", () => {
  const surface = new OffscreenSurface();
  const writer = createProcessOutputWriter(surface);
  writer.write("\x1b[1;31merror:\x1b[0m file missing\r\n\x1b[2Kplain\n");
  const [first, second] = surface.snapshot().lines;
  assertEquals(first![0], { text: "error:", style: { bold: true, foreground: 1 } });
  assertEquals(first![1], { text: " file missing" });
  assertEquals(second, [{ text: "plain" }]); // the 2K erase vanished
});

Deno.test("a live screen yields a color-preserving styled scrollback snapshot", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 2, scrollbackLimit: 10 });
  screen.write("\x1b[31mred\x1b[0m one\r\nline two\r\nline three\r\n");
  const rows = screen.scrollbackCellRows();
  assert(rows.length >= 1); // earlier lines scrolled into styled history
  const text = rows.map((row) => row.map((cell) => cell.char || " ").join("").trimEnd());
  assert(text[0]!.includes("red"));
});
