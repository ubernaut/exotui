// Copyright 2023 Im-Beast. MIT license.
import { BEGIN_SYNCHRONIZED_OUTPUT, CLEAR_SCREEN, END_SYNCHRONIZED_OUTPUT, moveCursor } from "../utils/ansi_codes.ts";
import { readCsiSequenceAt, readOsc8SequenceAt } from "../utils/ansi_text.ts";
import { sgrColor, sgrParameters } from "../utils/sgr_parameters.ts";
import type { CanvasRenderStats } from "./canvas.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const MAX_ANSI_CELL_PARTS_CACHE_SIZE = 32768;
const MAX_ANSI_PREFIX_STATE_CACHE_SIZE = 8192;
const ansiCellPartsCache = new Map<string, AnsiCellParts>();
const emptyAnsiPrefixState: AnsiPrefixState = { foreground: false, background: false, other: false };
const ansiPrefixStateCache = new Map<string, AnsiPrefixState>();
const ansi256PrefixCache = new Map<string, string>();
const XTERM_CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

/** Wire color depth emitted by {@linkcode AnsiCanvasSink}. */
export type AnsiColorDepth = "truecolor" | "256";

/** Runtime-adjustable wire encoding options for {@linkcode AnsiCanvasSink}. */
export interface AnsiWireEncodingOptions {
  /** Emit 24-bit RGB (`"truecolor"`) or quantize RGB SGR sequences to xterm-256 (`"256"`). */
  readonly colorDepth?: AnsiColorDepth;
  /** Compress long runs of identical ASCII glyphs with ECMA-48 `REP` (`CSI n b`). */
  readonly repeatCompression?: boolean;
}

/** Public interface describing a canvas Stdout. */
export interface CanvasStdout {
  writeSync(data: Uint8Array): number;
}

/** Public interface describing a canvas Cell Update. */
export interface CanvasCellUpdate {
  row: number;
  column: number;
  value: string | Uint8Array;
}

/** Public interface describing a contiguous row range of canvas cell updates. */
export interface CanvasRowRangeUpdate {
  row: number;
  startColumn: number;
  values: readonly (string | Uint8Array)[];
}

/** Public interface describing a canvas Cell Sink. */
export interface CanvasCellSink {
  /** Set false when a range-aware sink does not need legacy per-cell update objects for range flushes. */
  requiresCellUpdates?: boolean;
  resize?(columns: number, rows: number): void;
  flush(updates: readonly CanvasCellUpdate[], stats: CanvasRenderStats): void;
  flushRanges?(
    ranges: readonly CanvasRowRangeUpdate[],
    stats: CanvasRenderStats,
    updates: readonly CanvasCellUpdate[],
  ): void;
  /**
   * True when the last flush could not deliver every byte (a saturated or
   * non-blocking terminal); reading clears the flag. The canvas responds by
   * forcing a full repaint, so a truncated frame heals instead of leaving
   * stale cells the diff will never touch again.
   */
  takeFlushDegraded?(): boolean;
  /**
   * Write-path counters accumulated since the last drain; reading resets
   * them. This is the evidence channel for "stutter with an idle CPU": a
   * saturated terminal shows up here as stall time and degraded flushes, not
   * as load on any CPU graph.
   */
  takeFlushTelemetry?(): AnsiFlushTelemetry;
  /** Updates wire-encoding parameters (such as 256-color quantization or `REP` compression) at runtime. */
  configure?(options: AnsiWireEncodingOptions): void;
}

/** Write-path telemetry accumulated between {@linkcode CanvasCellSink.takeFlushTelemetry} drains. */
export interface AnsiFlushTelemetry {
  /** flush()/flushRanges() invocations — one per rendered frame. */
  frames: number;
  /** Encoded bytes offered to the terminal. */
  bytes: number;
  /** writeSync calls made delivering those bytes. */
  writes: number;
  /** Buffer-full refusals (WouldBlock/EAGAIN) from the tty. */
  wouldBlocks: number;
  /** Writes that accepted fewer bytes than offered. */
  shortWrites: number;
  /** Total time spent stalled waiting for the terminal to drain. */
  stallMs: number;
  /** The single worst stall. */
  maxStallMs: number;
  /** Flushes abandoned past the stall budget; each forces a full repaint. */
  degradedFlushes: number;
  /** Bytes dropped by those abandoned flushes. */
  droppedBytes: number;
}

function emptyFlushTelemetry(): AnsiFlushTelemetry {
  return {
    frames: 0,
    bytes: 0,
    writes: 0,
    wouldBlocks: 0,
    shortWrites: 0,
    stallMs: 0,
    maxStallMs: 0,
    degradedFlushes: 0,
    droppedBytes: 0,
  };
}

/**
 * Formats one drained {@linkcode AnsiFlushTelemetry} window into a single
 * greppable `key=value` line with fixed field order for terminal write-path
 * diagnostics and stall profiling.
 */
export function formatAnsiFlushTelemetry(telemetry: AnsiFlushTelemetry): string {
  return `frames=${telemetry.frames} bytes=${telemetry.bytes} writes=${telemetry.writes} ` +
    `wouldblock=${telemetry.wouldBlocks} short=${telemetry.shortWrites} ` +
    `stall_ms=${telemetry.stallMs.toFixed(1)} max_stall_ms=${telemetry.maxStallMs.toFixed(1)} ` +
    `degraded=${telemetry.degradedFlushes} dropped_bytes=${telemetry.droppedBytes}`;
}

/** Options for configuring ansi Canvas Sink. */
export interface AnsiCanvasSinkOptions extends AnsiWireEncodingOptions {
  stdout: CanvasStdout;
  flushLimit?: number;
  /** Bracket each rendered frame in DEC synchronized output (mode 2026) to avoid mid-flush tearing. */
  synchronizedOutput?: boolean;
}

/** Writes a real terminal may refuse mid-frame; how long one flush may stall. */
const MAX_WRITE_STALL_MS = 40;
/** One bounded synchronous pause while a saturated terminal drains. */
const WRITE_STALL_SLICE_MS = 2;

/** True for the errors a non-blocking tty raises when its buffer is full. */
function isWouldBlockError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "WouldBlock" ||
    (error as { code?: string }).code === "EAGAIN";
}

/** Terminal sink that converts dirty canvas cells into cursor-addressed ANSI writes. */
export class AnsiCanvasSink implements CanvasCellSink {
  readonly requiresCellUpdates = false;

  readonly #stdout: CanvasStdout;
  readonly #flushLimit: number;
  readonly #synchronizedOutput: boolean;
  #colorDepth: AnsiColorDepth;
  #repeatCompression: boolean;
  #degraded = false;
  #telemetry = emptyFlushTelemetry();

  constructor(options: AnsiCanvasSinkOptions) {
    this.#stdout = options.stdout;
    this.#flushLimit = options.flushLimit ?? defaultAnsiFlushLimit();
    this.#synchronizedOutput = options.synchronizedOutput ?? false;
    this.#colorDepth = options.colorDepth ?? "truecolor";
    this.#repeatCompression = options.repeatCompression ?? false;
  }

  /** Updates wire-encoding mode (color quantization and repeat compression) without replacing the sink. */
  configure(options: AnsiWireEncodingOptions): void {
    if (options.colorDepth !== undefined) this.#colorDepth = options.colorDepth;
    if (options.repeatCompression !== undefined) this.#repeatCompression = options.repeatCompression;
  }

  /** Returns the currently active wire-encoding parameters. */
  inspectEncoding(): Required<AnsiWireEncodingOptions> {
    return {
      colorDepth: this.#colorDepth,
      repeatCompression: this.#repeatCompression,
    };
  }

  takeFlushDegraded(): boolean {
    const degraded = this.#degraded;
    this.#degraded = false;
    return degraded;
  }

  takeFlushTelemetry(): AnsiFlushTelemetry {
    const telemetry = this.#telemetry;
    this.#telemetry = emptyFlushTelemetry();
    return telemetry;
  }

  /**
   * Writes a whole sequence, surviving the two ways a real tty drops bytes:
   * short writes (`writeSync` returning less than it was given) and
   * `WouldBlock`/`EAGAIN` (raw-mode stdin shares the tty's non-blocking flag,
   * so stdout inherits it). Both are invisible on an in-memory stdout, which
   * is why they only ever bite on real terminals — as stale "ghost" cells the
   * diff renderer then believes were already painted. Progress is retried
   * with brief bounded pauses; if the terminal stays saturated past the
   * stall budget the rest of this frame is dropped and `#degraded` is set,
   * which makes the canvas force a clean full repaint next render.
   */
  #write(sequence: string): void {
    if (sequence.length === 0) return;
    const bytes = textEncoder.encode(sequence);
    const telemetry = this.#telemetry;
    telemetry.bytes += bytes.length;
    let offset = 0;
    let stalledSince: number | undefined;
    // Rolls a finished stall into the counters; only called while stalled, so
    // the happy path pays nothing beyond the byte/write counts.
    const endStall = (now: number): void => {
      if (stalledSince === undefined) return;
      const stall = now - stalledSince;
      telemetry.stallMs += stall;
      if (stall > telemetry.maxStallMs) telemetry.maxStallMs = stall;
      stalledSince = undefined;
    };
    while (offset < bytes.length) {
      const offered = bytes.length - offset;
      let written = 0;
      telemetry.writes += 1;
      try {
        written = this.#stdout.writeSync(offset === 0 ? bytes : bytes.subarray(offset));
      } catch (error) {
        if (!isWouldBlockError(error)) throw error;
        telemetry.wouldBlocks += 1;
      }
      if (written > 0) {
        if (written < offered) telemetry.shortWrites += 1;
        offset += written;
        if (stalledSince !== undefined) endStall(performance.now());
        continue;
      }
      const now = performance.now();
      stalledSince ??= now;
      if (now - stalledSince > MAX_WRITE_STALL_MS) {
        endStall(now);
        telemetry.degradedFlushes += 1;
        telemetry.droppedBytes += bytes.length - offset;
        this.#degraded = true;
        return;
      }
      // Busy-wait one slice; the terminal is draining on its own schedule and
      // this synchronous path has no way to yield without tearing the frame.
      const resume = now + WRITE_STALL_SLICE_MS;
      while (performance.now() < resume) { /* draining */ }
    }
  }

  resize(_columns: number, _rows: number): void {
    this.#write(`${moveCursor(0, 0)}${CLEAR_SCREEN}`);
  }

  flush(updates: readonly CanvasCellUpdate[], _stats?: CanvasRenderStats): void {
    this.#telemetry.frames += 1;
    if (updates.length === 0) return;
    const encodeOptions: AnsiRangeEncodeOptions = {
      quantize256: this.#colorDepth === "256",
      repeatCompression: this.#repeatCompression,
    };
    let drawSequence = this.#synchronizedOutput ? BEGIN_SYNCHRONIZED_OUTPUT : "";
    for (let index = 0; index < updates.length;) {
      const span = compactAnsiUpdateSpan(updates, index, encodeOptions);
      const cursor = moveCursor(span.row, span.column);
      if (drawSequence.length > 0 && drawSequence.length + cursor.length + span.text.length > this.#flushLimit) {
        this.#write(drawSequence);
        drawSequence = "";
        if (this.#degraded) break;
      }
      drawSequence += cursor + span.text;
      index += span.cells;
    }
    if (this.#synchronizedOutput) drawSequence += END_SYNCHRONIZED_OUTPUT;
    this.#write(drawSequence);
  }

  flushRanges(ranges: readonly CanvasRowRangeUpdate[], _stats: CanvasRenderStats): void {
    this.#telemetry.frames += 1;
    if (ranges.length === 0) return;
    const encodeOptions: AnsiRangeEncodeOptions = {
      quantize256: this.#colorDepth === "256",
      repeatCompression: this.#repeatCompression,
    };
    const frameState: AnsiRangeFrameState = {
      activePrefix: "",
      activeState: emptyAnsiPrefixState,
      needsReset: false,
    };
    let drawSequence = this.#synchronizedOutput ? BEGIN_SYNCHRONIZED_OUTPUT : "";
    for (const range of ranges) {
      const cursor = moveCursor(range.row, range.startColumn);
      const text = compactAnsiCellRange(range, frameState, encodeOptions);
      if (drawSequence.length > 0 && drawSequence.length + cursor.length + text.length > this.#flushLimit) {
        this.#write(drawSequence);
        drawSequence = "";
        if (this.#degraded) break;
      }
      drawSequence += cursor + text;
    }
    if (!this.#degraded) {
      if (frameState.needsReset) drawSequence += "\x1b[0m";
      if (this.#synchronizedOutput) drawSequence += END_SYNCHRONIZED_OUTPUT;
      this.#write(drawSequence);
    }
  }
}

interface AnsiRangeEncodeOptions {
  readonly quantize256: boolean;
  readonly repeatCompression: boolean;
}

interface AnsiRangeFrameState {
  activePrefix: string;
  activeState: AnsiPrefixState;
  needsReset: boolean;
}

interface AnsiCellParts {
  prefix: string;
  text: string;
  suffix: string;
  hyperlink: string;
}

interface AnsiCellSpan {
  text: string;
  cells: number;
  first: AnsiCellParts;
  prefix: string;
}

interface AnsiUpdateSpan {
  text: string;
  cells: number;
  row: number;
  column: number;
}

function compactAnsiUpdateSpan(
  updates: readonly CanvasCellUpdate[],
  start: number,
  options: AnsiRangeEncodeOptions,
): AnsiUpdateSpan {
  const firstUpdate = updates[start]!;
  const first = splitAnsiCellValue(firstUpdate.value);
  const firstPrefix = options.quantize256 ? quantizeAnsiPrefixTo256(first.prefix) : first.prefix;
  let text = first.text;
  let index = start + 1;
  let column = firstUpdate.column;
  while (isCompactAsciiText(first.text) && index < updates.length) {
    const update = updates[index]!;
    if (update.row !== firstUpdate.row || update.column !== column + 1) break;
    const current = splitAnsiCellValue(update.value);
    if (!isCompactAsciiText(current.text)) break;
    const currentPrefix = options.quantize256 ? quantizeAnsiPrefixTo256(current.prefix) : current.prefix;
    if (currentPrefix !== firstPrefix || current.suffix !== first.suffix || current.hyperlink !== first.hyperlink) {
      break;
    }
    text += current.text;
    column = update.column;
    index += 1;
  }
  const encodedText = options.repeatCompression && isCompactAsciiText(text) ? compressAnsiRepeatedText(text) : text;
  const openLink = first.hyperlink ? `\x1b]8;;${first.hyperlink}\x1b\\` : "";
  const closeLink = first.hyperlink ? "\x1b]8;;\x1b\\" : "";
  return {
    row: firstUpdate.row,
    column: firstUpdate.column,
    text: `${openLink}${firstPrefix}${encodedText}${first.suffix}${closeLink}`,
    cells: index - start,
  };
}

function compactAnsiCellSpan(
  values: readonly (string | Uint8Array)[],
  start: number,
  options: AnsiRangeEncodeOptions,
): AnsiCellSpan {
  const firstValue = values[start]!;
  const first = splitAnsiCellValue(firstValue);
  const firstPrefix = options.quantize256 ? quantizeAnsiPrefixTo256(first.prefix) : first.prefix;
  // Separate authored cells are not one Unicode text run. Keep non-ASCII
  // cells (and empty wide followers) distinct so CUP can retain boundaries.
  if (!isCompactAsciiText(first.text)) return { text: first.text, cells: 1, first, prefix: firstPrefix };
  let repeatedCells = 1;
  while (start + repeatedCells < values.length && values[start + repeatedCells] === firstValue) {
    repeatedCells += 1;
  }
  if (repeatedCells > 1 && !options.quantize256) {
    const raw = first.text.repeat(repeatedCells);
    return {
      text: options.repeatCompression ? compressAnsiRepeatedText(raw) : raw,
      cells: repeatedCells,
      first,
      prefix: firstPrefix,
    };
  }

  let text = repeatedCells > 1 ? first.text.repeat(repeatedCells) : first.text;
  let index = start + repeatedCells;
  while (index < values.length) {
    const current = splitAnsiCellValue(values[index]!);
    if (!isCompactAsciiText(current.text)) break;
    const currentPrefix = options.quantize256 ? quantizeAnsiPrefixTo256(current.prefix) : current.prefix;
    if (currentPrefix !== firstPrefix || current.suffix !== first.suffix || current.hyperlink !== first.hyperlink) {
      break;
    }
    text += current.text;
    index += 1;
  }
  return {
    text: options.repeatCompression ? compressAnsiRepeatedText(text) : text,
    cells: index - start,
    first,
    prefix: firstPrefix,
  };
}

function compactAnsiCellRange(
  range: CanvasRowRangeUpdate,
  frameState: AnsiRangeFrameState,
  options: AnsiRangeEncodeOptions,
): string {
  const { values } = range;
  let output = "";
  let activeHyperlink = "";
  let isolateNext = false;

  for (let index = 0; index < values.length;) {
    const span = compactAnsiCellSpan(values, index, options);
    const { first, prefix } = span;
    if (!first.text) {
      // An empty wide-glyph follower emits no text and does not advance the
      // host cursor, so skip style/link changes and re-address the next cell.
      isolateNext = true;
      index += span.cells;
      continue;
    }
    const isolated = !isCompactAsciiText(first.text);
    if (isolated || isolateNext) output += moveCursor(range.row, range.startColumn + index);
    isolateNext = isolated;
    if (first.hyperlink !== activeHyperlink) {
      output += `\x1b]8;;${first.hyperlink}\x1b\\`;
      activeHyperlink = first.hyperlink;
    }
    if (prefix !== frameState.activePrefix) {
      const nextState = ansiPrefixState(prefix);
      if (frameState.needsReset && !ansiPrefixCanOverrideActive(frameState.activeState, nextState)) {
        output += "\x1b[0m";
        frameState.needsReset = false;
        output += prefix;
      } else {
        output += emitAnsiPrefixDelta(frameState.activeState, nextState, prefix);
      }
      frameState.activePrefix = prefix;
      frameState.activeState = nextState;
    }
    output += span.text;
    if (first.text.includes("\x1b")) {
      frameState.activePrefix = "";
      frameState.activeState = emptyAnsiPrefixState;
      frameState.needsReset = true;
    } else if (prefix || first.suffix) {
      frameState.needsReset = true;
    }
    index += span.cells;
  }

  if (activeHyperlink) output += "\x1b]8;;\x1b\\";
  return output;
}

/** Emits only the changed SGR channel(s) when both active and next prefixes are simple color-only codes. */
function emitAnsiPrefixDelta(active: AnsiPrefixState, next: AnsiPrefixState, rawNextPrefix: string): string {
  if (active.other || next.other) return rawNextPrefix;
  if (!next.foreground && !next.background) return rawNextPrefix;
  const fgChanged = next.foreground && next.fgParam !== active.fgParam;
  const bgChanged = next.background && next.bgParam !== active.bgParam;
  if (!fgChanged && !bgChanged) return "";
  if (fgChanged && bgChanged) return `\x1b[${next.fgParam};${next.bgParam}m`;
  return fgChanged ? `\x1b[${next.fgParam}m` : `\x1b[${next.bgParam}m`;
}

/** Compresses runs of 7+ identical printable ASCII characters with ECMA-48 `REP` (`CSI n b`). */
function compressAnsiRepeatedText(text: string): string {
  if (text.length < 7) return text;
  let output = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    let end = index + 1;
    while (end < text.length && text[end] === char) end += 1;
    const count = end - index;
    if (count >= 7) {
      output += `${char}\x1b[${count - 1}b`;
    } else {
      output += text.slice(index, end);
    }
    index = end;
  }
  return output;
}

/**
 * Quantizes an 8-bit RGB triple to the closest xterm-256 palette index
 * (`16..255`: 6x6x6 color cube and 24-level grayscale ramp).
 */
export function rgbToXterm256(red: number, green: number, blue: number): number {
  const r = Math.max(0, Math.min(255, Math.round(red)));
  const g = Math.max(0, Math.min(255, Math.round(green)));
  const b = Math.max(0, Math.min(255, Math.round(blue)));
  const ri = nearestXtermCubeIndex(r);
  const gi = nearestXtermCubeIndex(g);
  const bi = nearestXtermCubeIndex(b);
  const cubeR = XTERM_CUBE_LEVELS[ri]!;
  const cubeG = XTERM_CUBE_LEVELS[gi]!;
  const cubeB = XTERM_CUBE_LEVELS[bi]!;
  const cubeDist = (r - cubeR) ** 2 + (g - cubeG) ** 2 + (b - cubeB) ** 2;
  const cubeIndex = 16 + 36 * ri + 6 * gi + bi;

  const avg = (r + g + b) / 3;
  const grayStep = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const grayLevel = 8 + grayStep * 10;
  const grayDist = (r - grayLevel) ** 2 + (g - grayLevel) ** 2 + (b - grayLevel) ** 2;
  return grayDist < cubeDist ? 232 + grayStep : cubeIndex;
}

function nearestXtermCubeIndex(value: number): number {
  if (value < 48) return 0;
  if (value < 115) return 1;
  return Math.min(5, Math.floor((value - 35) / 40));
}

function quantizeAnsiPrefixTo256(prefix: string): string {
  if (!prefix || !prefix.includes(";2;") && !prefix.includes(":2:")) return prefix;
  const cached = ansi256PrefixCache.get(prefix);
  if (cached !== undefined) return cached;
  let output = "";
  for (let offset = 0; offset < prefix.length;) {
    const sequence = readCsiSequenceAt(prefix, offset);
    if (!sequence) {
      output += prefix[offset]!;
      offset += 1;
      continue;
    }
    if (!sequence.endsWith("m") || !/^[\d;:]*$/.test(sequence.slice(2, -1))) {
      output += sequence;
      offset += sequence.length;
      continue;
    }
    const parameters = sgrParameters(sequence.slice(2, -1));
    const nextParams: string[] = [];
    for (let index = 0; index < parameters.length;) {
      const command = Number(parameters[index]!.split(":")[0]);
      if (command === 38 || command === 48 || command === 58) {
        const color = sgrColor(parameters, index);
        if (color.rgb) {
          const [r, g, b] = color.rgb;
          nextParams.push(`${command};5;${rgbToXterm256(r, g, b)}`);
          index += color.consumed;
          continue;
        }
        for (let consumed = 0; consumed < color.consumed; consumed += 1) {
          nextParams.push(parameters[index + consumed]!);
        }
        index += color.consumed;
      } else {
        nextParams.push(parameters[index]!);
        index += 1;
      }
    }
    output += `\x1b[${nextParams.join(";")}m`;
    offset += sequence.length;
  }
  if (ansi256PrefixCache.size > MAX_ANSI_PREFIX_STATE_CACHE_SIZE) ansi256PrefixCache.clear();
  ansi256PrefixCache.set(prefix, output);
  return output;
}

function isCompactAsciiText(text: string): boolean {
  if (!text) return false;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit < 32 || unit > 126) return false;
  }
  return true;
}

interface AnsiPrefixState {
  foreground: boolean;
  background: boolean;
  other: boolean;
  fgParam?: string;
  bgParam?: string;
}

function ansiPrefixState(prefix: string): AnsiPrefixState {
  if (!prefix) return emptyAnsiPrefixState;
  const cached = ansiPrefixStateCache.get(prefix);
  if (cached) return cached;
  const state: AnsiPrefixState = { foreground: false, background: false, other: false };
  // Only complete color-only prefixes can safely replace a previous prefix
  // without resetting. Attributes may be combined with color parameters;
  // channel values and colon subparameters are not independent SGR commands.
  for (let offset = 0; offset < prefix.length;) {
    const sequence = readCsiSequenceAt(prefix, offset);
    if (!sequence?.endsWith("m") || !/^[\d;:]*$/.test(sequence.slice(2, -1))) {
      state.other = true;
      break;
    }
    const parameters = sgrParameters(sequence.slice(2, -1));
    for (let index = 0; index < parameters.length;) {
      const command = Number(parameters[index]!.split(":")[0]);
      if (command === 38 || command === 48) {
        const color = sgrColor(parameters, index);
        if (color.rgb || color.palette !== undefined) {
          const token = parameters.slice(index, index + color.consumed).join(";");
          if (command === 38) {
            state.foreground = true;
            state.fgParam = token;
          } else {
            state.background = true;
            state.bgParam = token;
          }
        } else state.other = true;
        index += color.consumed;
      } else {
        state.other = true;
        index++;
      }
    }
    offset += sequence.length;
  }
  if (ansiPrefixStateCache.size > MAX_ANSI_PREFIX_STATE_CACHE_SIZE) {
    ansiPrefixStateCache.clear();
  }
  ansiPrefixStateCache.set(prefix, state);
  return state;
}

function ansiPrefixCanOverrideActive(active: AnsiPrefixState, next: AnsiPrefixState): boolean {
  if (active.other) return false;
  if (active.foreground && !next.foreground) return false;
  if (active.background && !next.background) return false;
  return true;
}

function splitAnsiCellValue(value: string | Uint8Array): AnsiCellParts {
  const cell = typeof value === "string" ? value : textDecoder.decode(value);
  if (!cell.includes("\x1b")) {
    return { prefix: "", text: cell, suffix: "", hyperlink: "" };
  }
  const cached = ansiCellPartsCache.get(cell);
  if (cached) return cached;

  let textStart = 0;
  let prefix = "";
  let hyperlink = "";
  while (textStart < cell.length) {
    const sequence = readCsiSequenceAt(cell, textStart);
    if (sequence) {
      prefix += sequence;
      textStart += sequence.length;
      continue;
    }
    const osc8 = readOsc8SequenceAt(cell, textStart);
    if (osc8) {
      hyperlink = osc8.uri;
      textStart += osc8.length;
      continue;
    }
    break;
  }

  const nextControl = cell.indexOf("\x1b", textStart);
  const text = cell.slice(textStart, nextControl < 0 ? cell.length : nextControl);
  if (!text || text.charCodeAt(0) === 0x1b) {
    return { prefix: "", text: cell, suffix: "", hyperlink: "" };
  }
  const suffix = parseAnsiSuffix(cell.slice(textStart + text.length));
  if (suffix === undefined) {
    return { prefix: "", text: cell, suffix: "", hyperlink: "" };
  }

  const split = { prefix, text, suffix, hyperlink };
  if (ansiCellPartsCache.size > MAX_ANSI_CELL_PARTS_CACHE_SIZE) {
    ansiCellPartsCache.clear();
  }
  ansiCellPartsCache.set(cell, split);
  return split;
}

function parseAnsiSuffix(value: string): string | undefined {
  if (!value) return "";
  let csiSuffix = "";
  let index = 0;
  while (index < value.length) {
    const sequence = readCsiSequenceAt(value, index);
    if (sequence) {
      csiSuffix += sequence;
      index += sequence.length;
      continue;
    }
    const osc8 = readOsc8SequenceAt(value, index);
    if (osc8 && osc8.uri === "") {
      index += osc8.length;
      continue;
    }
    return undefined;
  }
  return csiSuffix;
}

/** Public class implementing a memory Canvas Sink. */
export class MemoryCanvasSink implements CanvasCellSink {
  readonly requiresCellUpdates = true;

  readonly updates: CanvasCellUpdate[] = [];
  readonly rowRanges: CanvasRowRangeUpdate[] = [];
  lastStats?: CanvasRenderStats;
  columns = 0;
  rows = 0;

  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
  }

  flush(updates: readonly CanvasCellUpdate[], stats: CanvasRenderStats): void {
    for (const update of updates) {
      this.updates.push({ ...update });
    }
    this.lastStats = { ...stats };
  }

  flushRanges(
    ranges: readonly CanvasRowRangeUpdate[],
    stats: CanvasRenderStats,
    updates: readonly CanvasCellUpdate[],
  ): void {
    for (const range of ranges) {
      this.rowRanges.push({ ...range, values: Array.from(range.values) });
    }
    this.flush(updates, stats);
  }

  clear(): void {
    this.updates.length = 0;
    this.rowRanges.length = 0;
    this.lastStats = undefined;
  }
}

/** Coalesces sorted canvas cell updates into contiguous row ranges. */
export function coalesceCanvasRowRanges(
  updates: readonly CanvasCellUpdate[],
  target: CanvasRowRangeUpdate[] = [],
): CanvasRowRangeUpdate[] {
  let active: { row: number; startColumn: number; nextColumn: number; values: (string | Uint8Array)[] } | undefined;
  let written = 0;

  for (const update of updates) {
    if (!active || update.row !== active.row || update.column !== active.nextColumn) {
      if (active) {
        target[written] = writeCanvasRowRangeUpdate(
          target[written],
          active.row,
          active.startColumn,
          active.values,
        );
        written += 1;
      }
      const values = retainedCanvasRowRangeValues(target[written]);
      values.length = 0;
      active = {
        row: update.row,
        startColumn: update.column,
        nextColumn: update.column,
        values,
      };
    }
    active.values.push(update.value);
    active.nextColumn = update.column + 1;
  }

  if (active) {
    target[written] = writeCanvasRowRangeUpdate(
      target[written],
      active.row,
      active.startColumn,
      active.values,
    );
    written += 1;
  }
  target.length = written;
  return target;
}

function retainedCanvasRowRangeValues(range: CanvasRowRangeUpdate | undefined): (string | Uint8Array)[] {
  return Array.isArray(range?.values) && !Object.isFrozen(range.values) ? range.values as (string | Uint8Array)[] : [];
}

function writeCanvasRowRangeUpdate(
  target: CanvasRowRangeUpdate | undefined,
  row: number,
  startColumn: number,
  values: readonly (string | Uint8Array)[],
): CanvasRowRangeUpdate {
  if (!target) return { row, startColumn, values };
  target.row = row;
  target.startColumn = startColumn;
  target.values = values;
  return target;
}

function defaultAnsiFlushLimit(): number {
  const host = globalThis as typeof globalThis & {
    Deno?: { build?: { os?: string } };
    process?: { platform?: string };
  };
  return host.Deno?.build?.os === "windows" || host.process?.platform === "win32" ? 1024 : 16384;
}
