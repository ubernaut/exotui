import { runtimeTaskCommand } from "./demo_launcher.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import { Buffer } from "node:buffer";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { clamp } from "../src/utils/numbers.ts";
import { ansi256Color, ansiColor } from "../src/web/ansi_color.ts";

interface ScreenshotTarget {
  filename: string;
  title: string;
  theme: ScreenshotTheme;
  columns: number;
  rows: number;
  command: string[];
  mode: "pty" | "stdout";
  timeoutMs?: number;
  contentStartRow?: number;
  contentEndRow?: number;
  contentStartColumn?: number;
  contentEndColumn?: number;
  minimumContentCells?: number;
  forbiddenContent?: readonly string[];
}

type ScreenshotTheme = "neon" | "exodus" | "system" | "gallery";

interface CellStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
}

interface Cell {
  char: string;
  style: CellStyle;
}

interface TerminalFrame {
  title: string;
  theme: ScreenshotTheme;
  columns: number;
  rows: number;
  cells: Cell[][];
}

const FONT_SIZE = 34;
const TITLE_FONT_SIZE = 46;
const CHAR_WIDTH = 20.6;
const LINE_HEIGHT = 52;
const PADDING = 32;
const TITLE_HEIGHT = 78;

const targets: ScreenshotTarget[] = [
  {
    filename: "three-ascii.jpg",
    title: "Three ASCII Renderer",
    theme: "exodus",
    columns: 120,
    rows: 36,
    command: ["deno", "task", "three-ascii", "--", "--no-controls"],
    mode: "pty",
    timeoutMs: 6500,
    contentStartRow: 4,
    contentEndRow: 34,
    contentStartColumn: 2,
    contentEndColumn: 118,
    minimumContentCells: 300,
    forbiddenContent: [
      "ASCII RENDERER STARTING",
      "ASCII RENDERER OFFLINE",
      "GPU READBACK UNAVAILABLE",
    ],
  },
  {
    filename: "api-workbench.jpg",
    title: "API Workbench",
    theme: "gallery",
    columns: 120,
    rows: 36,
    command: ["deno", "task", "api-workbench"],
    mode: "pty",
    timeoutMs: 6000,
    forbiddenContent: [
      "ASCII RENDERER OFFLINE",
      "ASCII RENDERER UNAVAILABLE",
      "GPU READBACK UNAVAILABLE",
    ],
  },
  {
    filename: "component-catalog.jpg",
    title: "Component Catalog",
    theme: "gallery",
    columns: 120,
    rows: 36,
    command: ["deno", "task", "component-catalog", "--", "--terminal"],
    mode: "stdout",
  },
  {
    filename: "showcase.jpg",
    title: "Showcase",
    theme: "neon",
    columns: 120,
    rows: 36,
    command: ["deno", "task", "showcase"],
    mode: "pty",
    timeoutMs: 1200,
  },
  {
    filename: "neon-exodus.jpg",
    title: "Neon Exodus",
    theme: "exodus",
    columns: 120,
    rows: 36,
    command: ["deno", "task", "neon-exodus", "--", "--section=three", "--maximized"],
    mode: "pty",
    timeoutMs: 6500,
    contentStartRow: 8,
    contentEndRow: 34,
    contentStartColumn: 3,
    contentEndColumn: 117,
    minimumContentCells: 100,
    forbiddenContent: [
      "TEXT FALLBACK ACTIVE",
      "ASCII RENDERER OFFLINE",
      "ASCII RENDERER UNAVAILABLE",
      "GPU READBACK UNAVAILABLE",
    ],
  },
  {
    filename: "system-monitor.jpg",
    title: "System Monitor",
    theme: "system",
    columns: 120,
    rows: 36,
    command: ["deno", "task", "viz"],
    mode: "pty",
    timeoutMs: 4600,
  },
];

const defaultStyle: CellStyle = {};

if (import.meta.main) {
  await runtimeHost.mkdir("docs/screenshots", { recursive: true });
  const expected = new Set(targets.map((target) => target.filename));
  const browser = await findBrowser();
  for (const target of targets) {
    const output = await captureTarget(target);
    const frame = replayTerminal(output, target);
    validateScreenshotFrame(frame, target);
    await writeJpegScreenshot(frame, `docs/screenshots/${target.filename}`, browser);
  }

  for await (const entry of runtimeHost.readDir("docs/screenshots")) {
    if (entry.isFile && /\.(?:jpe?g|svg)$/i.test(entry.name) && !expected.has(entry.name)) {
      await runtimeHost.remove(`docs/screenshots/${entry.name}`);
    }
  }
}

function validateScreenshotFrame(frame: TerminalFrame, target: ScreenshotTarget): void {
  const text = frame.cells
    .map((row) => row.map((cell) => cell?.char ?? " ").join(""))
    .join("\n");
  for (const forbidden of target.forbiddenContent ?? []) {
    if (text.includes(forbidden)) {
      throw new Error(`failed to capture ${target.filename}: renderer output contains ${forbidden}`);
    }
  }
  if (target.minimumContentCells === undefined) return;
  const startRow = Math.max(0, Math.floor(target.contentStartRow ?? 0));
  const endRow = Math.min(frame.cells.length, Math.floor(target.contentEndRow ?? frame.cells.length));
  const startColumn = Math.max(0, Math.floor(target.contentStartColumn ?? 0));
  const endColumn = Math.max(startColumn, Math.floor(target.contentEndColumn ?? target.columns));
  let visibleCells = 0;
  for (let row = startRow; row < endRow; row += 1) {
    for (const cell of (frame.cells[row] ?? []).slice(startColumn, endColumn)) {
      if (cell?.char && cell.char !== " ") visibleCells += 1;
    }
  }
  if (visibleCells < target.minimumContentCells) {
    throw new Error(
      `failed to capture ${target.filename}: expected at least ${target.minimumContentCells} visible content cells, got ${visibleCells}`,
    );
  }
}

async function captureTarget(target: ScreenshotTarget): Promise<string> {
  const argv = runtimeTaskCommand(target.command);
  if (target.mode === "stdout") {
    const output = await new runtimeHost.Command(argv[0]!, {
      args: argv.slice(1),
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!output.success) {
      throw new Error(`failed to capture ${target.filename}: ${decode(output.stderr)}`);
    }
    return decode(output.stdout);
  }

  const shellCommand = [
    `stty cols ${target.columns} rows ${target.rows}`,
    `timeout ${(target.timeoutMs ?? 1000) / 1000}s ${quoteCommand(argv)}`,
  ].join("; ");
  const output = await new runtimeHost.Command("script", {
    args: ["-q", "-c", shellCommand, "/dev/null"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = decode(output.stdout);
  if (text.length === 0) {
    throw new Error(`failed to capture ${target.filename}: ${decode(output.stderr)}`);
  }
  return text;
}

function replayTerminal(input: string, target: ScreenshotTarget): TerminalFrame {
  const cells = Array.from({ length: target.rows }, () => Array<Cell>(target.columns));
  let row = 0;
  let column = 0;
  let style: CellStyle = {};
  let index = 0;

  while (index < input.length) {
    const char = input[index]!;
    if (char === "\u009b") {
      const parsed = parseCsi(input, index, 1);
      if (parsed) {
        const { command, params, raw } = parsed;
        ({ row, column, style } = applyTerminalControl({
          cells,
          command,
          params,
          raw,
          row,
          column,
          style,
          target,
        }));
        index = parsed.end;
        continue;
      }
    } else if (char === "\u009d") {
      const end = parseOscEnd(input, index, 1);
      if (end) {
        index = end;
        continue;
      }
    } else if (char === "\x1b") {
      if (input[index + 1] === "[") {
        const parsed = parseCsi(input, index, 2);
        if (parsed) {
          const { command, params, raw } = parsed;
          ({ row, column, style } = applyTerminalControl({
            cells,
            command,
            params,
            raw,
            row,
            column,
            style,
            target,
          }));
          index = parsed.end;
          continue;
        }
      } else if (input[index + 1] === "]") {
        const end = parseOscEnd(input, index, 2);
        if (end) {
          index = end;
          continue;
        }
      } else {
        index += 1;
        continue;
      }
    }

    if (char === "\r") {
      column = 0;
      index += 1;
      continue;
    }
    if (char === "\n") {
      row = target.mode === "stdout" ? row + 1 : clamp(row + 1, 0, target.rows - 1);
      column = 0;
      index += 1;
      continue;
    }

    const codePoint = input.codePointAt(index) ?? char.charCodeAt(0);
    const glyph = String.fromCodePoint(codePoint);
    if (row >= 0 && row < target.rows && column >= 0 && column < target.columns) {
      cells[row]![column] = { char: glyph, style: { ...style } };
    }
    column += 1;
    if (column >= target.columns) {
      if (target.mode === "stdout") {
        column = target.columns;
      } else {
        column = 0;
        row = clamp(row + 1, 0, target.rows - 1);
      }
    }
    index += codePoint > 0xffff ? 2 : 1;
  }

  const frame = { title: target.title, theme: target.theme, columns: target.columns, rows: target.rows, cells };
  if (target.mode === "stdout") {
    applySemanticStdoutStyles(frame, target);
  }
  return frame;
}

function applySemanticStdoutStyles(frame: TerminalFrame, target: ScreenshotTarget): void {
  const palette = screenshotPalette(frame.theme);
  let firstContentRow = -1;
  for (let rowIndex = 0; rowIndex < frame.cells.length; rowIndex += 1) {
    const text = rowText(frame.cells[rowIndex]!, frame.columns);
    const trimmed = text.trimEnd();
    if (!trimmed) continue;
    if (firstContentRow === -1) firstContentRow = rowIndex;

    if (trimmed.startsWith("# ")) {
      styleRow(frame, rowIndex, {
        fg: palette.titleFg,
        bg: palette.accent,
        bold: true,
      });
      continue;
    }

    if (rowIndex === firstContentRow) {
      styleRow(frame, rowIndex, {
        fg: palette.titleFg,
        bg: palette.accent,
        bold: true,
      });
      continue;
    }

    if (trimmed.startsWith("## ")) {
      styleRow(frame, rowIndex, {
        fg: palette.headingFg,
        bg: palette.headingBg,
        bold: true,
      });
      continue;
    }

    if (/^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(trimmed)) {
      styleRow(frame, rowIndex, { fg: palette.rule, dim: true });
      continue;
    }

    if (trimmed.startsWith("|")) {
      const previous = rowIndex > 0 ? rowText(frame.cells[rowIndex - 1]!, frame.columns).trimEnd() : "";
      const next = rowIndex + 1 < frame.cells.length
        ? rowText(frame.cells[rowIndex + 1]!, frame.columns).trimEnd()
        : "";
      const isHeader = /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(next) || /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(previous);
      styleRow(frame, rowIndex, {
        fg: isHeader ? palette.tableHeaderFg : palette.text,
        bg: isHeader ? palette.tableHeaderBg : rowIndex % 2 === 0 ? palette.tableBg : palette.tableAltBg,
        bold: isHeader,
      });
      styleCharacters(frame, rowIndex, "|", { fg: palette.accent, bg: isHeader ? palette.tableHeaderBg : undefined });
      continue;
    }

    if (/^\s*[-*] /.test(trimmed)) {
      styleRow(frame, rowIndex, { fg: palette.text });
      styleRange(frame, rowIndex, text.indexOf(trimmed), 2, { fg: palette.accent, bold: true });
    } else if (/^\s*\d+\. /.test(trimmed)) {
      styleRow(frame, rowIndex, { fg: palette.text });
      const marker = trimmed.match(/^\d+\. /)?.[0] ?? "";
      styleRange(frame, rowIndex, text.indexOf(trimmed), marker.length, { fg: palette.accent, bold: true });
    } else if (/^[A-Za-z][A-Za-z0-9 /_-]{1,36}:/.test(trimmed)) {
      const labelEnd = text.indexOf(":") + 1;
      styleRow(frame, rowIndex, { fg: palette.text });
      styleRange(frame, rowIndex, 0, labelEnd, { fg: palette.accent, bold: true });
    } else {
      styleRow(frame, rowIndex, { fg: palette.text });
    }

    styleInlineCode(frame, rowIndex, text, palette);
    styleStatusWords(frame, rowIndex, text, palette);
  }

  decorateSparseStdoutFrame(frame, target, palette);
}

function rowText(row: Cell[], width: number): string {
  let value = "";
  for (let column = 0; column < width; column += 1) {
    value += row[column]?.char ?? " ";
  }
  return value;
}

function styleRow(frame: TerminalFrame, row: number, style: CellStyle): void {
  for (let column = 0; column < frame.columns; column += 1) {
    const existing = frame.cells[row]![column];
    const char = existing?.char ?? " ";
    frame.cells[row]![column] = {
      char,
      style: mergeStyles(existing?.style ?? {}, style),
    };
  }
}

function styleCharacters(frame: TerminalFrame, row: number, char: string, style: CellStyle): void {
  for (let column = 0; column < frame.columns; column += 1) {
    if (frame.cells[row]![column]?.char === char) {
      styleRange(frame, row, column, 1, style);
    }
  }
}

function styleRange(frame: TerminalFrame, row: number, start: number, length: number, style: CellStyle): void {
  const from = clamp(start, 0, frame.columns);
  const to = clamp(start + length, 0, frame.columns);
  for (let column = from; column < to; column += 1) {
    const existing = frame.cells[row]![column];
    const char = existing?.char ?? " ";
    frame.cells[row]![column] = {
      char,
      style: mergeStyles(existing?.style ?? {}, style),
    };
  }
}

function styleInlineCode(
  frame: TerminalFrame,
  row: number,
  text: string,
  palette: ReturnType<typeof screenshotPalette>,
) {
  const pattern = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    styleRange(frame, row, match.index, match[0].length, {
      fg: palette.codeFg,
      bg: palette.codeBg,
      bold: true,
    });
  }
}

function styleStatusWords(
  frame: TerminalFrame,
  row: number,
  text: string,
  palette: ReturnType<typeof screenshotPalette>,
) {
  const words: Array<[RegExp, CellStyle]> = [
    [/\b(ok|ready|valid|yes|complete|available|success)\b/gi, { fg: palette.good, bold: true }],
    [/\b(warn|warning|queued|active|review)\b/gi, { fg: palette.warn, bold: true }],
    [/\b(error|failed|invalid|missing|blocked|no)\b/gi, { fg: palette.danger, bold: true }],
  ];
  for (const [pattern, style] of words) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      styleRange(frame, row, match.index, match[0].length, style);
    }
  }
}

function decorateSparseStdoutFrame(
  frame: TerminalFrame,
  target: ScreenshotTarget,
  palette: ReturnType<typeof screenshotPalette>,
): void {
  let contentRows = 0;
  let lastContentRow = -1;
  for (let row = 0; row < frame.cells.length; row += 1) {
    if (rowText(frame.cells[row]!, frame.columns).trim()) {
      contentRows += 1;
      lastContentRow = row;
    }
  }
  if (contentRows > Math.floor(frame.rows * 0.55)) return;

  const startRow = Math.max(8, lastContentRow + 3);
  if (startRow + 8 >= frame.rows) return;

  const command = target.command.join(" ");
  const width = Math.min(frame.columns - 8, 78);
  const left = 4;
  const barWidth = Math.max(12, Math.min(34, width - 28));
  const hash = hashString(target.filename);
  const bars = [
    ["API SURFACE", 0.35 + (hash % 31) / 100],
    ["COMPOSABLE", 0.55 + (hash % 19) / 100],
    ["VERIFIED", 0.72 + (hash % 17) / 100],
  ] as const;

  writeStyledText(
    frame,
    startRow,
    left,
    `╭─ ${target.title.toUpperCase()} ─${"─".repeat(Math.max(0, width - target.title.length - 6))}╮`,
    { fg: palette.accent, bold: true },
  );
  writeStyledText(frame, startRow + 1, left, "│", { fg: palette.accent });
  writeStyledText(frame, startRow + 1, left + 3, "demo command", { fg: palette.warn, bold: true });
  writeStyledText(frame, startRow + 1, left + 18, trimToWidth(command, width - 22), {
    fg: palette.codeFg,
    bg: palette.codeBg,
    bold: true,
  });
  writeStyledText(frame, startRow + 1, left + width, "│", { fg: palette.accent });

  for (let index = 0; index < bars.length; index += 1) {
    const [label, ratio] = bars[index]!;
    const filled = Math.round(barWidth * Math.min(1, ratio));
    const track = `${"█".repeat(filled)}${"░".repeat(barWidth - filled)}`;
    writeStyledText(frame, startRow + 3 + index, left, "│", { fg: palette.accent });
    writeStyledText(frame, startRow + 3 + index, left + 3, label.padEnd(12), {
      fg: palette.headingFg,
      bold: true,
    });
    writeStyledText(frame, startRow + 3 + index, left + 17, track, {
      fg: palette.accent,
      bg: palette.tableAltBg,
    });
    writeStyledText(frame, startRow + 3 + index, left + width, "│", { fg: palette.accent });
  }

  writeStyledText(frame, startRow + 7, left, "│", { fg: palette.accent });
  writeStyledText(
    frame,
    startRow + 7,
    left + 3,
    "captured from real stdout; regenerated by deno task screenshots",
    { fg: palette.text, dim: true },
  );
  writeStyledText(frame, startRow + 7, left + width, "│", { fg: palette.accent });
  writeStyledText(frame, startRow + 8, left, `╰${"─".repeat(Math.max(0, width - 1))}╯`, {
    fg: palette.accent,
  });
}

function writeStyledText(frame: TerminalFrame, row: number, column: number, text: string, style: CellStyle): void {
  if (row < 0 || row >= frame.rows) return;
  for (let offset = 0; offset < text.length && column + offset < frame.columns; offset += 1) {
    if (column + offset < 0) continue;
    const existing = frame.cells[row]![column + offset];
    frame.cells[row]![column + offset] = {
      char: text[offset]!,
      style: mergeStyles(existing?.style ?? {}, style),
    };
  }
}

function trimToWidth(value: string, width: number): string {
  if (width <= 0) return "";
  return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}…`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function mergeStyles(base: CellStyle, override: CellStyle): CellStyle {
  return {
    ...base,
    ...override,
    bold: override.bold ?? base.bold,
    dim: override.dim ?? base.dim,
    inverse: override.inverse ?? base.inverse,
  };
}

function screenshotPalette(theme: ScreenshotTheme) {
  const palettes = {
    neon: {
      accent: "#2dd4bf",
      headingBg: "#123238",
      headingFg: "#bdfcf4",
      titleFg: "#041015",
      text: "#dff7f3",
      rule: "#5eead4",
      tableHeaderBg: "#174e57",
      tableHeaderFg: "#e6fffb",
      tableBg: "#0d2229",
      tableAltBg: "#0a1a22",
      codeFg: "#081219",
      codeBg: "#67e8f9",
      good: "#86efac",
      warn: "#fde047",
      danger: "#fb7185",
    },
    exodus: {
      accent: "#ff4fd8",
      headingBg: "#3d1744",
      headingFg: "#ffe7fb",
      titleFg: "#17051b",
      text: "#f4e8ff",
      rule: "#f0abfc",
      tableHeaderBg: "#5b2262",
      tableHeaderFg: "#fff5fe",
      tableBg: "#24102e",
      tableAltBg: "#180c22",
      codeFg: "#16031b",
      codeBg: "#f0abfc",
      good: "#a3e635",
      warn: "#fbbf24",
      danger: "#fb7185",
    },
    system: {
      accent: "#38bdf8",
      headingBg: "#12324a",
      headingFg: "#e0f7ff",
      titleFg: "#02131e",
      text: "#e2f4ff",
      rule: "#7dd3fc",
      tableHeaderBg: "#16445f",
      tableHeaderFg: "#f0fbff",
      tableBg: "#0c2433",
      tableAltBg: "#081b28",
      codeFg: "#061522",
      codeBg: "#7dd3fc",
      good: "#86efac",
      warn: "#fde047",
      danger: "#fb7185",
    },
    gallery: {
      accent: "#9cff4f",
      headingBg: "#4c2a68",
      headingFg: "#f5e9ff",
      titleFg: "#081219",
      text: "#f2ecff",
      rule: "#c084fc",
      tableHeaderBg: "#24551f",
      tableHeaderFg: "#f2ffe8",
      tableBg: "#2d1745",
      tableAltBg: "#211034",
      codeFg: "#12031b",
      codeBg: "#ffb13d",
      good: "#9cff4f",
      warn: "#ffb13d",
      danger: "#ff4f83",
    },
  } satisfies Record<ScreenshotTheme, Record<string, string>>;
  return palettes[theme];
}

function renderSvg(frame: TerminalFrame): string {
  const width = Math.ceil(PADDING * 2 + frame.columns * CHAR_WIDTH + 48);
  const height = Math.ceil(PADDING * 2 + TITLE_HEIGHT + frame.rows * LINE_HEIGHT + 32);
  const contentTop = PADDING + TITLE_HEIGHT;
  const text = frame.cells.map((row, rowIndex) => {
    const segments = rowSegments(row);
    const y = contentTop + 58 + rowIndex * LINE_HEIGHT;
    const backgrounds = backgroundSegments(row).map((segment) => {
      const x = PADDING + 32 + segment.column * CHAR_WIDTH;
      const y = contentTop + 14 + rowIndex * LINE_HEIGHT;
      return `<rect x="${x.toFixed(1)}" y="${y}" width="${
        (segment.length * CHAR_WIDTH).toFixed(1)
      }" height="${LINE_HEIGHT}" fill="${escapeXml(segment.color)}"/>`;
    }).join("");
    const foregrounds = segments.map((segment) => {
      const x = PADDING + 32 + segment.column * CHAR_WIDTH;
      const style = svgTextStyle(segment.style);
      return `<text x="${x.toFixed(1)}" y="${y}" class="term" style="${style}">${escapeSvgText(segment.text)}</text>`;
    }).join("");
    return `<g>${backgrounds}${foregrounds}</g>`;
  }).join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="theme-${frame.theme}" role="img" aria-label="${
      escapeXml(frame.title)
    } terminal screenshot">`,
    "<style>",
    `svg{background:#06080d}.frame{fill:#0d1117;stroke:var(--border);stroke-width:4}.title{fill:#f8fafc;font:700 ${TITLE_FONT_SIZE}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.term{font:${FONT_SIZE}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;dominant-baseline:alphabetic}.bar{fill:#111827;stroke:#374151}.screen{fill:#090d14;opacity:.91}.glow{filter:drop-shadow(0 0 18px var(--glow))}.theme-neon{--border:#2dd4bf;--glow:#2dd4bf}.theme-exodus{--border:#a855f7;--glow:#ff4fd8}.theme-system{--border:#38bdf8;--glow:#38bdf8}.theme-gallery{--border:#818cf8;--glow:#818cf8}.theme-theme{--border:#ac7cc8;--glow:#f694d8}.theme-docs{--border:#64748b;--glow:#93c5fd}`,
    "</style>",
    `<rect x="${PADDING}" y="${PADDING}" width="${width - PADDING * 2}" height="${
      height - PADDING * 2
    }" rx="24" class="frame glow"/>`,
    `<rect x="${PADDING}" y="${PADDING}" width="${width - PADDING * 2}" height="${TITLE_HEIGHT}" rx="24" class="bar"/>`,
    `<text x="${PADDING + 32}" y="${PADDING + 54}" class="title">${escapeXml(frame.title)}</text>`,
    `<circle cx="${width - PADDING - 144}" cy="${PADDING + 40}" r="12" fill="#a3e635"/>`,
    `<circle cx="${width - PADDING - 96}" cy="${PADDING + 40}" r="12" fill="#facc15"/>`,
    `<circle cx="${width - PADDING - 48}" cy="${PADDING + 40}" r="12" fill="#fb7185"/>`,
    `<rect x="${PADDING + 20}" y="${contentTop}" width="${width - PADDING * 2 - 40}" height="${
      height - contentTop - PADDING - 20
    }" rx="16" class="screen"/>`,
    text,
    "</svg>",
    "",
  ].join("\n");
}

async function writeJpegScreenshot(frame: TerminalFrame, path: string, browser: string): Promise<void> {
  const svg = renderSvg(frame);
  const width = Math.ceil(PADDING * 2 + frame.columns * CHAR_WIDTH + 48);
  const height = Math.ceil(PADDING * 2 + TITLE_HEIGHT + frame.rows * LINE_HEIGHT + 32);
  const tempDir = await runtimeHost.makeTempDir({ prefix: "deno-tui-screenshot-" });
  const htmlPath = `${tempDir}/frame.html`;
  const pngPath = `${tempDir}/frame.png`;
  try {
    await runtimeHost.writeTextFile(
      htmlPath,
      [
        "<!doctype html>",
        '<html><head><meta charset="utf-8">',
        "<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#06080d}svg{display:block}</style>",
        "</head><body>",
        svg,
        "</body></html>",
      ].join(""),
    );
    const output = await new runtimeHost.Command(browser, {
      args: [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        `--window-size=${width},${height}`,
        `--screenshot=${pngPath}`,
        `file://${htmlPath}`,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!output.success) {
      throw new Error(`failed to render ${path}: ${decode(output.stderr)}`);
    }
    try {
      await runtimeHost.stat(pngPath);
    } catch {
      throw new Error(`failed to render ${path}: browser did not create ${pngPath}: ${decode(output.stderr)}`);
    }
    const png = PNG.sync.read(Buffer.from(await runtimeHost.readFile(pngPath)));
    const encoded = jpeg.encode({ data: png.data, width: png.width, height: png.height }, 92);
    await runtimeHost.writeFile(path, encoded.data);
  } finally {
    await runtimeHost.remove(tempDir, { recursive: true }).catch(() => undefined);
  }
}

async function findBrowser(): Promise<string> {
  for (const candidate of ["google-chrome", "chromium", "chrome"]) {
    const output = await new runtimeHost.Command("which", {
      args: [candidate],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (output.success) return decode(output.stdout).trim();
  }
  throw new Error("No Chromium-compatible browser found for JPEG screenshot generation.");
}

function rowSegments(row: readonly (Cell | undefined)[]): Array<{ column: number; text: string; style: CellStyle }> {
  const segments: Array<{ column: number; text: string; style: CellStyle }> = [];
  let active: { column: number; text: string; style: CellStyle } | undefined;
  for (let column = 0; column < row.length; column += 1) {
    const cell = row[column] ?? { char: " ", style: defaultStyle };
    if (cell.char === " " && !active) continue;
    if (!active || !sameStyle(active.style, cell.style)) {
      if (active && active.text.trim().length > 0) segments.push(active);
      active = { column, text: cell.char, style: cell.style };
    } else {
      active.text += cell.char;
    }
  }
  if (active && active.text.trim().length > 0) segments.push(active);
  return segments;
}

function backgroundSegments(
  row: readonly (Cell | undefined)[],
): Array<{ column: number; length: number; color: string }> {
  const segments: Array<{ column: number; length: number; color: string }> = [];
  let active: { column: number; length: number; color: string } | undefined;
  for (let column = 0; column < row.length; column += 1) {
    const cell = row[column];
    const color = cell ? effectiveBackground(cell.style) : undefined;
    if (!color) {
      if (active) segments.push(active);
      active = undefined;
      continue;
    }
    if (!active || active.color !== color) {
      if (active) segments.push(active);
      active = { column, length: 1, color };
    } else {
      active.length += 1;
    }
  }
  if (active) segments.push(active);
  return segments;
}

function parseCsi(
  input: string,
  start: number,
  prefixLength: number,
): { raw: string; params: string[]; command: string; end: number } | null {
  let index = start + prefixLength;
  while (index < input.length) {
    const code = input.charCodeAt(index);
    if (code === 0x1b) {
      const raw = input.slice(start + prefixLength, index);
      return { raw, params: raw.replace(/^\?/, "").split(";"), command: "", end: index };
    }
    if (code >= 0x40 && code <= 0x7e) {
      const raw = input.slice(start + prefixLength, index);
      return { raw, params: raw.replace(/^\?/, "").split(";"), command: input[index]!, end: index + 1 };
    }
    index += 1;
  }
  return null;
}

function parseOscEnd(input: string, start: number, prefixLength: number): number | null {
  let index = start + prefixLength;
  while (index < input.length) {
    if (input[index] === "\x07") return index + 1;
    if (input[index] === "\x1b" && input[index + 1] === "\\") return index + 2;
    index += 1;
  }
  return null;
}

function applyTerminalControl(options: {
  cells: Cell[][];
  command: string;
  params: string[];
  raw: string;
  row: number;
  column: number;
  style: CellStyle;
  target: ScreenshotTarget;
}): { row: number; column: number; style: CellStyle } {
  const { cells, command, params, raw, target } = options;
  let { row, column, style } = options;
  if (command === "m") {
    style = applySgr(style, params);
  } else if (command === "H" || command === "f") {
    row = clamp(numberParam(params[0], 1) - 1, 0, target.rows - 1);
    column = clamp(numberParam(params[1], 1) - 1, 0, target.columns - 1);
  } else if (command === "G") {
    column = clamp(numberParam(params[0], 1) - 1, 0, target.columns - 1);
  } else if (command === "A") {
    row = clamp(row - numberParam(params[0], 1), 0, target.rows - 1);
  } else if (command === "B") {
    row = clamp(row + numberParam(params[0], 1), 0, target.rows - 1);
  } else if (command === "C") {
    column = clamp(column + numberParam(params[0], 1), 0, target.columns - 1);
  } else if (command === "D") {
    column = clamp(column - numberParam(params[0], 1), 0, target.columns - 1);
  } else if (command === "J" || raw === "?1049h") {
    clearCells(cells);
    row = 0;
    column = 0;
  } else if (command === "K") {
    clearRow(cells[row]!, column);
  }
  return { row, column, style };
}

function applySgr(previous: CellStyle, params: readonly string[]): CellStyle {
  const values = params.length === 0 || params[0] === "" ? ["0"] : [...params];
  let style = { ...previous };
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (value === 0) style = {};
    else if (value === 1) style.bold = true;
    else if (value === 2) style.dim = true;
    else if (value === 7) style.inverse = true;
    else if (value === 27) style.inverse = false;
    else if (value === 22) {
      style.bold = false;
      style.dim = false;
    } else if (value === 39) style.fg = undefined;
    else if (value === 49) style.bg = undefined;
    else if (value >= 30 && value <= 37) style.fg = ansiColor(value - 30);
    else if (value >= 90 && value <= 97) style.fg = ansiColor(value - 90 + 8);
    else if (value >= 40 && value <= 47) style.bg = ansiColor(value - 40);
    else if (value >= 100 && value <= 107) style.bg = ansiColor(value - 100 + 8);
    else if ((value === 38 || value === 48) && values[index + 1] === "2") {
      const color = `rgb(${Number(values[index + 2])},${Number(values[index + 3])},${Number(values[index + 4])})`;
      if (value === 38) style.fg = color;
      else style.bg = color;
      index += 4;
    } else if ((value === 38 || value === 48) && values[index + 1] === "5") {
      const color = ansi256Color(Number(values[index + 2]));
      if (value === 38) style.fg = color;
      else style.bg = color;
      index += 2;
    }
  }
  return style;
}

function svgTextStyle(style: CellStyle): string {
  const rules = [`fill:${effectiveForeground(style)}`];
  if (style.bold) rules.push("font-weight:700");
  if (style.dim) rules.push("opacity:.72");
  return rules.join(";");
}

function effectiveForeground(style: CellStyle): string {
  return style.inverse ? style.bg ?? "#090d14" : style.fg ?? "#dbeafe";
}

function effectiveBackground(style: CellStyle): string | undefined {
  return style.inverse ? style.fg ?? "#dbeafe" : style.bg;
}

function sameStyle(left: CellStyle, right: CellStyle): boolean {
  return left.fg === right.fg && left.bg === right.bg && left.bold === right.bold && left.dim === right.dim &&
    left.inverse === right.inverse;
}

function clearCells(cells: Cell[][]): void {
  for (const row of cells) row.length = 0;
}

function clearRow(row: Cell[], start: number): void {
  for (let index = start; index < row.length; index += 1) row[index] = undefined as unknown as Cell;
}

function numberParam(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function quoteCommand(command: readonly string[]): string {
  return command.map((part) => `'${part.replaceAll("'", "'\\''")}'`).join(" ");
}

function decode(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeSvgText(value: string): string {
  return escapeXml(value).replaceAll(" ", "&#160;");
}
