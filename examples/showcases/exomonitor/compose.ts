// The whole screen as one frame of coloured cells.
//
// The chrome — borders, titles, readings, compositing — comes from
// @ubernaut/exotui/viz, which is where it belongs: none of it knows what a CPU
// is. What is left here is the part that does. How a feed reads as one line of
// text, how busy its latest value is, and which stream each tile draws.

import {
  blitFrame,
  drawStream,
  drawTileFrame,
  drawTileLabel,
  groundless,
  screenFrame,
  visualizationById,
  type VisualizationTheme,
  type VizCell,
  type VizFrame,
  writeText,
} from "../../../src/viz/mod.ts";
import type { Rgb } from "../../../mod.ts";
import { type Feed, type FeedStreams, formatValue } from "./feeds.ts";
import type { FeedLayout, FeedTile } from "./tiles.ts";

export interface ScreenModel {
  readonly width: number;
  readonly height: number;
  readonly layout: FeedLayout;
  readonly streams: FeedStreams;
  readonly theme: VisualizationTheme;
  readonly accent: Rgb;
  /** Drawn across the top when there is a row to spare. */
  readonly header?: string;
  /** Drawn across the bottom when there is a row to spare. */
  readonly status?: string;
  /**
   * Names for a feed's entries, by feed id.
   *
   * The renderers that identify what they draw — a rack, a status grid — fall
   * back to the index without these, which is how a rack of interfaces used to
   * report `0` and `1` instead of `eth0` and `wlan0`.
   */
  readonly labels?: ReadonlyMap<string, readonly string[]>;
  /**
   * Paint the theme's ground on every cell.
   *
   * Off by default, and that is what makes a host's window opacity work: a
   * terminal cell carrying an explicit background is opaque by definition, so a
   * compositor behind it has nothing to blend.
   */
  readonly opaque?: boolean;
}

/**
 * The one-line reading a tile puts beside its title.
 *
 * Degrades rather than truncates. Given nine columns, `16×100%` cut to `16×10`
 * is a lie; the peak alone is not.
 */
/** The largest number anywhere in a reading, whatever rank it is. */
function peakOf(value: unknown): number {
  if (typeof value === "number") return value;
  if (!Array.isArray(value)) return 0;
  let peak = Number.NEGATIVE_INFINITY;
  for (const entry of value) peak = Math.max(peak, peakOf(entry));
  return Number.isFinite(peak) ? peak : 0;
}

export function summaryOf(feed: Feed, streams: FeedStreams, room = Number.POSITIVE_INFINITY): string {
  const stream = streams.get(feed.id);
  const latest = stream?.latest();
  if (latest === undefined) return "";
  if (typeof latest === "number") return formatValue(feed, latest);
  const values = latest as readonly unknown[];
  if (values.length === 0) return "";
  // Rank two and up: the peak across the whole reading, and how many rows it
  // has. `Math.max` over arrays gives NaN, which is how `2×NaN%` reached a
  // title bar.
  const peak = formatValue(feed, peakOf(values));
  // A vector short enough to report entry by entry says more than its peak does.
  if (feed.entryMarks && feed.entryMarks.length === values.length) {
    const pairs = values.map((value, index) => `${feed.entryMarks![index]}${formatValue(feed, peakOf(value))}`)
      .join(" ");
    if (pairs.length <= room) return pairs;
  }
  const counted = `${values.length}×${peak}`;
  return counted.length <= room ? counted : peak;
}

/** How busy a feed's latest reading is, for colouring its number. */
function intensityOf(feed: Feed, streams: FeedStreams): number {
  const latest = streams.get(feed.id)?.latest();
  if (latest === undefined) return 0;
  const value = peakOf(latest);
  const domain = feed.domain ?? { min: 0, max: Math.max(1, value) };
  const span = domain.max - domain.min;
  return span === 0 ? 0 : Math.min(1, Math.max(0, (value - domain.min) / span));
}

/** Draws every tile's chart, chrome and all, into one screen-sized frame. */
export function composeScreen(model: ScreenModel): VizFrame {
  const screen = screenFrame({ width: model.width, height: model.height }, model.theme);
  if (model.width <= 0 || model.height <= 0) return screen;

  if (model.header) {
    writeText(screen, 1, 0, model.header.slice(0, Math.max(0, model.width - 2)), {
      foreground: model.accent,
      background: model.theme.background,
    });
  }

  for (const tile of model.layout.tiles) {
    const feed = tile.source.feed;
    const reading = summaryOf(
      feed,
      model.streams,
      tile.framed ? tile.rect.width - feed.title.length - 8 : tile.rect.width - feed.short.length - 1,
    );
    const chrome = { theme: model.theme, accent: model.accent, title: feed.title, reading };
    if (tile.framed) drawTileFrame(screen, tile.rect, chrome);
    else {
      drawTileLabel(screen, tile.rect, {
        ...chrome,
        title: feed.short,
        intensity: intensityOf(feed, model.streams),
      });
    }
    drawChartInto(screen, tile.chart.column, tile.chart.row, tile, model);
  }

  if (model.status) {
    writeText(screen, 1, model.height - 1, model.status.slice(0, Math.max(0, model.width - 2)), {
      foreground: model.theme.axis,
      background: model.theme.background,
    });
  }
  return model.opaque ? screen : groundless(screen, model.theme.background);
}

/**
 * One tile's chart on its own, for a feed that updates faster than the screen.
 *
 * The same frame the full composition would have blitted there, so a live tile
 * drawn on top of the screen is identical to the same tile drawn as part of it.
 */
export function composeChart(tile: FeedTile, model: ScreenModel): VizFrame {
  const frame = screenFrame(tile.chart, model.theme);
  drawChartInto(frame, 0, 0, tile, model);
  return model.opaque ? frame : groundless(frame, model.theme.background);
}

function drawChartInto(target: VizCell[][], column: number, row: number, tile: FeedTile, model: ScreenModel): void {
  const { chart } = tile;
  if (chart.width <= 0 || chart.height <= 0) return;
  const feed = tile.source.feed;
  // No visualisation at all means the planner judged every candidate unreadable
  // here, and the tile's number already says what there is to say. Drawing a
  // placeholder for that would be noise.
  const visualization = tile.visualization ? visualizationById(tile.visualization) : undefined;
  if (!visualization) return;
  const stream = model.streams.get(feed.id);
  if (!stream || stream.length === 0) {
    // Waiting for the first sample. A blank box looks like a bug; a dim ellipsis
    // looks like what it is.
    writeText(target, column, row, "…", { foreground: model.theme.axis, background: model.theme.background });
    return;
  }
  const frame = drawStream(visualization, stream, {
    size: { width: chart.width, height: chart.height },
    theme: model.theme,
    ...(feed.domain ? { domain: feed.domain } : {}),
    label: tile.framed ? undefined : feed.title,
    ...(model.labels?.get(feed.id) ? { labels: model.labels.get(feed.id) } : {}),
    format: (value: number) => formatValue(feed, value),
  });
  blitFrame(target, { column, row }, frame);
}
