// Copyright 2023 Im-Beast. MIT license.

// VIS-010: one SNAPSHOT feeds every export. A chart snapshot captures
// the series revision, both domains, the viewport, detached copies of
// every series, and the deterministic cell rendering; the four exporters
// — raw data, ANSI cells, SVG, and a structured description — all read
// from that single frozen model, so every format declares the same
// scale/domain metadata and matches the same revision by construction.
// Mutating the live series after the snapshot cannot change any export.

import { linearScale } from "./scales.ts";
import { renderSeries, type SeriesKind, type SeriesPoint } from "./series.ts";

/** One series in the snapshot. */
export interface SnapshotSeries {
  readonly name: string;
  readonly kind: SeriesKind;
  readonly points: readonly SeriesPoint[];
}

/** The single snapshot model. */
export interface ChartSnapshot {
  readonly revision: number;
  readonly xDomain: readonly [number, number];
  readonly yDomain: readonly [number, number];
  readonly width: number;
  readonly height: number;
  readonly series: readonly SnapshotSeries[];
  /** Deterministic cell rendering of every series overlaid. */
  readonly cells: readonly string[];
}

/** Builds the snapshot: detached, frozen, deterministic. */
export function buildChartSnapshot(options: {
  readonly revision: number;
  readonly xDomain: readonly [number, number];
  readonly yDomain: readonly [number, number];
  readonly width: number;
  readonly height: number;
  readonly series: readonly SnapshotSeries[];
}): ChartSnapshot {
  const xScale = linearScale(options.xDomain, [0, Math.max(0, options.width - 1)]);
  const yScale = linearScale(options.yDomain, [Math.max(0, options.height - 1), 0]);
  const grid: string[][] = Array.from(
    { length: options.height },
    () => Array.from({ length: options.width }, () => " "),
  );
  const glyphs = ["·", "*", "o", "+"];
  options.series.forEach((series, index) => {
    renderSeries(series.points, {
      kind: series.kind,
      xScale,
      yScale,
      width: options.width,
      height: options.height,
      glyph: series.kind === "scatter" ? "●" : glyphs[index % glyphs.length]!,
      grid,
    });
  });
  return Object.freeze({
    revision: options.revision,
    xDomain: [...options.xDomain] as [number, number],
    yDomain: [...options.yDomain] as [number, number],
    width: options.width,
    height: options.height,
    series: options.series.map((series) =>
      Object.freeze({
        name: series.name,
        kind: series.kind,
        points: series.points.map((point) => ({ ...point })),
      })
    ),
    cells: Object.freeze(grid.map((row) => row.join(""))),
  });
}

/** Shared metadata every format declares. */
function metadata(snapshot: ChartSnapshot): {
  readonly revision: number;
  readonly xDomain: readonly [number, number];
  readonly yDomain: readonly [number, number];
  readonly width: number;
  readonly height: number;
} {
  return {
    revision: snapshot.revision,
    xDomain: snapshot.xDomain,
    yDomain: snapshot.yDomain,
    width: snapshot.width,
    height: snapshot.height,
  };
}

/** Export 1: the raw data with metadata. */
export function exportChartData(snapshot: ChartSnapshot): {
  readonly metadata: ReturnType<typeof metadata>;
  readonly series: readonly SnapshotSeries[];
} {
  return { metadata: metadata(snapshot), series: snapshot.series };
}

/** Export 2: deterministic ANSI cell lines with metadata. */
export function exportChartCells(snapshot: ChartSnapshot): {
  readonly metadata: ReturnType<typeof metadata>;
  readonly lines: readonly string[];
} {
  return { metadata: metadata(snapshot), lines: snapshot.cells };
}

/** Export 3: an SVG document carrying metadata attributes. */
export function exportChartSvg(snapshot: ChartSnapshot): string {
  const cellWidth = 8;
  const cellHeight = 16;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${snapshot.width * cellWidth}" height="${
      snapshot.height * cellHeight
    }" data-revision="${snapshot.revision}" data-x-domain="${snapshot.xDomain.join(",")}" data-y-domain="${
      snapshot.yDomain.join(",")
    }" font-family="monospace" font-size="14">`,
  ];
  snapshot.cells.forEach((line, row) => {
    const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    parts.push(
      `<text x="0" y="${(row + 1) * cellHeight - 4}" xml:space="preserve">${escaped}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

/** Export 4: the structured description with per-series statistics. */
export function exportChartDescription(snapshot: ChartSnapshot): {
  readonly metadata: ReturnType<typeof metadata>;
  readonly series: readonly {
    readonly name: string;
    readonly kind: SeriesKind;
    readonly pointCount: number;
    readonly missingCount: number;
    readonly minY?: number;
    readonly maxY?: number;
  }[];
} {
  return {
    metadata: metadata(snapshot),
    series: snapshot.series.map((series) => {
      const present = series.points.filter((point): point is { x: number; y: number } => point.y !== null);
      return {
        name: series.name,
        kind: series.kind,
        pointCount: series.points.length,
        missingCount: series.points.length - present.length,
        ...(present.length > 0
          ? {
            minY: Math.min(...present.map((point) => point.y)),
            maxY: Math.max(...present.map((point) => point.y)),
          }
          : {}),
      };
    }),
  };
}
