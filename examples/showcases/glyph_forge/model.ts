// Copyright 2023 Im-Beast. MIT license.

// GlyphForge domain model (025 §5, vertical slice): a versioned cell-art
// project schema (grid, layers, frames, palette), pure editing operations
// (pencil/line/rect/flood-fill), top-down layer compositing, and a
// deterministic truecolor ANSI export. Everything is JSON-safe and
// renderer-neutral; the studio app and tests share these exact functions.

/** Version stamped into persisted GlyphForge projects. */
export const GLYPHFORGE_PROJECT_SCHEMA_VERSION = 1 as const;

/** Bounds that keep projects and history predictable. */
export const GLYPHFORGE_MAX_COLUMNS = 200;
export const GLYPHFORGE_MAX_ROWS = 100;
export const GLYPHFORGE_MAX_LAYERS = 16;
export const GLYPHFORGE_MAX_FRAMES = 64;

/** One painted cell: a glyph plus palette indices. */
export interface GlyphCell {
  readonly char: string;
  readonly fg: number;
  readonly bg: number;
}

/** One layer: a sparse rows×columns grid; null cells are transparent. */
export interface GlyphLayerData {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly cells: ReadonlyArray<ReadonlyArray<GlyphCell | null>>;
}

/** One animation frame: layers composite bottom to top. */
export interface GlyphFrameData {
  readonly id: string;
  readonly durationMs: number;
  readonly layers: readonly GlyphLayerData[];
}

/** A complete versioned project. */
export interface GlyphProject {
  readonly schemaVersion: typeof GLYPHFORGE_PROJECT_SCHEMA_VERSION;
  readonly name: string;
  readonly columns: number;
  readonly rows: number;
  /** Hex colors ("#rrggbb"); cells reference palette indices. */
  readonly palette: readonly string[];
  readonly frames: readonly GlyphFrameData[];
}

/** One point edit applied to a layer. */
export interface GlyphEdit {
  readonly column: number;
  readonly row: number;
  readonly cell: GlyphCell | null;
}

/** The editing tools of the vertical slice. */
export type GlyphTool = "pencil" | "eraser" | "fill" | "line" | "rect" | "eyedropper" | "text";

/** Parses "#rrggbb" into an RGB triple; throws on malformed palette data. */
export function glyphHexToRgb(hex: string): readonly [number, number, number] {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) throw new TypeError(`Invalid GlyphForge palette color: ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return [(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** An empty transparent layer grid. */
export function emptyGlyphCells(columns: number, rows: number): (GlyphCell | null)[][] {
  return Array.from({ length: rows }, () => new Array<GlyphCell | null>(columns).fill(null));
}

/** Applies point edits immutably, ignoring out-of-bounds points. */
export function applyGlyphEdits(
  layer: GlyphLayerData,
  edits: readonly GlyphEdit[],
  columns: number,
  rows: number,
): GlyphLayerData {
  const cells = layer.cells.map((row) => [...row]);
  for (const edit of edits) {
    if (edit.column < 0 || edit.column >= columns || edit.row < 0 || edit.row >= rows) continue;
    cells[edit.row]![edit.column] = edit.cell;
  }
  return { ...layer, cells };
}

/** Bresenham line points, inclusive of both endpoints. */
export function glyphLinePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { column: number; row: number }[] {
  const points: { column: number; row: number }[] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const targetX = Math.round(x1);
  const targetY = Math.round(y1);
  const dx = Math.abs(targetX - x);
  const dy = -Math.abs(targetY - y);
  const stepX = x < targetX ? 1 : -1;
  const stepY = y < targetY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push({ column: x, row: y });
    if (x === targetX && y === targetY) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
  return points;
}

/** Rectangle outline (or filled) points between two corners, inclusive. */
export function glyphRectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled = false,
): { column: number; row: number }[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const points: { column: number; row: number }[] = [];
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      if (filled || row === top || row === bottom || column === left || column === right) {
        points.push({ column, row });
      }
    }
  }
  return points;
}

/** Flood-fill edits from a seed point over cells matching the seed value. */
export function glyphFloodFillEdits(
  layer: GlyphLayerData,
  column: number,
  row: number,
  cell: GlyphCell | null,
  columns: number,
  rows: number,
): GlyphEdit[] {
  if (column < 0 || column >= columns || row < 0 || row >= rows) return [];
  const matches = (a: GlyphCell | null, b: GlyphCell | null): boolean =>
    a === null ? b === null : b !== null && a.char === b.char && a.fg === b.fg && a.bg === b.bg;
  const seed = layer.cells[row]?.[column] ?? null;
  if (matches(seed, cell)) return [];
  const visited = new Set<number>();
  const queue: number[] = [row * columns + column];
  const edits: GlyphEdit[] = [];
  while (queue.length > 0) {
    const key = queue.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const y = Math.floor(key / columns);
    const x = key % columns;
    if (!matches(layer.cells[y]?.[x] ?? null, seed)) continue;
    edits.push({ column: x, row: y, cell });
    if (x > 0) queue.push(key - 1);
    if (x < columns - 1) queue.push(key + 1);
    if (y > 0) queue.push(key - columns);
    if (y < rows - 1) queue.push(key + columns);
  }
  return edits;
}

/** Composites one frame's visible layers bottom to top. */
export function compositeGlyphFrame(project: GlyphProject, frameIndex: number): (GlyphCell | null)[][] {
  const frame = project.frames[frameIndex];
  const output = emptyGlyphCells(project.columns, project.rows);
  if (!frame) return output;
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    for (let row = 0; row < project.rows; row += 1) {
      for (let column = 0; column < project.columns; column += 1) {
        const cell = layer.cells[row]?.[column];
        if (cell) output[row]![column] = cell;
      }
    }
  }
  return output;
}

/**
 * Deterministic truecolor ANSI export of one frame. Runs of identical
 * style share one SGR; every row resets so the art pastes cleanly.
 */
export function glyphFrameToAnsi(project: GlyphProject, frameIndex: number): string {
  const composite = compositeGlyphFrame(project, frameIndex);
  const lines: string[] = [];
  for (let row = 0; row < project.rows; row += 1) {
    let line = "";
    let activeKey = "";
    for (let column = 0; column < project.columns; column += 1) {
      const cell = composite[row]![column];
      if (!cell) {
        if (activeKey !== "") {
          line += "\x1b[0m";
          activeKey = "";
        }
        line += " ";
        continue;
      }
      const key = `${cell.fg}/${cell.bg}`;
      if (key !== activeKey) {
        const fg = glyphHexToRgb(project.palette[cell.fg] ?? "#ffffff");
        const bg = glyphHexToRgb(project.palette[cell.bg] ?? "#000000");
        line += `\x1b[38;2;${fg[0]};${fg[1]};${fg[2]};48;2;${bg[0]};${bg[1]};${bg[2]}m`;
        activeKey = key;
      }
      line += cell.char;
    }
    if (activeKey !== "") line += "\x1b[0m";
    lines.push(line);
  }
  return lines.join("\n");
}

/** Strictly normalizes a persisted project; anything malformed falls back. */
export function normalizeGlyphProject(value: unknown, fallback: () => GlyphProject): GlyphProject {
  if (!value || typeof value !== "object") return fallback();
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== GLYPHFORGE_PROJECT_SCHEMA_VERSION) return fallback();
  const columns = clampInt(record.columns, 1, GLYPHFORGE_MAX_COLUMNS);
  const rows = clampInt(record.rows, 1, GLYPHFORGE_MAX_ROWS);
  if (columns === undefined || rows === undefined) return fallback();
  if (!Array.isArray(record.palette) || record.palette.length === 0 || record.palette.length > 64) {
    return fallback();
  }
  const palette: string[] = [];
  for (const entry of record.palette) {
    if (typeof entry !== "string" || !/^#[\da-f]{6}$/i.test(entry)) return fallback();
    palette.push(entry.toLowerCase());
  }
  if (
    !Array.isArray(record.frames) || record.frames.length === 0 ||
    record.frames.length > GLYPHFORGE_MAX_FRAMES
  ) {
    return fallback();
  }
  const frames: GlyphFrameData[] = [];
  for (const frameValue of record.frames) {
    const frame = normalizeFrame(frameValue, columns, rows, palette.length);
    if (!frame) return fallback();
    frames.push(frame);
  }
  const name = typeof record.name === "string" && record.name.length > 0 && record.name.length <= 64
    ? record.name
    : "untitled";
  return { schemaVersion: GLYPHFORGE_PROJECT_SCHEMA_VERSION, name, columns, rows, palette, frames };
}

function normalizeFrame(
  value: unknown,
  columns: number,
  rows: number,
  paletteSize: number,
): GlyphFrameData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.length > 0 && record.id.length <= 64 ? record.id : undefined;
  const durationMs = clampInt(record.durationMs, 16, 60_000);
  if (id === undefined || durationMs === undefined) return undefined;
  if (
    !Array.isArray(record.layers) || record.layers.length === 0 ||
    record.layers.length > GLYPHFORGE_MAX_LAYERS
  ) {
    return undefined;
  }
  const layers: GlyphLayerData[] = [];
  for (const layerValue of record.layers) {
    if (!layerValue || typeof layerValue !== "object") return undefined;
    const layer = layerValue as Record<string, unknown>;
    const layerId = typeof layer.id === "string" && layer.id.length > 0 && layer.id.length <= 64 ? layer.id : undefined;
    const name = typeof layer.name === "string" && layer.name.length > 0 && layer.name.length <= 64
      ? layer.name
      : undefined;
    if (layerId === undefined || name === undefined) return undefined;
    if (!Array.isArray(layer.cells)) return undefined;
    const cells = emptyGlyphCells(columns, rows);
    for (let row = 0; row < rows; row += 1) {
      const sourceRow = layer.cells[row];
      if (!Array.isArray(sourceRow)) continue;
      for (let column = 0; column < columns; column += 1) {
        const cell = sourceRow[column];
        if (!cell || typeof cell !== "object") continue;
        const data = cell as Record<string, unknown>;
        if (
          typeof data.char !== "string" || data.char.length !== 1 ||
          typeof data.fg !== "number" || !Number.isInteger(data.fg) || data.fg < 0 || data.fg >= paletteSize ||
          typeof data.bg !== "number" || !Number.isInteger(data.bg) || data.bg < 0 || data.bg >= paletteSize
        ) {
          continue;
        }
        cells[row]![column] = { char: data.char, fg: data.fg, bg: data.bg };
      }
    }
    layers.push({
      id: layerId,
      name,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      cells,
    });
  }
  return { id, durationMs, layers };
}

function clampInt(value: unknown, low: number, high: number): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= low && value <= high ? value : undefined;
}

/** The classic 16-color palette the fixture project paints with. */
export const GLYPHFORGE_FIXTURE_PALETTE: readonly string[] = [
  "#101010",
  "#aa0000",
  "#00aa00",
  "#aa5500",
  "#0000aa",
  "#aa00aa",
  "#00aaaa",
  "#aaaaaa",
  "#555555",
  "#ff5555",
  "#55ff55",
  "#ffff55",
  "#5555ff",
  "#ff55ff",
  "#55ffff",
  "#ffffff",
];

/** The seeded starter project: two layers, two animation frames. */
export function glyphForgeFixtureProject(): GlyphProject {
  const columns = 40;
  const rows = 14;
  const background = emptyGlyphCells(columns, rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      // A dim horizon gradient: deep blue sky over a dark ground band.
      const cell = row < rows - 3
        ? { char: row % 3 === 0 && column % 7 === 3 ? "✦" : " ", fg: 15, bg: 0 }
        : { char: "▒", fg: 8, bg: 0 };
      background[row]![column] = cell;
    }
  }
  const art = emptyGlyphCells(columns, rows);
  const word = "NOVA";
  const glyph = [
    "█▄ █ ▄▀▄ █ █ ▄▀▄",
    "█ ▀█ ▀▄▀ ▀▄▀ █▀█",
  ];
  for (let row = 0; row < glyph.length; row += 1) {
    const line = glyph[row]!;
    for (let column = 0; column < line.length; column += 1) {
      const char = line[column]!;
      if (char === " ") continue;
      art[row + 5]![column + 12] = { char, fg: 11, bg: 0 };
    }
  }
  void word;
  const frameOne: GlyphFrameData = {
    id: "frame-1",
    durationMs: 400,
    layers: [
      { id: "sky", name: "Sky", visible: true, locked: false, cells: background },
      { id: "title", name: "Title", visible: true, locked: false, cells: art },
    ],
  };
  // Frame two shifts the title color for a simple two-step blink.
  const artBlink = art.map((row) => row.map((cell) => (cell ? { ...cell, fg: 9 } : null) as GlyphCell | null));
  const frameTwo: GlyphFrameData = {
    id: "frame-2",
    durationMs: 400,
    layers: [
      { id: "sky", name: "Sky", visible: true, locked: false, cells: background },
      { id: "title", name: "Title", visible: true, locked: false, cells: artBlink },
    ],
  };
  return {
    schemaVersion: GLYPHFORGE_PROJECT_SCHEMA_VERSION,
    name: "nova-starter",
    columns,
    rows,
    palette: GLYPHFORGE_FIXTURE_PALETTE,
    frames: [frameOne, frameTwo],
  };
}
