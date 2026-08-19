// Copyright 2023 Im-Beast. MIT license.

// A picture as the desktop background, rendered in shaded blocks.
//
// The image is decoded once, box-filtered down to the cell grid with the
// terminal's 2:1 cell aspect respected, and painted as `█` cells whose
// foreground carries the colour. Aspect is preserved; the letterbox shows the
// desktop theme. PNG decodes with nothing but `DecompressionStream`; JPEG goes
// through the vendored `jpeg-js`. The file is picked in the config browser.

import { decode as decodeJpeg } from "jpeg-js";
import type { Rectangle } from "@ubernaut/exotui";
import type { ExomuxBackgroundAdvanceOptions, ExomuxBackgroundCell, ExomuxBackgroundPoint } from "./background.ts";
import type { ExomuxRgb, ExomuxThemeSpec } from "./model.ts";

/** Wallpaper file extensions the browser lists and the field decodes. */
export const EXOMUX_IMAGE_EXTENSIONS: readonly string[] = Object.freeze([".png", ".jpg", ".jpeg"]);

/** True when a filename is a wallpaper the image background can load. */
export function isExomuxImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return EXOMUX_IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Decoded raster: RGBA bytes, row-major. */
export interface ExomuxDecodedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
/** Refuse anything that would decode to more than this many pixels. */
const MAX_PIXELS = 64 * 1024 * 1024;

function hasSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false;
  }
  return true;
}

/** Decodes a JPEG to RGBA via the vendored decoder, with the same pixel cap. */
export function decodeExomuxJpeg(bytes: Uint8Array): ExomuxDecodedImage {
  const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_PIXELS / 1e6 });
  if (decoded.width * decoded.height > MAX_PIXELS) throw new Error("image too large");
  return { width: decoded.width, height: decoded.height, pixels: new Uint8Array(decoded.data) };
}

/** Decodes a PNG or JPEG by content signature; the browser only offers those. */
export async function decodeExomuxImage(bytes: Uint8Array): Promise<ExomuxDecodedImage> {
  if (hasSignature(bytes, PNG_SIGNATURE)) return await decodeExomuxPng(bytes);
  if (hasSignature(bytes, JPEG_SIGNATURE)) return decodeExomuxJpeg(bytes);
  throw new Error("unsupported image format (PNG and JPEG only)");
}

/**
 * Decodes a PNG. Supports the common shapes — 8-bit depth in every colour
 * type, plus 16-bit truecolour/greyscale (high byte taken) — and rejects
 * interlacing, which is vanishingly rare in wallpaper files.
 */
export async function decodeExomuxPng(bytes: Uint8Array): Promise<ExomuxDecodedImage> {
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error("not a PNG file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette: Uint8Array | undefined;
  let alphaPalette: Uint8Array | undefined;
  const idat: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = bytes[offset + 16]!;
      colorType = bytes[offset + 17]!;
      if (bytes[offset + 20] !== 0) throw new Error("interlaced PNG is not supported");
      if (width * height > MAX_PIXELS) throw new Error("image too large");
      if (bitDepth !== 8 && !(bitDepth === 16 && (colorType === 0 || colorType === 2))) {
        throw new Error(`unsupported PNG bit depth ${bitDepth}`);
      }
    } else if (type === "PLTE") palette = data.slice();
    else if (type === "tRNS" && colorType === 3) alphaPalette = data.slice();
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (width === 0 || height === 0 || idat.length === 0) throw new Error("PNG carries no image data");

  const compressed = new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream("deflate"));
  const raw = new Uint8Array(await new Response(compressed).arrayBuffer());

  const channels = colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 1;
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  const stride = width * channels * bytesPerSample;
  const bpp = channels * bytesPerSample;
  if (raw.length < (stride + 1) * height) throw new Error("PNG image data is truncated");

  // Un-filter in place into a copy without the per-row filter bytes.
  const flat = new Uint8Array(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)]!;
    const source = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const target = flat.subarray(row * stride, (row + 1) * stride);
    const above = row > 0 ? flat.subarray((row - 1) * stride, row * stride) : undefined;
    for (let column = 0; column < stride; column += 1) {
      const left = column >= bpp ? target[column - bpp]! : 0;
      const up = above?.[column] ?? 0;
      const upLeft = column >= bpp ? (above?.[column - bpp] ?? 0) : 0;
      let value = source[column]!;
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      target[column] = value;
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const at = index * bpp;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 255;
    if (colorType === 2 || colorType === 6) {
      red = flat[at]!;
      green = flat[at + bytesPerSample]!;
      blue = flat[at + bytesPerSample * 2]!;
      if (colorType === 6) alpha = flat[at + 3]!;
    } else if (colorType === 0 || colorType === 4) {
      red = green = blue = flat[at]!;
      if (colorType === 4) alpha = flat[at + 1]!;
    } else if (colorType === 3) {
      const entry = flat[at]! * 3;
      red = palette?.[entry] ?? 0;
      green = palette?.[entry + 1] ?? 0;
      blue = palette?.[entry + 2] ?? 0;
      alpha = alphaPalette?.[flat[at]!] ?? 255;
    }
    pixels[index * 4] = red;
    pixels[index * 4 + 1] = green;
    pixels[index * 4 + 2] = blue;
    pixels[index * 4 + 3] = alpha;
  }
  return { width, height, pixels };
}

export interface ExomuxImageFieldOptions {
  /** Path of the image (PNG or JPEG) to show; nothing renders until set. */
  readonly path?: string;
  /** Test seam: bytes to decode instead of reading `path`. */
  readonly bytes?: Uint8Array;
}

/** Matches the colour quantization the animated fields use, for cache reuse. */
const COLOR_STEP = 16;
/** Shade ramp for the darkest cells, so shadow detail survives quantization. */
const SHADES: readonly string[] = ["░", "▒", "▓", "█"];

/**
 * Static picture background. `advance` reports a change only while the image
 * is loading or the grid resizes, so the desktop stops repainting once the
 * picture is on screen.
 */
export class ExomuxImageField {
  #image: ExomuxDecodedImage | undefined;
  #error: string | undefined;
  #loading: Promise<void> | undefined;
  #cells: (ExomuxBackgroundCell | undefined)[][] = [];
  #width = 0;
  #height = 0;
  #dirty = true;
  readonly #path: string | undefined;

  constructor(options: ExomuxImageFieldOptions = {}) {
    this.#path = options.path;
    if (options.bytes) {
      this.#loading = decodeExomuxImage(options.bytes)
        .then((image) => {
          this.#image = image;
        })
        .catch((cause) => {
          this.#error = cause instanceof Error ? cause.message : String(cause);
        })
        .finally(() => {
          this.#dirty = true;
        });
    } else if (options.path) {
      this.#loading = Deno.readFile(options.path)
        .then(decodeExomuxImage)
        .then((image) => {
          this.#image = image;
        })
        .catch((cause) => {
          this.#error = cause instanceof Error ? cause.message : String(cause);
        })
        .finally(() => {
          this.#dirty = true;
        });
    }
  }

  /** Why the image is not showing, for the status line; undefined while fine. */
  get error(): string | undefined {
    return this.#error;
  }

  setPointer(_point: ExomuxBackgroundPoint): void {}
  clearPointer(): void {}

  advance(options: ExomuxBackgroundAdvanceOptions): boolean {
    const bounds = options.bounds;
    if (bounds.width !== this.#width || bounds.height !== this.#height) {
      this.#width = Math.max(0, bounds.width);
      this.#height = Math.max(0, bounds.height);
      this.#dirty = true;
    }
    if (!this.#dirty) return false;
    this.#dirty = false;
    this.#rebuild();
    return true;
  }

  rasterizeCells(
    bounds: Rectangle,
    _theme: ExomuxThemeSpec,
  ): ReadonlyArray<ReadonlyArray<ExomuxBackgroundCell | undefined>> {
    if (bounds.width !== this.#width || bounds.height !== this.#height) return [];
    return this.#cells;
  }

  #rebuild(): void {
    const image = this.#image;
    const width = this.#width;
    const height = this.#height;
    this.#cells = Array.from({ length: height }, () => new Array<ExomuxBackgroundCell | undefined>(width));
    if (!image || width === 0 || height === 0) return;

    // Fit the picture into the grid. A cell is about twice as tall as it is
    // wide, so the grid's virtual pixel space is width x 2·height.
    const gridAspect = width / (height * 2);
    const imageAspect = image.width / image.height;
    let drawWidth = width;
    let drawHeight = height;
    if (imageAspect > gridAspect) drawHeight = Math.max(1, Math.round((width / imageAspect) / 2));
    else drawWidth = Math.max(1, Math.round(imageAspect * height * 2));
    const left = Math.floor((width - drawWidth) / 2);
    const top = Math.floor((height - drawHeight) / 2);

    for (let row = 0; row < drawHeight; row += 1) {
      const y0 = Math.floor((row / drawHeight) * image.height);
      const y1 = Math.max(y0 + 1, Math.floor(((row + 1) / drawHeight) * image.height));
      for (let column = 0; column < drawWidth; column += 1) {
        const x0 = Math.floor((column / drawWidth) * image.width);
        const x1 = Math.max(x0 + 1, Math.floor(((column + 1) / drawWidth) * image.width));
        let red = 0;
        let green = 0;
        let blue = 0;
        let alpha = 0;
        let taps = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const at = (y * image.width + x) * 4;
            const a = image.pixels[at + 3]! / 255;
            red += image.pixels[at]! * a;
            green += image.pixels[at + 1]! * a;
            blue += image.pixels[at + 2]! * a;
            alpha += a;
            taps += 1;
          }
        }
        if (taps === 0 || alpha / taps < 0.05) continue;
        const scale = 1 / Math.max(1e-6, alpha);
        const colour: ExomuxRgb = [
          quantize(red * scale),
          quantize(green * scale),
          quantize(blue * scale),
        ];
        // Dark cells step down the shade ramp: a quantized near-black block
        // loses all texture, and the partial blocks keep shadow detail legible.
        const luma = (colour[0] + colour[1] + colour[2]) / (3 * 255);
        const shade = luma < 0.06 ? undefined : SHADES[Math.min(SHADES.length - 1, Math.floor(luma * 5))];
        if (!shade) continue;
        this.#cells[top + row]![left + column] = { char: shade, foreground: colour };
      }
    }
  }

  /** Resolves once the image has decoded (or failed); a test convenience. */
  get ready(): Promise<void> {
    return this.#loading ?? Promise.resolve();
  }

  get path(): string | undefined {
    return this.#path;
  }
}

function quantize(value: number): number {
  const snapped = Math.round(value / COLOR_STEP) * COLOR_STEP;
  return Math.max(0, Math.min(255, snapped));
}
