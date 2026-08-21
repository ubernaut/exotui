// ANSI-styled strings -> cells, for demos that speak styled lines.
//
// The desktop composes windows as cell grids, and some demos (the neon suite)
// render ANSI strings. This converts what those demos actually emit — SGR
// truecolor, 256-colour, the 16 base colours, resets — and drops anything else
// rather than misreading it. Kept apart from the desktop page so it can be
// tested without a DOM.

import type { VizCell } from "../../src/viz/mod.ts";

export type CellRgb = readonly [number, number, number];

export function ansi256ToRgb(index: number): CellRgb {
  if (index < 16) {
    const base: CellRgb[] = [
      [15, 23, 42],
      [239, 68, 68],
      [34, 197, 94],
      [234, 179, 8],
      [59, 130, 246],
      [217, 70, 239],
      [6, 182, 212],
      [229, 231, 235],
      [71, 85, 105],
      [251, 113, 133],
      [134, 239, 172],
      [253, 224, 71],
      [147, 197, 253],
      [240, 171, 252],
      [103, 232, 249],
      [248, 250, 252],
    ];
    return base[index] ?? [219, 234, 254];
  }
  if (index >= 232) {
    const level = 8 + (Math.min(index, 255) - 232) * 10;
    return [level, level, level];
  }
  const offset = Math.min(index, 231) - 16;
  const cube = (value: number) => (value === 0 ? 0 : 55 + value * 40);
  return [cube(Math.floor(offset / 36)), cube(Math.floor((offset % 36) / 6)), cube(offset % 6)];
}

export function hexToRgb(value: string): CellRgb | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return undefined;
  const packed = parseInt(match[1]!, 16);
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

/** One styled line as exactly `width` cells, padded with the ground colour. */
export function ansiLineToCells(line: string, width: number, ground: CellRgb): VizCell[] {
  const cells: VizCell[] = [];
  let foreground: CellRgb | undefined;
  let background: CellRgb | undefined;
  let index = 0;
  while (index < line.length && cells.length < width) {
    const char = line[index]!;
    if (char === "\x1b") {
      const end = line.indexOf("m", index);
      if (end === -1) break;
      const params = line.slice(index + 2, end).split(";").map(Number);
      for (let at = 0; at < params.length; at += 1) {
        const code = params[at]!;
        if (code === 0) {
          foreground = undefined;
          background = undefined;
        } else if (code === 39) foreground = undefined;
        else if (code === 49) background = undefined;
        else if (code === 38 && params[at + 1] === 2) {
          foreground = [params[at + 2] ?? 0, params[at + 3] ?? 0, params[at + 4] ?? 0];
          at += 4;
        } else if (code === 48 && params[at + 1] === 2) {
          background = [params[at + 2] ?? 0, params[at + 3] ?? 0, params[at + 4] ?? 0];
          at += 4;
        } else if (code === 38 && params[at + 1] === 5) {
          foreground = ansi256ToRgb(params[at + 2] ?? 0);
          at += 2;
        } else if (code === 48 && params[at + 1] === 5) {
          background = ansi256ToRgb(params[at + 2] ?? 0);
          at += 2;
        } else if (code >= 30 && code <= 37) foreground = ansi256ToRgb(code - 30);
        else if (code >= 90 && code <= 97) foreground = ansi256ToRgb(code - 90 + 8);
        else if (code >= 40 && code <= 47) background = ansi256ToRgb(code - 40);
        else if (code >= 100 && code <= 107) background = ansi256ToRgb(code - 100 + 8);
      }
      index = end + 1;
      continue;
    }
    cells.push({ char, foreground, background: background ?? ground });
    index += 1;
  }
  while (cells.length < width) cells.push({ char: " ", background: ground });
  return cells;
}
