// Copyright 2023 Im-Beast. MIT license.
import { UNICODE_ZERO_WIDTH_DELTA_RANGES } from "./generated/unicode_17_0_0_zero_width.ts";
import { UNICODE_WIDE_WIDTH_DELTA_RANGES } from "./generated/unicode_17_0_0_wide_width.ts";

const zeroRanges = /* @__PURE__ */ decodeRanges(UNICODE_ZERO_WIDTH_DELTA_RANGES);
const wideRanges = /* @__PURE__ */ decodeRanges(UNICODE_WIDE_WIDTH_DELTA_RANGES);

function decodeRanges(deltas: readonly number[]): Uint32Array {
  const output = new Uint32Array(deltas.length);
  let end = -1;
  for (let i = 0; i < output.length; i += 2) {
    output[i] = end + 1 + deltas[i]!;
    end = output[i] + deltas[i + 1]!;
    output[i + 1] = end;
  }
  return output;
}

/** Internal, allocation-free projection of the pinned narrow profile's zero-width categories. */
export function isUnicodeZeroWidthCodePoint(codePoint: number): boolean {
  return contains(zeroRanges, codePoint);
}

/** Internal assigned W/F projection; combining/fixed-zero categories are resolved separately first. */
export function isUnicodeWideCodePoint(codePoint: number): boolean {
  return contains(wideRanges, codePoint);
}

function contains(ranges: Uint32Array, codePoint: number): boolean {
  let low = 0, high = ranges.length / 2;
  while (low < high) {
    const middle = (low + high) >>> 1, index = middle * 2;
    if (codePoint < ranges[index]!) high = middle;
    else if (codePoint > ranges[index + 1]!) low = middle + 1;
    else return true;
  }
  return false;
}
