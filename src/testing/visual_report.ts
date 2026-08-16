// Copyright 2023 Im-Beast. MIT license.

// 036 T1: visual changes produce a reviewable artifact, not only a
// pass/fail checksum. Scene captures render to styled HTML panes and SVG
// frames (SGR → CSS for the common palette, truecolor, and 256-color
// forms; unrecognized codes keep their raw prefix in a data attribute),
// and a before/after diff report embeds both panes with changed lines
// highlighted and the mismatch table inline. The matrix runner drives one
// scenario across terminal sizes × key sequences and returns one labeled,
// reproducible capture per cell.

import type { TerminalSceneCapture, TerminalStyledSpan } from "./scene.ts";
import { compareTerminalSnapshot, type TerminalSnapshotMismatch } from "./snapshot.ts";

/** CSS derived from one span's SGR prefix. */
export interface SgrCss {
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverted?: boolean;
  /** Numeric SGR parameters that did not map to a CSS property. */
  unmapped: number[];
}

const BASE_PALETTE = [
  "#000000",
  "#cd3131",
  "#0dbc79",
  "#e5e510",
  "#2472c8",
  "#bc3fbc",
  "#11a8cd",
  "#e5e5e5",
  "#666666",
  "#f14c4c",
  "#23d18b",
  "#f5f543",
  "#3b8eea",
  "#d670d6",
  "#29b8db",
  "#ffffff",
];

function xterm256(index: number): string {
  if (index < 16) return BASE_PALETTE[index]!;
  if (index < 232) {
    const cube = index - 16;
    const level = (component: number) => (component === 0 ? 0 : 55 + component * 40);
    const r = level(Math.floor(cube / 36));
    const g = level(Math.floor(cube / 6) % 6);
    const b = level(cube % 6);
    return `rgb(${r},${g},${b})`;
  }
  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray},${gray},${gray})`;
}

/** Parses one SGR prefix (possibly several sequences) into CSS properties. */
export function sgrToCss(style: string): SgrCss {
  const css: SgrCss = { unmapped: [] };
  const params: number[] = [];
  for (const match of style.matchAll(/\x1b\[([0-9;]*)m/g)) {
    for (const part of (match[1] === "" ? "0" : match[1]!).split(";")) params.push(Number(part));
  }
  for (let index = 0; index < params.length; index += 1) {
    const code = params[index]!;
    if (code === 0) {
      css.color = css.background = undefined;
      css.bold =
        css.italic =
        css.underline =
        css.strikethrough =
        css.inverted =
          undefined;
    } else if (code === 1) css.bold = true;
    else if (code === 3) css.italic = true;
    else if (code === 4) css.underline = true;
    else if (code === 7) css.inverted = true;
    else if (code === 9) css.strikethrough = true;
    else if (code >= 30 && code <= 37) css.color = BASE_PALETTE[code - 30];
    else if (code >= 90 && code <= 97) css.color = BASE_PALETTE[code - 90 + 8];
    else if (code >= 40 && code <= 47) css.background = BASE_PALETTE[code - 40];
    else if (code >= 100 && code <= 107) css.background = BASE_PALETTE[code - 100 + 8];
    else if ((code === 38 || code === 48) && params[index + 1] === 2) {
      const value = `rgb(${params[index + 2] ?? 0},${params[index + 3] ?? 0},${params[index + 4] ?? 0})`;
      if (code === 38) css.color = value;
      else css.background = value;
      index += 4;
    } else if ((code === 38 || code === 48) && params[index + 1] === 5) {
      const value = xterm256(params[index + 2] ?? 0);
      if (code === 38) css.color = value;
      else css.background = value;
      index += 2;
    } else css.unmapped.push(code);
  }
  return css;
}

function cssDeclarations(css: SgrCss): string {
  const color = css.inverted ? css.background ?? "#1e1e1e" : css.color;
  const background = css.inverted ? css.color ?? "#e5e5e5" : css.background;
  const parts: string[] = [];
  if (color) parts.push(`color:${color}`);
  if (background) parts.push(`background:${background}`);
  if (css.bold) parts.push("font-weight:bold");
  if (css.italic) parts.push("font-style:italic");
  const decorations = [css.underline ? "underline" : "", css.strikethrough ? "line-through" : ""]
    .filter(Boolean);
  if (decorations.length > 0) parts.push(`text-decoration:${decorations.join(" ")}`);
  return parts.join(";");
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function rowsOf(capture: TerminalSceneCapture): Map<number, TerminalStyledSpan[]> {
  const rows = new Map<number, TerminalStyledSpan[]>();
  for (const span of capture.spans) {
    const row = rows.get(span.row) ?? [];
    row.push(span);
    rows.set(span.row, row);
  }
  for (const row of rows.values()) row.sort((left, right) => left.column - right.column);
  return rows;
}

function rowCountOf(capture: TerminalSceneCapture): number {
  let count = capture.text.split("\n").length;
  for (const span of capture.spans) count = Math.max(count, span.row + 1);
  return count;
}

/** Renders one capture as a styled HTML pane. */
export function renderSceneHtml(capture: TerminalSceneCapture, options: { changedLines?: Set<number> } = {}): string {
  const rows = rowsOf(capture);
  const lines: string[] = [];
  for (let row = 0; row < rowCountOf(capture); row += 1) {
    const parts: string[] = [];
    let cursor = 0;
    for (const span of rows.get(row) ?? []) {
      if (span.column > cursor) parts.push(" ".repeat(span.column - cursor));
      const css = sgrToCss(span.style);
      const declarations = cssDeclarations(css);
      const unmapped = css.unmapped.length > 0 ? ` data-sgr="${css.unmapped.join(";")}"` : "";
      parts.push(
        declarations || unmapped
          ? `<span style="${declarations}"${unmapped}>${escapeHtml(span.text)}</span>`
          : escapeHtml(span.text),
      );
      cursor = span.column + span.text.length;
    }
    const changed = options.changedLines?.has(row + 1) ? ' class="changed"' : "";
    lines.push(`<div${changed}>${parts.join("") || " "}</div>`);
  }
  return `<pre class="terminal">${lines.join("\n")}</pre>`;
}

/** Renders one capture as a standalone SVG frame. */
export function renderSceneSvg(capture: TerminalSceneCapture): string {
  const cellWidth = 8.4;
  const cellHeight = 17;
  const rows = rowCountOf(capture);
  const columns = Math.max(1, ...capture.spans.map((span) => span.column + span.text.length));
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(columns * cellWidth)}" height="${
      rows * cellHeight
    }" font-family="monospace" font-size="14">`,
    `<rect width="100%" height="100%" fill="#1e1e1e"/>`,
  ];
  for (const span of capture.spans) {
    const css = sgrToCss(span.style);
    const x = span.column * cellWidth;
    const y = span.row * cellHeight;
    const background = css.inverted ? css.color ?? "#e5e5e5" : css.background;
    if (background) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${span.text.length * cellWidth}" height="${cellHeight}" fill="${background}"/>`,
      );
    }
    const fill = (css.inverted ? css.background : css.color) ?? "#e5e5e5";
    const weight = css.bold ? ' font-weight="bold"' : "";
    parts.push(
      `<text x="${x}" y="${y + cellHeight - 4}" fill="${fill}"${weight} xml:space="preserve">${
        escapeHtml(span.text)
      }</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}

/** One before/after visual diff artifact. */
export interface SceneDiffReport {
  pass: boolean;
  mismatches: TerminalSnapshotMismatch[];
  /** Complete standalone HTML document for review. */
  html: string;
}

/** Builds the reviewable HTML diff artifact for two captures. */
export function renderSceneDiffReport(
  before: TerminalSceneCapture,
  after: TerminalSceneCapture,
  options: { title?: string } = {},
): SceneDiffReport {
  const comparison = compareTerminalSnapshot(after.text, before.text, { maxMismatches: 64 });
  const changedLines = new Set(comparison.mismatches.map((mismatch) => mismatch.line));
  const title = options.title ?? "Terminal visual diff";
  const mismatchRows = comparison.mismatches
    .map((mismatch) =>
      `<tr><td>${mismatch.line}:${mismatch.column}</td><td>${escapeHtml(mismatch.expected)}</td><td>${
        escapeHtml(mismatch.actual)
      }</td></tr>`
    )
    .join("");
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{background:#252526;color:#e5e5e5;font-family:monospace}
.panes{display:flex;gap:16px}
.terminal{background:#1e1e1e;padding:8px;line-height:17px}
.terminal .changed{outline:1px solid #f14c4c}
table{border-collapse:collapse}td,th{border:1px solid #666;padding:2px 6px}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p>${comparison.pass ? "No visual changes." : `${comparison.mismatches.length} changed line(s).`}</p>
<div class="panes"><div><h2>Before</h2>${renderSceneHtml(before, { changedLines })}</div>
<div><h2>After</h2>${renderSceneHtml(after, { changedLines })}</div></div>
${
    comparison.pass
      ? ""
      : `<h2>Mismatches</h2><table><tr><th>line:col</th><th>before</th><th>after</th></tr>${mismatchRows}</table>`
  }
</body></html>`;
  return { pass: comparison.pass, mismatches: comparison.mismatches, html };
}
