// Copyright 2023 Im-Beast. MIT license.

interface Point {
  x: number;
  y: number;
}
interface Segment {
  end: Point;
  incoming?: Point;
  outgoing?: Point;
  close?: boolean;
}
interface Contour {
  start: Point;
  move?: Point;
  segments: Segment[];
}

/** A real SVG command vertex, never a point introduced by flattening a curve. */
export interface MermaidMarkerVertex extends Point {
  angle: number;
  position: "start" | "mid" | "end";
}

const number = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;
const difference = (from: Point, to: Point): Point | undefined => {
  const point = { x: to.x - from.x, y: to.y - from.y };
  return point.x || point.y ? point : undefined;
};
const angle = (point: Point): number => Math.atan2(point.y, point.x) * 180 / Math.PI;
const reflect = (point: Point, control: Point): Point => ({ x: 2 * point.x - control.x, y: 2 * point.y - control.y });

/** Bounded SVG vertex/direction extraction; authoritative DOM geometry still owns curve sampling/layout. */
export function markerPathVertices(data: string): MermaidMarkerVertex[] {
  if (data.length > 1_048_576) throw new RangeError("Mermaid marker path exceeds its source budget.");
  const contours: Contour[] = [];
  let contour: Contour | undefined;
  let current: Point = { x: 0, y: 0 };
  let command = "";
  let previous = "";
  let cubic: Point | undefined;
  let quadratic: Point | undefined;
  let cursor = 0;
  let count = 0;
  const skip = () => {
    while (/[\s,]/.test(data[cursor] ?? "") && cursor < data.length) cursor++;
  };
  const read = (flag = false): number => {
    skip();
    const match = data.slice(cursor).match(flag ? /^[01]/ : number)?.[0];
    if (!match) throw new SyntaxError("Invalid SVG marker path parameters.");
    cursor += match.length;
    const value = Number(match);
    if (!Number.isFinite(value)) throw new RangeError("Non-finite SVG marker path coordinate.");
    return value;
  };
  const point = (relative: boolean): Point => {
    const x = read();
    const y = read();
    const result = { x: x + (relative ? current.x : 0), y: y + (relative ? current.y : 0) };
    if (![result.x, result.y].every(Number.isFinite)) throw new RangeError("Non-finite SVG marker vertex.");
    return result;
  };
  const charge = () => {
    if (++count > 8192) throw new RangeError("Mermaid marker path exceeds its vertex budget.");
  };
  const line = (end: Point): Segment => ({
    end,
    incoming: difference(current, end),
    outgoing: difference(current, end),
  });
  while (true) {
    skip();
    if (cursor >= data.length) break;
    if (/[a-z]/i.test(data[cursor]!)) command = data[cursor++]!;
    if (!command || !/[mlhvcsqtaz]/i.test(command)) throw new SyntaxError("Invalid SVG marker path command.");
    const lower = command.toLowerCase();
    const relative = command === lower;
    if (lower === "m") {
      const next = point(relative);
      contour = { start: next, move: difference(current, next), segments: [] };
      current = next;
      contours.push(contour);
      charge();
      cubic = quadratic = undefined;
      previous = "m";
      command = relative ? "l" : "L";
      continue;
    }
    if (!contour) throw new SyntaxError("SVG marker path must begin with moveto.");
    let segment: Segment;
    let nextCubic: Point | undefined;
    let nextQuadratic: Point | undefined;
    if (lower === "z") {
      segment = { ...line(contour.start), close: true };
      if (!segment.incoming && contour.segments.length) {
        segment.incoming = segment.outgoing = contour.segments[0]!.outgoing;
      }
      command = "";
    } else {
      if (lower === "h") segment = line({ x: read() + (relative ? current.x : 0), y: current.y });
      else if (lower === "v") segment = line({ x: current.x, y: read() + (relative ? current.y : 0) });
      else if (lower === "l") segment = line(point(relative));
      else if (lower === "c" || lower === "s") {
        const first = lower === "c"
          ? point(relative)
          : cubic && /[cs]/.test(previous)
          ? reflect(current, cubic)
          : current;
        const second = point(relative);
        const end = point(relative);
        segment = {
          end,
          outgoing: difference(current, first) ?? difference(current, second) ?? difference(current, end),
          incoming: difference(second, end) ?? difference(first, end) ?? difference(current, end),
        };
        nextCubic = second;
      } else if (lower === "q" || lower === "t") {
        const control = lower === "q"
          ? point(relative)
          : quadratic && /[qt]/.test(previous)
          ? reflect(current, quadratic)
          : current;
        const end = point(relative);
        segment = {
          end,
          outgoing: difference(current, control) ?? difference(current, end),
          incoming: difference(control, end) ?? difference(current, end),
        };
        nextQuadratic = control;
      } else {
        const rx = read();
        const ry = read();
        const rotation = read();
        const large = read(true);
        const sweep = read(true);
        const end = point(relative);
        segment = { end, ...arcDirections(current, end, rx, ry, rotation, large, sweep) };
      }
    }
    contour.segments.push(segment);
    current = segment.end;
    if (![current.x, current.y].every(Number.isFinite)) throw new RangeError("Non-finite SVG marker vertex.");
    cubic = nextCubic;
    quadratic = nextQuadratic;
    previous = lower;
    charge();
  }
  const vertices: Omit<MermaidMarkerVertex, "position">[] = [];
  for (const { start, move, segments } of contours) {
    // Retain the owning Chromium host's zero-vector angle (atan2(0,0)),
    // rather than inventing neighbouring tangents that its SVG does not paint.
    const starts = segments.map((segment) => segment.outgoing ?? { x: 0, y: 0 });
    const ends = segments.map((segment) => segment.incoming ?? { x: 0, y: 0 });
    const initial = starts[0] ?? move ?? { x: 0, y: 0 };
    const final = ends.at(-1) ?? initial;
    const closed = segments.findLastIndex((segment) => segment.close);
    vertices.push({ ...start, angle: closed < 0 ? angle(initial) : middleAngle(ends[closed]!, initial) });
    for (const [index, segment] of segments.entries()) {
      const next = starts[index + 1];
      vertices.push({
        ...segment.end,
        angle: segment.close
          ? middleAngle(ends[index]!, initial)
          : next
          ? middleAngle(ends[index]!, next)
          : angle(final),
      });
    }
  }
  return vertices.map((vertex, index) => ({
    ...vertex,
    position: index === vertices.length - 1 ? "end" : index === 0 ? "start" : "mid",
  }));
}

function middleAngle(incoming: Point, outgoing: Point): number {
  let first = angle(incoming);
  const last = angle(outgoing);
  if (first - last > 180 || first - last <= -180) first += 360;
  return (first + last) / 2;
}

/** Endpoint-to-centre arc conversion from SVG implementation notes, followed by exact ellipse tangents. */
function arcDirections(
  from: Point,
  to: Point,
  radiusX: number,
  radiusY: number,
  rotation: number,
  large: number,
  sweep: number,
): Omit<Segment, "end"> {
  const straight = difference(from, to);
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  if (!straight || !rx || !ry) return { outgoing: straight, incoming: straight };
  const radians = rotation % 360 * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x = cosine * dx + sine * dy;
  const y = -sine * dx + cosine * dy;
  const correction = Math.hypot(x / rx, y / ry);
  if (correction > 1) {
    rx *= correction;
    ry *= correction;
  }
  const square = (x / rx) ** 2 + (y / ry) ** 2;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (1 - square) / square));
  const cx = factor * rx * y / ry;
  const cy = -factor * ry * x / rx;
  const tangent = (pointX: number, pointY: number): Point => {
    const localX = -rx * pointY / ry;
    const localY = ry * pointX / rx;
    const direction = sweep ? 1 : -1;
    const result = {
      x: direction * (cosine * localX - sine * localY),
      y: direction * (sine * localX + cosine * localY),
    };
    if (![result.x, result.y].every(Number.isFinite)) {
      throw new RangeError("SVG marker arc exceeds its numeric budget.");
    }
    return result;
  };
  return { outgoing: tangent(x - cx, y - cy), incoming: tangent(-x - cx, -y - cy) };
}
