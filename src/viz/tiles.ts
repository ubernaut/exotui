// Copyright 2023 Im-Beast. MIT license.

// Dividing an area into tiles, and deciding what each one draws.
//
// The alternative is a table of which panels each terminal size may show, which
// is a rule someone has to keep updating and still cannot answer the question
// that matters: a machine with eighty-eight cores and one with four want
// different charts at the same size. So nothing here is a table. Sources are
// divided into equal tiles and each tile asks the registry what suits its data
// at its size, which makes the layout a function of the data rather than of a
// list of breakpoints.
//
// Promoted out of exomonitor, where it was written and where none of it ever
// knew what a CPU was.

import type { Rectangle } from "../types.ts";
import type { VizDataShape, VizFit } from "./fit.ts";
import { fitVisualizations } from "./registry.ts";

/** Narrower than this and a tile cannot hold even a label and a number. */
export const MIN_TILE_WIDTH = 7;
export const MIN_TILE_HEIGHT = 1;

/**
 * Below this, every entry is sharing cells with its neighbours and the chart is
 * a texture rather than a reading. A tile at or under it draws no chart, which
 * is how a very small area ends up showing labelled numbers without anyone
 * writing a mode for that.
 */
export const MINIMUM_CROWDING = 0.2;

/** A tile gets a border once it can spare two columns and two rows for one. */
export function isFramed(size: { readonly width: number; readonly height: number }): boolean {
  return size.width >= 14 && size.height >= 5;
}

/**
 * Character cells are about twice as tall as they are wide, and a chart plots
 * time across the horizontal, so the tile that reads best is wider than square.
 */
const TARGET_ASPECT = 3;

export interface TileGrid {
  readonly columns: number;
  readonly rows: number;
}

/**
 * The grid shape for this many tiles in this area, or none if they will not fit.
 *
 * Chooses the column count whose tiles come closest to the target proportion,
 * penalising a grid that leaves cells empty — six tiles as 3x2 beats 4x2 with
 * two holes in it, even where the holes would make the rest better shaped.
 */
export function gridFor(area: Rectangle, count: number): TileGrid | undefined {
  if (count <= 0 || area.width <= 0 || area.height <= 0) return undefined;
  let best: { grid: TileGrid; score: number } | undefined;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const width = Math.floor(area.width / columns);
    const height = Math.floor(area.height / rows);
    if (width < MIN_TILE_WIDTH || height < MIN_TILE_HEIGHT) continue;
    const aspect = Math.abs(Math.log(width / height / TARGET_ASPECT));
    const score = aspect + (columns * rows - count) * 0.15;
    if (!best || score < best.score) best = { grid: { columns, rows }, score };
  }
  return best?.grid;
}

/** Splits a length into whole parts, spreading the remainder over the first few. */
function split(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < extra ? 1 : 0));
}

/**
 * Places `count` tiles across the area.
 *
 * A final row holding fewer tiles spreads them over the full width rather than
 * leaving a hole. They are then not quite equal, which is the right trade: a
 * gap in the corner reads as a bug and a slightly wider tile does not.
 */
export function placeTiles(area: Rectangle, count: number): Rectangle[] {
  const grid = gridFor(area, count);
  if (!grid) return [];
  const heights = split(area.height, grid.rows);
  const rects: Rectangle[] = [];
  // Neighbouring borders butted together read as one doubled line. A tile that
  // can spare a column and a row gives them up, so every tile is surrounded by
  // ground instead of by its neighbour. A column is cheap once a tile is wide
  // enough; a row is not, so short tiles keep theirs.
  const tileWidth = Math.floor(area.width / grid.columns);
  const tileHeight = Math.floor(area.height / grid.rows);
  const columnGutter = grid.columns > 1 && tileWidth >= MIN_TILE_WIDTH + 2 ? 1 : 0;
  const rowGutter = grid.rows > 1 && tileWidth >= 16 && tileHeight >= 7 ? 1 : 0;
  let placed = 0;
  let row = area.row;
  for (let index = 0; index < grid.rows; index += 1) {
    const height = heights[index]!;
    const inRow = Math.min(grid.columns, count - placed);
    const widths = split(area.width, inRow);
    let column = area.column;
    for (const width of widths) {
      rects.push({ column, row, width: width - columnGutter, height: height - rowGutter });
      column += width;
    }
    placed += inRow;
    row += height;
  }
  return rects;
}

/** Where a tile's chart draws, given the chrome the tile can afford. */
export function chartRectFor(rect: Rectangle): Rectangle {
  if (isFramed(rect)) {
    return { column: rect.column + 1, row: rect.row + 1, width: rect.width - 2, height: rect.height - 2 };
  }
  // Unframed, the title takes the first row and the chart gets the rest.
  return { column: rect.column, row: rect.row + 1, width: rect.width, height: Math.max(0, rect.height - 1) };
}

/** What a tile needs to know about one thing it might draw. */
export interface TileSource {
  readonly id: string;
  /** What the data is, now — entry counts come from the running system. */
  readonly shape: VizDataShape;
  /**
   * The visualisation this source is best shown as, where several fit.
   *
   * Ranking knows the shape of the data; it cannot know that a spectrum reads
   * best as a trace and per-core load reads best as a waterfall. That is
   * knowledge about the subject, so it comes from the caller. A user's pin
   * still wins, and a preference that does not fit is ignored like any other.
   */
  readonly prefer?: string;
}

export interface VizTile<T extends TileSource = TileSource> {
  readonly source: T;
  readonly rect: Rectangle;
  readonly chart: Rectangle;
  readonly framed: boolean;
  /** The visualisation to draw, or none where no candidate is worth drawing. */
  readonly visualization: string | undefined;
  /** Every candidate, best first, for a settings page to offer and explain. */
  readonly fits: readonly VizFit[];
}

export interface TileLayout<T extends TileSource = TileSource> {
  readonly tiles: readonly VizTile<T>[];
  /** Sources dropped so the rest stay readable. */
  readonly omitted: readonly T[];
}

export interface PlanTilesOptions {
  /** A visualisation the user pinned, by source id; ignored where it no longer fits. */
  readonly overrides?: ReadonlyMap<string, string>;
  /** Override the point below which a tile keeps its number and drops its chart. */
  readonly minimumCrowding?: number;
}

/**
 * Lays sources out and picks each tile's visualisation.
 *
 * Where they do not all fit, the last ones are dropped rather than every tile
 * being squeezed below readability — and the dropped ones are reported, because
 * a display that quietly stops showing something is worse than one that says it
 * has no room for it.
 */
export function planTiles<T extends TileSource>(
  area: Rectangle,
  sources: readonly T[],
  options: PlanTilesOptions = {},
): TileLayout<T> {
  const overrides = options.overrides ?? new Map<string, string>();
  const floor = options.minimumCrowding ?? MINIMUM_CROWDING;
  let shown = sources.length;
  let rects: Rectangle[] = [];
  while (shown > 0) {
    rects = placeTiles(area, shown);
    if (rects.length === shown) break;
    shown -= 1;
  }
  if (shown === 0) return { tiles: [], omitted: [...sources] };

  const tiles: VizTile<T>[] = [];
  for (let index = 0; index < shown; index += 1) {
    const source = sources[index]!;
    const rect = rects[index]!;
    const chart = chartRectFor(rect);
    const fits = chart.width > 0 && chart.height > 0 ? fitVisualizations(source.shape, chart) : [];
    // The user's pin first, then what the source says suits it, then whatever
    // ranked highest on shape alone.
    const preferred = fits.find((fit) => fit.id === overrides.get(source.id)) ??
      fits.find((fit) => fit.id === source.prefer) ??
      fits[0];
    // A chart nobody can read is worse than the number on its own.
    const chosen = preferred && preferred.crowding >= floor ? preferred : undefined;
    tiles.push({ source, rect, chart, framed: isFramed(rect), visualization: chosen?.id, fits });
  }
  return { tiles, omitted: sources.slice(shown) };
}
