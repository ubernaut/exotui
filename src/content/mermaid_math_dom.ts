// Copyright 2023 Im-Beast. MIT license.
import type { MermaidScenePath, MermaidScenePoint, MermaidSceneText } from "./mermaid_scene.ts";
import { measuredPaintColor } from "./mermaid_gradient_dom.ts";
import {
  measuredTextDirectionResolver,
  renderedTextResolver,
  renderedTextSlices,
} from "./mermaid_text_transform_dom.ts";
import { measuredHTMLTextRuns } from "./mermaid_text_dom.ts";
import { generatedMathTextBaseline } from "./mermaid_generated_content_dom.ts";
import { mirroredTextGlyph } from "./mermaid_bidi.ts";
import { mathFractionRules } from "./mermaid_math_rules_dom.ts";

const namespace = "http://www.w3.org/1998/Math/MathML";
const tokens = new Set(["mi", "mn", "mo", "mtext", "ms"]);
const vertical = new Set(["(", ")", "[", "]", "{", "}", "|", "‖", "⌊", "⌋", "⌈", "⌉"]);

/** Capture notation that MathML paints without text nodes; the browser still owns TeX and math layout. */
export function extractMathML(
  root: Element,
  context: {
    convert(point: MermaidScenePoint): MermaidScenePoint;
    visible(element: Element): boolean;
    diagnostics: Set<string>;
    budget: { nodes: number; comparisons?: number; textNodes?: number; textCharacters?: number };
  },
): { item: MermaidScenePath | MermaidSceneText; owner: Element }[] {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const rendered = renderedTextResolver(document);
  const nodes = [root, ...root.querySelectorAll("*")];
  context.budget.nodes += nodes.length;
  if (nodes.length > 4096 || context.budget.nodes > 16_384) {
    throw new RangeError("Mermaid MathML exceeds its node budget.");
  }
  const rootSize = Number.parseFloat(view.getComputedStyle(root).fontSize);
  const records: { item: MermaidScenePath | MermaidSceneText; owner: Element }[] = [];
  const radicals: typeof records = [];
  let accentCanvas: CanvasRenderingContext2D | null | undefined;
  const fontCanvas = () => {
    if (accentCanvas === undefined) {
      if (++context.budget.nodes > 16_384) throw new RangeError("Mermaid MathML exceeds its node budget.");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      accentCanvas = canvas.getContext("2d");
    }
    return accentCanvas;
  };
  let fractionRules: ReturnType<typeof mathFractionRules> | undefined;
  const levels: number[] = [];
  const decorations: { x: number; right: number; y: number }[] = [];
  const point = (x: number, y: number) => context.convert({ x, y });
  const allowed = new Set([
    ...tokens,
    "math",
    "mrow",
    "mfrac",
    "msqrt",
    "mroot",
    "msub",
    "msup",
    "msubsup",
    "munder",
    "mover",
    "munderover",
    "mmultiscripts",
    "mprescripts",
    "none",
    "mtable",
    "mtr",
    "mtd",
    "mstyle",
    "mspace",
    "mpadded",
    "mphantom",
    "semantics",
    "annotation",
    "annotation-xml",
    "merror",
  ]);
  const text = (
    element: Element,
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    stretch?: "vertical" | "horizontal",
  ): MermaidSceneText => {
    const css = view.getComputedStyle(element);
    const at = point(x, y);
    const far = point(x + width, y + height);
    const item: MermaidSceneText = {
      kind: "text",
      text: value,
      x: at.x,
      y: at.y,
      width: far.x - at.x,
      height: far.y - at.y,
      color: measuredPaintColor(css.color, document),
      fontWeight: css.fontWeight,
      fontStyle: css.textTransform === "math-auto" ? "italic" : css.fontStyle,
      math: { rowUnits: 1, stretch },
    };
    records.push({ item, owner: element });
    if (!stretch) levels.push(at.y);
    else if (stretch === "horizontal") decorations.push({ x: at.x, right: far.x, y: at.y });
    return item;
  };
  const rule = (element: Element, x1: number, x2: number, y: number, thickness?: number) => {
    const start = point(x1, y);
    // Rule thickness is measured in original screen pixels, whereas points
    // are SVG-scene relative. Retain that affine metric through JSON/native
    // projection, rather than treating a zoomed pixel as a scene unit.
    const origin = point(0, 0), along = point(1, 0), down = point(0, 1);
    const a = along.x - origin.x, b = along.y - origin.y;
    const c = down.x - origin.x, d = down.y - origin.y, det = a * d - b * c;
    if (!Number.isFinite(det) || det === 0) throw new RangeError("Invalid MathML rule transform.");
    records.push({
      owner: element,
      item: {
        kind: "path",
        points: [start, point(x2, y)],
        closed: false,
        strokeInverse: thickness === undefined ? undefined : [
          d / det,
          -b / det,
          -c / det,
          a / det,
          (c * origin.y - d * origin.x) / det,
          (b * origin.x - a * origin.y) / det,
        ],
        paint: {
          fill: "none",
          stroke: measuredPaintColor(view.getComputedStyle(element).color, document),
          strokeWidth: thickness ?? 1,
          dash: [],
          opacity: 1,
        },
      },
    });
    decorations.push({ x: start.x, right: point(x2, y).x, y: start.y });
  };
  try {
    for (const element of nodes) {
      if (
        element.namespaceURI !== namespace || !context.visible(element) ||
        element.closest("annotation,annotation-xml,mphantom")
      ) continue;
      const tag = element.localName;
      if (!allowed.has(tag)) context.diagnostics.add(`MathML notation needs native expansion: ${tag}`);
      const box = element.getBoundingClientRect();
      const accent = tag === "mo" &&
        ["mover", "munder", "munderover"].includes(element.parentElement?.localName ?? "") &&
        element !== element.parentElement?.firstElementChild;
      if (!(box.height > 0 && (box.width > 0 || accent))) continue;
      const css = view.getComputedStyle(element);
      if (css.writingMode !== "horizontal-tb" || css.direction !== "ltr" && !tokens.has(tag)) {
        context.diagnostics.add("Bidirectional or vertical MathML needs native math ordering.");
      }
      if (tokens.has(tag)) {
        const walker = document.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        while (walker.nextNode()) {
          context.budget.textNodes = (context.budget.textNodes ?? 0) + 1;
          if (context.budget.textNodes > 16_384) throw new RangeError("Mermaid MathML exceeds its text-node budget.");
          const node = walker.currentNode as Text;
          if (node.parentElement && context.visible(node.parentElement)) textNodes.push(node);
        }
        // MathML Core renders ms like mtext: quotes must be authored in the text.
        // Legacy lquote/rquote attributes do not synthesize painted glyphs.
        let value = "";
        for (const node of textNodes) value += rendered(node);
        const sequence = context.budget.textCharacters ?? 0;
        context.budget.textCharacters = (context.budget.textCharacters ?? 0) + value.length;
        if (context.budget.textCharacters > 65_536) throw new RangeError("Mermaid MathML exceeds its text budget.");
        if (!value.trim()) continue;
        const size = Number.parseFloat(css.fontSize);
        const parentBox = element.parentElement!.getBoundingClientRect();
        const baseBox = accent ? element.parentElement!.firstElementChild!.getBoundingClientRect() : undefined;
        const stretch = tag === "mo" && vertical.has(value) && element.getAttribute("stretchy") !== "false" &&
            parentBox.height > size * 1.25
          ? "vertical"
          : tag === "mo" && ["¯", "‾", "_", "→", "←", "↔", "⃗"].includes(value) && (accent || box.width > size)
          ? "horizontal"
          : undefined;
        if (stretch && css.direction !== "ltr") {
          context.diagnostics.add("Bidirectional or vertical MathML needs native math ordering.");
        }
        // Plain MathML can reorder glyphs even with an LTR paragraph and no
        // controls/marks. Measure original token positions; keep ordinary ink
        // boxes and stretched operator assemblies on their existing anchor path.
        const generated = [...element.children].some((child) =>
          [...child.attributes].some((attribute) => attribute.name.startsWith("data-exotui-generated-"))
        );
        let operatorInk = value;
        if (css.writingMode === "horizontal-tb" && (!stretch || mirroredTextGlyph(value, true).text !== value)) {
          const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
          const labels = textNodes.map((node) => ({ node, segments: [...segmenter.segment(node.data)] }));
          const resolveDirection = measuredTextDirectionResolver(
            element,
            labels.flatMap(({ node, segments }) =>
              segments.filter(({ segment }) => {
                const mirror = mirroredTextGlyph(segment, true);
                return mirror.text !== segment || mirror.unpaired;
              }).map(({ index, segment }) => ({ node, start: index, end: index + segment.length }))
            ),
          );
          const fragments = labels.map(({ node, segments }) => {
            const owner = node.parentElement!, css = view.getComputedStyle(owner);
            const values = css.textTransform === "none" || css.textTransform === "math-auto"
              ? segments.map(({ segment }) => segment)
              : renderedTextSlices(
                element,
                segments.map(({ index, segment }) => ({ node, start: index, end: index + segment.length })),
              );
            return {
              node,
              owner,
              css,
              runs: measuredHTMLTextRuns(node, css, segments, values, context.diagnostics, resolveDirection, true),
            };
          });
          const separated = fragments.some(({ runs }) =>
            runs.some((run) => run.layout?.glyphs.some((glyph) => glyph.fragments))
          );
          const runs = fragments.flatMap(({ runs }) => runs);
          if (stretch && runs.length) operatorInk = runs.map((run) => run.renderedText ?? run.text).join("");
          const reordered = runs.some((run, index) => {
            const previous = runs[index - 1];
            // Font line boxes may differ on one baseline. Separate legacy
            // HTML rows are not bidi reversal; retain their logical spaces.
            return previous &&
              Math.max(run.y, previous.y) < Math.min(run.y + run.height, previous.y + previous.height) - .1 &&
              run.x < previous.x - .1;
          });
          const positioned = separated || reordered || runs.some((run) => run.renderedText !== undefined);
          const first = fragments.find(({ runs }) => runs.length);
          const split = first &&
            fragments.some(({ css, runs }) =>
              css.color !== first.css.color || css.fontWeight !== first.css.fontWeight ||
              css.fontStyle !== first.css.fontStyle ||
              css.fontSize !== first.css.fontSize || runs.length > 1 || runs.some((run) =>
                Math.abs(run.y - first.runs[0]!.y) > 0.5
              )
            );
          if (!stretch && (positioned || generated && split)) {
            for (const { node, owner, css, runs } of fragments) {
              if (!runs.length) continue;
              const baseline = generated
                ? generatedMathTextBaseline(node, context.diagnostics)
                : mathBaseline(element, context.diagnostics);
              const yShift = baseline - runs[0]!.y - rootSize * 0.3;
              const hasDetached = runs.some((run) =>
                run.layout?.glyphs.some((glyph) => glyph.fragments?.some((fragment) => fragment.columnOffset === -1))
              );
              const scale = hasDetached ? mathFontScale(owner) : undefined;
              if (hasDetached && !scale) {
                context.diagnostics.add("Detached MathML ink needs an axis-aligned font transform.");
              }
              for (const run of runs) {
                if (!run.text.trim()) continue;
                const item = text(
                  owner,
                  run.text,
                  run.x,
                  run.y + yShift,
                  run.width,
                  Number.parseFloat(css.fontSize),
                );
                if (run.renderedText !== undefined) item.renderedText = run.renderedText;
                if (positioned) {
                  if (!run.layout) {
                    context.diagnostics.add("Expanded or zero-advance HTML text needs native shaping layout.");
                    continue;
                  }
                  const zero = point(0, 0), along = point(1, 0);
                  item.layout = {
                    ...run.layout,
                    sequence,
                    columnUnits: run.layout.columnUnits * Math.hypot(along.x - zero.x, along.y - zero.y),
                    glyphs: run.layout.glyphs.map((glyph) => ({
                      ...glyph,
                      ...point(glyph.x, glyph.y + yShift),
                      fragments: glyph.fragments?.map((fragment) => {
                        let ink;
                        if (fragment.columnOffset === -1 && scale) {
                          context.budget.comparisons = (context.budget.comparisons ?? 0) + 1;
                          if (context.budget.comparisons > 1_000_000) {
                            throw new RangeError("Mermaid MathML exceeds its measurement budget.");
                          }
                          const bounds = mathDetachedInk(
                            css,
                            fragment.rendered.slice(1),
                            fontCanvas(),
                          );
                          if (bounds) {
                            const top = baseline + fragment.y - runs[0]!.y - bounds.ascent * scale.y;
                            const left = fragment.x - bounds.left * scale.x;
                            const a = point(left, top),
                              b = point(left + bounds.width * scale.x, top + bounds.height * scale.y);
                            ink = { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
                          } else {
                            context.diagnostics.add("Detached MathML ink needs measured ready-font glyph bounds.");
                          }
                        }
                        return { ...fragment, ...point(fragment.x, fragment.y + yShift), ...(ink ? { ink } : {}) };
                      }),
                    })),
                  };
                  delete item.renderedText;
                }
              }
            }
            continue;
          }
        }
        // MathML element boxes bound actual ink, unlike Range boxes which use
        // the font line box and give scripts/operators incompatible anchors.
        // An assembly is a native projection hint, not proof that the font
        // stretched. Keep the operator's own ink box, including fallback
        // glyphs centred inside a much taller/wider parent or accent base.
        // Zero-advance combining accents have real ink outside the advance
        // box. Measure the same styled font at its original glyph origin.
        const zeroAccent = stretch === "horizontal" && box.width === 0 && baseBox;
        const accentInk = zeroAccent ? mathAccentInk(element, value, fontCanvas()) : undefined;
        if (zeroAccent && !accentInk) {
          context.diagnostics.add("Zero-advance MathML accent needs measured native ink bounds.");
        }
        const item = text(
          element,
          value,
          accentInk ? box.x - accentInk.left : zeroAccent ? baseBox.x : box.x,
          stretch ? box.y : mathBaseline(element, context.diagnostics) - rootSize * 0.3,
          accentInk ? accentInk.width : zeroAccent ? baseBox.width : box.width,
          box.height,
          stretch,
        );
        if (value === "⃗") item.renderedText = "→";
        else if (operatorInk !== value) item.renderedText = operatorInk;
      } else if (tag === "mfrac" && ["math", "inline math", "block math"].includes(css.display)) {
        const children = [...element.children].filter((child) => {
          const style = view.getComputedStyle(child);
          return style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";
        });
        // Non-two-child fractions use mrow layout and paint no fraction bar.
        if (children.length !== 2) continue;
        fractionRules ??= mathFractionRules(document, context.budget, context.diagnostics);
        const metrics = fractionRules.measure(element);
        if (metrics.thickness === 0) continue;
        const blockSize = Number.parseFloat(css.height) + Number.parseFloat(css.paddingTop) +
          Number.parseFloat(css.paddingBottom) + Number.parseFloat(css.borderTopWidth) +
          Number.parseFloat(css.borderBottomWidth);
        const inlineSize = Number.parseFloat(css.width) + Number.parseFloat(css.paddingLeft) +
          Number.parseFloat(css.paddingRight) + Number.parseFloat(css.borderLeftWidth) +
          Number.parseFloat(css.borderRightWidth);
        const sy = box.height / blockSize, sx = box.width / inlineSize;
        if (!(Number.isFinite(sy) && sy > 0 && Number.isFinite(sx) && sx > 0)) {
          throw new RangeError("Invalid MathML fraction scale.");
        }
        const left = box.left + (Number.parseFloat(css.paddingLeft) + Number.parseFloat(css.borderLeftWidth)) * sx;
        const right = box.right - (Number.parseFloat(css.paddingRight) + Number.parseFloat(css.borderRightWidth)) * sx;
        rule(
          element,
          left,
          right,
          mathBaseline(element, context.diagnostics, true) - metrics.axis * sy,
          metrics.thickness * sy,
        );
      } else if ((tag === "msqrt" || tag === "mroot") && element.children.length) {
        const children = tag === "mroot" ? [element.children[0]!] : [...element.children];
        const boxes = children.map((child) => child.getBoundingClientRect());
        const left = Math.min(...boxes.map((child) => child.left));
        const right = Math.max(...boxes.map((child) => child.right));
        const rtl = css.direction === "rtl";
        const size = Number.parseFloat(css.fontSize);
        // The browser places the surd at inline-start, which is to the
        // RIGHT of the operand in RTL. The original radical glyph remains
        // U+221A; paragraph direction alone does not imply mirrored ink.
        const radicalWidth = Math.min(size * 0.55, rtl ? box.right - right : left - box.left);
        if (radicalWidth > 0) {
          text(
            element,
            "√",
            rtl ? right : left - radicalWidth,
            mathBaseline(children[0]!, context.diagnostics) - rootSize * 0.3,
            radicalWidth,
            size,
          );
          // The surd is parent notation, not an earlier sibling of its
          // base. Paint it after the base's fraction rules, whose boundary
          // cells can otherwise replace the radical at terminal density.
          radicals.push(records.pop()!);
          rule(element, rtl ? box.left : left, rtl ? right : box.right, box.top);
        }
      }
    }
  } finally {
    fractionRules?.dispose();
  }
  records.push(...radicals.reverse());
  // One terminal row must not hold both a base and its script, or numerator
  // and fraction bar. Ignore subpixel ink-metric noise between ordinary tokens.
  levels.sort((a, b) => a - b);
  let rowUnits = Math.abs(point(0, rootSize * 0.5).y - point(0, 0).y);
  // Resolve glyph ink at at least three rows, including ordinary tokens.
  // Otherwise a visible denominator near a clipping boundary can round its
  // only representative cell outside the viewport and disappear entirely.
  // Fences also need separate top/body/bottom rows within their own box.
  for (const { item } of records) {
    if (item.kind === "text" && item.height > 0) {
      rowUnits = Math.min(rowUnits, item.height / 3);
    }
  }
  for (let index = 1; index < levels.length; index++) {
    const gap = levels[index]! - levels[index - 1]!;
    if (gap > 0.75) rowUnits = Math.min(rowUnits, gap * 0.9);
  }
  // A degree outside a radical bar can share its row in either direction. Only constrain
  // decoration/token pairs whose horizontal extents actually overlap.
  for (const decoration of decorations) {
    for (const { item } of records) {
      context.budget.comparisons = (context.budget.comparisons ?? 0) + 1;
      if (context.budget.comparisons > 1_000_000) {
        throw new RangeError("Mermaid MathML exceeds its layout-work budget.");
      }
      if (
        item.kind !== "text" || item.math?.stretch || item.x + item.width <= decoration.x ||
        item.x >= decoration.right
      ) continue;
      const gap = Math.abs(item.y - decoration.y);
      if (gap > 0.75) rowUnits = Math.min(rowUnits, gap * 0.9);
    }
  }
  if (!(Number.isFinite(rowUnits) && rowUnits > 0)) throw new RangeError("Invalid MathML native row density.");
  for (const { item } of records) if (item.kind === "text") item.math!.rowUnits = rowUnits;
  return records;
}

/** Combining accent ink, not advance width; no measuring DOM or font/resource registration is installed. */
// A foreignObject supplies SVG-to-screen scale; HTML descendants add their
// own zoom/axis-aligned transforms. No DOM or font resources are registered.
function mathFontScale(element: Element): { x: number; y: number } | undefined {
  const view = element.ownerDocument.defaultView!, foreign = element.closest("foreignObject");
  if (!(foreign instanceof view.SVGForeignObjectElement)) return;
  const matrix = foreign.getScreenCTM();
  if (!matrix || Math.abs(matrix.b) > 1e-7 || Math.abs(matrix.c) > 1e-7) return;
  let x = matrix.a, y = matrix.d;
  for (let owner: Element | null = element; owner && owner !== foreign; owner = owner.parentElement) {
    const css = view.getComputedStyle(owner), transform = new view.DOMMatrix(css.transform);
    if (
      !transform.is2D || Math.abs(transform.b) > 1e-7 || Math.abs(transform.c) > 1e-7 ||
      ["rotate", "scale", "perspective"].some((name) => !["", "none"].includes(css.getPropertyValue(name)))
    ) return;
    const zoom = css.zoom === "normal" ? 1 : Number.parseFloat(css.zoom);
    x *= transform.a * zoom;
    y *= transform.d * zoom;
  }
  return [x, y].every((value) => Number.isFinite(value) && value > 0) ? { x, y } : undefined;
}

function mathDetachedInk(
  css: CSSStyleDeclaration,
  value: string,
  canvas: CanvasRenderingContext2D | null,
): { left: number; ascent: number; width: number; height: number } | undefined {
  if (!canvas || !/^[\p{Mark}\p{Cf}]+$/u.test(value)) return;
  // Canvas's font shorthand does not carry these OpenType/individual CSS
  // variants. Do not claim ready-font parity by silently measuring defaults.
  if (
    !["normal", ""].includes(css.fontFeatureSettings) || !["normal", ""].includes(css.fontVariationSettings) ||
    !["normal", ""].includes(css.fontVariantCaps) || !["normal", "100%", ""].includes(css.fontStretch)
  ) return;
  canvas.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
  canvas.textAlign = "left";
  canvas.textBaseline = "alphabetic";
  canvas.direction = "ltr";
  const metrics = canvas.measureText(value),
    left = metrics.actualBoundingBoxLeft,
    ascent = metrics.actualBoundingBoxAscent,
    width = left + metrics.actualBoundingBoxRight,
    height = ascent + metrics.actualBoundingBoxDescent;
  if (![left, ascent, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || metrics.width !== 0) return;
  return { left, ascent, width, height };
}

function mathAccentInk(
  element: Element,
  value: string,
  canvas: CanvasRenderingContext2D | null,
): { left: number; width: number } | undefined {
  const document = element.ownerDocument, css = document.defaultView!.getComputedStyle(element);
  if (!canvas) return;
  canvas.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
  canvas.textAlign = "left";
  canvas.direction = "ltr";
  const metrics = canvas.measureText(value), left = metrics.actualBoundingBoxLeft;
  const width = left + metrics.actualBoundingBoxRight;
  if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) return;
  return { left, width };
}

/** A zero-size MathML space exposes the actual font/math baseline, including script and glyph variants. */
function mathBaseline(element: Element, diagnostics: Set<string>, fractionRule = false): number {
  const document = element.ownerDocument;
  const before = element.getBoundingClientRect();
  const parent = element.parentNode!;
  const wrapper = document.createElementNS(namespace, "mrow");
  const marker = document.createElementNS(namespace, "mspace");
  for (const name of ["width", "height", "depth"]) marker.setAttribute(name, "0px");
  parent.replaceChild(wrapper, element);
  try {
    wrapper.append(element, marker);
    const after = element.getBoundingClientRect();
    if (Math.abs(before.width - after.width) > 0.1 || Math.abs(before.height - after.height) > 0.1) {
      diagnostics.add("MathML baseline probe changed styled glyph metrics.");
    }
    const baseline = marker.getBoundingClientRect().top;
    if (fractionRule) {
      // The wrapper owns untransformed fraction layout. Its baseline can be
      // projected into the fraction's own transformed box, including local
      // axis-aligned scale/translate, without changing authored styles.
      const layout = wrapper.getBoundingClientRect();
      if (layout.height > 0) return before.top + (baseline - layout.top) * before.height / layout.height;
    }
    return baseline + before.top - after.top;
  } finally {
    parent.replaceChild(element, wrapper);
  }
}
