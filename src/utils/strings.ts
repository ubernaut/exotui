// Copyright 2023 Im-Beast. MIT license.
import { readCsiSequenceAt } from "./ansi_text.ts";
import { isSgrReset, mergeSgrStyle } from "./sgr_style.ts";
import { DEFAULT_UNICODE_GRAPHEME_SEGMENTER } from "../unicode/grapheme.ts";
import { measureCharacterWidth } from "./character_width.ts";

/**
 * Legacy Unicode matcher retained for public compatibility. Rendering helpers
 * use the pinned UAX #29 segmenter; this regex is not a full grapheme profile.
 *
 * Used reference: https://github.com/lodash/lodash/blob/master/.internal/unicodeSize.js
 */
export const UNICODE_CHAR_REGEXP =
  /\ud83c[\udffb-\udfff](?=\ud83c[\udffb-\udfff])|(?:(?:\ud83c\udff4\udb40\udc67\udb40\udc62\udb40(?:\udc65|\udc73|\udc77)\udb40(?:\udc6e|\udc63|\udc6c)\udb40(?:\udc67|\udc74|\udc73)\udb40\udc7f)|[^\ud800-\udfff][\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff\u1ab0-\u1aff\u1dc0-\u1dff]?|[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff\u1ab0-\u1aff\u1dc0-\u1dff]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\ud800-\udfff])[\ufe0e\ufe0f]?(?:[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff\u1ab0-\u1aff\u1dc0-\u1dff]|\ud83c[\udffb-\udfff])?(?:\u200d(?:[^\ud800-\udfff]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff])[\ufe0e\ufe0f]?(?:[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff\u1ab0-\u1aff\u1dc0-\u1dff]|\ud83c[\udffb-\udfff])?)*/g;

const empty: string[] = [];
const ESC_PATTERN = "\\x1b";
const BEL_PATTERN = "\\x07";
const STRIP_CSI_SEQUENCE_REGEXP = new RegExp(`${ESC_PATTERN}\\[[0-?]*[ -/]*[@-~]`, "g");
const STRIP_OSC_SEQUENCE_REGEXP = new RegExp(
  `${ESC_PATTERN}\\][^${BEL_PATTERN}]*(?:${BEL_PATTERN}|${ESC_PATTERN}\\\\)`,
  "g",
);

/** Converts given text to array of strings which consist of sequences which represent a single character */
export function getMultiCodePointCharacters(text: string): string[] {
  if (!text) return empty;

  if (text.includes("\x1b")) {
    return getStyledCharacters(text);
  }

  const plainAscii = getPlainAsciiCharacters(text);
  if (plainAscii) return plainAscii;

  return Array.from(DEFAULT_UNICODE_GRAPHEME_SEGMENTER.iterate(text), (cluster) => cluster.segment);
}

function getPlainAsciiCharacters(text: string): string[] | undefined {
  const cells = new Array<string>(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0x80 || code === 0x0d) return undefined;
    cells[index] = text[index] ?? "";
  }
  return cells;
}

function getStyledCharacters(text: string): string[] {
  const simpleStyledAscii = getSimpleStyledAsciiCharacters(text);
  if (simpleStyledAscii) return simpleStyledAscii;
  if (hasComplexGraphemes(text)) return getStyledGraphemes(text);

  const cells: string[] = [];
  let style = "";
  let lastStyle = "";
  let lastChar = "";
  let lastCell = "";

  for (let index = 0; index < text.length;) {
    if (text.charCodeAt(index) === 0x1b) {
      const sequence = readCsiSequenceAt(text, index);
      if (sequence) {
        if (sequence.endsWith("m")) {
          style = mergeSgrStyle(style, sequence);
        }
        index += sequence.length;
        continue;
      }
    }

    const char = text[index]!;
    if (style === lastStyle && char === lastChar) {
      cells.push(lastCell);
    } else {
      lastStyle = style;
      lastChar = char;
      lastCell = style ? `${style}${char}\x1b[0m` : char;
      cells.push(lastCell);
    }
    index += char.length;
  }

  return cells;
}

function getSimpleStyledAsciiCharacters(text: string): string[] | undefined {
  if (text.charCodeAt(0) !== 0x1b) return undefined;
  let style = "";
  let bodyStart = 0;
  for (let index = 0; index < text.length;) {
    const sequence = readCsiSequenceAt(text, index);
    if (!sequence || !sequence.endsWith("m")) break;
    style = mergeSgrStyle(style, sequence);
    index += sequence.length;
    bodyStart = index;
  }
  if (bodyStart <= 0 || bodyStart >= text.length) return undefined;

  let bodyEnd = text.length;
  while (bodyEnd > bodyStart) {
    const resetStart = previousCsiSequenceStart(text, bodyEnd);
    if (resetStart === undefined || resetStart < bodyStart) break;
    const sequence = text.slice(resetStart, bodyEnd);
    if (!sequence.endsWith("m") || !isSgrReset(sequence)) break;
    bodyEnd = resetStart;
  }
  if (bodyEnd <= bodyStart) return undefined;
  for (let index = bodyStart; index < bodyEnd; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code >= 0x80) return undefined;
  }

  const bodyLength = bodyEnd - bodyStart;
  const cells = new Array<string>(bodyLength);
  if (!style) {
    for (let index = 0; index < bodyLength; index += 1) {
      cells[index] = text[bodyStart + index] ?? "";
    }
    return cells;
  }

  let lastChar = "";
  let lastCell = "";
  for (let index = 0; index < bodyLength; index += 1) {
    const char = text[bodyStart + index] ?? "";
    if (char === lastChar) {
      cells[index] = lastCell;
      continue;
    }
    lastChar = char;
    lastCell = `${style}${char}\x1b[0m`;
    cells[index] = lastCell;
  }
  return cells;
}

/** Strips string of all its styles */
export function stripStyles(string: string): string {
  return string
    .replace(STRIP_CSI_SEQUENCE_REGEXP, "")
    .replace(STRIP_OSC_SEQUENCE_REGEXP, "");
}

/** Inserts {value} into {string} on given {index} */
export function insertAt(string: string, index: number, value: string): string {
  return string.slice(0, index) + value + string.slice(index);
}

/** Returns real {text} width */
export function textWidth(text: string, start = 0): number {
  if (!text) return 0;
  const asciiWidth = plainAsciiWidth(text, start);
  if (asciiWidth !== undefined) return asciiWidth;
  const narrowAnsiWidth = narrowAnsiTextWidth(text, start);
  if (narrowAnsiWidth !== undefined) return narrowAnsiWidth;

  let width = 0;
  for (const { char } of displayGraphemes(text, Math.max(0, Math.floor(start)))) {
    if (char.includes("\n")) break;
    width += characterWidth(char);
  }

  return width;
}

/** Crops {text} to given {width} */
export function cropToWidth(text: string, width: number): string {
  const asciiCropped = cropPlainAsciiToWidth(text, width);
  if (asciiCropped !== undefined) return asciiCropped;
  const narrowAnsiCropped = cropNarrowAnsiToWidth(text, width);
  if (narrowAnsiCropped !== undefined) return narrowAnsiCropped;

  let cropped = "";
  let croppedWidth = 0;
  let end = 0;
  for (const { char, prefix, raw, rawEnd } of displayGraphemes(text)) {
    if (char.includes("\n")) return cropped + prefix;
    const charWidth = characterWidth(char);

    if (croppedWidth + charWidth > width) {
      if (prefix && isAnsiResetOnly(prefix)) {
        cropped += prefix;
      }
      if (croppedWidth + 1 === width) {
        cropped += " ";
      }
      return cropped;
    } else {
      croppedWidth += charWidth;
    }

    cropped += prefix + raw;
    end = rawEnd;
  }

  return cropped + text.slice(end);
}

function plainAsciiWidth(text: string, start = 0): number | undefined {
  const offset = Math.max(0, Math.floor(start));
  for (let index = offset; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x0a) return index - offset;
    if (code < 0x20 || code === 0x7f || code >= 0x80) return undefined;
  }
  return Math.max(0, text.length - offset);
}

function cropPlainAsciiToWidth(text: string, width: number): string | undefined {
  const safeWidth = Math.max(0, Math.floor(width));
  const limit = Math.min(text.length, safeWidth);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0x0a) return text.slice(0, Math.min(index, safeWidth));
    if (code < 0x20 || code === 0x7f || code >= 0x80) return undefined;
  }
  return text.length <= safeWidth ? text : text.slice(0, limit);
}

function narrowAnsiTextWidth(text: string, start = 0): number | undefined {
  let width = 0;
  for (let index = Math.max(0, Math.floor(start)); index < text.length;) {
    const code = text.charCodeAt(index);
    if (code === 0x0a) return width;
    if (code === 0x1b) {
      const sequence = readAnsiSequenceAt(text, index);
      if (!sequence) return undefined;
      index += sequence.length;
      continue;
    }
    if (isFastNarrowCodePoint(code)) {
      width += 1;
      index += 1;
      continue;
    }
    return undefined;
  }
  return width;
}

function cropNarrowAnsiToWidth(text: string, width: number): string | undefined {
  const safeWidth = Math.max(0, Math.floor(width));
  let cropped = "";
  let croppedWidth = 0;
  let prefix = "";

  for (let index = 0; index < text.length;) {
    const code = text.charCodeAt(index);
    if (code === 0x1b) {
      const sequence = readAnsiSequenceAt(text, index);
      if (!sequence) return undefined;
      prefix += sequence;
      index += sequence.length;
      continue;
    }
    if (code === 0x0a) break;
    if (!isFastNarrowCodePoint(code)) return undefined;

    if (croppedWidth + 1 > safeWidth) {
      if (prefix && isAnsiResetOnly(prefix)) cropped += prefix;
      prefix = "";
      break;
    }

    cropped += prefix + (text[index] ?? "");
    prefix = "";
    croppedWidth += 1;
    index += 1;
  }

  if (prefix) cropped += prefix;
  return cropped;
}

function isFastNarrowCodePoint(code: number): boolean {
  return (code >= 0x20 && code < 0x7f) || code === 0x2588 || code === 0x2587;
}

function hasComplexGraphemes(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 0x80 || text.charCodeAt(i) === 0x0d) return true;
  }
  return false;
}

/** ANSI controls have no grapheme boundaries. Track raw spans without an offset entry per UTF-16 unit. */
function* displayGraphemes(text: string, start = 0) {
  const runs: Array<{ start: number; end: number; rawStart: number }> = [];
  let plain = "";
  for (let i = start; i < text.length;) {
    const sequence = readAnsiSequenceAt(text, i);
    if (sequence) {
      i += sequence.length;
      continue;
    }
    const rawStart = i;
    // An invalid escape remains an ordinary control character, not an infinite loop.
    i++;
    while (i < text.length && text.charCodeAt(i) !== 0x1b) i++;
    const visible = text.slice(rawStart, i), at = plain.length;
    plain += visible;
    runs.push({ start: at, end: plain.length, rawStart });
  }
  let firstRun = 0, lastRun = 0, previousEnd = start;
  for (const cluster of DEFAULT_UNICODE_GRAPHEME_SEGMENTER.iterate(plain)) {
    while (cluster.start >= runs[firstRun]!.end) firstRun++;
    while (cluster.end > runs[lastRun]!.end) lastRun++;
    const first = runs[firstRun]!, last = runs[lastRun]!;
    const rawStart = first.rawStart + cluster.start - first.start;
    const rawEnd = last.rawStart + cluster.end - last.start;
    yield {
      char: cluster.segment,
      prefix: text.slice(previousEnd, rawStart),
      raw: text.slice(rawStart, rawEnd),
      rawEnd,
    };
    previousEnd = rawEnd;
  }
}

function updateSgrStyle(style: string, raw: string): string {
  for (let i = raw.indexOf("\x1b"); i !== -1; i = raw.indexOf("\x1b", i + 1)) {
    const sequence = readCsiSequenceAt(raw, i);
    if (sequence?.endsWith("m")) style = mergeSgrStyle(style, sequence);
  }
  return style;
}

function getStyledGraphemes(text: string): string[] {
  const cells: string[] = [];
  let style = "";
  for (const { char, prefix, raw } of displayGraphemes(text)) {
    style = updateSgrStyle(style, prefix);
    // The terminal cell's base scalar owns its style. Internal SGR still
    // changes subsequent cells, but cannot split the visible grapheme.
    cells.push(style ? `${style}${char}\x1b[0m` : char);
    style = updateSgrStyle(style, raw);
  }
  return cells;
}

function isAnsiResetOnly(value: string): boolean {
  if (!value) return false;
  let index = 0;
  while (index < value.length) {
    const sequence = readAnsiSequenceAt(value, index);
    if (!sequence || !sequence.endsWith("m") || !isSgrReset(sequence)) return false;
    index += sequence.length;
  }
  return true;
}

function readAnsiSequenceAt(value: string, start: number): string | undefined {
  return readCsiSequenceAt(value, start) ?? readOscSequenceAt(value, start);
}

function previousCsiSequenceStart(value: string, end: number): number | undefined {
  const start = value.lastIndexOf("\x1b[", end - 1);
  if (start < 0) return undefined;
  const sequence = readCsiSequenceAt(value, start);
  return sequence && start + sequence.length === end ? start : undefined;
}

function readOscSequenceAt(value: string, start: number): string | undefined {
  if (!value.startsWith("\x1b]", start)) return undefined;
  const contentStart = start + 2;
  const belEnd = value.indexOf("\x07", contentStart);
  const stEnd = value.indexOf("\x1b\\", contentStart);
  const end = belEnd >= 0 && stEnd >= 0 ? Math.min(belEnd, stEnd) : belEnd >= 0 ? belEnd : stEnd;
  if (end < 0) return undefined;
  return value.slice(start, end + (end === stEnd ? 2 : 1));
}

/** Public helper for is Final Ansi Byte. */
export function isFinalAnsiByte(character: string): boolean {
  const codePoint = character.charCodeAt(0);
  // don't include 0x70–0x7E range because its considered "private"
  return codePoint >= 0x40 && codePoint < 0x70;
}

/**
 * Return width of given character
 *
 * Originally created by sindresorhus: https://github.com/sindresorhus/is-fullwidth-code-point/blob/main/index.js
 */
export function characterWidth(character: string): number {
  return measureCharacterWidth(character.includes("\x1b") ? stripStyles(character) : character);
}

/** Returns capitalized string created from {text} */
export function capitalize<T extends string>(text: T): Capitalize<T> {
  return (text[0].toUpperCase() + text.slice(1)) as Capitalize<T>;
}
