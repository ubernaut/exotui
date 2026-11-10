// Copyright 2023 Im-Beast. MIT license.

/** One integer cell coordinate on an orthogonal route. */
export interface RoutePoint {
  x: number;
  y: number;
}

/** A routed point with its circuit-compatible box-drawing glyph. */
export interface RouteCell extends RoutePoint {
  glyph: string;
}

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
const GLYPHS = ["│", "┌", "│", "┐", "┘", "─", "┐", "─", "│", "└", "│", "┘", "└", "─", "┌", "─"] as const;

/** Cardinal direction in the circuits convention: north, east, south, west. */
export function routeDirection(from: RoutePoint, to: RoutePoint): number {
  if (to.y < from.y) return 0;
  if (to.x > from.x) return 1;
  if (to.y > from.y) return 2;
  return 3;
}

/** Converts a unit-step path to the same line glyphs as the circuits background. */
export function routeCells(path: readonly RoutePoint[], terminalGlyph?: string): RouteCell[] {
  if (path.length < 2) return [];
  return path.map((point, index) => {
    const arrival = index === 0 ? routeDirection(point, path[1]!) : routeDirection(path[index - 1]!, point);
    const exit = index === path.length - 1 ? arrival : routeDirection(point, path[index + 1]!);
    return {
      ...point,
      glyph: index === path.length - 1 && terminalGlyph ? terminalGlyph : GLYPHS[arrival * 4 + exit]!,
    };
  });
}

/**
 * Shared generation-stamped BFS extracted from the circuits background.
 * Buffers are reused between searches; every cell is visited at most once.
 * The caller owns walls and can choose neighbor rotation for equal-length ties.
 */
export class OrthogonalRouter {
  #seen = new Uint32Array();
  #previous = new Int32Array();
  #queue = new Int32Array();
  #generation = 0;

  /** Finds a shortest path inside a bounded grid, or returns undefined when blocked. */
  route(
    width: number,
    height: number,
    source: RoutePoint,
    sink: RoutePoint,
    passable: (index: number) => boolean,
    rotation = 0,
  ): RoutePoint[] | undefined {
    if (
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width * height > 4_000_000
    ) {
      throw new RangeError("Orthogonal routing requires a positive grid of at most 4,000,000 cells.");
    }
    const inside = (p: RoutePoint) =>
      Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < width && p.y >= 0 && p.y < height;
    if (!inside(source) || !inside(sink)) return undefined;
    const size = width * height;
    if (this.#seen.length !== size) {
      this.#seen = new Uint32Array(size);
      this.#previous = new Int32Array(size);
      this.#queue = new Int32Array(size);
      this.#generation = 0;
    }
    if (this.#generation === 0xffff_ffff) {
      this.#seen.fill(0);
      this.#generation = 0;
    }
    const from = source.y * width + source.x;
    const to = sink.y * width + sink.x;
    if (!passable(from) || !passable(to)) return undefined;
    const generation = ++this.#generation;
    const turnOffset = ((Math.trunc(rotation) % 4) + 4) % 4;
    let head = 0;
    let tail = 0;
    this.#queue[tail++] = from;
    this.#seen[from] = generation;
    this.#previous[from] = -1;
    while (head < tail) {
      const index = this.#queue[head++]!;
      if (index === to) {
        const path: RoutePoint[] = [];
        for (let cursor = to; cursor !== -1; cursor = this.#previous[cursor]!) {
          path.push({ x: cursor % width, y: Math.floor(cursor / width) });
        }
        return path.reverse();
      }
      const x = index % width;
      const y = Math.floor(index / width);
      for (let turn = 0; turn < 4; turn++) {
        const direction = (turn + turnOffset) % 4;
        const nx = x + DX[direction]!;
        const ny = y + DY[direction]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (this.#seen[next] === generation || !passable(next)) continue;
        this.#seen[next] = generation;
        this.#previous[next] = index;
        this.#queue[tail++] = next;
      }
    }
    return undefined;
  }
}
