// Copyright 2023 Im-Beast. MIT license.
import { BrowserCellCanvasSink, parseAnsiCell } from "../../../src/web/cell_canvas_sink.ts";
import { Canvas } from "../../../src/canvas/canvas.ts";
import { TextObject } from "../../../src/canvas/text.ts";
import { Signal } from "../../../src/signals/mod.ts";
import { createAnsiStyle } from "../../../src/theme.ts";
import { MarkdownSurface } from "../../../mod.document.ts";
import { type MermaidStandardDiagram, prepareMermaidMarkdown } from "../../../mod.mermaid.ts";
import { MermaidRemoteCells } from "./remote_cells.ts";
import { longAccentLabel, longKeycapLabel, unicodeWideLabels } from "./unicode_labels.ts";

const stats = {} as never;
function host(
  columns: number,
  rows: number,
  devicePixelRatio: number,
  font = "16px monospace",
  cellWidth = 10,
  cellHeight = 20,
) {
  const canvas = document.createElement("canvas");
  const sink = new BrowserCellCanvasSink({
    canvas,
    cellWidth,
    cellHeight,
    font,
    foreground: "white",
    background: "black",
    devicePixelRatio,
  });
  sink.resize(columns, rows);
  return { canvas, sink };
}
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
}
function same(left: HTMLCanvasElement, right: HTMLCanvasElement, name: string): void {
  if (left.width !== right.width || left.height !== right.height) throw new Error(`${name}: geometry differs`);
  const a = pixels(left), b = pixels(right);
  const index = a.findIndex((value, index) => value !== b[index]);
  if (index !== -1) throw new Error(`${name}: pixel channel ${index} differs (${a[index]} versus ${b[index]})`);
}
function flush(sink: BrowserCellCanvasSink, cells: readonly (readonly (string | Uint8Array)[])[]) {
  sink.flushRanges(cells.map((values, row) => ({ row, startColumn: 0, values })), stats);
}
function clean(
  cells: readonly (readonly (string | Uint8Array)[])[],
  ratio: number,
  font = "16px monospace",
  cellWidth = 10,
  cellHeight = 20,
): HTMLCanvasElement {
  const { canvas, sink } = host(cells[0]!.length, cells.length, ratio, font, cellWidth, cellHeight);
  flush(sink, cells);
  return canvas;
}

/** Ink, not just advance, must stay in its owned cell and disappear on a sparse clear. */
export function verifyBrowserInkOverhang() {
  let cases = 0, repaintChecks = 0, sourceOverhangPixels = 0, visiblePixels = 0, fullyClippedCases = 0;
  for (
    const { ratio, cellWidth, cellHeight } of [1, 1.25, 1.5, 1.75, 2].flatMap((ratio) =>
      [9, 10, 11].map((cellWidth) => ({ ratio, cellWidth, cellHeight: Math.max(20, cellWidth + 10) }))
    )
  ) {
    for (const family of ['"Liberation Mono",monospace', "monospace"]) {
      for (const bold of [false, true]) {
        for (const italic of [false, true]) {
          for (const glyph of ["f", "j", "a\u0333", "\u00a0\u0333", "e\u0301\u0308"]) {
            const font = `16px ${family}`, styledFont = `${italic ? "italic " : ""}${bold ? "700 " : ""}${font}`;
            const style = createAnsiStyle({ foreground: [0, 255, 0], bold, italic });
            const surface = host(4, 3, ratio, font, cellWidth, cellHeight);
            const cells = Array.from({ length: 3 }, () => Array<string>(4).fill(" "));
            cells[1]![1] = style(glyph);
            surface.sink.flush([{ row: 1, column: 1, value: style(glyph) }], stats);
            const expected = document.createElement("canvas");
            expected.width = surface.canvas.width;
            expected.height = surface.canvas.height;
            const context = expected.getContext("2d")!;
            context.scale(ratio, ratio);
            context.fillStyle = "black";
            context.fillRect(0, 0, expected.width / ratio, expected.height / ratio);
            context.font = styledFont;
            context.textBaseline = "top";
            context.fillStyle = "lime";
            // The original unbounded glyph independently demonstrates real ink
            // outside the advance, including its top/bottom/left/right overhang.
            context.fillText(glyph, cellWidth, cellHeight);
            const original = pixels(expected);
            if (!original.some((value, index) => index % 4 === 1 && value > 0)) {
              throw new Error(`Original font painted no ink: ${glyph}/${styledFont}/${ratio}`);
            }
            for (let y = 0; y < expected.height; y++) {
              for (let x = 0; x < expected.width; x++) {
                if (
                  original[(y * expected.width + x) * 4 + 1] &&
                  (x < cellWidth * ratio || x >= 2 * cellWidth * ratio || y < cellHeight * ratio ||
                    y >= 2 * cellHeight * ratio)
                ) sourceOverhangPixels++;
              }
            }
            context.fillStyle = "black";
            context.fillRect(0, 0, expected.width / ratio, expected.height / ratio);
            context.save();
            context.beginPath();
            // Each device pixel belongs to the cell containing its center;
            // independent integer-device clipping cannot blend with a neighbor.
            const left = Math.round(cellWidth * ratio), top = Math.round(cellHeight * ratio);
            context.rect(
              left / ratio,
              top / ratio,
              (Math.round(2 * cellWidth * ratio) - left) / ratio,
              (Math.round(2 * cellHeight * ratio) - top) / ratio,
            );
            context.clip();
            context.fillStyle = "lime";
            context.fillText(glyph, cellWidth, cellHeight);
            context.restore();
            const reference = pixels(expected);
            const ink = reference.filter((value, index) => index % 4 === 1 && value > 0).length;
            if (!ink) {
              // Retain the original visible-ink assertion in normal/wider cells.
              // A 9px cell can legitimately exclude all ink of a 16px carrier.
              if (cellWidth >= 10) {
                throw new Error(`Ink-overhang reference has no visible ink: ${glyph}/${styledFont}/${ratio}`);
              }
              fullyClippedCases++;
            }
            visiblePixels += ink;
            same(surface.canvas, expected, `Independent owned ink ${glyph}/${styledFont}/${ratio}`);
            const compare = (name: string) => {
              same(
                surface.canvas,
                clean(cells, ratio, font, cellWidth, cellHeight),
                `${name}/${glyph}/${styledFont}/${ratio}/${cellWidth}x${cellHeight}`,
              );
              repaintChecks++;
            };
            compare("single sparse owner");
            cells[1]![2] = "N";
            surface.sink.flush([{ row: 1, column: 2, value: "N" }], stats);
            compare("only neighbor changes");
            cells[1]![1] = " ";
            surface.sink.flush([{ row: 1, column: 1, value: " " }], stats);
            compare("only owner clears");
            cells[1]![1] = style(glyph);
            surface.sink.flushRanges([{ row: 1, startColumn: 1, values: [style(glyph)] }], stats);
            compare("range restores owner");
            cells[0]![1] = style(glyph);
            cells[1]![1] = " ";
            surface.sink.flush([{ row: 0, column: 1, value: style(glyph) }, { row: 1, column: 1, value: " " }], stats);
            compare("scroll moves glyph before clearing old row");
            cells[0]![1] = " ";
            surface.sink.flushRanges([{ row: 0, startColumn: 1, values: [" "] }], stats);
            compare("moved owner clears");
            cases++;
          }
        }
      }
    }
  }
  if (!sourceOverhangPixels) throw new Error("Original fonts did not exercise an ink overhang");
  return { cases, repaintChecks, sourceOverhangPixels, visiblePixels, fullyClippedCases };
}

/** Real Canvas2D pixels; incremental paints must equal a clean complete frame at every mutation. */
export function verifyBrowserOwnedPlanes() {
  let profiles = 0, repaintChecks = 0, solidPixels = 0;
  for (const ratio of [1, 1.25, 1.5, 1.75, 2]) {
    for (const cellWidth of [9, 10, 11]) {
      const cellHeight = Math.max(20, cellWidth + 10);
      const surface = host(4, 3, ratio, "16px monospace", cellWidth, cellHeight);
      const style = createAnsiStyle({ foreground: [0, 255, 0], background: [0, 0, 0] });
      const cells = Array.from({ length: 3 }, () => Array<string>(4).fill(style("█")));
      flush(surface.sink, cells);
      const data = pixels(surface.canvas);
      // Full blocks must fill every device pixel, including ceil-sized edges:
      // no font or sink-derived reference can hide fractional black seams.
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 0 || data[i + 1] !== 255 || data[i + 2] !== 0 || data[i + 3] !== 255) {
          throw new Error(`Full-block device seam: ${ratio}/${cellWidth}x${cellHeight}/${i / 4}`);
        }
        solidPixels++;
      }
      const compare = (name: string) => {
        same(
          surface.canvas,
          clean(cells, ratio, "16px monospace", cellWidth, cellHeight),
          `${name}/${ratio}/${cellWidth}x${cellHeight}`,
        );
        repaintChecks++;
      };
      const glyphs = ["░", "▚", "╬", "═", "─"];
      for (const glyph of glyphs) {
        cells[1]![1] = style(glyph);
        surface.sink.flush([{ row: 1, column: 1, value: cells[1]![1]! }], stats);
        compare(`geometric ${glyph}`);
        cells[1]![2] = " ";
        surface.sink.flush([{ row: 1, column: 2, value: " " }], stats);
        compare("clear neighbor without touching geometry");
        cells[1]![1] = " ";
        surface.sink.flush([{ row: 1, column: 1, value: " " }], stats);
        compare("clear geometry");
      }
      for (const underlineStyle of ["solid", "double", "dotted", "dashed", "wavy"] as const) {
        const decorated = createAnsiStyle({
          foreground: [0, 255, 0],
          underline: true,
          underlineStyle,
          overline: true,
          strikethrough: true,
        })(" ");
        cells[1]![1] = decorated;
        surface.sink.flush([{ row: 1, column: 1, value: decorated }], stats);
        compare(`decorated whitespace ${underlineStyle}`);
        cells[1]![1] = " ";
        surface.sink.flush([{ row: 1, column: 1, value: " " }], stats);
        compare("clear decorations");
      }
      // A complete reverse paint must have the same ownership as a forward paint.
      surface.sink.flush(
        cells.flatMap((row, y) => row.map((value, column) => ({ row: y, column, value }))).reverse(),
        stats,
      );
      compare("reverse full plane");
      profiles++;
    }
  }
  return { profiles, repaintChecks, solidPixels };
}

/** Real Canvas2D pixels; incremental paints must equal a clean complete frame at every mutation. */
export async function verifyBrowserWideCells() {
  let cases = 0, repaintChecks = 0, independentPixels = 0, textFrames = 0;
  for (const ratio of [1, 1.5, 2]) {
    for (const glyph of ["界", "🌈", "👩‍💻"]) {
      for (const underlineStyle of ["solid", "double", "wavy", "dotted", "dashed"] as const) {
        const style = createAnsiStyle({
          foreground: [255, 255, 255],
          background: [0, 0, 0],
          underline: true,
          underlineColor: [0, 255, 0],
          underlineStyle,
        });
        const { canvas, sink } = host(6, 2, ratio);
        const cells = [[" ", style(glyph), style(""), "A", " ", " "], Array<string>(6).fill(" ")];
        const compare = (label: string) => {
          same(canvas, clean(cells, ratio), `${glyph}/${underlineStyle}/${ratio}/${label}`);
          repaintChecks++;
        };
        sink.flush(cells.flatMap((row, y) => row.map((value, column) => ({ row: y, column, value }))).reverse(), stats);
        compare("reverse full update");
        // Independent two-column paint: no cell sink or continuation logic.
        // Use the solid line to prove both glyph ink and second-cell underline.
        if (underlineStyle === "solid") {
          const expected = document.createElement("canvas");
          expected.width = canvas.width;
          expected.height = canvas.height;
          const context = expected.getContext("2d")!;
          context.scale(ratio, ratio);
          context.fillStyle = "black";
          context.fillRect(0, 0, 60, 40);
          context.save();
          context.beginPath();
          context.rect(10, 0, 20, 20);
          context.clip();
          context.font = "16px monospace";
          context.textBaseline = "top";
          context.fillStyle = "white";
          context.fillText(glyph, 10, 0);
          context.restore();
          context.fillStyle = "lime";
          context.fillRect(10, 19, 20, 1);
          const x = 20 * ratio, width = 10 * ratio, height = 20 * ratio;
          const a = canvas.getContext("2d")!.getImageData(x, 0, width, height).data;
          const b = expected.getContext("2d")!.getImageData(x, 0, width, height).data;
          if (a.some((value, index) => value !== b[index])) {
            throw new Error(`Independent wide-glyph follower pixels differ: ${glyph}/${ratio}`);
          }
          let glyphInk = 0, lineInk = 0;
          for (let i = 0; i < b.length; i += 4) {
            if (b[i + 1] && !b[i] && !b[i + 2]) lineInk++;
            else if (b[i] || b[i + 1] || b[i + 2]) glyphInk++;
          }
          if (!glyphInk || !lineInk) throw new Error("Independent wide paint did not exercise both inks.");
          independentPixels += glyphInk + lineInk;
        }
        sink.flushRanges([{ row: 0, startColumn: 2, values: [style("")] }], stats);
        compare("only dirty follower");
        cells[0]![2] = "B";
        sink.flush([{ row: 0, column: 2, value: "B" }], stats);
        compare("break pair at follower");
        cells[0]![2] = style("");
        sink.flush([{ row: 0, column: 2, value: style("") }], stats);
        compare("restore styled follower");
        cells[0]![1] = "S";
        sink.flushRanges([{ row: 0, startColumn: 1, values: ["S"] }], stats);
        compare("replace owner clears old tail");
        cells[0]![1] = style(glyph);
        sink.flush([{ row: 0, column: 1, value: style(glyph) }], stats);
        compare("restore owner");
        cells[0]![1] = cells[0]![2] = " ";
        sink.flushRanges([
          { row: 0, startColumn: 2, values: [" "] },
          { row: 0, startColumn: 1, values: [" "] },
        ], stats);
        compare("plain replacement erases both halves");
        sink.resize(3, 1);
        flush(sink, [[" ", "A", " "]]);
        same(canvas, clean([[" ", "A", " "]], ratio), "shrink clears retained spans");
        sink.resize(9, 2);
        const grown = [Array<string>(9).fill(" "), Array<string>(9).fill(" ")];
        grown[1]![7] = style(glyph);
        grown[1]![8] = style("");
        flush(sink, grown);
        same(canvas, clean(grown, ratio), "grow fills newly available area");
        repaintChecks += 2;
        cases++;
      }
    }
    // Ordinary single-cell font overhang must still be clipped, not granted a wide span.
    const narrow = host(3, 1, ratio, "48px monospace");
    narrow.sink.flush([{ row: 0, column: 1, value: "W" }], stats);
    const data = pixels(narrow.canvas);
    let narrowInk = 0;
    for (let y = 0; y < narrow.canvas.height; y++) {
      for (let x = 0; x < narrow.canvas.width; x++) {
        const i = (y * narrow.canvas.width + x) * 4;
        const ink = data[i] || data[i + 1] || data[i + 2];
        if (ink && (x < 10 * ratio || x >= 20 * ratio)) throw new Error("Narrow glyph bleeds outside its cell.");
        if (ink) narrowInk++;
      }
    }
    if (!narrowInk) throw new Error("Narrow clipping probe painted no glyph.");
    const textStyle = createAnsiStyle({ foreground: [255, 255, 255], underline: true });
    const surface = host(12, 2, ratio), value = new Signal(textStyle("界é🌈👩‍💻X"));
    const canvas = new Canvas({ sink: surface.sink, size: { columns: 12, rows: 2 } });
    const object = new TextObject({
      canvas,
      value,
      style: (text) => text,
      zIndex: 1,
      rectangle: { column: 0, row: 0, width: 12 },
      overwriteRectangle: true,
      multiCodePointSupport: true,
    });
    object.draw();
    try {
      await Promise.resolve();
      await Promise.resolve();
      for (const [text, width] of [["界é🌈👩‍💻X", 12], ["Short", 12], ["界Y", 3], ["界Y", 12]] as const) {
        value.value = textStyle(text);
        canvas.size.value = { columns: width, rows: 2 };
        canvas.render();
        const cells = Array.from(
          { length: 2 },
          (_, row) => Array.from({ length: width }, (_, column) => canvas.frameBuffer[row]?.[column] ?? " "),
        );
        if (text === "界é🌈👩‍💻X") {
          const glyphs = cells[0]!.slice(0, 8).map((value) =>
            parseAnsiCell(typeof value === "string" ? value : new TextDecoder().decode(value)).text
          );
          if (JSON.stringify(glyphs) !== JSON.stringify(["界", "", "é", "🌈", "", "👩‍💻", "", "X"])) {
            throw new Error(`Actual styled TextObject lost grapheme boundaries: ${JSON.stringify(glyphs)}`);
          }
        }
        same(surface.canvas, clean(cells, ratio), `Actual TextObject ${text}/${width}/${ratio}`);
        canvas.rerenderAll();
        canvas.render();
        same(surface.canvas, clean(cells, ratio), "Forced TextObject redraw");
        textFrames += 2;
      }
    } finally {
      object.erase();
      value.dispose();
    }
  }
  return { cases, repaintChecks, independentPixels, textFrames, ratios: [1, 1.5, 2] };
}

/** Real compiled Unicode diagrams through disposed compiler → Markdown → browser cell pixels. */
export async function verifyMermaidBrowserWideCells(retained: readonly MermaidStandardDiagram[]) {
  let diagrams = 0, frames = 0, wideGlyphs = 0, graphemes = 0, remoteCells = 0, remoteFrames = 0;
  for (const diagram of retained.filter((diagram) => diagram.source.includes("Wide Unicode"))) {
    const source = `Before\n\n\`\`\`mermaid\n${diagram.source}\n\`\`\`\n\nAfter\n\n${"Tail\n\n".repeat(12)}`;
    const prepared = await prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
    const markdown = new MarkdownSurface({ source, render: prepared.render, initialSize: { columns: 120, rows: 20 } });
    const surface = host(120, 20, 1);
    const remote = new MermaidRemoteCells();
    let columns = 120, rows = 20;
    try {
      await markdown.ready;
      for (const [width, scroll] of [[120, 0], [120, 1], [120, -1], [48, 0], [160, 0]] as const) {
        if (width !== columns) {
          columns = width;
          rows = 20;
          surface.sink.resize(columns, rows);
        }
        if (scroll) markdown.scroll(scroll);
        const cells = markdown.renderCells(columns, rows);
        flush(surface.sink, remote.roundTrip(cells));
        same(surface.canvas, clean(cells, 1), `Actual Mermaid Markdown ${width}/${scroll}`);
        if (width === 120 && !scroll) {
          for (
            const [glyph, width] of [
              ["界", 2],
              ["é", 1],
              ["🌈", 2],
              ["👩‍💻", 2],
              ["ạ́́", 1],
              ["क्ष", 1],
              ["क्‍ष", 1],
              [
                "각",
                2,
              ],
              ["1️⃣", 2],
              [longAccentLabel, 1],
              [longKeycapLabel, 2],
              ...unicodeWideLabels.map((glyph) => [glyph, 2] as const),
            ] as const
          ) {
            const position = cells.flatMap((row, y) => row.map((value, x) => ({ value, x, y })))
              .find((cell) => parseAnsiCell(cell.value).text === glyph);
            if (!position) throw new Error(`Actual Mermaid label omitted ${glyph}.`);
            graphemes++;
            if (width === 2) {
              const { x, y } = position;
              const b = surface.canvas.getContext("2d")!.getImageData((x + 1) * 10, y * 20, 10, 20).data;
              const ground = parseAnsiCell(position.value).background;
              if (!ground) throw new Error("Actual Mermaid label lacks a ground for pixel proof.");
              const rgb = ground.match(/\d+/g)!.map(Number);
              if (!b.some((value, index) => index % 4 < 3 && value !== rgb[index % 4])) {
                throw new Error(`Actual Mermaid label erased second-cell pixels: ${glyph}.`);
              }
              wideGlyphs++;
            }
          }
        }
        frames++;
      }
      diagrams++;
      remoteCells += remote.cells;
      remoteFrames += remote.frames;
    } finally {
      markdown.dispose();
    }
  }
  if (diagrams !== 2 || wideGlyphs !== 18 || graphemes !== 28) {
    throw new Error("Actual Mermaid Unicode browser fixtures were omitted.");
  }
  return { diagrams, frames, wideGlyphs, graphemes, remoteCells, remoteFrames };
}

/** Compiler-disposed MathML ink must also survive native document/remote cell repainting. */
export async function verifyMermaidBrowserInk(retained: readonly MermaidStandardDiagram[]) {
  const diagrams = retained.filter((diagram) => diagram.source.includes("https://example.test/detached-ink"));
  if (diagrams.length !== 8) throw new Error("Actual styled MathML ink fixtures were omitted.");
  let cases = 0, frames = 0, marks = 0, remoteCells = 0;
  for (const diagram of diagrams) {
    const source = `Before\n\n\`\`\`mermaid\n${diagram.source}\n\`\`\`\n\nAfter\n\n${"Tail\n\n".repeat(12)}`;
    const prepared = await prepareMermaidMarkdown(source, { compile: () => Promise.resolve(diagram) });
    const width = prepared.diagrams[0]!.native.columns + 4;
    const rows = prepared.diagrams[0]!.native.rows + 6;
    for (const [ratio, cellWidth, cellHeight] of [[1, 10, 20], [1.25, 9, 20], [1.75, 11, 21]] as const) {
      for (const family of ['"Liberation Mono",monospace', "monospace"]) {
        const font = `16px ${family}`;
        const surface = host(width, rows, ratio, font, cellWidth, cellHeight);
        const markdown = new MarkdownSurface({
          source,
          render: prepared.render,
          initialSize: { columns: width, rows },
        });
        const remote = new MermaidRemoteCells();
        let previous: readonly (readonly string[])[] = [];
        try {
          await markdown.ready;
          for (const scroll of [0, 1, -1, 2, -2]) {
            for (let step = 0; step < Math.abs(scroll); step++) markdown.scroll(scroll > 0 ? 1 : -1);
            const cells = remote.roundTrip(markdown.renderCells(width, rows));
            // Update only changed cells, exactly as a native incremental canvas does.
            surface.sink.flush(
              cells.flatMap((row, y) =>
                row.flatMap((value, column) => previous[y]?.[column] === value ? [] : [{ row: y, column, value }])
              ),
              stats,
            );
            same(
              surface.canvas,
              clean(cells, ratio, font, cellWidth, cellHeight),
              `Disposed MathML sparse document ${ratio}/${cellWidth}/${family}/${scroll}`,
            );
            if (!scroll) {
              const carriers = cells.flatMap((row) => row.map(parseAnsiCell)).filter((cell) =>
                cell.text === "\u00a0\u0333"
              );
              if (carriers.length !== 1 || carriers[0]!.foreground !== "rgb(0,128,0)") {
                throw new Error("Actual disposed MathML ink lost its single styled carrier.");
              }
              marks++;
            }
            previous = cells;
            frames++;
          }
          // Removal must clear every formerly painted cell, not just new content.
          const blank = Array.from({ length: rows }, () => Array<string>(width).fill(" "));
          surface.sink.flush(
            blank.flatMap((row, y) =>
              row.flatMap((value, column) => previous[y]?.[column] === value ? [] : [{ row: y, column, value }])
            ),
            stats,
          );
          same(surface.canvas, clean(blank, ratio, font, cellWidth, cellHeight), "Disposed MathML document clears");
          frames++;
          cases++;
          remoteCells += remote.cells;
        } finally {
          markdown.dispose();
        }
      }
    }
  }
  return { diagrams: diagrams.length, cases, frames, marks, remoteCells };
}
