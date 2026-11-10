// Copyright 2023 Im-Beast. MIT license.
import { getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import type { MermaidScenePoint, MermaidSceneText } from "./mermaid_scene.ts";
import { renderedTextSlices } from "./mermaid_text_transform_dom.ts";
import { measuredHTMLGlyphDirection, mirroredTextGlyph } from "./mermaid_bidi.ts";

type TextBox = { x: number; y: number; width: number; height: number };
type TextRun = {
  text: string;
  renderedText?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layout?: MermaidSceneText["layout"];
};

/** Separate only genuinely distinct native shaping boxes; duplicate character boxes remain one grapheme. */
function measuredGlyphFragments(
  value: string,
  measure: (start: number, end: number) => { box: TextBox; direction: "ltr" | "rtl" | undefined },
  diagnostics?: Set<string>,
): {
  fragments: (NonNullable<NonNullable<MermaidSceneText["layout"]>["glyphs"][number]["fragments"]>[number] & {
    width: number;
    height: number;
  })[];
  columnUnits: number;
} | undefined {
  if (/\p{Variation_Selector}/u.test(value)) return;
  const groups: { start: number; end: number; text: string; box: TextBox }[] = [];
  let offset = 0;
  for (const char of value) {
    const end = offset + char.length, { box } = measure(offset, end);
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width < 0 || box.height <= 0) {
      diagnostics?.add("Separated text glyphs need finite native shaping geometry.");
      return;
    }
    const previous = groups.at(-1);
    if (
      previous &&
      ["x", "y", "width", "height"].every((key) =>
        Math.abs(previous.box[key as keyof TextBox] - box[key as keyof TextBox]) < .1
      )
    ) {
      previous.text += char;
      previous.end = end;
    } else groups.push({ start: offset, end, text: char, box });
    offset = end;
  }
  if (groups.length < 2) return;
  // Distinct boxes also occur inside Indic conjuncts, emoji and ligatures.
  // Preserve those shaping units: only detached trailing combining-mark ink
  // can acquire a printable carrier, never another base or a variation selector.
  if (groups.slice(1).some(({ text }) => !/^[\p{Mark}\p{Cf}]+$/u.test(text))) return;
  const base = groups[0]!.box;
  if (
    !groups.slice(1).some(({ box }) =>
      box.x + box.width < base.x - .1 || box.x > base.x + base.width + .1 ||
      box.y + box.height < base.y - .1 || box.y > base.y + base.height + .1
    )
  ) return;
  const pitches: number[] = [];
  const fragments = groups.flatMap(({ start, end, text, box }) => {
    const mirror = mirroredTextGlyph(text, true);
    let ink = text;
    if (mirror.text !== text || mirror.unpaired) {
      const direction = measure(start, end).direction;
      if (direction === "rtl") {
        ink = mirror.text;
        if (mirror.unpaired) {
          diagnostics?.add("Mirrored text needs a font glyph without a Unicode character substitute.");
        }
      } else if (direction === undefined) {
        diagnostics?.add("Bidirectional HTML glyph direction needs an unambiguous native measurement.");
      }
    }
    const width = textWidth(ink);
    if (!width && !/\p{Mark}/u.test(ink)) return [];
    if (width && box.width > 0) pitches.push(box.width / width);
    // A standalone mark needs an inert printable carrier in ANSI/cell transport.
    // Keep its measured anchor; zero-advance marks overhang the preceding cell.
    return [{
      rendered: width ? ink : `\u00a0${ink}`,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      ...(!width && box.width === 0 ? { columnOffset: -1 as const } : {}),
    }];
  });
  if (fragments.length < 2 || !pitches.length) return;
  diagnostics?.add(
    "Separated combining marks use printable native carriers; exact font shaping needs a font-capable host.",
  );
  return { fragments, columnUnits: Math.min(...pitches) };
}

/** Browser Range geometry for styled HTML fragments, preserving wrapped lines and rendered grapheme text. */
export function measuredHTMLTextRuns(
  node: Text,
  css: CSSStyleDeclaration,
  segments: readonly Intl.SegmentData[],
  rendered: readonly string[],
  diagnostics?: Set<string>,
  resolveDirection?: (node: Text, start: number, end: number) => "ltr" | "rtl" | undefined,
  captureLayout = false,
): TextRun[] {
  const range = node.ownerDocument!.createRange();
  const runs: TextRun[] = [];
  const positions = new Map<
    TextRun,
    { glyphs: NonNullable<MermaidSceneText["layout"]>["glyphs"][number][]; pitch: number }
  >();
  const preserve = ["pre", "pre-wrap", "break-spaces"].includes(css.whiteSpace);
  for (const [at, { segment, index }] of segments.entries()) {
    range.setStart(node, index);
    range.setEnd(node, index + segment.length);
    const box = range.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) continue;
    const value = !preserve && /^[\t\r\n ]+$/.test(segment) ? " " : rendered[at]!;
    const boxes = segment.length > String.fromCodePoint(segment.codePointAt(0)!).length
      ? [...range.getClientRects()]
      : [box];
    if (
      value === segment && css.writingMode === "horizontal-tb" && boxes.length > 1 &&
      boxes.some((rect) => Math.abs(rect.x - boxes[0]!.x) > .1 || Math.abs(rect.y - boxes[0]!.y) > .1)
    ) {
      const shaped = measuredGlyphFragments(value, (from, to) => {
        range.setStart(node, index + from);
        range.setEnd(node, index + to);
        const box = range.getBoundingClientRect();
        range.collapse(true);
        const start = range.getBoundingClientRect();
        range.setStart(node, index + to);
        range.collapse(true);
        return {
          box,
          direction: measuredHTMLGlyphDirection(box, start, range.getBoundingClientRect()) ??
            resolveDirection?.(node, index + from, index + to),
        };
      }, diagnostics);
      if (shaped) {
        runs.push({
          text: value,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          layout: {
            columnUnits: shaped.columnUnits,
            anchor: "top-left",
            glyphs: [{
              start: 0,
              end: value.length,
              x: box.x,
              y: box.y,
              fragments: shaped.fragments.map(({ width: _width, height: _height, ...fragment }) => fragment),
            }],
          },
        });
        continue;
      }
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
    }
    let ink = value;
    const mirror = mirroredTextGlyph(value, true);
    if (mirror.text !== value || mirror.unpaired) {
      range.collapse(true);
      const start = range.getBoundingClientRect();
      range.setStart(node, index + segment.length);
      range.collapse(true);
      const end = range.getBoundingClientRect();
      const direction = css.writingMode === "horizontal-tb"
        ? measuredHTMLGlyphDirection(box, start, end) ?? resolveDirection?.(node, index, index + segment.length)
        : undefined;
      if (direction === "rtl") {
        ink = mirror.text;
        if (mirror.unpaired) {
          diagnostics?.add("Mirrored text needs a font glyph without a Unicode character substitute.");
        }
      } else if (direction === undefined) {
        diagnostics?.add("Bidirectional HTML glyph direction needs an unambiguous native measurement.");
      }
    }
    const previous = runs.at(-1);
    if (
      previous && !previous.layout && Math.abs(previous.y - box.y) < 0.5 &&
      Math.abs(previous.x + previous.width - box.x) < 1
    ) {
      const measured = positions.get(previous)!;
      measured.glyphs.push({
        start: previous.text.length,
        end: previous.text.length + value.length,
        x: box.x,
        y: box.y,
        ...(ink !== value ? { rendered: ink } : {}),
      });
      if (textWidth(ink) > 0) measured.pitch = Math.min(measured.pitch, box.width / textWidth(ink));
      if (previous.renderedText !== undefined || ink !== value) {
        previous.renderedText = (previous.renderedText ?? previous.text) + ink;
      }
      previous.text += value;
      previous.width = box.right - previous.x;
      previous.height = Math.max(previous.height, box.height);
    } else {
      const run = {
        text: value,
        ...(ink !== value ? { renderedText: ink } : {}),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
      runs.push(run);
      positions.set(run, {
        glyphs: [{ start: 0, end: value.length, x: box.x, y: box.y, ...(ink !== value ? { rendered: ink } : {}) }],
        pitch: textWidth(ink) > 0 ? box.width / textWidth(ink) : Infinity,
      });
    }
  }
  if (captureLayout || runs.some((run) => run.layout)) {
    for (const run of runs) {
      if (run.layout) continue;
      const measured = positions.get(run)!;
      if (
        !Number.isFinite(measured.pitch) || measured.pitch <= 0 ||
        measured.glyphs.some((glyph) =>
          getMultiCodePointCharacters(run.text.slice(glyph.start, glyph.end)).length !== 1
        )
      ) {
        if (!captureLayout) diagnostics?.add("Expanded or zero-advance HTML text needs native shaping layout.");
        continue;
      }
      run.layout = { columnUnits: measured.pitch, anchor: "top-left", glyphs: measured.glyphs };
    }
  }
  return runs;
}

/** Capture SVG's actual character layout, including nested run styles and UTF-16/grapheme boundaries. */
export function measuredSVGText(
  element: SVGTextElement,
  convert: (point: MermaidScenePoint, matrix: DOMMatrix) => MermaidScenePoint,
  visible: (owner: Element) => boolean,
  budget: { characters: number; nodes: number },
  diagnostics?: Set<string>,
): {
  owner: SVGGraphicsElement;
  text: string;
  renderedText?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layout?: MermaidSceneText["layout"];
}[] {
  const view = element.ownerDocument.defaultView!;
  const count = element.getNumberOfChars();
  const sequence = budget.characters;
  budget.characters += count;
  if (!Number.isSafeInteger(count) || count < 0 || budget.characters > 65_536) {
    throw new RangeError("SVG text exceeds its character budget.");
  }
  const matrix = element.getScreenCTM();
  if (!count || !matrix) return [];
  const walker = element.ownerDocument.createTreeWalker(element, view.NodeFilter.SHOW_TEXT);
  const runs: { owner: SVGGraphicsElement; node: Text; text: string }[] = [];
  let trailingSpace = true;
  while (walker.nextNode()) {
    if (++budget.nodes > 16_384) throw new RangeError("SVG text exceeds its node budget.");
    const owner = walker.currentNode.parentElement;
    if (!owner || !(owner instanceof view.SVGGraphicsElement)) continue;
    if (owner.closest("title,desc,style,script")) continue;
    let displayed = true;
    for (let at: Element | null = owner; at; at = at.parentElement) {
      if (view.getComputedStyle(at).display === "none") displayed = false;
      if (at === element) break;
    }
    if (!displayed) continue;
    const css = view.getComputedStyle(owner);
    let text = walker.currentNode.textContent ?? "";
    if (!["pre", "pre-wrap", "break-spaces"].includes(css.whiteSpace)) {
      text = text.replace(/[\t\r\n ]+/g, " ");
      if (trailingSpace) text = text.replace(/^ /, "");
    }
    if (!text) continue;
    trailingSpace = text.endsWith(" ");
    runs.push({ owner, node: walker.currentNode as Text, text });
  }
  const last = runs.at(-1);
  if (last && !["pre", "pre-wrap", "break-spaces"].includes(view.getComputedStyle(last.owner).whiteSpace)) {
    last.text = last.text.replace(/ $/, "");
  }
  const rendered = renderedTextSlices(
    element,
    runs.map(({ node, text }) => ({ node, start: 0, end: text.length })),
    new Map(runs.map(({ node, text }) => [node, text])),
  );
  for (const [index, text] of rendered.entries()) runs[index]!.text = text;
  if (runs.reduce((n, run) => n + run.text.length, 0) !== count) {
    throw new RangeError("Owning SVG text character mapping is unsupported.");
  }
  let offset = 0;
  return runs.flatMap(({ owner, text }) => {
    const start = offset;
    offset += text.length;
    if (!text || !visible(owner)) return [];
    const chars = getMultiCodePointCharacters(text);
    if (chars.length > 8192) throw new RangeError("SVG text exceeds its grapheme budget.");
    let local = 0, advance = 0;
    const boxes: { x: number; y: number }[] = [];
    const glyphs = chars.map((char) => {
      const index = start + local;
      const box = element.getExtentOfChar(index);
      const p = element.getStartPositionOfChar(index), q = element.getEndPositionOfChar(index);
      const from = convert(p, matrix), to = convert(q, matrix);
      advance += Math.hypot(to.x - from.x, to.y - from.y);
      const corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ].map(([x, y]) => convert({ x: x!, y: y! }, matrix));
      boxes.push(...corners);
      const center = convert({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, matrix);
      // Local SVG advance resolves bidi direction independently of geometric
      // reflection/rotation. Do not infer it from the transformed scene axis.
      const css = view.getComputedStyle(owner);
      const delta = css.writingMode === "horizontal-tb" ? q.x - p.x : q.y - p.y;
      const mirror = mirroredTextGlyph(char, delta < 0);
      if (mirror.unpaired) diagnostics?.add("Mirrored text needs a font glyph without a Unicode character substitute.");
      const glyph: NonNullable<MermaidSceneText["layout"]>["glyphs"][number] = {
        start: local,
        end: local + char.length,
        x: center.x,
        y: center.y,
        ...(mirror.text !== char ? { rendered: mirror.text } : {}),
      };
      if ([...char].length > 1) {
        const shaped = measuredGlyphFragments(char, (from, _to) => {
          const bounds = element.getExtentOfChar(index + from);
          const p = element.getStartPositionOfChar(index + from), q = element.getEndPositionOfChar(index + from);
          return {
            box: bounds,
            direction: (css.writingMode === "horizontal-tb" ? q.x - p.x : q.y - p.y) < 0 ? "rtl" : "ltr",
          };
        }, diagnostics);
        if (shaped) {
          const fragments = shaped.fragments.map(({ x, y, width, height, ...fragment }) => {
            // SVG fragments retain the existing upright, world-space center profile.
            const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
            boxes.push(...corners.map(([x, y]) => convert({ x: x!, y: y! }, matrix)));
            const point = convert({ x: x + width / 2, y: y + height / 2 }, matrix);
            return { ...fragment, ...point };
          });
          glyph.fragments = fragments;
          delete glyph.rendered;
        }
      }
      local += char.length;
      return glyph;
    });
    const x = Math.min(...boxes.map((p) => p.x)), y = Math.min(...boxes.map((p) => p.y));
    const width = Math.max(...boxes.map((p) => p.x)) - x, height = Math.max(...boxes.map((p) => p.y)) - y;
    const origin = convert({ x: 0, y: 0 }, matrix), along = convert({ x: 1, y: 0 }, matrix);
    const irregular = Math.abs(along.y - origin.y) > 1e-5 ||
      along.x < origin.x ||
      element.querySelector("textPath,[rotate]") !== null || element.hasAttribute("rotate") ||
      [element, ...element.querySelectorAll("tspan,textPath")].some((node) =>
        ["x", "y", "dx", "dy"].some((name) => (node.getAttribute(name) ?? "").trim().split(/[\s,]+/).length > 1)
      ) ||
      ["letterSpacing", "wordSpacing"].some((name) => {
        const value = view.getComputedStyle(owner)[name as "letterSpacing" | "wordSpacing"];
        return value !== "normal" && Number.parseFloat(value) !== 0;
      }) ||
      view.getComputedStyle(owner).writingMode !== "horizontal-tb" ||
      glyphs.some((p, i) =>
        p.fragments !== undefined || i > 0 && (Math.abs(p.y - glyphs[i - 1]!.y) > 1e-5 || p.x < glyphs[i - 1]!.x)
      );
    const columnUnits = advance / Math.max(1, textWidth(text));
    return [{
      owner,
      text,
      // Substitution changes ink, not geometry: ordinary runs keep their original top-edge placement.
      ...(!irregular && glyphs.some((glyph) => glyph.rendered !== undefined)
        ? { renderedText: glyphs.map((glyph) => glyph.rendered ?? text.slice(glyph.start, glyph.end)).join("") }
        : {}),
      x,
      y,
      width,
      height,
      layout: irregular && columnUnits > 0 ? { glyphs, columnUnits, sequence } : undefined,
    }];
  });
}
