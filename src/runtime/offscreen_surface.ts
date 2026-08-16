// Copyright 2023 Im-Beast. MIT license.

// 036 R1: styled scrollback snapshots and reusable streaming
// off-screen surfaces. An OffscreenSurface is a bounded styled-line
// scrollback anything can stream into; the three writers cover the
// named content kinds — Markdown (headings, bullets, inline code and
// emphasis become styled segments), code (a pluggable Highlighter
// yields scoped segments), and process output (chunks pass through a
// tiny SGR tracker so color and bold survive while everything else is
// plain text). snapshot() freezes the current history — including how
// many lines the bound already dropped, so a snapshot can never
// silently claim to be complete — and styledScrollbackSnapshot does
// the same for a live terminal screen's color-preserving history.

import type { Highlighter } from "../app/syntax_service.ts";

/** One styled segment of an off-screen line. */
export interface OffscreenSegment {
  readonly text: string;
  readonly style?: {
    readonly scope?: string;
    readonly bold?: boolean;
    readonly italic?: boolean;
    readonly foreground?: number;
  };
}

/** One frozen surface snapshot. */
export interface OffscreenSnapshot {
  readonly lines: readonly (readonly OffscreenSegment[])[];
  /** Lines the bound dropped before this snapshot; 0 means complete. */
  readonly dropped: number;
}

/** The bounded streaming off-screen surface. */
export class OffscreenSurface {
  readonly #maxLines: number;
  #lines: OffscreenSegment[][] = [];
  #dropped = 0;

  constructor(options: { readonly maxLines?: number } = {}) {
    this.#maxLines = Math.max(1, options.maxLines ?? 2000);
  }

  appendLine(segments: readonly OffscreenSegment[]): void {
    this.#lines.push([...segments]);
    if (this.#lines.length > this.#maxLines) {
      const excess = this.#lines.length - this.#maxLines;
      this.#lines.splice(0, excess);
      this.#dropped += excess;
    }
  }

  lineCount(): number {
    return this.#lines.length;
  }

  /** A window over the styled history, for viewport renderers. */
  window(offset: number, count: number): readonly (readonly OffscreenSegment[])[] {
    const from = Math.max(0, offset);
    return this.#lines.slice(from, from + Math.max(0, count));
  }

  /** Freezes the current history with its honest dropped count. */
  snapshot(): OffscreenSnapshot {
    return Object.freeze({
      lines: this.#lines.map((line) => Object.freeze(line.map((segment) => ({ ...segment })))),
      dropped: this.#dropped,
    });
  }
}

/** Streams Markdown text into styled lines. */
export function createMarkdownSurfaceWriter(surface: OffscreenSurface): { write(chunk: string): void; flush(): void } {
  let pending = "";
  const emit = (line: string): void => {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      surface.appendLine([{ text: heading[2]!, style: { scope: `heading-${heading[1]!.length}`, bold: true } }]);
      return;
    }
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    const body = bullet ? bullet[2]! : line;
    const prefix: OffscreenSegment[] = bullet ? [{ text: `${bullet[1]!}• `, style: { scope: "bullet" } }] : [];
    const segments: OffscreenSegment[] = [...prefix];
    // Inline code and emphasis, in one deterministic pass.
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
    let cursor = 0;
    for (const match of body.matchAll(pattern)) {
      if (match.index > cursor) segments.push({ text: body.slice(cursor, match.index) });
      const token = match[0];
      if (token.startsWith("`")) segments.push({ text: token.slice(1, -1), style: { scope: "code" } });
      else segments.push({ text: token.slice(2, -2), style: { bold: true } });
      cursor = match.index + token.length;
    }
    if (cursor < body.length) segments.push({ text: body.slice(cursor) });
    surface.appendLine(segments.length > 0 ? segments : [{ text: "" }]);
  };
  return {
    write(chunk) {
      pending += chunk;
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        emit(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    },
    flush() {
      if (pending !== "") {
        emit(pending);
        pending = "";
      }
    },
  };
}

/** Streams source code through a highlighter into scoped segments. */
export function createCodeSurfaceWriter(
  surface: OffscreenSurface,
  highlighter: Highlighter,
): { write(chunk: string): void; flush(): void } {
  let pending = "";
  let lineNumber = 0;
  const emit = (line: string): void => {
    const spans = highlighter.highlightLine(line, lineNumber);
    lineNumber += 1;
    if (spans.length === 0) {
      surface.appendLine([{ text: line }]);
      return;
    }
    const segments: OffscreenSegment[] = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) segments.push({ text: line.slice(cursor, span.start) });
      segments.push({ text: line.slice(span.start, span.end), style: { scope: span.scope } });
      cursor = span.end;
    }
    if (cursor < line.length) segments.push({ text: line.slice(cursor) });
    surface.appendLine(segments);
  };
  return {
    write(chunk) {
      pending += chunk;
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        emit(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    },
    flush() {
      if (pending !== "") {
        emit(pending);
        pending = "";
      }
    },
  };
}

/** Streams process output, tracking SGR color/bold; the rest is text. */
export function createProcessOutputWriter(surface: OffscreenSurface): { write(chunk: string): void; flush(): void } {
  let pending = "";
  let bold = false;
  let foreground: number | undefined;
  const style = (): OffscreenSegment["style"] =>
    bold || foreground !== undefined
      ? { ...(bold ? { bold: true } : {}), ...(foreground !== undefined ? { foreground } : {}) }
      : undefined;
  const emit = (line: string): void => {
    const segments: OffscreenSegment[] = [];
    let cursor = 0;
    const pattern = /\x1b\[([0-9;]*)m/g;
    for (const match of line.matchAll(pattern)) {
      if (match.index > cursor) {
        const current = style();
        segments.push({ text: line.slice(cursor, match.index), ...(current ? { style: current } : {}) });
      }
      for (const part of (match[1] === "" ? "0" : match[1]!).split(";")) {
        const code = Number.parseInt(part, 10);
        if (code === 0) {
          bold = false;
          foreground = undefined;
        } else if (code === 1) bold = true;
        else if (code === 22) bold = false;
        else if (code >= 30 && code <= 37) foreground = code - 30;
        else if (code === 39) foreground = undefined;
        else if (code >= 90 && code <= 97) foreground = code - 90 + 8;
      }
      cursor = match.index + match[0].length;
    }
    const rest = line.slice(cursor).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    if (rest !== "" || segments.length === 0) {
      const current = style();
      segments.push({ text: rest, ...(current ? { style: current } : {}) });
    }
    surface.appendLine(segments);
  };
  return {
    write(chunk) {
      pending += chunk;
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        emit(pending.slice(0, newline).replace(/\r$/, ""));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    },
    flush() {
      if (pending !== "") {
        emit(pending);
        pending = "";
      }
    },
  };
}
