// Copyright 2023 Im-Beast. MIT license.
import type { MermaidScenePath, MermaidScenePoint } from "./mermaid_scene.ts";
import type { CellPoint } from "../visual/raster.ts";
import { strokePattern } from "./mermaid_stroke.ts";
import { strokeContours } from "./mermaid_stroke_metrics.ts";

type Point = { x: number; y: number };
type Affine = readonly [number, number, number, number, number, number];
type Run = { points: Point[]; closed: boolean };
type Primitive = { bounds: readonly [number, number, number, number]; contains: (x: number, y: number) => boolean };

/**
 * Resolve sufficiently wide strokes into bounded, unioned native samples.
 * Thin strokes retain the circuit glyph projection; outlines use captured stroke
 * metrics (authored or host space), not an isotropic transformed-width guess.
 */
export function strokeOutlineCells(
  path: MermaidScenePath,
  columns: number,
  rows: number,
  columnUnits: number,
  rowUnits: number,
  charge: (amount: number) => void,
  originX = 0,
  originY = 0,
): Iterable<CellPoint> | undefined {
  strokePattern(path.paint); // Keep the existing numeric/dash validation contract.
  const inverse: Affine = path.strokeInverse ?? [1, 0, 0, 1, 0, 0];
  if (inverse.length !== 6 || !inverse.every(Number.isFinite)) throw new RangeError("Invalid native stroke metrics.");
  const [a, b, c, d, e, f] = inverse;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || !determinant) throw new RangeError("Invalid native stroke metric transform.");
  const matrix: Affine = [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
  if (!matrix.every(Number.isFinite)) throw new RangeError("Invalid native stroke metric inverse.");
  const width = path.paint.strokeWidth;
  const sx = Math.hypot(matrix[0] / columnUnits, matrix[1] / rowUnits);
  const sy = Math.hypot(matrix[2] / columnUnits, matrix[3] / rowUnits);
  if (width * Math.max(sx, sy) < 1) return;
  const radius = width / 2;
  const join = path.paint.lineJoin ?? "miter";
  const limit = path.paint.miterLimit ?? 4;
  if (!["miter", "round", "bevel", "miter-clip"].includes(join) || !Number.isFinite(limit) || limit < 1) {
    throw new RangeError("Invalid or unsupported native stroke join.");
  }
  const cap = path.paint.lineCap ?? "butt";
  if (!["butt", "round", "square"].includes(cap)) throw new RangeError("Invalid native stroke cap.");
  const covered = new Set<number>();
  const raster = (primitive: Primitive) => {
    charge(1);
    const [left, top, right, bottom] = primitive.bounds;
    const corners = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) =>
      transform({ x: x!, y: y! }, matrix)
    );
    if (!corners.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))) {
      throw new RangeError("Native stroke outline exceeds its numeric budget.");
    }
    const x0 = Math.max(originX, Math.ceil(Math.min(...corners.map(({ x }) => x)) / columnUnits));
    const y0 = Math.max(originY, Math.ceil(Math.min(...corners.map(({ y }) => y)) / rowUnits));
    const x1 = Math.min(originX + columns - 1, Math.floor(Math.max(...corners.map(({ x }) => x)) / columnUnits));
    const y1 = Math.min(originY + rows - 1, Math.floor(Math.max(...corners.map(({ y }) => y)) / rowUnits));
    for (let row = y0; row <= y1; row++) {
      for (let column = x0; column <= x1; column++) {
        charge(1);
        const key = (row - originY) * columns + column - originX;
        if (covered.has(key)) continue;
        const point = transform({ x: column * columnUnits, y: row * rowUnits }, inverse);
        if (primitive.contains(point.x, point.y)) covered.add(key);
      }
    }
  };
  let points = 0;
  for (const contour of strokeContours(path)) {
    points += contour.points.length;
    if (points > 8192) throw new RangeError("Native Mermaid path exceeds its point budget.");
    charge(contour.points.length);
    const metric = contour.points.map((point) => ({ ...transform(point, inverse), distance: point.distance }));
    for (const run of strokeRuns(metric, contour.closed, path, charge)) {
      const segments: { first: Point; last: Point; direction: Point; normal: Point }[] = [];
      for (let index = 1; index < run.points.length; index++) {
        const first = run.points[index - 1]!;
        const last = run.points[index]!;
        const length = Math.hypot(last.x - first.x, last.y - first.y);
        if (!length) continue;
        const direction = { x: (last.x - first.x) / length, y: (last.y - first.y) / length };
        const normal = { x: -direction.y * radius, y: direction.x * radius };
        segments.push({ first, last, direction, normal });
        raster(polygon([
          plus(first, normal),
          plus(last, normal),
          plus(last, normal, -1),
          plus(first, normal, -1),
        ]));
      }
      if (!segments.length) {
        const point = run.points[0];
        if (point && cap === "round") raster(circle(point, radius));
        if (point && cap === "square") {
          raster(polygon([
            { x: point.x - radius, y: point.y - radius },
            { x: point.x + radius, y: point.y - radius },
            { x: point.x + radius, y: point.y + radius },
            { x: point.x - radius, y: point.y + radius },
          ]));
        }
        continue;
      }
      if (!run.closed) {
        for (const [segment, end] of [[segments[0]!, -1], [segments.at(-1)!, 1]] as const) {
          const point = end === -1 ? segment.first : segment.last;
          if (cap === "round") raster(circle(point, radius));
          if (cap === "square") {
            const tip = plus(point, segment.direction, radius * end);
            raster(polygon([
              plus(point, segment.normal),
              plus(tip, segment.normal),
              plus(tip, segment.normal, -1),
              plus(point, segment.normal, -1),
            ]));
          }
        }
      }
      const pairs = segments.length - 1 + (run.closed ? 1 : 0);
      for (let index = 0; index < pairs; index++) {
        const first = segments[index % segments.length]!;
        const last = segments[(index + 1) % segments.length]!;
        const vertex = first.last;
        const cross = first.direction.x * last.direction.y - first.direction.y * last.direction.x;
        const dot = first.direction.x * last.direction.x + first.direction.y * last.direction.y;
        if (Math.abs(cross) < 1e-12) {
          if (dot < 0 && join === "round") raster(circle(vertex, radius));
          continue;
        }
        const side = cross > 0 ? -1 : 1;
        const begin = plus(vertex, first.normal, side);
        const end = plus(vertex, last.normal, side);
        if (join === "round") {
          const disc = circle(vertex, radius);
          const angle = Math.atan2(begin.y - vertex.y, begin.x - vertex.x);
          const turn = Math.atan2(cross, dot);
          raster({
            bounds: disc.bounds,
            contains: (x, y) => {
              if (!disc.contains(x, y)) return false;
              const delta = Math.atan2(y - vertex.y, x - vertex.x) - angle;
              const sweep = modulo(delta * Math.sign(turn), Math.PI * 2);
              return sweep <= Math.abs(turn) + 1e-12 || x === vertex.x && y === vertex.y;
            },
          });
          continue;
        }
        const shift = { x: end.x - begin.x, y: end.y - begin.y };
        const along = (shift.x * last.direction.y - shift.y * last.direction.x) / cross;
        const miter = plus(begin, first.direction, along);
        const extent = Math.hypot(miter.x - vertex.x, miter.y - vertex.y);
        if (join !== "bevel" && extent <= radius * limit + 1e-10) {
          raster(polygon([vertex, begin, miter, end]));
        } else if (join === "miter-clip") {
          const axis = { x: (miter.x - vertex.x) / extent, y: (miter.y - vertex.y) / extent };
          const clipped = (point: Point, direction: Point) => {
            const distance = (radius * limit - (point.x - vertex.x) * axis.x - (point.y - vertex.y) * axis.y) /
              (direction.x * axis.x + direction.y * axis.y);
            return plus(point, direction, distance);
          };
          raster(polygon([vertex, begin, clipped(begin, first.direction), clipped(end, last.direction), end]));
        } else raster(polygon([vertex, begin, end]));
      }
    }
  }
  return Array.from(covered, (key) => ({ column: key % columns + originX, row: Math.floor(key / columns) + originY }));
}

function strokeRuns(
  points: readonly MermaidScenePoint[],
  closed: boolean,
  path: MermaidScenePath,
  charge: (amount: number) => void,
): Run[] {
  if (!points.length) return [];
  let distance = 0;
  let previous = -Infinity;
  const measured = points.map((point, index) => {
    if (index) distance += Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y);
    const value = point.distance ?? distance;
    if (!Number.isFinite(value) || value < 0 || value < previous) {
      throw new RangeError("Invalid native stroke outline distance.");
    }
    previous = value;
    return { ...point, distance: value };
  });
  const total = measured.at(-1)!.distance;
  const raw = path.paint.dash;
  const lengths = raw.length % 2 ? [...raw, ...raw] : raw;
  const period = lengths.reduce((sum, value) => sum + value, 0);
  if (!period) return [{ points: measured, closed }];
  const offset = modulo(path.paint.dashOffset ?? 0, period);
  const cycles = Math.ceil((total + offset) / period) + 2;
  if (!Number.isSafeInteger(cycles) || cycles * lengths.length > 32768) {
    throw new RangeError("Native stroke outline exceeds its dash-run budget.");
  }
  charge(cycles * lengths.length);
  const intervals: [number, number][] = [];
  for (let cycle = -1; cycle < cycles; cycle++) {
    let begin = cycle * period - offset;
    for (const [index, length] of lengths.entries()) {
      const end = begin + length;
      if (index % 2 === 0 && (length === 0 ? begin >= 0 && begin <= total : end > 0 && begin < total)) {
        intervals.push([Math.max(0, begin), Math.min(total, end)]);
      }
      begin = end;
    }
  }
  const runs: Run[] = [];
  let cursor = 1;
  let retained = 0;
  for (const [begin, end] of intervals) {
    while (cursor < measured.length - 1 && measured[cursor]!.distance < begin) cursor++;
    const at = (position: number, segment: number): Point => {
      if (measured.length === 1) return measured[0]!;
      const first = measured[Math.max(0, segment - 1)]!;
      const last = measured[segment]!;
      const span = last.distance - first.distance;
      const fraction = span ? (position - first.distance) / span : 0;
      return { x: first.x + fraction * (last.x - first.x), y: first.y + fraction * (last.y - first.y) };
    };
    const run: Run = { points: [at(begin, cursor)], closed: false };
    while (cursor < measured.length - 1 && measured[cursor]!.distance < end) run.points.push(measured[cursor++]!);
    run.points.push(at(end, cursor));
    retained += run.points.length;
    if (retained > 65536) throw new RangeError("Native stroke outline exceeds its retained-point budget.");
    runs.push(run);
  }
  if (closed && intervals[0]?.[0] === 0 && intervals.at(-1)?.[1] === total) {
    if (runs.length === 1) runs[0]!.closed = true;
    else {
      const last = runs.pop()!;
      const first = runs.shift()!;
      runs.unshift({ points: [...last.points, ...first.points.slice(1)], closed: false });
    }
  }
  return runs;
}

function transform(point: Point, matrix: Affine): Point {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

function plus(point: Point, vector: Point, scale = 1): Point {
  return { x: point.x + vector.x * scale, y: point.y + vector.y * scale };
}

function circle(point: Point, radius: number): Primitive {
  return {
    bounds: [point.x - radius, point.y - radius, point.x + radius, point.y + radius],
    contains: (x, y) => (x - point.x) ** 2 + (y - point.y) ** 2 <= radius ** 2,
  };
}

function polygon(points: readonly Point[]): Primitive {
  return {
    bounds: [
      Math.min(...points.map(({ x }) => x)),
      Math.min(...points.map(({ y }) => y)),
      Math.max(...points.map(({ x }) => x)),
      Math.max(...points.map(({ y }) => y)),
    ],
    contains: (x, y) => {
      let positive = false;
      let negative = false;
      for (let index = 0; index < points.length; index++) {
        const first = points[index]!;
        const last = points[(index + 1) % points.length]!;
        const cross = (last.x - first.x) * (y - first.y) - (last.y - first.y) * (x - first.x);
        positive ||= cross > 1e-10;
        negative ||= cross < -1e-10;
        if (positive && negative) return false;
      }
      return true;
    },
  };
}

function modulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}
