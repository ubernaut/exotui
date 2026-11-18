// Copyright 2023 Im-Beast. MIT license.
import type { MermaidSceneImageAsset } from "./mermaid_scene.ts";

/** Explicit per-compilation image bounds, independent of network byte quotas. */
export interface MermaidImageLimits {
  maxImages?: number;
  maxBytes?: number;
  maxTotalBytes?: number;
  maxSourcePixels?: number;
  maxTotalSourcePixels?: number;
  maxRasterPixels?: number;
  maxTotalRasterPixels?: number;
  timeoutMs?: number;
}

/** A host-approved image body. Loading this body must not grant arbitrary network access. */
export interface MermaidImageResource {
  body: Uint8Array;
  contentType?: string;
}

/** Host capability, never accepted from Mermaid source/configuration. Embedded data images need no loader. */
export interface MermaidImageOptions {
  limits?: MermaidImageLimits;
  load?: (url: URL, options: { signal: AbortSignal }) => Promise<MermaidImageResource>;
}

export function imageLimits(input: MermaidImageLimits = {}): Required<MermaidImageLimits> {
  const defaults = {
    maxImages: 64,
    maxBytes: 8 * 1024 * 1024,
    maxTotalBytes: 32 * 1024 * 1024,
    maxSourcePixels: 16 * 1024 * 1024,
    maxTotalSourcePixels: 32 * 1024 * 1024,
    maxRasterPixels: 262_144,
    maxTotalRasterPixels: 1_048_576,
    timeoutMs: 30_000,
  };
  const ceilings = {
    maxImages: 256,
    maxBytes: 32 * 1024 * 1024,
    maxTotalBytes: 128 * 1024 * 1024,
    maxSourcePixels: 64 * 1024 * 1024,
    maxTotalSourcePixels: 128 * 1024 * 1024,
    maxRasterPixels: 4_194_304,
    maxTotalRasterPixels: 8_388_608,
    timeoutMs: 300_000,
  };
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    result[key] = input[key] ?? defaults[key];
    if (!Number.isSafeInteger(result[key]) || result[key] < 1 || result[key] > ceilings[key]) {
      throw new RangeError(`Invalid Mermaid image ${key} limit.`);
    }
  }
  return result;
}

/** PNG/JPEG dimension preflight BEFORE giving approved bytes to a browser decoder. Other formats return undefined. */
export function imageDimensions(body: Uint8Array): { width: number; height: number } | undefined {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (body.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => body[index] === byte)) {
    if (body.length < 33 || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) {
      throw new SyntaxError("Invalid PNG image header.");
    }
    return dimensions(view.getUint32(16), view.getUint32(20));
  }
  if (body[0] !== 0xff || body[1] !== 0xd8) return;
  let offset = 2;
  while (offset < body.length) {
    if (body[offset++] !== 0xff) throw new SyntaxError("Invalid JPEG image marker.");
    while (body[offset] === 0xff) offset++;
    const marker = body[offset++];
    if (marker === undefined || marker === 0 || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > body.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > body.length) throw new SyntaxError("Invalid JPEG image segment.");
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8) throw new SyntaxError("Invalid JPEG image frame.");
      return dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }
    offset += length;
  }
  throw new SyntaxError("JPEG image has no bounded frame header.");
}

function dimensions(width: number, height: number): { width: number; height: number } {
  if (!width || !height) throw new SyntaxError("Invalid image dimensions.");
  return { width, height };
}

export function encodeImageBytes(bytes: Uint8Array): string {
  let result = "";
  // Chunk on three-byte boundaries; no spread of an unbounded argument list.
  for (let start = 0; start < bytes.length; start += 12_288) {
    let chunk = "";
    for (let at = start; at < Math.min(bytes.length, start + 12_288); at++) chunk += String.fromCharCode(bytes[at]!);
    result += btoa(chunk);
  }
  return result;
}

export function decodeImageAsset(asset: MermaidSceneImageAsset): Uint8Array {
  const pixels = asset.width * asset.height;
  if (
    !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) || asset.width < 1 || asset.height < 1 ||
    pixels > 4_194_304 || asset.rgba.length !== Math.ceil(pixels * 4 / 3) * 4
  ) throw new RangeError("Native Mermaid image exceeds its raster budget or has invalid dimensions/data.");
  let decoded: string;
  try {
    decoded = atob(asset.rgba);
  } catch {
    throw new SyntaxError("Invalid native Mermaid RGBA image data.");
  }
  if (decoded.length !== pixels * 4) throw new SyntaxError("Invalid native Mermaid RGBA image length.");
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}
