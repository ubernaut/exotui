// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals } from "./deps.ts";
import { TerminalScreenController } from "../src/runtime/terminal_screen.ts";
import { TerminalScrollbackController } from "../src/runtime/terminal_scrollback.ts";
import { encodeTerminalIndexedColor, encodeTerminalRgbColor } from "../src/runtime/terminal_color.ts";
import {
  mixTerminalRgb,
  resolveTerminalCellStyle,
  type TerminalCellStyleOptions,
} from "../src/runtime/terminal_palette.ts";
import { TerminalScreen } from "../src/components/terminal_screen.ts";
import { Signal } from "../src/signals/mod.ts";
import { createAnsiStyle } from "../src/theme.ts";
import { BrowserCellCanvasSink, parseAnsiCell } from "../src/web/cell_canvas_sink.ts";
import { WidgetSurface, widgetSurfaceCellData } from "../mod.app.ts";
import { MarkdownSurface } from "../mod.document.ts";
import { type MermaidStandardDiagram, prepareMermaidMarkdown } from "../mod.mermaid.ts";
import {
  applyCellFrameDelta,
  type CellFrame,
  decodeCellFrame,
  encodeCellFrame,
  encodeCellFrameDelta,
} from "../mod.remote.ts";

const escape = String.fromCharCode(27);
const styles = ["solid", "double", "wavy", "dotted", "dashed"] as const;
const colors: TerminalCellStyleOptions = {
  defaultForeground: [220, 226, 240],
  defaultBackground: [20, 24, 34],
  cursorForeground: [0, 0, 0],
  cursorBackground: [255, 200, 0],
};
const spec = {
  bold: true,
  italic: true,
  underline: true,
  overline: true,
  strikethrough: true,
  foreground: [0, 0, 255] as const,
  underlineColor: [0, 255, 0] as const,
};
const rgb = encodeTerminalRgbColor;
const raw = (value: string | Uint8Array | undefined) =>
  typeof value === "string" ? value : new TextDecoder().decode(value);

Deno.test("offscreen WidgetSurface never borrows real terminal handles", async () => {
  const surface = new WidgetSurface(8, 1);
  try {
    surface.mount((tui) => {
      assert(tui.stdin !== Deno.stdin && tui.stdout !== Deno.stdout);
      assertEquals(tui.stdout.writeSync(Uint8Array.of(65)), 1);
      assertEquals(tui.manageTerminalSize, false);
      return [];
    });
    await surface.render();
  } finally {
    surface.dispose();
  }
});

Deno.test("surface color reader consumes underline/color subparameters without resetting glyph color/bold", () => {
  for (const underlineStyle of styles) {
    const value = createAnsiStyle({ ...spec, underlineStyle, background: [4, 0, 9] })("A");
    assertEquals(widgetSurfaceCellData(value), {
      glyph: "A",
      foreground: [0, 0, 255],
      background: [4, 0, 9],
      bold: true,
    });
  }
  const value = `${escape}[1;38:2::0:0:255;58;2;0;4mA${escape}[0m`;
  assertEquals(widgetSurfaceCellData(value), {
    glyph: "A",
    foreground: [0, 0, 255],
    background: undefined,
    bold: true,
  });
});

Deno.test("terminal SGR retains all five underline styles and independent RGB-zero ink without resetting glyph attributes", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 1 });
  for (const underlineStyle of styles) screen.write(createAnsiStyle({ ...spec, underlineStyle })("A"));
  for (const [index, underlineStyle] of styles.entries()) {
    assertEquals(screen.cellRows()[0]![index], {
      char: "A",
      bold: true,
      italic: true,
      underline: true,
      ...(underlineStyle === "solid" ? {} : { underlineStyle }),
      overline: true,
      strikethrough: true,
      foreground: rgb(0, 0, 255),
      underlineColor: rgb(0, 255, 0),
    });
  }
  assertEquals(screen.cellRows()[0]![5], { char: " " });
});

Deno.test("terminal SGR preserves colon RGB/indexed colors and consumes malformed channels atomically", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 1 });
  screen.write(`${escape}[1;3;4:3;38:2::0:0:255;48:5:196;58:2:0:0:255:0mA`);
  const a = screen.cellRows()[0]![0]!;
  assertEquals(a.foreground, rgb(0, 0, 255));
  assertEquals(a.background, encodeTerminalIndexedColor(196));
  assertEquals(a.underlineColor, rgb(0, 255, 0));
  screen.write(`${escape}[58:2:1:0:0:0;38:2:9:4;48;2;0;4;9mB`);
  const b = screen.cellRows()[0]![1]!;
  assert(b.bold && b.italic && b.underline);
  assertEquals(b.underlineStyle, "wavy");
  assertEquals(b.underlineColor, a.underlineColor, "Unsupported color spaces never become black or resets.");
  assertEquals(b.foreground, a.foreground);
  assertEquals(b.background, rgb(0, 4, 9));
  screen.write(`${escape}[58;2;0;4mC`);
  const c = screen.cellRows()[0]![2]!;
  assert(c.bold && c.italic && c.underline);
  assertEquals(c.underlineStyle, "wavy");
  assertEquals(c.underlineColor, a.underlineColor);
});

Deno.test("terminal independent resets preserve unrelated style and underline ink until SGR59 or full reset", () => {
  const screen = new TerminalScreenController({ columns: 10, rows: 1 });
  screen.write(`${escape}[1;2;3;4:3;7;9;53;58;5;46mA`);
  screen.write(`${escape}[22;23;24;27;29;55mB${escape}[4mC${escape}[59;21mD${escape}[0;3mE`);
  const [a, b, c, d, e] = screen.cellRows()[0]!;
  assert(a!.bold && a!.dim && a!.inverse && a!.italic && a!.strikethrough && a!.overline);
  assertEquals(b, { char: "B", bold: false, underlineColor: encodeTerminalIndexedColor(46) });
  assertEquals(c, { char: "C", bold: false, underline: true, underlineColor: encodeTerminalIndexedColor(46) });
  assertEquals(d, { char: "D", bold: false, underline: true, underlineStyle: "double" });
  assertEquals(e, { char: "E", italic: true });
  screen.write(`${escape}[4:3m${escape}[4:0mF${escape}[mG`);
  assertEquals(screen.cellRows()[0]![5], { char: "F", italic: true });
  assertEquals(screen.cellRows()[0]![6], { char: "G" });
});

Deno.test("terminal controls do not treat private/intermediate SGR or arbitrary colon attributes as styling", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 1 });
  screen.write(`${escape}[3;4:3mA${escape}[?0m${escape}[>0m${escape}[0 m${escape}[1:0;4:9;53:0mB`);
  assertEquals(screen.cellRows()[0]![1], { char: "B", italic: true, underline: true, underlineStyle: "wavy" });
});

Deno.test("terminal styled Unicode survives every byte-boundary split and repeat without styling wide followers", () => {
  const input = new TextEncoder().encode(
    createAnsiStyle({ ...spec, underlineStyle: "wavy" })("A界") + `${escape}[3;4:4mZ${escape}[2b`,
  );
  const expected = new TerminalScreenController({ columns: 12, rows: 2 });
  expected.write(input);
  const bytewise = new TerminalScreenController({ columns: 12, rows: 2 });
  for (const byte of input) bytewise.write(Uint8Array.of(byte));
  assertEquals(bytewise.cellRows(), expected.cellRows());
  for (let split = 0; split <= input.length; split++) {
    const screen = new TerminalScreenController({ columns: 12, rows: 2 });
    screen.write(input.subarray(0, split));
    screen.write(input.subarray(split));
    assertEquals(screen.cellRows(), expected.cellRows(), `UTF-8/control split at ${split}`);
  }
  assertEquals(expected.cellRows()[0]![2], { char: " ", continuation: true });
  assertEquals(expected.textRows()[0]!.trimEnd(), "A界 ZZZ");
});

Deno.test("terminal styled history survives resize, JSON snapshots, copy selection and alternate-buffer restoration", () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write(createAnsiStyle({ ...spec, underlineStyle: "dashed" })("A界") + "\r\nplain\r\nlive");
  const original = screen.scrollbackCellRows()[0]![0]!;
  assert(original.underline && original.overline && original.italic);
  const cloned = JSON.parse(JSON.stringify(screen.cellRowsRange(0, 3)));
  assertEquals(cloned[0][0], original);
  cloned[0][0].underlineColor = 0;
  assertEquals(screen.scrollbackCellRows()[0]![0], original, "Snapshots cannot mutate the model.");
  screen.resize(8, 2);
  assertEquals(screen.cellRowsRange(0, 1)[0]![0], original);
  const history = new TerminalScrollbackController({ screen, viewportRows: 2 });
  history.setSelection(0);
  assertEquals(history.copySelection(), "A界");
  screen.write(`${escape}[?1049h${escape}[0;4:2;58;5;196mALT${escape}[?1049l`);
  assertEquals(screen.scrollbackCellRows()[0]![0], original);
  assertEquals(screen.textRows()[0]!.trimEnd(), "plain");
  screen.write(`${escape}[0m${escape}[1;3;4;53;9;48;2;0;0;255m${escape}[2J`);
  assertEquals(
    screen.cellRows()[0]![0],
    { char: " ", background: rgb(0, 0, 255) },
    "Erased blanks do not inherit glyph decoration.",
  );
});

Deno.test("terminal palette memo distinguishes typography/ink and resolves inverse on real translucent grounds", () => {
  const screen = new TerminalScreenController({ columns: 8, rows: 1 });
  for (const underlineStyle of styles) screen.write(createAnsiStyle({ ...spec, dim: true, underlineStyle })("A"));
  const options: TerminalCellStyleOptions = { ...colors, ground: (column) => [column * 20, 40, 60], opacity: 0.5 };
  for (const [index, underlineStyle] of styles.entries()) {
    const cell = screen.cellRows()[0]![index]!;
    const resolved = resolveTerminalCellStyle({ ...cell, inverse: true }, index, 0, false, options);
    assertEquals(resolved.underlineStyle ?? "solid", underlineStyle);
    assert(resolved.dim && resolved.italic && resolved.underline && resolved.overline && resolved.strikethrough);
    assertEquals(resolved.underlineColor, [0, 255, 0]);
    assertEquals(resolved.background, [0, 0, 255]);
    assertEquals(resolved.foreground, mixTerminalRgb([index * 20, 40, 60], colors.defaultBackground, 0.5));
    const cursor = resolveTerminalCellStyle({ ...cell, inverse: true }, index, 0, true, options);
    assert(cursor.bold && cursor.italic && cursor.underline && cursor.overline);
    assertEquals(cursor.foreground, colors.cursorForeground);
    assertEquals(cursor.background, colors.cursorBackground);
    assertEquals(cursor.underlineColor, [0, 255, 0]);
  }
  const cell = screen.cellRows()[0]![0]!;
  const faded = resolveTerminalCellStyle(cell, 0, 0, false, { ...colors, dimToward: [0, 0, 0] });
  assertEquals(faded.underlineColor, mixTerminalRgb([0, 255, 0], [0, 0, 0], 0.45));
  const plain = resolveTerminalCellStyle({ char: "A", foreground: cell.foreground }, 0, 0, false, options);
  assert(!plain.italic && !plain.underline && !plain.overline && !plain.strikethrough);
});

Deno.test("mounted TerminalScreen retains styled copy-mode history and clears cached decorations on live replacement", async () => {
  const screen = new TerminalScreenController({ columns: 12, rows: 2 });
  screen.write(createAnsiStyle({ ...spec, underlineStyle: "dotted" })("A界") + "\r\nplain\r\nlive");
  const scrollback = new TerminalScrollbackController({ screen, viewportRows: 2 });
  scrollback.setSelection(0);
  const revision = new Signal(0), surface = new WidgetSurface(12, 2);
  try {
    surface.mount((tui) => [
      new TerminalScreen({
        parent: tui,
        rectangle: { column: 0, row: 0, width: 12, height: 2 },
        zIndex: 1,
        screen,
        scrollback,
        revision,
        colors,
        showCursor: false,
        contrastLift: false,
      }),
    ]);
    await surface.render();
    const painted = parseAnsiCell(raw(surface.cellAt(0, 0)));
    assert(painted.bold && painted.italic && painted.underline && painted.overline && painted.strikethrough);
    assertEquals(painted.underlineStyle, "dotted");
    assertEquals(painted.foreground, "rgb(0,0,255)");
    assertEquals(painted.underlineColor, "rgb(0,255,0)");
    assertEquals(scrollback.copySelection(), "A界");
    scrollback.exitCopyMode();
    screen.write(`${escape}[H${escape}[0mA`);
    revision.value++;
    await surface.render();
    const plain = parseAnsiCell(raw(surface.cellAt(0, 0)));
    assertEquals(plain.text, "A");
    assert(!plain.bold && !plain.italic && !plain.underline && !plain.overline && !plain.strikethrough);
    assertEquals(plain.underlineColor, undefined);
  } finally {
    surface.dispose();
  }
});

Deno.test("prepared Mermaid Markdown survives terminal component plus unchanged remote full/delta codec and browser paint", async () => {
  const source = "```mermaid\ntransport\n```";
  const diagram: MermaidStandardDiagram = {
    source: "transport",
    diagramType: "fixture",
    version: "fixture",
    svg: "<svg/>",
    scene: {
      width: 128,
      height: 80,
      title: "",
      description: "",
      diagnostics: [],
      items: [{
        kind: "text",
        text: "A",
        x: 8,
        y: 64,
        width: 8,
        height: 16,
        color: "blue",
        fontWeight: "bold",
        fontStyle: "italic",
        decorations: [
          {
            line: "underline",
            color: "lime",
            style: "wavy",
            thickness: "auto",
            offset: "auto",
            position: "auto",
            skipInk: "auto",
          },
          {
            line: "overline",
            color: "blue",
            style: "solid",
            thickness: "auto",
            offset: "auto",
            position: "auto",
            skipInk: "auto",
          },
          {
            line: "line-through",
            color: "blue",
            style: "solid",
            thickness: "auto",
            offset: "auto",
            position: "auto",
            skipInk: "auto",
          },
        ],
      }],
    },
  };
  const prepared = await prepareMermaidMarkdown(source, {
    compile: () => Promise.resolve(JSON.parse(JSON.stringify(diagram))),
  });
  assertEquals(prepared.diagnostics, []);
  const markdown = new MarkdownSurface({ source, render: prepared.render });
  const screen = new TerminalScreenController({ columns: 64, rows: 12 }),
    revision = new Signal(0),
    surface = new WidgetSurface(64, 12);
  try {
    await markdown.ready;
    screen.write(markdown.render(64, 12).join("\r\n"));
    surface.mount((tui) => [
      new TerminalScreen({
        parent: tui,
        rectangle: { column: 0, row: 0, width: 64, height: 12 },
        zIndex: 1,
        screen,
        revision,
        colors,
        showCursor: false,
        contrastLift: false,
      }),
    ]);
    await surface.render();
    const capture = (): CellFrame => ({
      columns: 64,
      rows: 12,
      cells: Array.from({ length: 64 * 12 }, (_, index) => {
        const value = raw(surface.cellAt(Math.floor(index / 64), index % 64));
        return {
          char: parseAnsiCell(value).text || " ",
          style: value.match(new RegExp(`^(?:${escape}\\[[0-9;:]*m)*`))?.[0] ?? "",
        };
      }),
    });
    const frame = capture(), index = frame.cells.findIndex((cell) => cell.char === "A");
    assert(index >= 0, "The diagram label actually reaches the mounted terminal.");
    // Opaque styles do not require v2; explicitly pin the old-wire compatibility oracle.
    const decoded = decodeCellFrame(JSON.parse(JSON.stringify(encodeCellFrame(frame, { version: 1 }))));
    assert(decoded.ok);
    assertEquals(decoded.frame, frame);
    const value = parseAnsiCell(decoded.frame.cells[index]!.style + "A");
    assert(value.bold && value.italic && value.underline && value.overline && value.strikethrough);
    assertEquals(value.underlineStyle, "wavy");
    assertEquals(value.underlineColor, "rgb(0,255,0)");
    screen.write(
      `${escape}[${Math.floor(index / 64) + 1};${index % 64 + 1}H` +
        createAnsiStyle({ ...spec, underlineStyle: "dashed" })("A"),
    );
    revision.value++;
    await surface.render();
    const next = capture(), delta = encodeCellFrameDelta(frame, next, { version: 1 });
    assertEquals(delta.kind, "delta");
    assertEquals(delta.version, 1, "No wire protocol or daemon descriptor change is needed for opaque styles.");
    const applied = applyCellFrameDelta(decoded.frame, JSON.parse(JSON.stringify(delta)));
    assert(applied.ok);
    assertEquals(applied.frame, next);
    const received = applied.frame.cells[index]!;
    assertEquals(parseAnsiCell(received.style + received.char).underlineStyle, "dashed");
    const paints: string[] = [], fonts: string[] = [];
    const context = {
      canvas: { width: 0, height: 0 },
      fillStyle: "",
      font: "",
      textBaseline: "top",
      fillRect: () => paints.push(context.fillStyle),
      fillText: () => fonts.push(context.font),
      scale: () => {},
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
    };
    const sink = new BrowserCellCanvasSink({
      canvas: { getContext: () => context } as unknown as HTMLCanvasElement,
      cellWidth: 10,
      cellHeight: 20,
      font: "16px monospace",
    });
    sink.resize(1, 1);
    paints.length = 0;
    sink.flush([{ row: 0, column: 0, value: received.style + received.char }], {} as never);
    assert(paints.includes("rgb(0,255,0)"), "Remote underline ink is actually painted, not merely decoded.");
    assert(paints.includes("rgb(0,0,255)"));
    assertEquals(fonts[0], "italic 700 16px monospace");
  } finally {
    markdown.dispose();
    surface.dispose();
  }
});
