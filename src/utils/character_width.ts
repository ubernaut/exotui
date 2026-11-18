// Copyright 2023 Im-Beast. MIT license.
import { isUnicodeWideCodePoint, isUnicodeZeroWidthCodePoint } from "../unicode/display_width.ts";

/** Internal constant-space accumulator for the display helpers' grapheme width tailoring. */
export class CharacterWidthAccumulator {
  #first = 0;
  #firstVisibleWidth = 0;
  #count = 0;
  #regional = true;
  #joiner = false;
  #variation = false;
  #emoji = false;
  #keycap = false;

  reset(): void {
    this.#first = this.#count = 0;
    this.#firstVisibleWidth = 0;
    this.#regional = true;
    this.#joiner =
      this.#variation =
      this.#emoji =
      this.#keycap =
        false;
  }

  push(codePoint: number): number {
    if (this.#count === 0) this.#first = codePoint;
    this.#count = Math.min(3, this.#count + 1);
    // An initial nonspacing/format scalar must not hide a later visible
    // spacing mark in the same extended grapheme (GB9/GB9a).
    if (!this.#firstVisibleWidth) this.#firstVisibleWidth = displayCodePointWidth(codePoint);
    if (codePoint === 0x200d) this.#joiner = true;
    if (codePoint === 0xfe0f) this.#variation = true;
    if (isEmojiSymbol(codePoint)) this.#emoji = true;
    if (codePoint < 0x1f1e6 || codePoint > 0x1f1ff) this.#regional = false;
    if (
      codePoint === 0x20e3 && ((this.#first >= 48 && this.#first <= 57) || this.#first === 35 || this.#first === 42)
    ) {
      this.#keycap = true;
    }
    if (
      (this.#joiner && this.#emoji) || this.#keycap || (this.#regional && this.#count === 2) ||
      (this.#variation && this.#emoji)
    ) return 2;
    return this.#firstVisibleWidth;
  }
}

/** Internal measurement shared by strings and the scalar-stream terminal model. */
export function measureCharacterWidth(plain: string): number {
  if (!plain) return 0;
  const first = plain.codePointAt(0)!;
  if (plain.length === (first > 0xffff ? 2 : 1)) return displayCodePointWidth(first);
  const state = new CharacterWidthAccumulator();
  let width = 0;
  for (const scalar of plain) width = state.push(scalar.codePointAt(0)!);
  return width;
}

function displayCodePointWidth(codePoint: number): number {
  if (codePoint < 0x80) return codePoint >= 0x20 && codePoint < 0x7f ? 1 : 0;
  // Preserve the existing zero-cell emoji-modifier tailoring. Narrow-profile
  // scalar widths alone do not define emoji/Indic/Hangul cluster presentation.
  if (isUnicodeZeroWidthCodePoint(codePoint) || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)) return 0;
  // Preserve the existing terminal presentation of an isolated flag indicator,
  // separate from UAX #11's neutral scalar classification.
  return isUnicodeWideCodePoint(codePoint) || (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) ? 2 : 1;
}

function isEmojiSymbol(codePoint: number): boolean {
  return (0x2600 <= codePoint && codePoint <= 0x27bf) || (0x1f000 <= codePoint && codePoint <= 0x1faff);
}
