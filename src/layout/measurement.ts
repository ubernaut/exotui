// Copyright 2023 Im-Beast. MIT license.

import type { LayoutIntrinsicSize } from "./solver.ts";
import { textWidth } from "../utils/strings.ts";

/** A cached intrinsic measurement entry for text and layout nodes. */
export interface LayoutMeasurementCacheEntry extends LayoutIntrinsicSize {
  key: string;
}

/** Runtime statistics for intrinsic layout measurement caching. */
export interface LayoutMeasurementCacheStats {
  entries: number;
  hits: number;
  misses: number;
}

/** Options for the intrinsic layout measurement cache. */
export interface LayoutMeasurementCacheOptions {
  maxEntries?: number;
}

/** Options for terminal-cell text intrinsic measurement. */
export interface TerminalTextIntrinsicMeasurementOptions {
  wrap?: boolean;
  breakWords?: boolean;
  preserveNewlines?: boolean;
}

/** Small FIFO cache for renderer-neutral intrinsic text and widget measurements. */
export class LayoutMeasurementCache {
  readonly maxEntries: number;
  #entries = new Map<string, LayoutIntrinsicSize>();
  #hits = 0;
  #misses = 0;

  constructor(options: LayoutMeasurementCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 4096));
  }

  get(key: string): LayoutIntrinsicSize | undefined {
    const value = this.#entries.get(key);
    if (!value) {
      this.#misses += 1;
      return undefined;
    }
    this.#hits += 1;
    return { ...value };
  }

  set(key: string, value: LayoutIntrinsicSize): void {
    if (!this.#entries.has(key) && this.#entries.size >= this.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    this.#entries.set(key, {
      width: Math.max(0, Math.floor(value.width)),
      height: Math.max(0, Math.floor(value.height)),
    });
  }

  clear(): void {
    this.#entries.clear();
    this.#hits = 0;
    this.#misses = 0;
  }

  stats(): LayoutMeasurementCacheStats {
    return {
      entries: this.#entries.size,
      hits: this.#hits,
      misses: this.#misses,
    };
  }
}

/** Measures terminal text for intrinsic layout using physical newlines and word-aware wrapping. */
export function measureTerminalTextIntrinsic(
  text: string,
  availableWidth: number,
  defaultTextHeight = 1,
  options: TerminalTextIntrinsicMeasurementOptions = {},
): LayoutIntrinsicSize {
  const wrapWidth = Math.max(1, Math.floor(availableWidth));
  const fallbackHeight = Math.max(1, Math.floor(defaultTextHeight));
  const wrap = options.wrap ?? true;
  const breakWords = options.breakWords ?? true;
  const preserveNewlines = options.preserveNewlines ?? true;
  let width = 1;
  let height = 0;
  let lineStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index];
    const isLineBreak = preserveNewlines && (char === "\n" || char === "\r");
    if (index < text.length && !isLineBreak) continue;
    const line = text.slice(lineStart, index);
    const lineWidth = textWidth(line);
    width = Math.max(width, lineWidth);
    height += wrap ? measureWrappedTerminalLineHeight(line, wrapWidth, breakWords) : 1;
    if (char === "\r" && text[index + 1] === "\n") index += 1;
    lineStart = index + 1;
  }

  return { width, height: Math.max(fallbackHeight, height) };
}

/**
 * The narrowest width the text can occupy without overflowing: the widest
 * whitespace-delimited word, or the widest single cluster when arbitrary
 * word breaking is allowed.
 */
export function measureTerminalTextMinContentWidth(
  text: string,
  options: TerminalTextIntrinsicMeasurementOptions = {},
): number {
  if (options.breakWords ?? true) {
    let widest = 1;
    for (const char of text) widest = Math.max(widest, textWidth(char));
    return widest;
  }
  let widest = 1;
  for (const word of text.split(/\s+/)) {
    if (word) widest = Math.max(widest, textWidth(word));
  }
  return widest;
}

function measureWrappedTerminalLineHeight(line: string, wrapWidth: number, breakWords: boolean): number {
  const wrappedLine = line.trimEnd();
  if (!wrappedLine) return 1;

  let rows = 1;
  let currentWidth = 0;

  for (let tokenStart = 0; tokenStart < wrappedLine.length;) {
    const whitespace = isAsciiWhitespace(wrappedLine.charCodeAt(tokenStart));
    let tokenEnd = tokenStart + 1;
    while (
      tokenEnd < wrappedLine.length &&
      isAsciiWhitespace(wrappedLine.charCodeAt(tokenEnd)) === whitespace
    ) {
      tokenEnd += 1;
    }

    const token = wrappedLine.slice(tokenStart, tokenEnd);
    tokenStart = tokenEnd;
    const tokenWidth = textWidth(token);
    if (tokenWidth <= 0) continue;

    if (whitespace) {
      if (currentWidth === 0) continue;
      if (currentWidth + tokenWidth <= wrapWidth) {
        currentWidth += tokenWidth;
      } else {
        rows += 1;
        currentWidth = 0;
      }
      continue;
    }

    if (tokenWidth <= wrapWidth || !breakWords) {
      if (currentWidth > 0 && currentWidth + tokenWidth > wrapWidth) {
        rows += 1;
        currentWidth = tokenWidth;
      } else {
        currentWidth += tokenWidth;
      }
      continue;
    }

    if (currentWidth > 0) {
      rows += 1;
      currentWidth = 0;
    }
    rows += Math.floor(tokenWidth / wrapWidth);
    currentWidth = tokenWidth % wrapWidth;
    if (currentWidth === 0) {
      rows -= 1;
      currentWidth = wrapWidth;
    }
  }

  return rows;
}

function isAsciiWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0b || code === 0x0c;
}
