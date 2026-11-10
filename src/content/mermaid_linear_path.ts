// Copyright 2023 Im-Beast. MIT license.
import type { MermaidScenePoint } from "./mermaid_scene.ts";

/** Exact vertices for one linear SVG contour; curves stay with the owning DOM's sampler. */
export function linearPathPoints(data: string): MermaidScenePoint[] | undefined {
  const token = /[MLHVZmlhvz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const tokens = data.match(token) ?? [];
  if (!tokens.length || !/^[\s,]*$/.test(data.replace(token, ""))) return;
  let command = "";
  let x = 0;
  let y = 0;
  let distance = 0;
  let start: MermaidScenePoint | undefined;
  const points: MermaidScenePoint[] = [];
  const append = (nextX: number, nextY: number): void => {
    if (points.length >= 8192) throw new RangeError("Native Mermaid path exceeds its point budget.");
    if (points.length) distance += Math.hypot(nextX - x, nextY - y);
    x = nextX;
    y = nextY;
    points.push({ x, y, distance });
  };
  for (let index = 0; index < tokens.length;) {
    const value = tokens[index]!;
    if (/^[a-z]$/i.test(value)) {
      command = value;
      index++;
      if (command.toLowerCase() === "z") {
        if (!start) return;
        append(start.x, start.y);
        command = "";
        continue;
      }
      if (index === tokens.length) return;
    }
    if (!command || !start && command.toLowerCase() !== "m") return;
    const lower = command.toLowerCase();
    const relative = command === lower;
    const count = lower === "h" || lower === "v" ? 1 : 2;
    const values = tokens.slice(index, index + count).map(Number);
    if (values.length !== count || values.some((number) => !Number.isFinite(number))) return;
    const first = values[0]!;
    if (lower === "m" && start) return; // Disconnected contours are split before sampling.
    if (lower === "h") append(relative ? x + first : first, y);
    else if (lower === "v") append(x, relative ? y + first : first);
    else append(relative ? x + first : first, relative ? y + values[1]! : values[1]!);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(distance)) return;
    if (lower === "m") {
      start = points[0]!;
      command = relative ? "l" : "L"; // Further moveto pairs are implicit lineto.
    }
    index += count;
  }
  return points;
}
