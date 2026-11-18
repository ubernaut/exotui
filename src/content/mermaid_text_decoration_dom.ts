// Copyright 2023 Im-Beast. MIT license.
import type { MermaidSceneText } from "./mermaid_scene.ts";
import { renderedTextDecorationPaint } from "./mermaid_text_decoration.ts";

type Decorations = NonNullable<MermaidSceneText["decorations"]>;

/** Read bounded decorating-box ancestry without changing the source or borrowing application stylesheets. */
export function measuredTextDecorations(svg: SVGSVGElement): (owner: Element) => Decorations | undefined {
  const view = svg.ownerDocument.defaultView!;
  const cache = new WeakMap<Element, { source: Decorations; css?: Decorations }>();
  // At most one CSS projection per bounded captured descriptor, shared across
  // descendants. Keep original SVG paint available for mixed sibling targets.
  const cssPaint = new WeakMap<Decorations[number], Decorations[number]>();
  let nodes = 0, units = 0;
  const read = (owner: Element, depth: number): Decorations => {
    if (depth > 128) throw new RangeError("Mermaid text decoration ancestry exceeds its budget.");
    const previous = cache.get(owner);
    if (previous) return previous.source;
    if (++nodes > 16_384) throw new RangeError("Mermaid text decoration ancestry exceeds its budget.");
    const css = view.getComputedStyle(owner);
    const atomic = ["inline-block", "inline-table", "inline-flex", "inline-grid"].includes(css.display) ||
      css.display.startsWith("inline flow-root");
    // Decorations propagate through boxes, not computed-style inheritance.
    // A descendant's none does not cancel an ancestor's underline. Atomic
    // inline and out-of-flow boxes instead start a new decorating context.
    const inherited = owner !== svg && owner.parentElement && !atomic &&
        !["absolute", "fixed"].includes(css.position) && css.cssFloat === "none"
      ? read(owner.parentElement, depth + 1)
      : [];
    const result = [...inherited];
    if (css.display !== "contents") {
      for (const line of css.textDecorationLine.split(/\s+/)) {
        if (line === "none" || !line) continue;
        if (!["underline", "line-through", "overline"].includes(line)) {
          throw new TypeError("Unsupported computed text decoration line.");
        }
        const decoration: Decorations[number] = {
          line: line as Decorations[number]["line"],
          color: css.textDecorationColor,
          style: css.textDecorationStyle,
          thickness: css.textDecorationThickness,
          offset: css.textUnderlineOffset,
          position: css.textUnderlinePosition,
          skipInk: css.textDecorationSkipInk,
        };
        if (owner.namespaceURI === "http://www.w3.org/2000/svg") {
          // SVG's current browser paint path uses the decorating owner's fill/
          // stroke, even when text-decoration-color computes to another ink.
          // Preserve both, without mutating CSS or guessing the child's paint.
          Object.assign(decoration, {
            color: css.fill,
            cssColor: css.textDecorationColor,
            stroke: css.stroke,
            strokeWidth: css.strokeWidth,
            fillOpacity: css.fillOpacity,
            strokeOpacity: css.strokeOpacity,
            paintOrder: css.paintOrder,
          });
        }
        const size = Object.values(decoration).reduce((sum, value) => sum + value.length, 0);
        if (size > 1024 || (units += size) > 1_048_576 || result.length >= 32) {
          throw new RangeError("Mermaid text decoration metadata exceeds its budget.");
        }
        result.push(decoration);
      }
    }
    cache.set(owner, { source: result });
    return result;
  };
  return (owner) => {
    const source = read(owner, 0);
    if (!source.length) return;
    if (owner.namespaceURI === "http://www.w3.org/2000/svg") return source;
    const captured = cache.get(owner)!;
    return captured.css ??= source.map((decoration) => {
      const previous = cssPaint.get(decoration);
      if (previous) return previous;
      const result = renderedTextDecorationPaint(decoration, false);
      cssPaint.set(decoration, result);
      return result;
    });
  };
}
