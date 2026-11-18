import { runtimeHost } from "../src/runtime/host.ts";
import { htmlCssLayoutBoxStyle, htmlCssVisibleLayoutBoxesInto } from "../app/html_css_layout_view.ts";
import { makeStyle, palette } from "../app/styles.ts";
import { clipRect } from "../src/app/hit_targets.ts";
import { type ComputedLayoutBox, createHtmlCssLayoutDemo, htmlCssLayoutDemoBoxLabel } from "../mod.ts";
import type { Rectangle } from "../src/types.ts";

const bounds = {
  column: 0,
  row: 0,
  width: Number(runtimeHost.args.find((arg) => arg.startsWith("--width="))?.slice("--width=".length)) || 96,
  height: Number(runtimeHost.args.find((arg) => arg.startsWith("--height="))?.slice("--height=".length)) || 30,
};
const result = createHtmlCssLayoutDemo(bounds);
const frame = createFrame(bounds.width, bounds.height, palette.void);
const boxes: ComputedLayoutBox[] = [];
htmlCssVisibleLayoutBoxesInto(boxes, result.layout.boxes);

for (const box of boxes) renderBox(frame, box, bounds);

fillRect(frame, { column: 1, row: 1, width: Math.max(0, bounds.width - 2), height: 1 }, palette.panelSoft);
writeText(frame, 1, 2, "HTML/CSS WORKBENCH", {
  fg: palette.void,
  bg: palette.signal,
  bold: true,
});
fillRect(
  frame,
  { column: 1, row: bounds.height - 3, width: Math.max(0, bounds.width - 2), height: 2 },
  palette.panelSoft,
);
writeText(frame, bounds.height - 3, 2, "parse markup -> cascade CSS -> solve layout -> render terminal cells", {
  fg: palette.signal,
  bg: palette.panelSoft,
  bold: true,
});
writeText(
  frame,
  bounds.height - 2,
  2,
  "flex-wrap, CSS Grid, fr tracks, media rules, absolute badge, shared workbench styling",
  {
    fg: palette.paper,
    bg: palette.panelSoft,
  },
);

console.log(renderFrame(frame));

function renderBox(frame: Cell[][], box: ComputedLayoutBox, bounds: Rectangle): void {
  const rect = clipRect(box.rect, bounds);
  if (rect.width <= 0 || rect.height <= 0) return;
  const style = htmlCssLayoutBoxStyle(box, {
    accent: palette.signal,
    accentDeep: palette.phosphor,
    background: palette.void,
    border: palette.dim,
    borderStrong: palette.signal,
    buttonActiveBg: palette.phosphor,
    buttonActiveText: palette.void,
    danger: palette.alarm,
    muted: palette.dim,
    panel: palette.panel,
    panelSoft: palette.panelSoft,
    soft: palette.dim,
    surface: palette.voidSoft,
    text: palette.paper,
    warn: palette.amber,
  }, contrastText);
  fillRect(frame, rect, style.bg);
  if (box.id === "layout-demo") return;
  drawOutline(frame, rect, style.border, style.bg, style.bold === true);

  const content = clipRect(box.contentRect, bounds);
  if (content.width <= 0 || content.height <= 0) return;
  if (box.id === "layout-stage") return;
  writeText(frame, content.row, content.column, fit(htmlCssLayoutDemoBoxLabel(box), content.width), {
    fg: style.fg,
    bg: style.bg,
    bold: style.bold === true,
  });
  if (content.height > 1 && box.text) {
    writeText(frame, content.row + 1, content.column, fit(box.text, content.width), {
      fg: palette.paper,
      bg: style.bg,
    });
  }
  if (content.height > 2 && (box.id.startsWith("metric-") || box.id.startsWith("grid-"))) {
    const detail = `${box.rect.width}x${box.rect.height} content ${box.contentRect.width}x${box.contentRect.height}`;
    writeText(frame, content.row + 2, content.column, fit(detail, content.width), {
      fg: palette.dim,
      bg: style.bg,
    });
  }
}

interface CellStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
}

interface Cell extends CellStyle {
  char: string;
}

function createFrame(width: number, height: number, bg: string): Cell[][] {
  const rows = new Array<Cell[]>(height);
  for (let row = 0; row < height; row += 1) {
    const cells = new Array<Cell>(width);
    for (let column = 0; column < width; column += 1) cells[column] = { char: " ", bg };
    rows[row] = cells;
  }
  return rows;
}

function fillRect(frame: Cell[][], rect: Rectangle, bg: string): void {
  for (let row = rect.row; row < rect.row + rect.height && row < frame.length; row += 1) {
    const cells = frame[row];
    if (!cells) continue;
    for (let column = rect.column; column < rect.column + rect.width && column < cells.length; column += 1) {
      if (column >= 0) cells[column] = { char: " ", bg };
    }
  }
}

function drawOutline(frame: Cell[][], rect: Rectangle, fg: string, bg: string, bold = false): void {
  if (rect.width < 2 || rect.height < 2) return;
  writeText(frame, rect.row, rect.column, `+${"-".repeat(Math.max(0, rect.width - 2))}+`, { fg, bg, bold });
  for (let row = rect.row + 1; row < rect.row + rect.height - 1; row += 1) {
    writeText(frame, row, rect.column, "|", { fg, bg, bold });
    writeText(frame, row, rect.column + rect.width - 1, "|", { fg, bg, bold });
  }
  writeText(frame, rect.row + rect.height - 1, rect.column, `+${"-".repeat(Math.max(0, rect.width - 2))}+`, {
    fg,
    bg,
    bold,
  });
}

function writeText(frame: Cell[][], row: number, column: number, value: string, style: CellStyle): void {
  const cells = frame[row];
  if (!cells) return;
  for (let index = 0; index < value.length && column + index < cells.length; index += 1) {
    if (column + index < 0) continue;
    cells[column + index] = { char: value[index]!, ...style };
  }
}

function renderFrame(frame: Cell[][]): string {
  const rows = new Array<string>(frame.length);
  for (let row = 0; row < frame.length; row += 1) {
    let line = "";
    let run = "";
    let previousKey = "";
    let previousStyle: CellStyle = {};
    const flushRun = () => {
      if (run.length === 0) return;
      line += makeStyle(previousStyle)(run);
      run = "";
    };
    for (let column = 0; column < frame[row]!.length; column += 1) {
      const cell = frame[row]![column]!;
      const key = `${cell.fg ?? ""}|${cell.bg ?? ""}|${cell.bold === true ? "1" : "0"}`;
      if (column === 0) {
        previousKey = key;
        previousStyle = { fg: cell.fg, bg: cell.bg, bold: cell.bold };
      } else if (key !== previousKey) {
        flushRun();
        previousKey = key;
        previousStyle = { fg: cell.fg, bg: cell.bg, bold: cell.bold };
      }
      run += cell.char;
    }
    flushRun();
    rows[row] = `${line}\x1b[0m`;
  }
  return rows.join("\n");
}

function fit(value: string, width: number): string {
  if (width <= 0) return "";
  return value.length <= width ? value.padEnd(width, " ") : `${value.slice(0, Math.max(0, width - 3))}...`;
}

function contrastText(color: string, dark: string, light: string): string {
  const normalized = color.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? dark : light;
}
