// Copyright 2023 Im-Beast. MIT license.
import type { MermaidSceneClip } from "./mermaid_scene.ts";

/** Validate bounded clip trees once, then test native cell sample points against their measured silhouettes. */
export function clipPredicate(
  clip: MermaidSceneClip | undefined,
  charge: (amount: number) => void,
  reserveCacheSlot: () => boolean = () => false,
): (x: number, y: number) => boolean {
  if (!clip) return () => true;
  let nodes = 0;
  let points = 0;
  const seen = new Set<MermaidSceneClip>();
  const areas = new WeakMap<MermaidSceneClip, readonly (readonly { x: number; y: number }[])[]>();
  const validate = (node: MermaidSceneClip, depth: number): void => {
    if (++nodes > 4096 || depth > 64 || seen.has(node)) {
      throw new RangeError("Native Mermaid clip exceeds its tree budget.");
    }
    seen.add(node);
    if (node.kind === "path") {
      if (node.rule !== "nonzero" && node.rule !== "evenodd") throw new RangeError("Invalid native clip winding rule.");
      if (node.contours.length > 8192) throw new RangeError("Native Mermaid clip exceeds its contour budget.");
      for (const contour of node.contours) {
        points += contour.length;
        if (points > 32768) throw new RangeError("Native Mermaid clip exceeds its point budget.");
        for (const point of contour) {
          if (!Number.isSafeInteger(Math.round(point.x)) || !Number.isSafeInteger(Math.round(point.y))) {
            throw new RangeError("Invalid native clip coordinates.");
          }
        }
      }
      // Clip silhouettes come from fills, never from stroke width. A line or
      // a collinear path has no filled area even at points on its centreline.
      areas.set(
        node,
        node.contours.filter((contour) => {
          if (contour.length < 3) return false;
          const first = contour[0]!;
          const second = contour.find((point) => point.x !== first.x || point.y !== first.y);
          if (!second) return false;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          return contour.some((point) => {
            const left = dx * (point.y - first.y);
            const right = dy * (point.x - first.x);
            return Math.abs(left - right) > Number.EPSILON * 16 * (Math.abs(left) + Math.abs(right));
          });
        }),
      );
    } else if (node.kind === "union" || node.kind === "intersection") {
      if (node.children.length > 4096) throw new RangeError("Native Mermaid clip exceeds its tree budget.");
      for (const child of node.children) validate(child, depth + 1);
    } else throw new RangeError("Invalid native clip node.");
    seen.delete(node);
  };
  validate(clip, 0);
  charge(points + nodes);
  const contains = (node: MermaidSceneClip, x: number, y: number): boolean => {
    charge(1);
    if (node.kind === "union") return node.children.some((child) => contains(child, x, y));
    if (node.kind === "intersection") return node.children.every((child) => contains(child, x, y));
    let winding = 0;
    for (const contour of areas.get(node)!) {
      charge(contour.length);
      for (let index = 0; index < contour.length; index++) {
        const from = contour[index]!;
        const to = contour[(index + 1) % contour.length]!;
        const cross = (to.x - from.x) * (y - from.y) - (x - from.x) * (to.y - from.y);
        if (
          cross === 0 && x >= Math.min(from.x, to.x) && x <= Math.max(from.x, to.x) &&
          y >= Math.min(from.y, to.y) && y <= Math.max(from.y, to.y)
        ) return true;
        if (from.y <= y && to.y > y && cross > 0) winding++;
        else if (from.y > y && to.y <= y && cross < 0) winding--;
      }
    }
    return node.rule === "evenodd" ? Math.abs(winding) % 2 === 1 : winding !== 0;
  };
  const cache = new Map<string, boolean>();
  return (x, y) => {
    const key = `${x},${y}`;
    const previous = cache.get(key);
    if (previous !== undefined) return previous;
    const result = contains(clip, x, y);
    if (reserveCacheSlot()) cache.set(key, result);
    return result;
  };
}
