// Copyright 2023 Im-Beast. MIT license.
import type { MermaidScenePoint } from "./mermaid_scene.ts";

interface Point {
  x: number;
  y: number;
}
const tokens = /[MLHVCSQTZmlhvcsqtz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const interpolate = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Bounded, control-hull-aware flattening of one SVG Bézier contour. Each retained
 * vertex gets owning-DOM arclength from an exact partial curve, not chord length.
 * Arc/malformed/disconnected paths stay with the existing DOM sampler.
 */
export function bezierPathPoints(
  data: string,
  measureLength: (path: string) => number,
  tolerance = 0.25,
): MermaidScenePoint[] | undefined {
  if (data.length > 1_048_576) throw new RangeError("Mermaid curve path exceeds its source budget.");
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) throw new RangeError("Invalid Mermaid curve tolerance.");
  const values = data.match(tokens) ?? [];
  if (!values.length || !/^[\s,]*$/.test(data.replace(tokens, ""))) return;
  let current: Point = { x: 0, y: 0 };
  let start: Point | undefined;
  let cubic: Point | undefined;
  let quadratic: Point | undefined;
  let previous = "";
  let command = "";
  let distance = 0;
  let cursor = 0;
  let work = 0;
  const result: MermaidScenePoint[] = [];
  const append = (point: Point, at: number): void => {
    if (result.length >= 8192) throw new RangeError("Native Mermaid path exceeds its point budget.");
    if (![point.x, point.y, at].every(Number.isFinite) || at < 0) {
      throw new RangeError("Invalid Mermaid curve geometry.");
    }
    result.push({ ...point, distance: at });
  };
  const length = (path: string): number => {
    const measured = measureLength(path);
    if (!Number.isFinite(measured) || measured < 0) throw new RangeError("Invalid Mermaid measured curve length.");
    return measured;
  };
  const point = (relative: boolean): Point | undefined => {
    const x = Number(values[cursor++]);
    const y = Number(values[cursor++]);
    if (![x, y].every(Number.isFinite)) return;
    return { x: x + (relative ? current.x : 0), y: y + (relative ? current.y : 0) };
  };
  const line = (end: Point): void => {
    distance += Math.hypot(end.x - current.x, end.y - current.y);
    append(end, distance);
    current = end;
  };
  while (cursor < values.length) {
    if (++work > 32768) throw new RangeError("Mermaid curve path exceeds its work budget.");
    const value = values[cursor]!;
    if (/^[a-z]$/i.test(value)) {
      command = value;
      cursor++;
      if (command.toLowerCase() !== "z" && cursor === values.length) return;
    }
    if (!command || !start && command.toLowerCase() !== "m") return;
    const lower = command.toLowerCase();
    const relative = command === lower;
    let nextCubic: Point | undefined;
    let nextQuadratic: Point | undefined;
    if (lower === "m") {
      if (start) return;
      const next = point(relative);
      if (!next) return;
      start = current = next;
      append(next, 0);
      command = relative ? "l" : "L";
    } else if (lower === "z") {
      line(start!);
      command = "";
    } else if (lower === "h" || lower === "v") {
      const number = Number(values[cursor++]);
      if (!Number.isFinite(number)) return;
      line(
        lower === "h"
          ? { x: number + (relative ? current.x : 0), y: current.y }
          : { x: current.x, y: number + (relative ? current.y : 0) },
      );
    } else if (lower === "l") {
      const end = point(relative);
      if (!end) return;
      line(end);
    } else {
      const controls = [current];
      if (lower === "c" || lower === "s") {
        const first = lower === "c"
          ? point(relative)
          : cubic && /[cs]/.test(previous)
          ? reflect(current, cubic)
          : current;
        const second = point(relative);
        const end = point(relative);
        if (!first || !second || !end) return;
        controls.push(first, second, end);
        nextCubic = second;
      } else if (lower === "q" || lower === "t") {
        const control = lower === "q"
          ? point(relative)
          : quadratic && /[qt]/.test(previous)
          ? reflect(current, quadratic)
          : current;
        const end = point(relative);
        if (!control || !end) return;
        controls.push(control, end);
        nextQuadratic = control;
      } else return;
      const origin = distance;
      const total = length(curveData(controls));
      let last = 0;
      const flatten = (part: Point[], from: number, to: number, depth: number): void => {
        if (++work > 32768) throw new RangeError("Mermaid curve path exceeds its work budget.");
        if (flat(part, tolerance)) {
          // Prefix lengths are authoritative browser geometry. Clamp only numeric
          // roundoff in its separately measured subdivisions, never dash phase.
          last = Math.min(total, Math.max(last, to === 1 ? total : length(curveData(split(controls, to)[0]))));
          append(part.at(-1)!, origin + last);
          return;
        }
        if (depth >= 24) throw new RangeError("Mermaid curve path exceeds its subdivision budget.");
        const [left, right] = split(part, 0.5);
        const middle = (from + to) / 2;
        flatten(left, from, middle, depth + 1);
        flatten(right, middle, to, depth + 1);
      };
      flatten(controls, 0, 1, 0);
      distance += total;
      current = controls.at(-1)!;
    }
    cubic = nextCubic;
    quadratic = nextQuadratic;
    previous = lower;
  }
  return result;
}

function reflect(point: Point, control: Point): Point {
  return { x: point.x * 2 - control.x, y: point.y * 2 - control.y };
}

function curveData(points: Point[]): string {
  return `M${points[0]!.x} ${points[0]!.y}${points.length === 4 ? "C" : "Q"}${
    points.slice(1).map(({ x, y }) => `${x} ${y}`).join(" ")
  }`;
}

function split(points: Point[], t: number): [Point[], Point[]] {
  const left = [points[0]!];
  const right = [points.at(-1)!];
  let row = points;
  while (row.length > 1) {
    row = row.slice(0, -1).map((point, index) => interpolate(point, row[index + 1]!, t));
    left.push(row[0]!);
    right.unshift(row.at(-1)!);
  }
  return [left, right];
}

function flat(points: Point[], tolerance: number): boolean {
  const first = points[0]!;
  const last = points.at(-1)!;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const chord = Math.hypot(dx, dy);
  let polygon = 0;
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    polygon += Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y);
    const deviation = chord
      ? Math.abs(dx * (point.y - first.y) - dy * (point.x - first.x)) / chord
      : Math.hypot(point.x - first.x, point.y - first.y);
    if (deviation > tolerance) return false;
  }
  // A collinear curve can double back. Perpendicular error alone would erase it.
  return polygon - chord <= tolerance;
}
