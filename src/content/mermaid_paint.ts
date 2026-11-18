// Copyright 2023 Im-Beast. MIT license.
import type { MermaidSceneGradient } from "./mermaid_scene.ts";
import { oklchToRgb, rgbToOklch } from "../theme_oklch.ts";

/** Unpremultiplied sRGB paint, retaining an exact CSS spelling for unchanged opaque colors. */
export interface PaintColor {
  rgb: readonly [number, number, number];
  alpha: number;
  text?: string;
}

const names: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  lime: "#00ff00",
  yellow: "#ffff00",
  cyan: "#00ffff",
  aqua: "#00ffff",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  purple: "#800080",
  orange: "#ffa500",
  gray: "#808080",
  grey: "#808080",
};

/** Pure normalization for measured CSS RGB/hex colors and common hand-authored scene colors. */
export function parsePaintColor(text: string | undefined): PaintColor | undefined {
  if (!text) return;
  const normalized = text.trim().toLowerCase();
  if (normalized === "none") return;
  if (normalized === "transparent") return { rgb: [0, 0, 0], alpha: 0, text };
  const value = names[normalized] ?? text.trim();
  const hex = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((char) => char + char).join("") : hex;
    return {
      rgb: [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number],
      alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1,
      text,
    };
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return;
  const parts = match[1]!.trim().split(/[,\s/]+/);
  if (parts.length < 3 || parts.length > 4) return;
  if (parts.some((part) => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%?$/i.test(part))) return;
  const number = (part: string, extent: number) => Number.parseFloat(part) * (part.endsWith("%") ? extent / 100 : 1);
  const rgb = parts.slice(0, 3).map((part) => Math.max(0, Math.min(255, number(part, 255)))) as [
    number,
    number,
    number,
  ];
  const alpha = parts[3] ? Math.max(0, Math.min(1, number(parts[3], 1))) : 1;
  if (![...rgb, alpha].every(Number.isFinite)) return;
  return { rgb, alpha, text };
}

/** Serialize transparent native paint without prematurely flattening it against an unknown window backdrop. */
export function paintCSS(color: PaintColor | undefined): string | undefined {
  if (!color || color.alpha <= 0) return;
  if (color.alpha === 1 && color.text) return color.text;
  const rgb = color.rgb.map((value) => Math.round(value)).join(", ");
  return color.alpha >= 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${Number(color.alpha.toFixed(8))})`;
}

/** Source-over compositing in sRGB, with the CSS blend functions evaluated before alpha composition. */
export function overPaint(source: PaintColor, backdrop?: PaintColor, opacity = 1, mode = "normal"): PaintColor {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError("Invalid native paint opacity.");
  const a = source.alpha * opacity;
  const b = backdrop?.alpha ?? 0;
  if (!a) return backdrop ?? { rgb: [0, 0, 0], alpha: 0 };
  if (a === 1 && mode === "normal") return source;
  const alpha = a + b * (1 - a);
  const base = (backdrop?.rgb ?? [0, 0, 0]).map((value) => value / 255);
  const front = source.rgb.map((value) => value / 255);
  const mixed = blend(base, front, mode);
  const rgb = front.map((value, index) =>
    255 * (a * (1 - b) * value + a * b * mixed[index]! + (1 - a) * b * base[index]!) / alpha
  ) as [number, number, number];
  return { rgb, alpha };
}

/** All CSS Compositing Level 1 blend modes; other modes require an explicit future implementation. */
export const BLEND_MODES = new Set([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

function blend(base: number[], front: number[], mode: string): number[] {
  if (!BLEND_MODES.has(mode)) throw new RangeError(`Unsupported native blend mode: ${mode}`);
  const hard = (b: number, s: number) => s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  if (["hue", "saturation", "color", "luminosity"].includes(mode)) {
    const lum = (values: number[]) => values[0]! * .3 + values[1]! * .59 + values[2]! * .11;
    const sat = (values: number[]) => Math.max(...values) - Math.min(...values);
    const setLum = (values: number[], target: number) => {
      let result = values.map((value) => value + target - lum(values));
      const low = Math.min(...result);
      const high = Math.max(...result);
      if (low < 0) result = result.map((value) => target + (value - target) * target / (target - low));
      if (high > 1) result = result.map((value) => target + (value - target) * (1 - target) / (high - target));
      return result;
    };
    const setSat = (values: number[], target: number) => {
      const low = Math.min(...values);
      const range = sat(values);
      return values.map((value) => range ? (value - low) * target / range : 0);
    };
    if (mode === "hue") return setLum(setSat(front, sat(base)), lum(base));
    if (mode === "saturation") return setLum(setSat(base, sat(front)), lum(base));
    if (mode === "color") return setLum(front, lum(base));
    return setLum(base, lum(front));
  }
  return base.map((b, index) => {
    const s = front[index]!;
    switch (mode) {
      case "multiply":
        return b * s;
      case "screen":
        return b + s - b * s;
      case "overlay":
        return hard(s, b);
      case "darken":
        return Math.min(b, s);
      case "lighten":
        return Math.max(b, s);
      case "color-dodge":
        return b === 0 ? 0 : s === 1 ? 1 : Math.min(1, b / (1 - s));
      case "color-burn":
        return b === 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
      case "hard-light":
        return hard(b, s);
      case "soft-light": {
        const d = b <= .25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
        return s <= .5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (d - b);
      }
      case "difference":
        return Math.abs(b - s);
      case "exclusion":
        return b + s - 2 * b * s;
      default:
        return s;
    }
  });
}

/** Compile a bounded paint sampler; SVG gradients remain vectors, not browser-only bitmap overlays. */
export function paintSampler(
  color: string,
  gradient: MermaidSceneGradient | undefined,
  opacity: number,
  charge: (amount: number) => void,
  diagnostics: Set<string>,
): (x: number, y: number) => PaintColor | undefined {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError("Invalid native paint opacity.");
  if (!gradient) {
    const parsed = parsePaintColor(color);
    if (!parsed && color !== "none" && color !== "transparent") {
      diagnostics.add(`Native CSS paint needs color normalization: ${color}`);
    }
    const result = parsed && opacity !== 1 ? { rgb: parsed.rgb, alpha: parsed.alpha * opacity } : parsed;
    return () => result;
  }
  if (
    gradient.inverse.length !== 6 || !["linear", "radial"].includes(gradient.kind) || gradient.stops.length > 4096 ||
    ![...gradient.inverse, gradient.x1, gradient.y1, gradient.x2, gradient.y2].every(Number.isFinite)
  ) {
    throw new RangeError("Invalid or excessive native gradient geometry.");
  }
  if (
    !["pad", "repeat", "reflect"].includes(gradient.spread) ||
    !["sRGB", "linearRGB", "Oklab"].includes(gradient.interpolation)
  ) {
    throw new RangeError("Invalid native gradient mode.");
  }
  // Reserve stop conversion work before allocating its normalized records.
  // Oklab sampling can invoke the shared bounded 32-step gamut mapper.
  charge(gradient.stops.length * (gradient.interpolation === "Oklab" ? 32 : 1));
  let previous = -Infinity;
  const stops = gradient.stops.map((stop) => {
    if (
      !Number.isFinite(stop.offset) || stop.offset < previous || stop.offset < 0 || stop.offset > 1 ||
      !Number.isFinite(stop.opacity) || stop.opacity < 0 || stop.opacity > 1
    ) {
      throw new RangeError("Invalid native gradient stop.");
    }
    previous = stop.offset;
    const parsed = parsePaintColor(stop.color);
    if (!parsed) throw new RangeError("Unsupported native gradient stop color.");
    const oklch = gradient.interpolation === "Oklab" ? rgbToOklch(parsed.rgb) : undefined;
    const lab = oklch
      ? [oklch.l, oklch.c * Math.cos(oklch.h * Math.PI / 180), oklch.c * Math.sin(oklch.h * Math.PI / 180)]
      : undefined;
    return { offset: stop.offset, color: { rgb: parsed.rgb, alpha: parsed.alpha * stop.opacity * opacity }, lab };
  });
  const radius = gradient.radius ?? 0;
  const inner = gradient.focalRadius ?? 0;
  if (gradient.kind === "radial" && (![radius, inner].every(Number.isFinite) || radius < 0 || inner < 0)) {
    throw new RangeError("Invalid native radial gradient radius.");
  }
  let fx = gradient.x1;
  let fy = gradient.y1;
  const focus = Math.hypot(fx - gradient.x2, fy - gradient.y2);
  if (gradient.kind === "radial" && focus + inner >= radius && focus > 0 && radius > inner) {
    const ratio = (radius - inner) * (1 - 1e-7) / focus;
    fx = gradient.x2 + (fx - gradient.x2) * ratio;
    fy = gradient.y2 + (fy - gradient.y2) * ratio;
  }
  const toLinear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  const toSRGB = (value: number) => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
  return (x, y) => {
    charge((gradient.interpolation === "Oklab" ? 256 : 16) + Math.ceil(Math.log2(stops.length + 1)));
    if (!stops.length) return;
    const [a, b, c, d, e, f] = gradient.inverse;
    const px = a * x + c * y + e;
    const py = b * x + d * y + f;
    const dx = gradient.x2 - fx;
    const dy = gradient.y2 - fy;
    if (gradient.kind === "linear" && !dx && !dy || gradient.kind === "radial" && !radius) return stops.at(-1)!.color;
    let position: number;
    if (gradient.kind === "linear") position = dx || dy ? ((px - fx) * dx + (py - fy) * dy) / (dx * dx + dy * dy) : 1;
    else if (!radius) position = 1;
    else {
      const qx = px - fx;
      const qy = py - fy;
      const dr = radius - inner;
      const aa = dx * dx + dy * dy - dr * dr;
      const bb = -2 * (qx * dx + qy * dy + inner * dr);
      const cc = qx * qx + qy * qy - inner * inner;
      const disc = bb * bb - 4 * aa * cc;
      if (disc < 0) return;
      position = Math.abs(aa) < 1e-14
        ? -cc / bb
        : Math.max((-bb - Math.sqrt(disc)) / (2 * aa), (-bb + Math.sqrt(disc)) / (2 * aa));
      if (!Number.isFinite(position)) position = 1;
    }
    if (gradient.spread === "repeat") position = ((position % 1) + 1) % 1;
    else if (gradient.spread === "reflect") {
      const phase = ((position % 2) + 2) % 2;
      position = phase > 1 ? 2 - phase : phase;
    } else position = Math.max(0, Math.min(1, position));
    let low = 0;
    let high = stops.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (stops[mid]!.offset <= position) low = mid + 1;
      else high = mid;
    }
    if (low === 0) return stops[0]!.color;
    if (low === stops.length) return stops.at(-1)!.color;
    const left = stops[low - 1]!;
    const right = stops[low]!;
    const t = (position - left.offset) / (right.offset - left.offset);
    const alpha = left.color.alpha * (1 - t) + right.color.alpha * t;
    if (gradient.interpolation === "Oklab") {
      // SVG paint servers interpolate color and stop opacity separately, unlike
      // premultiplied CSS image gradients. Transparent colored stops still
      // contribute their color, including in modern browser Oklab interpolation.
      const lab = left.lab!.map((value, index) => value * (1 - t) + right.lab![index]! * t);
      return {
        rgb: oklchToRgb({
          l: lab[0]!,
          c: Math.hypot(lab[1]!, lab[2]!),
          h: Math.atan2(lab[2]!, lab[1]!) * 180 / Math.PI,
        }),
        alpha,
      };
    }
    const rgb = left.color.rgb.map((value, index) => {
      const other = right.color.rgb[index]!;
      return gradient.interpolation === "linearRGB"
        ? 255 * toSRGB(toLinear(value / 255) * (1 - t) + toLinear(other / 255) * t)
        : value * (1 - t) + other * t;
    }) as [number, number, number];
    return { rgb, alpha };
  };
}
