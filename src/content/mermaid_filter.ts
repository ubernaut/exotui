// Copyright 2023 Im-Beast. MIT license.
import type { MermaidNativeCell } from "./mermaid_cells.ts";
import type {
  MermaidSceneClip,
  MermaidSceneFilter,
  MermaidSceneFilterNode,
  MermaidSceneTransfer,
} from "./mermaid_scene.ts";
import { BLEND_MODES, overPaint, type PaintColor, parsePaintColor } from "./mermaid_paint.ts";

export interface FilterCell {
  cell: MermaidNativeCell;
  background?: PaintColor;
  foreground?: PaintColor;
}
interface Image {
  background: Map<number, PaintColor>;
  visible: Map<number, PaintColor>;
  glyphs: Map<number, MermaidNativeCell>;
}
const clear: PaintColor = { rgb: [0, 0, 0], alpha: 0 };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const linear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = (value: number) => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
// Match the measured Chromium SVG filter surfaces: linear-light filter
// intermediates use 8-bit channels, not unconstrained double precision.
const quantized = (value: number) => Math.round(clamp(value) * 255) / 255;
const inSpace = (color: PaintColor, space?: string): PaintColor =>
  space === "linearRGB"
    ? {
      rgb: color.rgb.map((value) => quantized(linear(value / 255)) * 255) as [number, number, number],
      alpha: color.alpha,
    }
    : color;
const fromSpace = (color: PaintColor, space?: string): PaintColor =>
  space === "linearRGB"
    ? {
      rgb: color.rgb.map((value) => srgb(quantized(value / 255)) * 255) as [number, number, number],
      alpha: color.alpha,
    }
    : color;

/** Apply portable SVG/CSS filter graphs to cell-scale paint, never to an HTML overlay. */
export function filterCells(
  pixels: ReadonlyMap<number, FilterCell>,
  filter: MermaidSceneFilter,
  options: {
    columns: number;
    rows: number;
    left?: number;
    top?: number;
    columnUnits: number;
    rowUnits: number;
    maxCells: number;
    charge: (amount: number) => void;
    predicate: (clip?: MermaidSceneClip) => (x: number, y: number) => boolean;
  },
): Map<number, FilterCell> {
  const { columns, rows, columnUnits, rowUnits, charge, left: originX = 0, top: originY = 0 } = options;
  if (filter.nodes.length > 256) throw new RangeError("Native Mermaid exceeds its filter-node budget.");
  const limit = Math.min(4_000_000, options.maxCells * 4);
  let retained = 0;
  const reserve = (amount: number) => {
    retained += amount;
    if (retained > limit) throw new RangeError("Native Mermaid exceeds its filter-cell budget.");
  };
  const empty = (): Image => ({ background: new Map(), visible: new Map(), glyphs: new Map() });
  const source = empty();
  for (const [index, pixel] of pixels) {
    charge(4);
    if (pixel.background) {
      reserve(1);
      source.background.set(index, pixel.background);
    }
    if (pixel.foreground ?? pixel.background) {
      reserve(1);
      source.visible.set(index, (pixel.foreground ?? pixel.background)!);
    }
    if (pixel.cell.char !== " " || pixel.cell.href || pixel.cell.interaction) {
      reserve(1);
      source.glyphs.set(index, pixel.cell);
    }
  }
  const images: (Image | undefined)[] = [source];
  const references = new Array(filter.nodes.length + 1).fill(0);
  const inputs = (node: MermaidSceneFilterNode): readonly number[] =>
    node.kind === "merge"
      ? node.inputs
      : "input2" in node
      ? [node.input, node.input2]
      : "input" in node
      ? [node.input]
      : [];
  for (const [index, node] of filter.nodes.entries()) {
    if (
      !["alpha", "matrix", "transfer", "blur", "offset", "flood", "blend", "composite", "merge"].includes(node.kind)
    ) {
      throw new RangeError("Unsupported native filter node.");
    }
    if (node.kind === "merge" && node.inputs.length > 256) {
      throw new RangeError("Native filter exceeds its merge-input budget.");
    }
    for (const input of inputs(node)) {
      if (!Number.isSafeInteger(input) || input < 0 || input > index) {
        throw new RangeError("Invalid native filter dependency.");
      }
      references[input]++;
    }
  }
  references[filter.nodes.length]++;
  if (!references[0]) {
    retained -= source.background.size + source.visible.size + source.glyphs.size;
    images[0] = undefined;
  }
  const sample = (map: ReadonlyMap<number, PaintColor>, x: number, y: number): PaintColor =>
    x >= 0 && x < columns && y >= 0 && y < rows ? map.get(y * columns + x) ?? clear : clear;
  const store = (map: Map<number, PaintColor>, index: number, color: PaintColor) => {
    if (color.alpha <= 0) return;
    if (!map.has(index)) reserve(1);
    map.set(index, color);
  };
  const domainBounds = new WeakMap<MermaidSceneClip, readonly [number, number, number, number]>();
  const domain = (clip: MermaidSceneClip | undefined, action: (index: number) => void) => {
    const inside = options.predicate(clip);
    let bounds = clip && domainBounds.get(clip);
    if (!bounds) {
      bounds = clipBounds(clip, charge);
      if (clip) domainBounds.set(clip, bounds);
    }
    const left = Math.max(0, Math.ceil(bounds[0] / columnUnits - .5) - originX);
    const top = Math.max(0, Math.ceil(bounds[1] / rowUnits - .5) - originY);
    const right = Math.min(columns - 1, Math.floor(bounds[2] / columnUnits - .5) - originX);
    const bottom = Math.min(rows - 1, Math.floor(bounds[3] / rowUnits - .5) - originY);
    charge(Math.max(0, right - left + 1) * Math.max(0, bottom - top + 1));
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (inside((x + originX + .5) * columnUnits, (y + originY + .5) * rowUnits)) action(y * columns + x);
      }
    }
  };
  const keepGlyphs = (output: Image, input: Image) => {
    for (const [index, cell] of input.glyphs) {
      if (!output.visible.has(index)) continue;
      if (!output.glyphs.has(index)) reserve(1);
      output.glyphs.set(index, cell);
    }
  };
  for (const node of filter.nodes) {
    const output = empty();
    const deps = inputs(node);
    const first = deps.length ? images[deps[0]!]! : undefined;
    const second = deps.length > 1 ? images[deps[1]!]! : undefined;
    if (node.interpolation && !["sRGB", "linearRGB"].includes(node.interpolation)) {
      throw new RangeError("Invalid native filter color space.");
    }
    const clip = node.clip && filter.clip
      ? { kind: "intersection" as const, children: [node.clip, filter.clip] }
      : node.clip ?? filter.clip;
    const inside = options.predicate(clip);
    const allowed = (index: number) =>
      inside(
        (index % columns + originX + .5) * columnUnits,
        (Math.floor(index / columns) + originY + .5) * rowUnits,
      );
    if (["alpha", "matrix", "transfer"].includes(node.kind)) {
      validateColorNode(node as Extract<MermaidSceneFilterNode, { kind: "alpha" | "matrix" | "transfer" }>);
    }
    for (const plane of ["background", "visible"] as const) {
      const a = first?.[plane];
      const b = second?.[plane];
      const target = output[plane];
      const put = (index: number, color: PaintColor) => {
        charge(4);
        if (allowed(index)) store(target, index, color);
      };
      if (identityFilter(node)) {
        for (const [index, color] of a!) put(index, color);
      } else if (node.kind === "flood") {
        const color = parsePaintColor(node.color);
        if (!color || !Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1) {
          throw new RangeError("Invalid native filter flood color/opacity.");
        }
        if (color.alpha * node.opacity) {
          domain(clip, (index) => put(index, { rgb: color.rgb, alpha: color.alpha * node.opacity }));
        }
      } else if (node.kind === "matrix" || node.kind === "transfer" || node.kind === "alpha") {
        const convert = (color: PaintColor): PaintColor => {
          charge(node.kind === "matrix" ? 24 : node.kind === "transfer" ? 12 : 4);
          const value = inSpace(color, node.interpolation);
          const rgba = [...value.rgb.map((channel) => channel / 255), value.alpha];
          const result = node.kind === "alpha"
            ? [0, 0, 0, value.alpha]
            : node.kind === "matrix"
            ? [0, 1, 2, 3].map((row) =>
              clamp(
                node.values[row * 5 + 4]! +
                  rgba.reduce((sum, channel, column) => sum + channel * node.values[row * 5 + column]!, 0),
              )
            )
            : rgba.map((channel, index) => transfer(channel, node.channels[index]!));
          return fromSpace(
            { rgb: [result[0]! * 255, result[1]! * 255, result[2]! * 255], alpha: result[3]! },
            node.interpolation,
          );
        };
        const emptyPaint = convert(clear);
        if (emptyPaint.alpha) domain(clip, (index) => put(index, convert(a!.get(index) ?? clear)));
        else for (const [index, color] of a!) put(index, convert(color));
      } else if (node.kind === "offset") {
        if (![node.dx, node.dy].every(Number.isFinite)) throw new RangeError("Invalid native filter offset.");
        const dx = node.dx / columnUnits;
        const dy = node.dy / rowUnits;
        // Distribute premultiplied samples; fractional SVG offsets must not
        // disappear merely because they are smaller than a terminal cell.
        for (const [index, color] of a!) {
          const x = index % columns + dx;
          const y = Math.floor(index / columns) + dy;
          const left = Math.floor(x);
          const top = Math.floor(y);
          const u = x - left;
          const v = y - top;
          for (
            const [ox, oy, weight] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [
              1,
              1,
              u * v,
            ]]
          ) {
            const tx = left + ox!;
            const ty = top + oy!;
            if (!weight || tx < 0 || tx >= columns || ty < 0 || ty >= rows) continue;
            const key = ty * columns + tx;
            const old = target.get(key) ?? clear;
            const alpha = old.alpha + color.alpha * weight!;
            put(key, {
              rgb: color.rgb.map((channel, channelIndex) =>
                (old.rgb[channelIndex]! * old.alpha + channel * color.alpha * weight!) / alpha
              ) as [number, number, number],
              alpha,
            });
          }
        }
      } else if (node.kind === "blur") {
        const horizontal = kernel(node.sigmaX / columnUnits);
        const vertical = kernel(node.sigmaY / rowUnits);
        const temporary = new Map<number, PaintColor>();
        for (const [axis, weights] of [[0, horizontal], [1, vertical]] as const) {
          const input = axis ? temporary : a!;
          const result = axis ? target : temporary;
          const radius = (weights.length - 1) / 2;
          let left = columns, right = -1, top = rows, bottom = -1;
          charge(input.size);
          for (const index of input.keys()) {
            const x = index % columns, y = Math.floor(index / columns);
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
          left = Math.max(0, left - (axis ? 0 : radius));
          right = Math.min(columns - 1, right + (axis ? 0 : radius));
          top = Math.max(0, top - (axis ? radius : 0));
          bottom = Math.min(rows - 1, bottom + (axis ? radius : 0));
          charge(Math.max(0, right - left + 1) * Math.max(0, bottom - top + 1) * weights.length * 4);
          for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
              const index = y * columns + x;
              if (axis && !allowed(index)) continue;
              const total = [0, 0, 0, 0];
              for (let offset = -radius; offset <= radius; offset++) {
                const color = inSpace(
                  sample(input, x + (axis ? 0 : offset), y + (axis ? offset : 0)),
                  node.interpolation,
                );
                const weight = weights[offset + radius]! * color.alpha;
                total[3]! += weight;
                for (let channel = 0; channel < 3; channel++) total[channel]! += weight * color.rgb[channel]!;
              }
              if (total[3]! <= 1e-12) continue;
              store(
                result,
                index,
                fromSpace({
                  rgb: [total[0]! / total[3]!, total[1]! / total[3]!, total[2]! / total[3]!],
                  alpha: total[3]!,
                }, node.interpolation),
              );
            }
          }
        }
        retained -= temporary.size;
      } else if (node.kind === "merge") {
        for (const input of deps) {
          for (const [index, color] of images[input]![plane]) {
            if (color.alpha === 1 || !target.has(index)) {
              put(index, color);
              continue;
            }
            put(
              index,
              fromSpace(
                overPaint(inSpace(color, node.interpolation), inSpace(target.get(index) ?? clear, node.interpolation)),
                node.interpolation,
              ),
            );
          }
        }
      } else {
        if (node.kind === "blend" && !BLEND_MODES.has(node.mode)) {
          throw new RangeError("Unsupported native filter blend mode.");
        }
        if (node.kind === "composite") validateComposite(node);
        const combine = (index: number) => {
          const ca = inSpace(a!.get(index) ?? clear, node.interpolation);
          const cb = inSpace(b!.get(index) ?? clear, node.interpolation);
          put(
            index,
            fromSpace(
              node.kind === "blend" ? overPaint(ca, cb, 1, node.mode) : composite(ca, cb, node),
              node.interpolation,
            ),
          );
        };
        if (node.kind === "composite" && node.operator === "arithmetic" && node.coefficients?.[3]) {
          domain(clip, combine);
        } else {
          for (const index of a!.keys()) combine(index);
          for (const index of b!.keys()) if (!a!.has(index)) combine(index);
        }
      }
    }
    if (node.kind === "offset") {
      const dx = Math.round(node.dx / columnUnits);
      const dy = Math.round(node.dy / rowUnits);
      for (const [index, cell] of first!.glyphs) {
        const x = index % columns + dx;
        const y = Math.floor(index / columns) + dy;
        const key = y * columns + x;
        if (x < 0 || x >= columns || y < 0 || y >= rows || !output.visible.has(key)) continue;
        reserve(1);
        output.glyphs.set(key, cell);
      }
    } else if (node.kind !== "alpha" && node.kind !== "flood") {
      for (const input of [...deps].reverse()) keepGlyphs(output, images[input]!);
    }
    images.push(output);
    for (const input of deps) {
      if (--references[input] === 0) {
        const image = images[input]!;
        retained -= image.background.size + image.visible.size + image.glyphs.size;
        images[input] = undefined;
      }
    }
  }
  const result = images.at(-1)!;
  const output = new Map<number, FilterCell>();
  const finalInside = options.predicate(filter.clip);
  for (const [index, color] of result.visible) {
    charge(4);
    if (
      !finalInside(
        (index % columns + originX + .5) * columnUnits,
        (Math.floor(index / columns) + originY + .5) * rowUnits,
      )
    ) continue;
    const cell = result.glyphs.get(index);
    output.set(index, {
      cell: cell ? { ...cell } : { char: " " },
      background: cell ? result.background.get(index) : color,
      foreground: cell ? color : undefined,
    });
  }
  return output;
}

/** Conservative graph support: every offset excursion and finite Gaussian halo, including intermediate nodes. */
export function filterBufferExtent(
  filter: MermaidSceneFilter,
  columnUnits: number,
  rowUnits: number,
  predicate: (clip?: MermaidSceneClip) => (x: number, y: number) => boolean,
  charge: (amount: number) => void,
): { x: number; y: number; regions: readonly (readonly [number, number, number, number])[] } {
  if (filter.nodes.length > 256) throw new RangeError("Native Mermaid exceeds its filter-node budget.");
  charge(filter.nodes.length * 8);
  let x = 0, y = 0;
  const regions: (readonly [number, number, number, number])[] = [];
  const seen = new Set<MermaidSceneClip>();
  const region = (clip?: MermaidSceneClip) => {
    if (!clip || seen.has(clip)) return;
    predicate(clip); // Validate cycles, depth, coordinates and quotas before walking bounds.
    const bounds = clipBounds(clip, charge);
    seen.add(clip);
    if (bounds.every(Number.isFinite) && bounds[0] <= bounds[2] && bounds[1] <= bounds[3]) regions.push(bounds);
  };
  region(filter.clip);
  for (const [index, node] of filter.nodes.entries()) {
    if (
      !["alpha", "matrix", "transfer", "blur", "offset", "flood", "blend", "composite", "merge"].includes(node.kind)
    ) {
      throw new RangeError("Unsupported native filter node.");
    }
    if (node.kind === "merge" && node.inputs.length > 256) {
      throw new RangeError("Native filter exceeds its merge-input budget.");
    }
    const inputs = node.kind === "merge"
      ? node.inputs
      : "input2" in node
      ? [node.input, node.input2]
      : "input" in node
      ? [node.input]
      : [];
    if (inputs.some((input) => !Number.isSafeInteger(input) || input < 0 || input > index)) {
      throw new RangeError("Invalid native filter dependency.");
    }
    if (node.kind === "offset") {
      if (![node.dx, node.dy].every(Number.isFinite)) throw new RangeError("Invalid native filter offset.");
      x += Math.abs(node.dx);
      y += Math.abs(node.dy);
    } else if (node.kind === "blur") {
      x += (kernel(node.sigmaX / columnUnits).length - 1) / 2 * columnUnits;
      y += (kernel(node.sigmaY / rowUnits).length - 1) / 2 * rowUnits;
    }
    region(node.clip);
  }
  return { x, y, regions };
}

function validateColorNode(node: Extract<MermaidSceneFilterNode, { kind: "matrix" | "transfer" | "alpha" }>): void {
  if (node.kind === "matrix" && (node.values.length !== 20 || !node.values.every(Number.isFinite))) {
    throw new RangeError("Invalid native filter color matrix.");
  }
  if (node.kind === "transfer") {
    if (node.channels.length !== 4) throw new RangeError("Invalid native filter channel transfers.");
    for (const channel of node.channels) {
      const values = channel.kind === "table" || channel.kind === "discrete"
        ? channel.values
        : channel.kind === "linear"
        ? [channel.slope, channel.intercept]
        : channel.kind === "gamma"
        ? [channel.amplitude, channel.exponent, channel.offset]
        : [];
      if (values.length > 4096 || !values.every(Number.isFinite) || channel.kind === "gamma" && channel.exponent < 0) {
        throw new RangeError("Invalid or excessive native filter transfer.");
      }
    }
  }
}

function identityFilter(node: MermaidSceneFilterNode): boolean {
  if (node.kind === "matrix") {
    return node.values.every((value, index) => value === ([0, 6, 12, 18].includes(index) ? 1 : 0));
  }
  if (node.kind === "blur") return node.sigmaX === 0 && node.sigmaY === 0;
  if (node.kind === "merge") return node.inputs.length === 1;
  if (node.kind === "transfer") {
    return node.channels.every((channel) =>
      channel.kind === "identity" ||
      channel.kind === "linear" && channel.slope === 1 && channel.intercept === 0 ||
      channel.kind === "gamma" && channel.amplitude === 1 && channel.exponent === 1 && channel.offset === 0 ||
      channel.kind === "table" && channel.values.length === 2 && channel.values[0] === 0 && channel.values[1] === 1
    );
  }
  return false;
}
function transfer(value: number, channel: MermaidSceneTransfer): number {
  if (channel.kind === "identity") return value;
  if (channel.kind === "linear") return clamp(value * channel.slope + channel.intercept);
  if (channel.kind === "gamma") return clamp(channel.amplitude * value ** channel.exponent + channel.offset);
  const values = channel.values;
  if (!values.length) return value;
  if (channel.kind === "discrete") {
    return clamp(values[Math.min(values.length - 1, Math.floor(value * values.length))]!);
  }
  const position = value * (values.length - 1);
  const left = Math.floor(position);
  return clamp(values[left]! + (values[Math.min(values.length - 1, left + 1)]! - values[left]!) * (position - left));
}
function validateComposite(node: Extract<MermaidSceneFilterNode, { kind: "composite" }>): void {
  if (
    !["over", "in", "out", "atop", "xor", "arithmetic"].includes(node.operator) || node.operator === "arithmetic" &&
      (!node.coefficients || node.coefficients.length !== 4 || !node.coefficients.every(Number.isFinite))
  ) {
    throw new RangeError("Invalid native filter composite.");
  }
}
function composite(
  a: PaintColor,
  b: PaintColor,
  node: Extract<MermaidSceneFilterNode, { kind: "composite" }>,
): PaintColor {
  if (node.operator === "over") return overPaint(a, b);
  if (node.operator === "arithmetic") {
    const [k1, k2, k3, k4] = node.coefficients!;
    const aa = [...a.rgb.map((value) => value / 255 * a.alpha), a.alpha];
    const bb = [...b.rgb.map((value) => value / 255 * b.alpha), b.alpha];
    const rgba = aa.map((value, index) => clamp(k1! * value * bb[index]! + k2! * value + k3! * bb[index]! + k4!));
    return {
      rgb: rgba.slice(0, 3).map((value) => rgba[3] ? Math.min(value, rgba[3]) / rgba[3] * 255 : 0) as [
        number,
        number,
        number,
      ],
      alpha: rgba[3]!,
    };
  }
  const wa = node.operator === "in" || node.operator === "atop" ? b.alpha : 1 - b.alpha;
  const wb = node.operator === "atop" ? 1 - a.alpha : node.operator === "xor" ? 1 - a.alpha : 0;
  const alpha = a.alpha * wa + b.alpha * wb;
  return {
    rgb: a.rgb.map((value, index) => alpha ? (value * a.alpha * wa + b.rgb[index]! * b.alpha * wb) / alpha : 0) as [
      number,
      number,
      number,
    ],
    alpha,
  };
}
function kernel(sigma: number): readonly number[] {
  if (!Number.isFinite(sigma) || sigma < 0) throw new RangeError("Invalid native Gaussian deviation.");
  if (!sigma) return [1];
  const radius = Math.ceil(sigma * 4 + .5);
  if (radius > 128) throw new RangeError("Native Gaussian exceeds its kernel budget.");
  const erf = (x: number) => {
    const sign = Math.sign(x);
    const value = Math.abs(x);
    const t = 1 / (1 + .3275911 * value);
    return sign *
      (1 -
        (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t *
          Math.exp(-value * value));
  };
  const weights = Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const x = index - radius;
    return (erf((x + .5) / (sigma * Math.SQRT2)) - erf((x - .5) / (sigma * Math.SQRT2))) / 2;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

/** Conservative bounds of an already validated clip tree; call the clip predicate validator before walking it. */
export function clipBounds(
  clip: MermaidSceneClip | undefined,
  charge: (amount: number) => void,
): readonly [number, number, number, number] {
  charge(1);
  if (!clip) return [-Infinity, -Infinity, Infinity, Infinity];
  if (clip.kind === "path") {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    charge(clip.contours.length);
    for (const contour of clip.contours) {
      charge(contour.length * 4);
      for (const { x, y } of contour) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return [left, top, right, bottom];
  }
  const union = clip.kind === "union";
  let value = union ? [Infinity, Infinity, -Infinity, -Infinity] : [-Infinity, -Infinity, Infinity, Infinity];
  charge(clip.children.length * 4);
  for (const child of clip.children) {
    const bounds = clipBounds(child, charge);
    value = value.map((item, index) => (union === (index < 2) ? Math.min : Math.max)(item, bounds[index]!));
  }
  return value as [number, number, number, number];
}
