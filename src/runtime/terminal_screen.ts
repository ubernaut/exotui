// Copyright 2023 Im-Beast. MIT license.
import {
  type ParsedTerminalControlSequence,
  parseTerminalControlSequence,
  parseTerminalParams,
} from "./terminal_sequences.ts";
import { clamp } from "../utils/numbers.ts";
import { CharacterWidthAccumulator, measureCharacterWidth } from "../utils/character_width.ts";
import { UnicodeGraphemeBoundaryCursor } from "../unicode/grapheme.ts";
import { normalizeTerminalDimension } from "./terminal_values.ts";
import { decodeTerminalColor, encodeTerminalIndexedColor, encodeTerminalRgbColor } from "./terminal_color.ts";
import { xtermPaletteRgb } from "./terminal_palette.ts";
import { parseTerminalClipboardWrite, type TerminalClipboardWrite } from "./terminal_services.ts";
import { sgrColor, sgrParameters } from "../utils/sgr_parameters.ts";
import type { AnsiStyleSpec } from "../theme.ts";

/** Styled terminal cell tracked by TerminalScreenController. */
export interface TerminalScreenCell {
  char: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  underlineStyle?: AnsiStyleSpec["underlineStyle"];
  underlineColor?: number;
  overline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  foreground?: number;
  background?: number;
  hyperlink?: string;
  /** On a row's final cell when automatic wrapping continues into the next row. */
  softWrapped?: boolean;
  /** Right-margin padding inserted before a wide glyph wraps; not copied as text. */
  wrapPadding?: boolean;
  /** On a row's final cell when a narrowing resize cut text off the row; its text does not end here. */
  clipped?: boolean;
  /**
   * Set on the blank that a double-width glyph parks in the column it also
   * occupies. Renderers must skip it — the glyph to its left already covers that
   * column — and the model keeps the pair honest: break either half and both are
   * erased, exactly as a real terminal does.
   */
  continuation?: boolean;
}

/** Cursor position inside a terminal screen model. */
export interface TerminalScreenCursor {
  column: number;
  row: number;
}

/** Terminal cursor style reported by TerminalScreenController inspection. */
export interface TerminalScreenCursorStyle {
  shape: "block" | "underline" | "bar";
  blinking: boolean;
}

/** Options for configuring Terminal Screen Controller. */
export interface TerminalScreenControllerOptions {
  columns?: number;
  rows?: number;
  scrollbackLimit?: number;
  /** Per-cell glyph budget (1–65,536 UTF-16 units); overflow replaces the whole cluster, never a prefix. */
  maxGlyphUtf16Units?: number;
  /** Budget above two UTF-16 units per cell, shared by both screens and history (0–8,388,608). */
  maxRetainedGlyphExtraUtf16Units?: number;
  /**
   * Called with each kitty graphics APC this screen consumes, and the cursor
   * cell it arrived at — the cell kitty anchors a display to. This is the
   * capture side of graphics passthrough; without a subscriber the sequences
   * are simply consumed and counted.
   */
  onKittyGraphics?: (data: string, cursor: { row: number; column: number }) => void;
  /**
   * Called for XTWINOPS size queries — `CSI 14 t` (text area in pixels),
   * `CSI 16 t` (cell size in pixels), `CSI 18 t` (size in cells).
   *
   * An application deciding how many pixels to render asks its terminal, and a
   * terminal that stays silent leaves it guessing — which is how an embedded
   * browser paints a frame sized for a window it is not in. The subscriber
   * owns the reply because only it knows the host's cell geometry; the screen
   * model only knows the query arrived.
   */
  onWindowSizeQuery?: (kind: 14 | 16 | 18) => void;
  /** Cursor position requested by CSI 6 n, in one-based terminal coordinates. */
  onCursorPositionQuery?: (row: number, column: number) => void;
  /**
   * Called with the bytes that answer a query this screen can answer from its
   * own state: device attributes, XTVERSION, device status, DECRQM, DECRQSS,
   * XTGETTCAP, the kitty keyboard flags and — when {@linkcode queryColors} is
   * given — OSC 10/11 colours. The subscriber writes them to the child's input.
   *
   * A program that asks and hears nothing waits out a timeout on every start,
   * or guesses; without a subscriber the queries are still consumed, silently.
   */
  onReply?: (data: string) => void;
  /** The colours an OSC 10 (foreground) or OSC 11 (background) query reports. Absent or undefined: unanswered. */
  queryColors?: () => TerminalScreenColorReport | undefined;
  /** What XTVERSION reports. Defaults to `exotui`. */
  identity?: { name: string; version?: string };
  /**
   * Called for bounded, valid OSC 52 clipboard writes emitted by the child.
   * Read queries (`?`) are never forwarded.
   */
  onClipboardWrite?: (write: TerminalClipboardWrite) => void;
  /** Maximum decoded UTF-8 byte length accepted for child OSC 52 writes (default 65,536). */
  maxClipboardBytes?: number;
  /**
   * Reflow soft-wrapped logical lines on the main screen when column width
   * changes (matching Ghostty, WezTerm, Kitty, and xterm). Alternate screens
   * never reflow. Defaults to `true`.
   */
  reflowOnResize?: boolean;
}

/** 8-bit RGB channels a terminal reports for its default colours and optional indexed palette slots. */
export interface TerminalScreenColorReport {
  foreground?: readonly [number, number, number];
  background?: readonly [number, number, number];
  /** Optional lookup for OSC 4 indexed palette queries (0–255); falls back to standard xterm-256. */
  palette?: (index: number) => readonly [number, number, number] | undefined;
}

/** The key reporting a child program has asked for, so its host can encode input to match. */
export interface TerminalScreenKeyboardProtocol {
  /** Kitty progressive-enhancement flags currently in force (0: legacy). */
  kittyFlags: number;
  /** xterm modifyOtherKeys level (0, 1 or 2). */
  modifyOtherKeys: number;
}

/** Clone-safe diagnostics for terminal glyph retention, including explicit whole-cluster refusals. */
export interface TerminalScreenGlyphInspection {
  maxGlyphUtf16Units: number;
  maxRetainedGlyphExtraUtf16Units: number;
  retainedGlyphExtraUtf16Units: number;
  rejectedClusters: number;
}

/** Serializable inspection snapshot for Terminal Screen Controller. */
export interface TerminalScreenInspection {
  columns: number;
  rows: number;
  cursor: TerminalScreenCursor;
  cursorVisible: boolean;
  cursorStyle: TerminalScreenCursorStyle;
  privateModes: number[];
  scrollbackRows: number;
  alternate: boolean;
  title?: string;
  /** The shell's cwd as last reported through OSC 7 (`file://host/path`). */
  workingDirectory?: string;
}

interface TerminalScreenState {
  cells: TerminalScreenCell[][];
  cursor: TerminalScreenCursor;
}

interface SavedCursorState {
  column: number;
  row: number;
  style: Omit<TerminalScreenCell, "char">;
  originMode: boolean;
  autoWrap: boolean;
  pendingWrap: boolean;
  charsetDecGraphics: [boolean, boolean];
  activeCharset: 0 | 1;
}

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_SCROLLBACK_LIMIT = 1000;
const MAX_PENDING_CONTROL_LENGTH = 128 * 1024;
const DEFAULT_MAX_CLIPBOARD_BYTES = 65_536;
const BLANK_CELL: TerminalScreenCell = Object.freeze({ char: " " });
/** The blank a double-width glyph parks in the second column it occupies. */
const CONTINUATION_CELL: TerminalScreenCell = Object.freeze({ char: " ", continuation: true });

/** VT100 DEC Special Graphics set used by curses ACS line drawing (`ESC ( 0` / `ESC ) 0` + SO). */
const DEC_SPECIAL_GRAPHICS: Readonly<Record<string, string>> = Object.freeze({
  "`": "◆",
  "a": "▒",
  "f": "°",
  "g": "±",
  "j": "┘",
  "k": "┐",
  "l": "┌",
  "m": "└",
  "n": "┼",
  "o": "⎺",
  "p": "⎻",
  "q": "─",
  "r": "⎼",
  "s": "⎽",
  "t": "├",
  "u": "┤",
  "v": "┴",
  "w": "┬",
  "x": "│",
  "y": "≤",
  "z": "≥",
  "{": "π",
  "|": "≠",
  "}": "£",
  "~": "·",
  "0": "█",
});

/** Lightweight ANSI terminal screen model for process and PTY output renderers. */
export class TerminalScreenController {
  #columns: number;
  #rows: number;
  #scrollbackLimit: number;
  #state: TerminalScreenState;
  #mainState?: TerminalScreenState;
  #scrollback: TerminalScreenCell[][] = [];
  #style: Omit<TerminalScreenCell, "char"> = {};
  /** Main and alternate screens each keep their own DECSC/SCOSC slot. */
  #savedCursor: { main?: SavedCursorState; alternate?: SavedCursorState } = {};
  #title?: string;
  #workingDirectory?: string;
  #hyperlink?: string;
  #scrollRegion: TerminalScreenScrollRegion;
  #horizontalMargins: TerminalScreenHorizontalMargins;
  #leftRightMarginsMode = false;
  #cursorVisible = true;
  #cursorStyle: TerminalScreenCursorStyle = { shape: "block", blinking: true };
  #privateModes = new Set<number>();
  #originMode = false;
  #autoWrap = true;
  #insertMode = false;
  /**
   * ANSI mode 20 (LNM). Off by default, as on every real terminal: a bare LF is
   * an index — down one row, same column — and only the tty line discipline's
   * ONLCR turns a cooked-mode `\n` into `\r\n`. Full-screen apps run the tty raw
   * and use LF (terminfo `cud1`) precisely because it keeps the column.
   */
  #lineFeedNewline = false;
  #lastPrintableCell?: TerminalScreenCell;
  #lastPrintableWidth = 1;
  /** Only the immediately preceding printable run may form a multi-scalar glyph. */
  #graphemeCell?: TerminalScreenCell;
  readonly #glyphBoundary = new UnicodeGraphemeBoundaryCursor();
  readonly #glyphWidth = new CharacterWidthAccumulator();
  #glyphContextCell?: TerminalScreenCell;
  #leadingGlyph?: TerminalScreenCell;
  #discardingGlyph = false;
  readonly #maxGlyphUtf16Units: number;
  readonly #maxRetainedGlyphExtraUtf16Units: number;
  #retainedGlyphExtraUtf16Units = 0;
  #rowGlyphExtras = new WeakMap<TerminalScreenCell[], number>();
  #rejectedClusters = 0;
  #tabStops: Set<number>;
  #pendingControl = "";
  /** At most one undecided UTF-16 high surrogate from a string chunk. */
  #pendingHighSurrogate = "";
  /** Swallowing an oversized DCS/APC/PM/SOS payload until its ST arrives. */
  #discardingString = false;
  #onKittyGraphics?: (data: string, cursor: { row: number; column: number }) => void;
  #onWindowSizeQuery?: (kind: 14 | 16 | 18) => void;
  #onCursorPositionQuery?: (row: number, column: number) => void;
  #onReply?: (data: string) => void;
  #queryColors?: () => TerminalScreenColorReport | undefined;
  #onClipboardWrite?: (write: TerminalClipboardWrite) => void;
  readonly #maxClipboardBytes: number;
  readonly #reflowOnResize: boolean;
  readonly #identity: string;
  /** Kitty keyboard flag stacks; the main and alternate screens keep their own. */
  #kittyKeyboard: { main: number[]; alternate: number[] } = { main: [], alternate: [] };
  #modifyOtherKeys = 0;
  #cursorStyleCode = 0;
  /** Per-slot RGB overrides set by `OSC 4` and cleared by `OSC 104` or `RIS`. */
  #paletteOverrides = new Map<number, readonly [number, number, number]>();
  /**
   * Kitty graphics sequences consumed without being drawn.
   *
   * Counted so a host can say "this application is sending images" instead of
   * presenting the honest-but-baffling alternative, which is a terminal that
   * stays blank while an editor paints its whole UI into sequences this model
   * swallows.
   */
  #kittyGraphicsConsumed = 0;
  // VT100 deferred-wrap latch: after a glyph fills the last column the cursor
  // parks there and only the *next* printable character wraps + scrolls. Full
  // -screen TUIs (e.g. nested Exomux) paint the bottom row edge-to-edge every
  // frame; without this latch each paint would spuriously scroll the screen up.
  #pendingWrap = false;
  readonly #charsetDecGraphics = [false, false];
  #activeCharset: 0 | 1 = 0;
  readonly #decoder = new TextDecoder();

  constructor(options: TerminalScreenControllerOptions = {}) {
    this.#maxGlyphUtf16Units = glyphBudget(options.maxGlyphUtf16Units, 1, 65_536);
    this.#maxRetainedGlyphExtraUtf16Units = glyphBudget(options.maxRetainedGlyphExtraUtf16Units, 0, 8_388_608);
    this.#columns = normalizeTerminalDimension(options.columns, DEFAULT_COLUMNS);
    this.#rows = normalizeTerminalDimension(options.rows, DEFAULT_ROWS);
    this.#scrollbackLimit = Math.max(0, Math.floor(options.scrollbackLimit ?? DEFAULT_SCROLLBACK_LIMIT));
    this.#state = {
      cells: createRows(this.#columns, this.#rows),
      cursor: { column: 0, row: 0 },
    };
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#horizontalMargins = fullHorizontalMargins(this.#columns);
    this.#tabStops = defaultTabStops(this.#columns);
    this.#onKittyGraphics = options.onKittyGraphics;
    this.#onWindowSizeQuery = options.onWindowSizeQuery;
    this.#onCursorPositionQuery = options.onCursorPositionQuery;
    this.#onReply = options.onReply;
    this.#queryColors = options.queryColors;
    this.#onClipboardWrite = options.onClipboardWrite;
    this.#maxClipboardBytes = Math.max(
      0,
      Math.min(DEFAULT_MAX_CLIPBOARD_BYTES, Math.floor(options.maxClipboardBytes ?? DEFAULT_MAX_CLIPBOARD_BYTES)),
    );
    this.#reflowOnResize = options.reflowOnResize ?? true;
    this.#identity = terminalIdentity(options.identity);
  }

  get columns(): number {
    return this.#columns;
  }

  get rows(): number {
    return this.#rows;
  }

  get cursor(): TerminalScreenCursor {
    return { ...this.#state.cursor };
  }

  /** Inspect bounded extra-text retention; rejected clusters paint U+FFFD and never silently retain a prefix. */
  inspectGlyphs(): TerminalScreenGlyphInspection {
    return {
      maxGlyphUtf16Units: this.#maxGlyphUtf16Units,
      maxRetainedGlyphExtraUtf16Units: this.#maxRetainedGlyphExtraUtf16Units,
      retainedGlyphExtraUtf16Units: this.#retainedGlyphExtraUtf16Units,
      rejectedClusters: this.#rejectedClusters,
    };
  }

  get alternate(): boolean {
    return this.#mainState !== undefined;
  }

  /** The key reporting the child asked for through the kitty keyboard protocol or modifyOtherKeys. */
  get keyboardProtocol(): TerminalScreenKeyboardProtocol {
    return { kittyFlags: this.#kittyFlags(), modifyOtherKeys: this.#modifyOtherKeys };
  }

  /** Whether DECCKM (`CSI ? 1 h`, Application Cursor Keys) is currently active. */
  get applicationCursorKeys(): boolean {
    return this.#privateModes.has(1);
  }

  /** Whether DECSET 1004 focus reporting (`CSI ? 1004 h`) is currently active. */
  get focusReporting(): boolean {
    return this.#privateModes.has(1004);
  }

  /** Clone-safe view of active `OSC 4` indexed palette overrides (empty when none are set). */
  paletteOverrides(): ReadonlyMap<number, readonly [number, number, number]> {
    if (this.#paletteOverrides.size === 0) return EMPTY_PALETTE_OVERRIDES;
    const copy = new Map<number, readonly [number, number, number]>();
    for (const [index, rgb] of this.#paletteOverrides) copy.set(index, [rgb[0], rgb[1], rgb[2]]);
    return copy;
  }

  get scrollbackRows(): number {
    return this.#scrollback.length;
  }

  get scrollbackLimit(): number {
    return this.#scrollbackLimit;
  }

  /** Retunes retained history, trimming the oldest rows when the limit shrinks. */
  setScrollbackLimit(limit: number): void {
    this.#scrollbackLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : this.#scrollbackLimit));
    if (this.#scrollback.length > this.#scrollbackLimit) {
      for (const row of this.#scrollback.splice(0, this.#scrollback.length - this.#scrollbackLimit)) {
        this.#releaseGlyphRow(row);
      }
    }
  }

  /** How many kitty graphics sequences arrived and were swallowed undrawn. */
  get kittyGraphicsConsumed(): number {
    return this.#kittyGraphicsConsumed;
  }

  /** Consume incremental UTF-8 bytes or UTF-16 string chunks; call flushInput at end of input. */
  write(data: string | Uint8Array): void {
    const decoded = typeof data === "string"
      ? this.#decoder.decode() + data
      : this.#decoder.decode(data, { stream: true });
    this.#writeDecoded(decoded, false);
  }

  /** Flush a final partial UTF-8 scalar or isolated UTF-16 high surrogate without ending the screen session. */
  flushInput(): void {
    this.#writeDecoded(this.#decoder.decode(), true);
  }

  #writeDecoded(decoded: string, final: boolean): void {
    let text = this.#pendingControl + this.#pendingHighSurrogate + decoded;
    this.#pendingControl = "";
    this.#pendingHighSurrogate = "";
    if (this.#discardingString) {
      // Inside a string sequence too large to buffer: swallow until ST. The
      // sequence was already judged inert, so dropping its payload loses
      // nothing — but letting any of it print would be the bug this mode
      // exists to prevent.
      const end = text.indexOf("\x1b\\");
      if (end < 0) {
        // ST itself can split across writes; keep a trailing ESC so the pair
        // is seen whole next time.
        if (text.endsWith("\x1b")) this.#pendingControl = "\x1b";
        return;
      }
      this.#discardingString = false;
      text = text.slice(end + 2);
    }
    for (let index = 0; index < text.length;) {
      const char = readTerminalGraphic(text, index);
      if (char === "\x1b") {
        const parsed = parseTerminalControlSequence(text, index);
        if (parsed) {
          this.#applyControl(parsed);
          index += parsed.length;
          continue;
        }
        const suffix = text.slice(index);
        if (incompleteTerminalControl(suffix)) {
          if (suffix.length < MAX_PENDING_CONTROL_LENGTH) {
            this.#pendingControl = suffix;
          } else {
            const opener = suffix[1];
            if (opener === "P" || opener === "_" || opener === "^" || opener === "X") {
              // A string payload larger than the pending cap — a kitty
              // graphics transmit can run to megabytes. Stop buffering and
              // discard to the terminator instead of dropping the buffer and
              // printing whatever half of the payload arrives next.
              this.#discardingString = true;
              if (opener === "_" && suffix.startsWith("\x1b_G")) this.#kittyGraphicsConsumed += 1;
            }
          }
          break;
        }
      }
      if (!final && index + 1 === text.length && char >= "\ud800" && char <= "\udbff") {
        this.#pendingHighSurrogate = char;
        break;
      }
      this.#writeChar(char);
      index += char.length;
    }
  }

  resize(columns: number, rows: number): void {
    const nextColumns = normalizeTerminalDimension(columns, this.#columns);
    const nextRows = normalizeTerminalDimension(rows, this.#rows);
    if (nextColumns === this.#columns && nextRows === this.#rows) return;
    this.#endGlyphRun();
    const previousColumns = this.#columns;
    this.#columns = nextColumns;
    this.#rows = nextRows;
    const widthChanged = previousColumns !== nextColumns;
    if (this.#mainState) {
      // Alternate screen has no scrollback and never reflows; main screen
      // underneath reflows soft-wrapped lines on width changes and preserves
      // its cursor row by pushing/pulling against scrollback.
      this.#state = resizeState(this.#state, nextColumns, nextRows);
      const resizedMain = this.#resizeMainState(
        this.#mainState,
        previousColumns,
        nextColumns,
        nextRows,
        this.#savedCursor.main,
      );
      this.#mainState = resizedMain.state;
      this.#applyResizedSavedCursor(
        this.#savedCursor.main,
        resizedMain.savedCursor,
        resizedMain.rowShift,
        widthChanged,
      );
      this.#shiftSavedCursor(this.#savedCursor.alternate, 0, widthChanged);
    } else {
      const resizedMain = this.#resizeMainState(
        this.#state,
        previousColumns,
        nextColumns,
        nextRows,
        this.#savedCursor.main,
      );
      this.#state = resizedMain.state;
      this.#applyResizedSavedCursor(
        this.#savedCursor.main,
        resizedMain.savedCursor,
        resizedMain.rowShift,
        widthChanged,
      );
      this.#shiftSavedCursor(this.#savedCursor.alternate, 0, widthChanged);
    }
    this.#recountGlyphs();
    // Narrowing (on alternate or non-reflowing screens) can slice a wide glyph off at the new right edge.
    for (const row of this.#state.cells) this.#repairRow(row);
    if (this.#mainState) { for (const row of this.#mainState.cells) this.#repairRow(row); }
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#horizontalMargins = fullHorizontalMargins(this.#columns);
    this.#tabStops = resizeTabStops(this.#tabStops, previousColumns, this.#columns);
    this.#pendingWrap = false;
  }

  #resizeMainState(
    state: TerminalScreenState,
    previousColumns: number,
    columns: number,
    rows: number,
    savedCursor?: SavedCursorState,
  ): { state: TerminalScreenState; rowShift: number; savedCursor?: TerminalScreenCursor } {
    if (this.#reflowOnResize && columns !== previousColumns) {
      return this.#reflowMainState(state, columns, rows, savedCursor);
    }
    const previousRows = state.cells.length;
    if (rows === previousRows) {
      return { state: resizeState(state, columns, rows), rowShift: 0 };
    }
    if (rows < previousRows) {
      // Like xterm, Ghostty and tmux: drop trailing blank rows below the cursor
      // first, then push excess top rows into scrollback so the cursor row (and
      // an inline TUI's prompt) stays visible instead of being truncated off.
      const delta = previousRows - rows;
      let trimmedBottom = 0;
      for (let row = previousRows - 1; row > state.cursor.row && trimmedBottom < delta; row -= 1) {
        if (!isBlankTerminalRow(state.cells[row]!)) break;
        trimmedBottom += 1;
      }
      const push = Math.min(delta - trimmedBottom, state.cursor.row);
      for (let row = 0; row < push; row += 1) {
        if (this.#scrollbackLimit > 0) {
          this.#scrollback.push(state.cells[row]!);
          if (this.#scrollback.length > this.#scrollbackLimit) this.#scrollback.shift();
        }
      }
      const cells = new Array<TerminalScreenCell[]>(rows);
      for (let row = 0; row < rows; row += 1) {
        const source = state.cells[push + row];
        cells[row] = source ? resizeCellRow(source, columns) : blankRow(columns);
      }
      return {
        state: {
          cells,
          cursor: {
            column: clamp(state.cursor.column, 0, columns - 1),
            row: clamp(state.cursor.row - push, 0, rows - 1),
          },
        },
        rowShift: -push,
      };
    }
    // Growing taller pulls recent rows back out of scrollback before padding
    // blank rows at the bottom, keeping inline cursor addressing in step.
    const delta = rows - previousRows;
    const pulled = Math.min(delta, this.#scrollback.length);
    const restored = pulled > 0 ? this.#scrollback.splice(this.#scrollback.length - pulled, pulled) : [];
    const cells = new Array<TerminalScreenCell[]>(rows);
    for (let row = 0; row < pulled; row += 1) {
      cells[row] = resizeCellRow(restored[row]!, columns);
    }
    for (let row = 0; row < previousRows; row += 1) {
      cells[pulled + row] = resizeCellRow(state.cells[row]!, columns);
    }
    for (let row = pulled + previousRows; row < rows; row += 1) {
      cells[row] = blankRow(columns);
    }
    return {
      state: {
        cells,
        cursor: {
          column: clamp(state.cursor.column, 0, columns - 1),
          row: clamp(state.cursor.row + pulled, 0, rows - 1),
        },
      },
      rowShift: pulled,
    };
  }

  #reflowMainState(
    state: TerminalScreenState,
    columns: number,
    rows: number,
    savedCursor?: SavedCursorState,
  ): { state: TerminalScreenState; rowShift: number; savedCursor?: TerminalScreenCursor } {
    const scrollbackCount = this.#scrollback.length;
    const allRows: TerminalScreenCell[][] = [...this.#scrollback, ...state.cells];
    const cursorAbsRow = scrollbackCount + state.cursor.row;
    const savedAbsRow = savedCursor ? scrollbackCount + savedCursor.row : -1;

    // Exclude trailing blank viewport rows below both content and cursor anchors
    // so reflowed lines expand into unused viewport space before scrolling.
    let activeEndRow = Math.max(cursorAbsRow, savedAbsRow);
    for (let row = allRows.length - 1; row > activeEndRow; row -= 1) {
      if (!isBlankTerminalRow(allRows[row]!)) {
        activeEndRow = row;
        break;
      }
    }

    const reflowed: TerminalScreenCell[][] = [];
    let mappedCursor: TerminalScreenCursor = { row: 0, column: 0 };
    let mappedSaved: TerminalScreenCursor | undefined = savedCursor ? { row: 0, column: 0 } : undefined;

    for (let startRow = 0; startRow <= activeEndRow;) {
      let endRow = startRow;
      while (endRow < activeEndRow && allRows[endRow]!.at(-1)?.softWrapped === true) {
        endRow += 1;
      }
      const lineItems: { cell: TerminalScreenCell; width: 1 | 2 }[] = [];
      let cursorOffset: { index: number; trailing: number } | undefined;
      let savedOffset: { index: number; trailing: number } | undefined;

      for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
        const row = allRows[rowIndex]!;
        const isLast = rowIndex === endRow;
        let limit = row.length;
        if (!isLast) {
          while (limit > 0 && row[limit - 1]?.wrapPadding) limit -= 1;
        } else {
          while (limit > 0 && isDefaultBlankCell(row[limit - 1])) limit -= 1;
        }

        for (let column = 0; column < limit;) {
          const cell = row[column]!;
          if (cell.continuation) {
            column += 1;
            continue;
          }
          const wide = column + 1 < limit && row[column + 1]?.continuation === true;
          const width: 1 | 2 = wide ? 2 : 1;
          const itemIndex = lineItems.length;
          if (
            rowIndex === cursorAbsRow &&
            (state.cursor.column === column || (wide && state.cursor.column === column + 1))
          ) {
            cursorOffset = { index: itemIndex, trailing: 0 };
          }
          if (
            savedCursor && rowIndex === savedAbsRow &&
            (savedCursor.column === column || (wide && savedCursor.column === column + 1))
          ) {
            savedOffset = { index: itemIndex, trailing: 0 };
          }
          lineItems.push({ cell: stripWrapMetadata(cell), width });
          column += width;
        }

        if (rowIndex === cursorAbsRow && !cursorOffset) {
          cursorOffset = { index: lineItems.length, trailing: Math.max(0, state.cursor.column - limit) };
        }
        if (savedCursor && rowIndex === savedAbsRow && !savedOffset) {
          savedOffset = { index: lineItems.length, trailing: Math.max(0, savedCursor.column - limit) };
        }
      }

      const packed = packLogicalLine(lineItems, columns, cursorOffset, savedOffset, reflowed.length);
      for (const packedRow of packed.rows) reflowed.push(packedRow);
      if (packed.cursor) mappedCursor = packed.cursor;
      if (packed.saved) mappedSaved = packed.saved;

      startRow = endRow + 1;
    }

    const total = reflowed.length;
    let visibleStart = 0;
    if (total > rows) {
      visibleStart = total - rows;
      if (mappedCursor.row < visibleStart) visibleStart = mappedCursor.row;
    }

    const nextScrollback = visibleStart > 0 ? reflowed.slice(0, visibleStart) : [];
    if (nextScrollback.length > this.#scrollbackLimit) {
      nextScrollback.splice(0, nextScrollback.length - this.#scrollbackLimit);
    }
    this.#scrollback = nextScrollback;

    const cells = new Array<TerminalScreenCell[]>(rows);
    for (let row = 0; row < rows; row += 1) {
      cells[row] = reflowed[visibleStart + row] ?? blankRow(columns);
    }

    return {
      state: {
        cells,
        cursor: {
          row: clamp(mappedCursor.row - visibleStart, 0, rows - 1),
          column: clamp(mappedCursor.column, 0, columns - 1),
        },
      },
      rowShift: 0,
      ...(mappedSaved
        ? {
          savedCursor: {
            row: clamp(mappedSaved.row - visibleStart, 0, rows - 1),
            column: clamp(mappedSaved.column, 0, columns - 1),
          },
        }
        : {}),
    };
  }

  #applyResizedSavedCursor(
    saved: SavedCursorState | undefined,
    mapped: TerminalScreenCursor | undefined,
    rowShift: number,
    widthChanged: boolean,
  ): void {
    if (!saved) return;
    if (mapped) {
      saved.row = clamp(mapped.row, 0, this.#rows - 1);
      saved.column = clamp(mapped.column, 0, this.#columns - 1);
      if (widthChanged) saved.pendingWrap = false;
      return;
    }
    this.#shiftSavedCursor(saved, rowShift, widthChanged);
  }

  #shiftSavedCursor(saved: SavedCursorState | undefined, rowShift: number, widthChanged: boolean): void {
    if (!saved) return;
    saved.row = clamp(saved.row + rowShift, 0, this.#rows - 1);
    saved.column = clamp(saved.column, 0, this.#columns - 1);
    if (widthChanged || rowShift !== 0) saved.pendingWrap = false;
  }

  clear(): void {
    this.#endGlyphRun();
    this.#decoder.decode();
    this.#pendingControl = "";
    this.#pendingHighSurrogate = "";
    this.#discardingString = false;
    this.#state.cells = createRows(this.#columns, this.#rows);
    this.#recountGlyphs();
    this.#state.cursor = { column: 0, row: 0 };
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#horizontalMargins = fullHorizontalMargins(this.#columns);
    this.#tabStops = defaultTabStops(this.#columns);
    this.#charsetDecGraphics[0] = false;
    this.#charsetDecGraphics[1] = false;
    this.#activeCharset = 0;
    this.#pendingWrap = false;
  }

  textRows(): string[] {
    return terminalCellRowsToText(this.#state.cells);
  }

  cellRows(): TerminalScreenCell[][] {
    return cloneTerminalCellRows(this.#state.cells);
  }

  scrollbackTextRows(): string[] {
    return terminalCellRowsToText(this.#scrollback);
  }

  /** Styled scrollback rows for renderers that need color-preserving history. */
  scrollbackCellRows(): TerminalScreenCell[][] {
    return cloneTerminalCellRows(this.#scrollback);
  }

  /** Clones only one combined scrollback/live row range for viewport renderers. */
  cellRowsRange(offset: number, count: number): TerminalScreenCell[][] {
    const totalRows = this.#scrollback.length + this.#state.cells.length;
    const start = clamp(Math.floor(Number.isFinite(offset) ? offset : 0), 0, totalRows);
    const length = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    const end = Math.min(totalRows, start + length);
    const rows = new Array<TerminalScreenCell[]>(end - start);
    for (let index = start; index < end; index += 1) {
      const source = index < this.#scrollback.length
        ? this.#scrollback[index]!
        : this.#state.cells[index - this.#scrollback.length]!;
      rows[index - start] = cloneTerminalCellRow(source);
    }
    return rows;
  }

  inspect(): TerminalScreenInspection {
    return {
      columns: this.#columns,
      rows: this.#rows,
      cursor: this.cursor,
      cursorVisible: this.#cursorVisible,
      cursorStyle: { ...this.#cursorStyle },
      privateModes: sortedPrivateModes(this.#privateModes),
      scrollbackRows: this.#scrollback.length,
      alternate: this.alternate,
      title: this.#title,
      workingDirectory: this.#workingDirectory,
    };
  }

  #writeChar(char: string): void {
    if (char < " ") this.#endGlyphRun();
    // LF, VT and FF all index. They return to column 0 only under LNM; treating
    // them as newlines unconditionally drags every `cud1` cursor-down to the
    // left edge, which corrupts any full-screen app that moves down a column at
    // a time — and does it right where the app was drawing.
    if (char === "\n" || char === "\v" || char === "\f") {
      this.#pendingWrap = false;
      if (this.#lineFeedNewline) this.#state.cursor.column = this.#activeLeftMargin();
      this.#index();
      return;
    }
    if (char === "\r") {
      this.#pendingWrap = false;
      this.#state.cursor.column = this.#activeLeftMargin();
      return;
    }
    if (char === "\b") {
      this.#pendingWrap = false;
      this.#state.cursor.column = Math.max(this.#activeLeftMargin(), this.#state.cursor.column - 1);
      return;
    }
    if (char === "\x0e") {
      this.#activeCharset = 1;
      return;
    }
    if (char === "\x0f") {
      this.#activeCharset = 0;
      return;
    }
    if (char === "\t") {
      this.#pendingWrap = false;
      this.#state.cursor.column = nextTabStop(this.#tabStops, this.#state.cursor.column, this.#columns);
      return;
    }
    if (char < " ") return;

    const glyph = this.#charsetDecGraphics[this.#activeCharset] ? DEC_SPECIAL_GRAPHICS[char] ?? char : char;
    if (this.#leadingGlyph && this.#appendLeadingGlyph(glyph)) return;
    // Scalars arrive incrementally, including across UTF-8 and SGR boundaries.
    // Grapheme boundaries, not a zero-width guess, decide whether Indic, Hangul,
    // regional indicators or an emoji sequence belongs to the preceding cell.
    if (this.#combineWithPreviousGlyph(glyph, measureCharacterWidth(glyph) === 0)) return;
    const width = terminalGraphicWidth(glyph);
    const cell = this.#styledCell(glyph);
    this.#placeGlyph(cell, width);
    this.#lastPrintableCell = { ...cell };
    this.#lastPrintableWidth = width;
  }

  /** Extend one bounded grapheme, retaining its first scalar's cell attributes. */
  #combineWithPreviousGlyph(glyph: string, zeroWidth: boolean): boolean {
    const row = this.#state.cells[this.#state.cursor.row];
    if (!row) return zeroWidth ? this.#holdLeadingGlyph(glyph) : false;
    const cursorColumn = this.#state.cursor.column;
    let column = this.#pendingWrap || row[cursorColumn] === this.#graphemeCell ? cursorColumn : cursorColumn - 1;
    // Step back over a wide glyph's continuation to the cell that owns the pair.
    while (column > 0 && row[column]?.continuation) column -= 1;
    if (column < 0 || column >= this.#columns) return zeroWidth ? this.#holdLeadingGlyph(glyph) : false;
    const base = row[column];
    if (!base || base !== this.#graphemeCell) return zeroWidth ? this.#holdLeadingGlyph(glyph) : false;
    // Ordinary ASCII streams retain their allocation-free boundary shortcut.
    if (
      !zeroWidth && glyph.length === 1 && glyph.charCodeAt(0) < 0x80 && base.char.length === 1 &&
      base.char.charCodeAt(0) < 0x80
    ) {
      return false;
    }
    if (this.#glyphContextCell !== base) {
      this.#glyphBoundary.reset();
      this.#glyphWidth.reset();
      for (const scalar of base.char) {
        const codePoint = scalar.codePointAt(0)!;
        this.#glyphBoundary.push(codePoint);
        this.#glyphWidth.push(codePoint);
      }
      this.#glyphContextCell = base;
      this.#discardingGlyph = false;
    }
    const codePoint = glyph.codePointAt(0)!;
    if (this.#glyphBoundary.push(codePoint)) {
      this.#glyphContextCell = undefined;
      this.#discardingGlyph = false;
      return zeroWidth ? this.#holdLeadingGlyph(glyph) : false;
    }
    if (this.#discardingGlyph) return true;
    let width = Math.max(1, this.#glyphWidth.push(codePoint));
    const length = base.char.length + glyph.length;
    const extra = Math.max(0, length - 2) - glyphExtra(base);
    const rejected = length > this.#maxGlyphUtf16Units ||
      extra > this.#maxRetainedGlyphExtraUtf16Units - this.#retainedGlyphExtraUtf16Units;
    const char = rejected ? "\ufffd" : base.char + glyph;
    if (rejected) {
      this.#rejectGlyph();
      this.#discardingGlyph = true;
      width = 1;
    }
    const combined: TerminalScreenCell = { ...base, char };
    const oldWidth = row[column + 1]?.continuation ? 2 : 1;
    const rightEdge = this.#activeRightMargin();
    if (width > oldWidth && column + width > rightEdge + 1) {
      // A variation selector/keycap can widen a glyph already at the margin.
      // Re-place the whole glyph, letting the normal wrap path own padding,
      // scrolling and scroll-region boundaries; never leave the old base.
      this.#replaceGlyphCell(row, column, this.#blankLike(base));
      this.#state.cursor.column = column;
      this.#pendingWrap = false;
      this.#placeGlyph(combined, width);
    } else {
      if (width > oldWidth) {
        if (this.#insertMode) {
          shiftCellsRight(row, column + oldWidth, width - oldWidth, rightEdge + 1, BLANK_CELL);
          this.#accountGlyphRow(row);
        } else {
          this.#breakPairAt(column + oldWidth);
        }
        this.#replaceGlyphCell(row, column + 1, CONTINUATION_CELL);
      } else if (width < oldWidth) {
        this.#replaceGlyphCell(row, column + 1, this.#blankLike(row[column + 1]));
      }
      const lastColumn = column + width - 1;
      this.#state.cursor.column = Math.min(rightEdge, lastColumn + 1);
      this.#pendingWrap = this.#autoWrap && lastColumn >= rightEdge;
      this.#replaceGlyphCell(row, column, combined);
      this.#graphemeCell = combined;
      if (this.#insertMode && width !== oldWidth) this.#repairRow(row);
    }
    this.#glyphContextCell = this.#graphemeCell;
    // REP repeats what is on screen, marks included.
    if (this.#lastPrintableCell) {
      this.#lastPrintableCell = { ...combined };
      this.#lastPrintableWidth = width;
    }
    return true;
  }

  #holdLeadingGlyph(glyph: string): true {
    this.#endGlyphRun();
    this.#glyphBoundary.reset();
    this.#glyphWidth.reset();
    const codePoint = glyph.codePointAt(0)!;
    this.#glyphBoundary.push(codePoint);
    this.#glyphWidth.push(codePoint);
    this.#leadingGlyph = this.#styledCell(glyph);
    if (glyph.length > this.#maxGlyphUtf16Units) this.#appendLeadingGlyph("");
    return true;
  }

  #appendLeadingGlyph(glyph: string): boolean {
    const leading = this.#leadingGlyph!;
    if (glyph && this.#glyphBoundary.push(glyph.codePointAt(0)!)) {
      this.#endGlyphRun();
      return false;
    }
    const width = glyph ? this.#glyphWidth.push(glyph.codePointAt(0)!) : 0;
    const rejected = leading.char.length + glyph.length > this.#maxGlyphUtf16Units;
    const cell = { ...leading, char: rejected ? "\ufffd" : leading.char + glyph };
    if (!width && !rejected) {
      this.#leadingGlyph = cell;
      return true;
    }
    this.#leadingGlyph = undefined;
    if (rejected) this.#rejectGlyph();
    this.#placeGlyph(cell, rejected ? 1 : width);
    this.#glyphContextCell = this.#graphemeCell;
    this.#discardingGlyph = rejected || this.#graphemeCell?.char !== cell.char;
    if (this.#graphemeCell) {
      this.#lastPrintableCell = { ...this.#graphemeCell };
      this.#lastPrintableWidth = terminalGraphicWidth(this.#graphemeCell.char);
    }
    return true;
  }

  #markSoftWrap(padding = false): void {
    const row = this.#state.cells[this.#state.cursor.row]!;
    const last = this.#columns - 1;
    row[last] = { ...row[last]!, softWrapped: true, ...(padding ? { wrapPadding: true } : {}) };
  }

  #placeGlyph(cell: TerminalScreenCell, width: number): void {
    const initialRight = this.#activeRightMargin();
    const wrapLeft = this.#leftRightMarginsMode ? this.#horizontalMargins.left : 0;
    const regionWidth = initialRight - wrapLeft + 1;
    // A wide glyph needs both columns even with DECAWM disabled or a one-cell
    // margin region. Omit it whole, rather than storing an owner no renderer can pair.
    if (
      width > this.#columns || width > regionWidth ||
      (width === 2 && !this.#autoWrap && this.#state.cursor.column === initialRight)
    ) {
      this.#breakPairAt(this.#state.cursor.column);
      this.#putCellAt(this.#state.cursor.column, this.#blankLike(cell), true);
      this.#endGlyphRun();
      this.#pendingWrap = false;
      return;
    }
    const splitHorizontal = this.#hasHorizontalMargins();
    // Resolve a wrap deferred from a previous edge write before placing this glyph.
    if (this.#pendingWrap) {
      if (this.#autoWrap) {
        if (!splitHorizontal) this.#markSoftWrap();
        this.#state.cursor.column = wrapLeft;
        this.#index();
      }
      this.#pendingWrap = false;
    }
    const rightEdge = this.#activeRightMargin();
    // A double-width glyph that cannot fit in the final column wraps first.
    if (width === 2 && this.#autoWrap && this.#state.cursor.column >= rightEdge) {
      this.#putCellAt(this.#state.cursor.column, BLANK_CELL, false);
      if (!splitHorizontal) this.#markSoftWrap(true);
      this.#state.cursor.column = wrapLeft;
      this.#index();
    }
    const startColumn = this.#state.cursor.column;
    // Landing on either half of an existing wide pair erases the whole pair, so
    // no orphaned glyph or continuation is left behind to shift the row.
    this.#breakPairAt(startColumn);
    if (width === 2) this.#breakPairAt(startColumn + 1);
    const placed = this.#putCellAt(startColumn, cell, true);
    if (placed !== cell) {
      cell = placed;
      width = 1;
    }
    const activeRight = this.#activeRightMargin();
    const lastColumn = Math.min(activeRight, startColumn + width - 1);
    for (let column = startColumn + 1; column <= lastColumn; column += 1) {
      this.#putCellAt(column, CONTINUATION_CELL, false);
    }
    // Insert mode shifted the rest of the row, which can cut a pair further along.
    if (this.#insertMode) this.#repairRow(this.#state.cells[this.#state.cursor.row]!);
    this.#graphemeCell = cell;
    if (lastColumn >= activeRight) {
      // At the right margin park the cursor and defer the wrap; only the next
      // printable character (if autowrap is on) actually advances + scrolls.
      this.#state.cursor.column = activeRight;
      this.#pendingWrap = this.#autoWrap;
    } else {
      this.#state.cursor.column = lastColumn + 1;
    }
  }

  /**
   * Erases both halves of any double-width pair overlapping a column that is
   * about to be overwritten. A real terminal cannot show half a wide glyph, and
   * leaving one behind desynchronises every renderer that trusts the pairing.
   */
  #breakPairAt(column: number): void {
    const row = this.#state.cells[this.#state.cursor.row];
    if (!row || column < 0 || column >= this.#columns) return;
    if (row[column]?.continuation && column > 0) {
      this.#replaceGlyphCell(row, column - 1, this.#blankLike(row[column - 1]));
    }
    if (row[column + 1]?.continuation && terminalGraphicWidth(row[column]?.char ?? " ") === 2) {
      this.#replaceGlyphCell(row, column + 1, this.#blankLike(row[column + 1]));
    }
  }

  /**
   * Restores the wide-pair invariant across one row after an edit that moved or
   * cleared cells wholesale. A continuation with no glyph in front of it, and a
   * wide glyph with no continuation behind it, are both erased.
   */
  #repairRow(row: TerminalScreenCell[]): void {
    for (let column = 0; column < this.#columns;) {
      const cell = row[column];
      if (cell?.continuation) {
        // Reached at the top of the loop, so no wide glyph claimed it.
        this.#replaceGlyphCell(row, column, this.#blankLike(cell));
        column += 1;
        continue;
      }
      if (terminalGraphicWidth(cell?.char ?? " ") === 2) {
        if (column + 1 < this.#columns && row[column + 1]?.continuation) {
          column += 2;
          continue;
        }
        this.#replaceGlyphCell(row, column, this.#blankLike(cell));
      }
      column += 1;
    }
    this.#accountGlyphRow(row);
  }

  /** A blank that keeps the cell's background, so repairs leave no pale gap. */
  #blankLike(cell: TerminalScreenCell | undefined): TerminalScreenCell {
    return cell?.background === undefined ? BLANK_CELL : { char: " ", background: cell.background };
  }

  #putCellAt(column: number, cell: TerminalScreenCell, insert: boolean): TerminalScreenCell {
    const row = this.#state.cells[this.#state.cursor.row]!;
    if (insert && this.#insertMode) {
      const rightBound = this.#activeRightMargin() + 1;
      shiftCellsRight(row, column, 1, rightBound, { char: " " });
      this.#accountGlyphRow(row);
    }
    const available = this.#maxRetainedGlyphExtraUtf16Units - this.#retainedGlyphExtraUtf16Units +
      glyphExtra(row[column]);
    if (cell.char.length > this.#maxGlyphUtf16Units || glyphExtra(cell) > available) {
      cell = { ...cell, char: "\ufffd" };
      this.#rejectGlyph();
    }
    this.#replaceGlyphCell(row, column, cell);
    return cell;
  }

  #replaceGlyphCell(row: TerminalScreenCell[], column: number, cell: TerminalScreenCell): void {
    const difference = glyphExtra(cell) - glyphExtra(row[column]);
    row[column] = cell;
    if (difference) {
      this.#rowGlyphExtras.set(row, (this.#rowGlyphExtras.get(row) ?? 0) + difference);
      this.#retainedGlyphExtraUtf16Units += difference;
    }
  }

  #accountGlyphRow(row: TerminalScreenCell[]): void {
    let extra = 0;
    for (const cell of row) extra += glyphExtra(cell);
    this.#retainedGlyphExtraUtf16Units += extra - (this.#rowGlyphExtras.get(row) ?? 0);
    this.#rowGlyphExtras.set(row, extra);
  }

  #releaseGlyphRow(row: TerminalScreenCell[]): void {
    this.#retainedGlyphExtraUtf16Units -= this.#rowGlyphExtras.get(row) ?? 0;
    this.#rowGlyphExtras.delete(row);
  }

  #recountGlyphs(): void {
    this.#retainedGlyphExtraUtf16Units = 0;
    this.#rowGlyphExtras = new WeakMap();
    for (const row of this.#state.cells) this.#accountGlyphRow(row);
    for (const row of this.#mainState?.cells ?? []) this.#accountGlyphRow(row);
    for (const row of this.#scrollback) this.#accountGlyphRow(row);
  }

  #rejectGlyph(): void {
    this.#rejectedClusters = Math.min(Number.MAX_SAFE_INTEGER, this.#rejectedClusters + 1);
  }

  #endGlyphRun(): void {
    this.#graphemeCell = this.#glyphContextCell = undefined;
    this.#leadingGlyph = undefined;
    this.#discardingGlyph = false;
  }

  /**
   * Background-colour erase: cells vacated by an erase, insert/delete or scroll
   * take the active SGR background (foreground and attributes are not carried),
   * so clearing or scrolling inside a coloured pane leaves no default-coloured
   * gaps. Falls back to the shared blank cell when no background is set.
   */
  #eraseCell(): TerminalScreenCell {
    const background = this.#style.background;
    return background === undefined ? BLANK_CELL : { char: " ", background };
  }

  #eraseRow(): TerminalScreenCell[] {
    return new Array<TerminalScreenCell>(this.#columns).fill(this.#eraseCell());
  }

  /** NEL: unlike a bare LF this always returns to the active left margin (column 0 without DECLRMM). */
  #newline(): void {
    this.#state.cursor.column = this.#activeLeftMargin();
    this.#index();
  }

  #index(): void {
    if (
      this.#hasHorizontalMargins() &&
      (this.#state.cursor.column < this.#horizontalMargins.left ||
        this.#state.cursor.column > this.#horizontalMargins.right)
    ) {
      if (this.#state.cursor.row < this.#rows - 1) this.#state.cursor.row += 1;
      return;
    }
    if (this.#state.cursor.row === this.#scrollRegion.bottom) {
      this.#scrollRegionUp(this.#scrollRegion.top, this.#scrollRegion.bottom, 1);
      return;
    }
    if (this.#state.cursor.row < this.#rows - 1) {
      this.#state.cursor.row += 1;
      return;
    }
    // The cursor sits on the last screen row but below the scroll region — as
    // tmux keeps its status line. A linefeed there scrolls nothing and the
    // cursor stays put; scrolling the whole screen would corrupt every row.
  }

  #hasHorizontalMargins(): boolean {
    return this.#leftRightMarginsMode &&
      (this.#horizontalMargins.left > 0 || this.#horizontalMargins.right < this.#columns - 1);
  }

  #activeLeftMargin(): number {
    return this.#leftRightMarginsMode && this.#state.cursor.column >= this.#horizontalMargins.left
      ? this.#horizontalMargins.left
      : 0;
  }

  #activeRightMargin(): number {
    return this.#leftRightMarginsMode && this.#state.cursor.column <= this.#horizontalMargins.right
      ? this.#horizontalMargins.right
      : this.#columns - 1;
  }

  #homeColumn(): number {
    return this.#originMode ? this.#horizontalMargins.left : 0;
  }

  #homeRow(): number {
    return this.#originMode ? this.#scrollRegion.top : 0;
  }

  #applyControl(sequence: ParsedTerminalControlSequence): void {
    if (
      sequence.kind === "csi" && sequence.command === "n" && !sequence.prefix &&
      !sequence.intermediates && sequence.params === "6"
    ) {
      const { row, column } = this.#state.cursor;
      this.#onCursorPositionQuery?.(
        Math.max(1, row + 1 - (this.#originMode ? this.#scrollRegion.top : 0)),
        Math.max(1, column + 1 - (this.#originMode ? this.#horizontalMargins.left : 0)),
      );
      return;
    }
    if (this.#applyQuery(sequence) || this.#applyKeyboardProtocol(sequence)) return;
    // Any control sequence other than a pure style change (SGR `m`) ends the
    // printable grapheme run. The deferred-wrap latch, however, only clears on
    // cursor movement, cell edits, resets, and modes that reposition the cursor
    // or turn autowrap off — cursor visibility (`?25l`/`?25h`), synchronized
    // output (`?2026h`/`?2026l`), OSC title/hyperlink, DECSCUSR, DECST8C, and
    // DECSC all leave a pending wrap intact, matching xterm and Ghostty.
    if (!(sequence.kind === "csi" && sequence.command === "m" && !sequence.private && !sequence.intermediates)) {
      this.#endGlyphRun();
      if (!preservesPendingWrap(sequence)) this.#pendingWrap = false;
    }
    if (sequence.kind === "osc") {
      this.#applyOsc(sequence.params);
      return;
    }
    // DCS/APC/PM/SOS are consumed whole and change nothing. APC is the one
    // that arrives in practice: the kitty graphics protocol ships images as
    // `ESC _ G … ESC \`, and an application told (or misled) that its
    // terminal draws images will send screenfuls of base64 through here. This
    // model does not render them — yet — but the honest failure is a blank
    // where the image would be, never the payload as text.
    if (
      sequence.kind === "dcs" || sequence.kind === "apc" || sequence.kind === "pm" || sequence.kind === "sos"
    ) {
      if (sequence.kind === "apc" && sequence.params.startsWith("G")) {
        this.#kittyGraphicsConsumed += 1;
        // Handed over with the cursor at this instant, because that is the
        // cell kitty anchors a display command to — a relay that captures the
        // sequence without the cursor has lost the placement.
        this.#onKittyGraphics?.(sequence.params, {
          row: this.#state.cursor.row,
          column: this.#state.cursor.column,
        });
      }
      return;
    }
    if (sequence.kind === "esc" && sequence.intermediates) {
      this.#applyEscIntermediates(sequence.intermediates, sequence.command);
      return;
    }
    // Keypad application/numeric modes are recognized so their bytes never
    // leak into the grid; the screen model itself needs no keypad state.
    if (sequence.kind === "esc" && (sequence.command === "=" || sequence.command === ">")) return;
    // xterm private-parameter extensions (`ESC [ < … `, `ESC [ = … `, `ESC [ > … `):
    // secondary/tertiary DA, XTVERSION and modifyOtherKeys. tmux emits these on
    // every attach. They carry no screen-model effect, but must be consumed so
    // neither their bytes nor their parameters reach the grid or the SGR state.
    if (sequence.kind === "csi" && sequence.prefix && sequence.prefix !== "?") return;
    // XTWINOPS: size queries are surfaced to the subscriber; every other
    // window op (resize and move requests, iconify) is consumed silently — a
    // child does not get to reshape the window a compositor gave it, and the
    // bytes must never reach the grid.
    if (sequence.kind === "csi" && sequence.command === "t" && !sequence.private) {
      const op = Number.parseInt(sequence.params, 10);
      if (op === 14 || op === 16 || op === 18) this.#onWindowSizeQuery?.(op);
      return;
    }
    // SGR colon subparameters and extended-color channels are atomic. The
    // generic cursor/mode parser deliberately flattens them and cannot be used here.
    if (sequence.command === "m") {
      if (sequence.kind === "csi" && !sequence.private && !sequence.intermediates) {
        this.#applySgr(sequence.params);
      }
      return;
    }
    const params = parseTerminalParams(sequence.params);
    if (sequence.private && (sequence.command === "h" || sequence.command === "l")) {
      this.#applyPrivateModes(params, sequence.command === "h");
      return;
    }
    if (sequence.command === "h" || sequence.command === "l") {
      this.#applyModes(params, sequence.command === "h");
      return;
    }
    if (sequence.kind === "csi") {
      // DECST8C (`CSI ? 5 W`): reset tab stops to every 8 columns. Cellbuf/
      // Bubble Tea renderers emit this before horizontal tab positioning.
      if (sequence.private && !sequence.intermediates && sequence.command === "W" && sequence.params === "5") {
        this.#tabStops = defaultTabStops(this.#columns);
        return;
      }
      // A private marker or an intermediate byte makes a different function of
      // the same final byte: `CSI ? u` asks for the kitty keyboard flags, it is
      // not SCORC; `CSI ? … r` restores DEC modes, it is not DECSTBM. Treating
      // them as their unmarked namesakes moved the cursor and the scroll region
      // under programs that had asked for neither. Only the selective erases
      // (DECSED, DECSEL) share their plain form's effect here, since this model
      // has no protected cells, and DECSCUSR is the one intermediate it acts on.
      if (sequence.private && sequence.command !== "J" && sequence.command !== "K") return;
      if (
        sequence.intermediates &&
        !(sequence.command === "q" && sequence.intermediates === " ") &&
        !(sequence.intermediates === "'" && (sequence.command === "}" || sequence.command === "~"))
      ) {
        return;
      }
    }
    switch (sequence.command) {
      case "H":
        if (sequence.kind === "esc") {
          this.#setTabStop();
          break;
        }
        this.#setCursorPosition(params[0] ?? 1, params[1] ?? 1);
        break;
      case "f":
        this.#setCursorPosition(params[0] ?? 1, params[1] ?? 1);
        break;
      case "A": {
        const minRow = this.#state.cursor.row >= this.#scrollRegion.top ? this.#scrollRegion.top : 0;
        this.#state.cursor.row = clamp(this.#state.cursor.row - (params[0] || 1), minRow, this.#rows - 1);
        break;
      }
      case "B": {
        const maxRow = this.#state.cursor.row <= this.#scrollRegion.bottom ? this.#scrollRegion.bottom : this.#rows - 1;
        this.#state.cursor.row = clamp(this.#state.cursor.row + (params[0] || 1), 0, maxRow);
        break;
      }
      case "C":
      case "a": {
        const maxCol = this.#activeRightMargin();
        this.#state.cursor.column = clamp(this.#state.cursor.column + (params[0] || 1), 0, maxCol);
        break;
      }
      case "D":
        if (sequence.kind === "esc") {
          this.#index();
          break;
        }
        this.#state.cursor.column = clamp(
          this.#state.cursor.column - (params[0] || 1),
          this.#activeLeftMargin(),
          this.#columns - 1,
        );
        break;
      case "E": {
        if (sequence.kind === "esc") {
          this.#newline();
          break;
        }
        const maxRow = this.#state.cursor.row <= this.#scrollRegion.bottom ? this.#scrollRegion.bottom : this.#rows - 1;
        this.#state.cursor.row = clamp(this.#state.cursor.row + (params[0] || 1), 0, maxRow);
        this.#state.cursor.column = this.#activeLeftMargin();
        break;
      }
      case "F": {
        const minRow = this.#state.cursor.row >= this.#scrollRegion.top ? this.#scrollRegion.top : 0;
        this.#state.cursor.row = clamp(this.#state.cursor.row - (params[0] || 1), minRow, this.#rows - 1);
        this.#state.cursor.column = this.#activeLeftMargin();
        break;
      }
      case "G":
      case "`":
        this.#state.cursor.column = this.#originMode
          ? clamp(
            this.#horizontalMargins.left + (params[0] || 1) - 1,
            this.#horizontalMargins.left,
            this.#horizontalMargins.right,
          )
          : clamp((params[0] || 1) - 1, 0, this.#columns - 1);
        break;
      case "d":
        this.#state.cursor.row = this.#originMode
          ? clamp(this.#scrollRegion.top + (params[0] || 1) - 1, this.#scrollRegion.top, this.#scrollRegion.bottom)
          : clamp((params[0] || 1) - 1, 0, this.#rows - 1);
        break;
      case "e": {
        const maxRow = this.#state.cursor.row <= this.#scrollRegion.bottom ? this.#scrollRegion.bottom : this.#rows - 1;
        this.#state.cursor.row = clamp(this.#state.cursor.row + (params[0] || 1), 0, maxRow);
        break;
      }
      case "I":
        this.#cursorForwardTabs(params[0] || 1);
        break;
      case "Z":
        this.#cursorBackwardTabs(params[0] || 1);
        break;
      case "b":
        this.#repeatLastPrintable(params[0] || 1);
        break;
      case "c":
        if (sequence.kind === "esc") this.#reset();
        break;
      case "g":
        this.#clearTabStops(params[0] ?? 0);
        break;
      case "J":
        this.#eraseDisplay(params[0] ?? 0);
        break;
      case "K":
        this.#eraseLine(params[0] ?? 0);
        break;
      case "@":
        this.#insertCharacters(params[0] || 1);
        break;
      case "P":
        this.#deleteCharacters(params[0] || 1);
        break;
      case "X":
        this.#eraseCharacters(params[0] || 1);
        break;
      case "L":
        this.#insertLines(params[0] || 1);
        break;
      case "M":
        if (sequence.kind === "esc") this.#reverseIndex();
        else this.#deleteLines(params[0] || 1);
        break;
      case "S":
        this.#scrollRegionUp(this.#scrollRegion.top, this.#scrollRegion.bottom, params[0] || 1);
        break;
      case "T":
        this.#scrollRegionDown(this.#scrollRegion.top, this.#scrollRegion.bottom, params[0] || 1);
        break;
      case "r":
        this.#setScrollRegion(params);
        break;
      case "q":
        if (sequence.intermediates === " ") this.#applyCursorStyle(params[0] ?? 0);
        break;
      case "}":
        if (sequence.intermediates === "'") this.#insertColumns(params[0] || 1);
        break;
      case "~":
        if (sequence.intermediates === "'") this.#deleteColumns(params[0] || 1);
        break;
      case "s":
        if (sequence.kind === "csi") {
          if (this.#leftRightMarginsMode) this.#setHorizontalMargins(params);
          else if (params.length === 0) this.#saveCursor();
        }
        break;
      case "7":
        this.#saveCursor();
        break;
      case "u":
      case "8":
        this.#restoreCursor();
        break;
    }
  }

  /** Answers the queries this model can answer from its own state. True when the sequence was a query. */
  #applyQuery(sequence: ParsedTerminalControlSequence): boolean {
    if (sequence.kind === "dcs") {
      // DECRQSS: only the settings this model holds are valid requests.
      if (sequence.params.startsWith("$q")) {
        const setting = sequence.params.slice(2);
        if (setting === " q") this.#reply(`\x1bP1$r${this.#cursorStyleCode} q\x1b\\`);
        else if (setting === "r") {
          this.#reply(`\x1bP1$r${this.#scrollRegion.top + 1};${this.#scrollRegion.bottom + 1}r\x1b\\`);
        } else if (setting === "s" && this.#leftRightMarginsMode) {
          this.#reply(`\x1bP1$r${this.#horizontalMargins.left + 1};${this.#horizontalMargins.right + 1}s\x1b\\`);
        } else if (setting === "m") {
          this.#reply(`\x1bP1$r${formatSgrState(this.#style)}m\x1b\\`);
        } else this.#reply("\x1bP0$r\x1b\\");
        return true;
      }
      // XTGETTCAP: no capability is served, and saying so beats a timeout.
      if (sequence.params.startsWith("+q")) {
        this.#reply("\x1bP0+r\x1b\\");
        return true;
      }
      return false;
    }
    if (sequence.kind === "osc") {
      const match = /^(10|11);\?$/.exec(sequence.params);
      if (!match) return false;
      const colors = this.#queryColors?.();
      const color = match[1] === "10" ? colors?.foreground : colors?.background;
      if (color) this.#reply(`\x1b]${match[1]};rgb:${color.map(colorChannel16).join("/")}\x1b\\`);
      return true;
    }
    if (sequence.kind !== "csi") return false;
    const { prefix, params, intermediates, command } = sequence;
    if (command === "c" && !intermediates && (params === "" || params === "0")) {
      // VT220 with ANSI colour; the secondary answer claims no firmware or cartridge.
      if (prefix === "") this.#reply("\x1b[?62;22c");
      else if (prefix === ">") this.#reply("\x1b[>1;10;0c");
      else return false;
      return true;
    }
    if (command === "q" && prefix === ">" && !intermediates && (params === "" || params === "0")) {
      this.#reply(`\x1bP>|${this.#identity}\x1b\\`);
      return true;
    }
    if (command === "n" && !intermediates) {
      if (prefix === "" && params === "5") this.#reply("\x1b[0n");
      else if (prefix === "?" && params === "6") {
        const { row, column } = this.#state.cursor;
        this.#reply(
          `\x1b[?${Math.max(1, row + 1 - (this.#originMode ? this.#scrollRegion.top : 0))};${
            Math.max(1, column + 1 - (this.#originMode ? this.#horizontalMargins.left : 0))
          }R`,
        );
      } else return false;
      return true;
    }
    if (command === "p" && intermediates === "$" && (prefix === "?" || prefix === "")) {
      const mode = Number.parseInt(params, 10);
      if (Number.isInteger(mode)) {
        const value = prefix === "?" ? this.#privateModeReport(mode) : this.#modeReport(mode);
        this.#reply(`\x1b[${prefix}${mode};${value}$y`);
      }
      return true;
    }
    if (command === "u" && prefix === "?" && !intermediates) {
      this.#reply(`\x1b[?${this.#kittyFlags()}u`);
      return true;
    }
    if (command === "m" && prefix === "?" && !intermediates && params === "4") {
      this.#reply(`\x1b[>4;${this.#modifyOtherKeys}m`);
      return true;
    }
    return false;
  }

  /** DECRQM values: 1 set, 2 reset, 3 permanently set, 0 not recognised. */
  #privateModeReport(mode: number): number {
    if (mode === 25) return this.#cursorVisible ? 1 : 2;
    if (mode === 7) return this.#autoWrap ? 1 : 2;
    // Clusters are always kept whole; there is no unclustered mode to switch to.
    if (mode === 2027) return 3;
    if (!REPORTED_PRIVATE_MODES.has(mode)) return 0;
    return this.#privateModes.has(mode) ? 1 : 2;
  }

  #modeReport(mode: number): number {
    if (mode === 4) return this.#insertMode ? 1 : 2;
    if (mode === 20) return this.#lineFeedNewline ? 1 : 2;
    return 0;
  }

  #reply(data: string): void {
    this.#onReply?.(data);
  }

  /**
   * Tracks the key reporting a child asks for: the kitty keyboard stack
   * (`CSI > flags u` push, `CSI < n u` pop, `CSI = flags ; mode u` set) and
   * xterm's modifyOtherKeys (`CSI > 4 ; level m`). The screen draws nothing
   * differently; its host reads {@linkcode keyboardProtocol} to encode keys the
   * way the child expects.
   */
  #applyKeyboardProtocol(sequence: ParsedTerminalControlSequence): boolean {
    if (sequence.kind !== "csi" || sequence.intermediates) return false;
    const params = parseTerminalParams(sequence.params);
    if (sequence.command === "u") {
      const stack = this.#mainState ? this.#kittyKeyboard.alternate : this.#kittyKeyboard.main;
      if (sequence.prefix === ">") {
        stack.push(clampKittyFlags(params[0] ?? 0));
        if (stack.length > MAX_KITTY_KEYBOARD_STACK) stack.shift();
        return true;
      }
      if (sequence.prefix === "<") {
        stack.splice(Math.max(0, stack.length - Math.max(1, params[0] || 1)));
        return true;
      }
      if (sequence.prefix === "=") {
        const flags = clampKittyFlags(params[0] ?? 0);
        const current = stack.length > 0 ? stack[stack.length - 1]! : 0;
        const mode = params[1] || 1;
        const next = mode === 2 ? current | flags : mode === 3 ? current & ~flags : flags;
        if (stack.length > 0) stack[stack.length - 1] = next;
        else stack.push(next);
        return true;
      }
      return false;
    }
    if (sequence.command === "m" && sequence.prefix === ">") {
      // `CSI > 4 m` resets the resource; other resources (0–3, 6, 7) are not keys this host encodes.
      if (params.length === 0 || params[0] === 4) this.#modifyOtherKeys = clamp(params[1] ?? 0, 0, 2);
      return true;
    }
    if (sequence.command === "n" && sequence.prefix === ">") {
      if (params.length === 0 || params[0] === 4) this.#modifyOtherKeys = 0;
      return true;
    }
    return false;
  }

  #kittyFlags(): number {
    const stack = this.#mainState ? this.#kittyKeyboard.alternate : this.#kittyKeyboard.main;
    return stack.length > 0 ? stack[stack.length - 1]! : 0;
  }

  #applyOsc(payload: string): void {
    const separator = payload.indexOf(";");
    if (separator < 0) {
      if (payload === "104") this.#paletteOverrides.clear();
      return;
    }
    const code = payload.slice(0, separator);
    if (code === "0" || code === "2") {
      this.#title = payload.slice(separator + 1);
      return;
    }
    if (code === "4") {
      this.#applyPaletteOsc(payload.slice(separator + 1));
      return;
    }
    if (code === "104") {
      this.#resetPaletteOsc(payload.slice(separator + 1));
      return;
    }
    if (code === "7") {
      this.#applyWorkingDirectory(payload.slice(separator + 1));
      return;
    }
    if (code === "8") {
      this.#applyHyperlink(payload.slice(separator + 1));
      return;
    }
    if (code === "52" && this.#onClipboardWrite) {
      const write = parseTerminalClipboardWrite(payload.slice(separator + 1), {
        maxBytes: this.#maxClipboardBytes,
      });
      if (write) this.#onClipboardWrite(write);
    }
  }

  #applyPaletteOsc(body: string): void {
    const parts = body.split(";");
    for (let index = 0; index + 1 < parts.length; index += 2) {
      const slot = Number(parts[index]!.trim());
      if (!Number.isInteger(slot) || slot < 0 || slot > 255) continue;
      const spec = parts[index + 1]!.trim();
      if (spec === "?") {
        const color = this.#paletteOverrides.get(slot) ??
          this.#queryColors?.()?.palette?.(slot) ??
          xtermPaletteRgb(slot);
        this.#reply(`\x1b]4;${slot};rgb:${color.map(colorChannel16).join("/")}\x1b\\`);
        continue;
      }
      const parsed = parseOscColorRgb(spec);
      if (parsed) this.#paletteOverrides.set(slot, parsed);
    }
  }

  #resetPaletteOsc(body: string): void {
    const trimmed = body.trim();
    if (trimmed === "") {
      this.#paletteOverrides.clear();
      return;
    }
    for (const part of trimmed.split(";")) {
      const slot = Number(part.trim());
      if (Number.isInteger(slot) && slot >= 0 && slot <= 255) {
        this.#paletteOverrides.delete(slot);
      }
    }
  }

  /**
   * OSC 7 reports the shell's working directory as a `file://host/path` URI.
   * Only well-formed file URIs with an absolute path are accepted; malformed
   * or foreign-scheme payloads never clear a previously reported directory.
   */
  #applyWorkingDirectory(uri: string): void {
    if (uri.length === 0 || uri.length > 4096 || !uri.startsWith("file:")) return;
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== "file:") return;
      const path = decodeURIComponent(parsed.pathname);
      if (!path.startsWith("/")) return;
      // `new URL("file:")` normalizes to a bare "/"; only accept a root
      // report when the URI actually spelled a path out.
      if (path === "/" && !/^file:\/\/[^/]*\//.test(uri)) return;
      this.#workingDirectory = path;
    } catch {
      // Unparseable URI: keep the last good report.
    }
  }

  #applyHyperlink(payload: string): void {
    const separator = payload.indexOf(";");
    if (separator < 0) return;
    const uri = payload.slice(separator + 1);
    this.#hyperlink = uri || undefined;
  }

  #styledCell(char: string): TerminalScreenCell {
    const cell: TerminalScreenCell = { char, ...this.#style };
    if (this.#hyperlink) cell.hyperlink = this.#hyperlink;
    return cell;
  }

  #applyEscIntermediates(intermediates: string, command: string): void {
    // ECMA-35 charset designation: `ESC ( final` selects G0, `ESC ) final` G1.
    // Only DEC Special Graphics (`0`) changes rendering; every other final —
    // and the G2/G3, DECALN, and `ESC % G` families — is consumed silently so
    // its bytes never print as literal glyphs.
    if (intermediates === "(") this.#charsetDecGraphics[0] = command === "0";
    else if (intermediates === ")") this.#charsetDecGraphics[1] = command === "0";
  }

  #applyPrivateModes(params: number[], enabled: boolean): void {
    for (const mode of params) {
      if (mode === 25) this.#cursorVisible = enabled;
      else {
        if (enabled) this.#privateModes.add(mode);
        else this.#privateModes.delete(mode);
        if (mode === 6) {
          this.#originMode = enabled;
          this.#pendingWrap = false;
          this.#state.cursor = {
            column: this.#homeColumn(),
            row: this.#homeRow(),
          };
        }
        if (mode === 7) {
          this.#autoWrap = enabled;
          if (!enabled) this.#pendingWrap = false;
        }
        if (mode === 69) {
          this.#leftRightMarginsMode = enabled;
          if (!enabled) this.#horizontalMargins = fullHorizontalMargins(this.#columns);
        }
        if (mode === 47 || mode === 1047) enabled ? this.#enterAlternate() : this.#exitAlternate();
        if (mode === 1048) enabled ? this.#saveCursor() : this.#restoreCursor();
        if (mode === 1049) {
          if (enabled) {
            if (!this.#mainState) {
              this.#saveCursor();
              this.#enterAlternate();
            }
          } else if (this.#mainState) {
            this.#exitAlternate();
            this.#restoreCursor();
          }
        }
      }
    }
  }

  #applyModes(params: number[], enabled: boolean): void {
    for (const mode of params) {
      if (mode === 4) this.#insertMode = enabled;
      else if (mode === 20) this.#lineFeedNewline = enabled;
    }
  }

  #setCursorPosition(row: number, column: number): void {
    if (!this.#originMode) {
      this.#state.cursor = {
        column: clamp(column - 1, 0, this.#columns - 1),
        row: clamp(row - 1, 0, this.#rows - 1),
      };
      return;
    }
    this.#state.cursor = {
      column: clamp(
        this.#horizontalMargins.left + column - 1,
        this.#horizontalMargins.left,
        this.#horizontalMargins.right,
      ),
      row: clamp(this.#scrollRegion.top + row - 1, this.#scrollRegion.top, this.#scrollRegion.bottom),
    };
  }

  #setTabStop(): void {
    this.#tabStops.add(this.#state.cursor.column);
  }

  #saveCursor(): void {
    const slot = this.#mainState ? "alternate" : "main";
    this.#savedCursor[slot] = {
      column: this.#state.cursor.column,
      row: this.#state.cursor.row,
      style: { ...this.#style },
      originMode: this.#originMode,
      autoWrap: this.#autoWrap,
      pendingWrap: this.#pendingWrap,
      charsetDecGraphics: [this.#charsetDecGraphics[0]!, this.#charsetDecGraphics[1]!],
      activeCharset: this.#activeCharset,
    };
  }

  #restoreCursor(): void {
    const slot = this.#mainState ? "alternate" : "main";
    const saved = this.#savedCursor[slot];
    if (!saved) return;
    this.#state.cursor = {
      column: clamp(saved.column, 0, this.#columns - 1),
      row: clamp(saved.row, 0, this.#rows - 1),
    };
    this.#style = { ...saved.style };
    this.#originMode = saved.originMode;
    this.#autoWrap = saved.autoWrap;
    this.#pendingWrap = saved.pendingWrap && this.#state.cursor.column === this.#columns - 1;
    this.#charsetDecGraphics[0] = saved.charsetDecGraphics[0];
    this.#charsetDecGraphics[1] = saved.charsetDecGraphics[1];
    this.#activeCharset = saved.activeCharset;
  }

  #clearTabStops(mode: number): void {
    if (mode === 3) {
      this.#tabStops.clear();
      return;
    }
    if (mode === 0) this.#tabStops.delete(this.#state.cursor.column);
  }

  #cursorForwardTabs(count: number): void {
    const amount = Math.max(1, Math.floor(count));
    for (let index = 0; index < amount; index += 1) {
      this.#state.cursor.column = nextTabStop(this.#tabStops, this.#state.cursor.column, this.#columns);
    }
  }

  #cursorBackwardTabs(count: number): void {
    const amount = Math.max(1, Math.floor(count));
    for (let index = 0; index < amount; index += 1) {
      this.#state.cursor.column = previousTabStop(this.#tabStops, this.#state.cursor.column);
    }
  }

  #repeatLastPrintable(count: number): void {
    if (!this.#lastPrintableCell) return;
    const amount = Math.max(1, Math.floor(count));
    for (let index = 0; index < amount; index += 1) {
      this.#placeGlyph({ ...this.#lastPrintableCell }, this.#lastPrintableWidth);
    }
  }

  #applyCursorStyle(style: number): void {
    this.#cursorStyleCode = style >= 0 && style <= 6 ? style : 0;
    switch (style) {
      case 3:
        this.#cursorStyle = { shape: "underline", blinking: true };
        break;
      case 4:
        this.#cursorStyle = { shape: "underline", blinking: false };
        break;
      case 5:
        this.#cursorStyle = { shape: "bar", blinking: true };
        break;
      case 6:
        this.#cursorStyle = { shape: "bar", blinking: false };
        break;
      case 2:
        this.#cursorStyle = { shape: "block", blinking: false };
        break;
      case 0:
      case 1:
      default:
        this.#cursorStyle = { shape: "block", blinking: true };
        break;
    }
  }

  #applySgr(body: string): void {
    const values = sgrParameters(body);
    for (let index = 0; index < values.length; index += 1) {
      const parts = values[index]!.split(":"), value = Number(parts[0]);
      if (parts.length > 1 && value === 4) {
        if (parts.length === 2 && /^[0-5]$/.test(parts[1]!)) {
          if (parts[1] === "0") {
            delete this.#style.underline;
            delete this.#style.underlineStyle;
          } else {
            this.#style.underline = true;
            this.#style.underlineStyle =
              (["solid", "double", "wavy", "dotted", "dashed"] as const)[Number(parts[1]) - 1];
          }
        }
        continue;
      }
      if (value === 38 || value === 48 || value === 58) {
        const parsed = sgrColor(values, index);
        const color = parsed.rgb
          ? encodeTerminalRgbColor(...parsed.rgb)
          : parsed.palette !== undefined
          ? encodeTerminalIndexedColor(parsed.palette)
          : undefined;
        if (color !== undefined) {
          if (value === 38) this.#style.foreground = color;
          else if (value === 48) this.#style.background = color;
          else this.#style.underlineColor = color;
        }
        index += parsed.consumed - 1;
        continue;
      }
      if (parts.length > 1) continue;
      if (value === 0) this.#style = {};
      else if (value === 1) this.#style.bold = true;
      else if (value === 2) this.#style.dim = true;
      else if (value === 3) this.#style.italic = true;
      else if (value === 4 || value === 21) {
        this.#style.underline = true;
        if (value === 21) this.#style.underlineStyle = "double";
        else delete this.#style.underlineStyle;
      } else if (value === 7) this.#style.inverse = true;
      else if (value === 9) this.#style.strikethrough = true;
      else if (value === 22) {
        this.#style.bold = false;
        delete this.#style.dim;
      } else if (value === 23) delete this.#style.italic;
      else if (value === 24) {
        delete this.#style.underline;
        delete this.#style.underlineStyle;
      } else if (value === 27) delete this.#style.inverse;
      else if (value === 29) delete this.#style.strikethrough;
      else if (value === 53) this.#style.overline = true;
      else if (value === 55) delete this.#style.overline;
      else if (value === 59) delete this.#style.underlineColor;
      else if (value >= 30 && value <= 37) this.#style.foreground = value;
      else if (value >= 90 && value <= 97) this.#style.foreground = value;
      else if (value === 39) delete this.#style.foreground;
      else if (value >= 40 && value <= 47) this.#style.background = value;
      else if (value >= 100 && value <= 107) this.#style.background = value;
      else if (value === 49) delete this.#style.background;
    }
  }

  #eraseDisplay(mode: number): void {
    if (mode === 2 || mode === 3) {
      // ED erases cells only. It must not move the cursor or disturb the scroll
      // region, tab stops, charset shifts or decoder state — a full `clear()`
      // here made apps that erase and keep drawing (tmux, Claude Code) land
      // their next writes at the top-left corner.
      for (let row = 0; row < this.#rows; row += 1) {
        fillCells(this.#state.cells[row]!, 0, this.#columns, this.#eraseCell());
        this.#accountGlyphRow(this.#state.cells[row]!);
      }
      // A full-row fill cannot leave half a pair, so no repair is needed here.
      // ED 3 additionally drops saved lines, matching xterm.
      if (mode === 3) {
        for (const row of this.#scrollback) this.#releaseGlyphRow(row);
        this.#scrollback = [];
      }
      return;
    }
    if (mode === 1) {
      for (let row = 0; row <= this.#state.cursor.row; row += 1) {
        const end = row === this.#state.cursor.row ? this.#state.cursor.column + 1 : this.#columns;
        fillCells(this.#state.cells[row]!, 0, end, this.#eraseCell());
        this.#repairRow(this.#state.cells[row]!);
      }
      return;
    }
    for (let row = this.#state.cursor.row; row < this.#rows; row += 1) {
      const start = row === this.#state.cursor.row ? this.#state.cursor.column : 0;
      fillCells(this.#state.cells[row]!, start, this.#columns - start, this.#eraseCell());
      this.#repairRow(this.#state.cells[row]!);
    }
  }

  #eraseLine(mode: number): void {
    const row = this.#state.cells[this.#state.cursor.row]!;
    const start = mode === 1 || mode === 2 ? 0 : this.#state.cursor.column;
    const end = mode === 1 ? this.#state.cursor.column + 1 : this.#columns;
    fillCells(row, start, end - start, this.#eraseCell());
    this.#repairRow(row);
  }

  #insertCharacters(count: number): void {
    const row = this.#state.cells[this.#state.cursor.row]!;
    const column = this.#state.cursor.column;
    if (
      this.#hasHorizontalMargins() && (column < this.#horizontalMargins.left || column > this.#horizontalMargins.right)
    ) {
      return;
    }
    const rightBound = this.#hasHorizontalMargins() ? this.#horizontalMargins.right + 1 : this.#columns;
    const amount = clamp(Math.floor(count), 1, rightBound - column);
    shiftCellsRight(row, column, amount, rightBound, this.#eraseCell());
    this.#repairRow(row);
  }

  #deleteCharacters(count: number): void {
    const row = this.#state.cells[this.#state.cursor.row]!;
    const column = this.#state.cursor.column;
    if (
      this.#hasHorizontalMargins() && (column < this.#horizontalMargins.left || column > this.#horizontalMargins.right)
    ) {
      return;
    }
    const rightBound = this.#hasHorizontalMargins() ? this.#horizontalMargins.right + 1 : this.#columns;
    const amount = clamp(Math.floor(count), 1, rightBound - column);
    shiftCellsLeft(row, column, amount, rightBound, this.#eraseCell());
    this.#repairRow(row);
  }

  #eraseCharacters(count: number): void {
    const row = this.#state.cells[this.#state.cursor.row]!;
    const column = this.#state.cursor.column;
    const amount = clamp(Math.floor(count), 1, this.#columns - column);
    fillCells(row, column, amount, this.#eraseCell());
    this.#repairRow(row);
  }

  #insertLines(count: number): void {
    const row = this.#state.cursor.row;
    if (row < this.#scrollRegion.top || row > this.#scrollRegion.bottom) return;
    if (
      this.#hasHorizontalMargins() &&
      (this.#state.cursor.column < this.#horizontalMargins.left ||
        this.#state.cursor.column > this.#horizontalMargins.right)
    ) {
      return;
    }
    const amount = clamp(Math.floor(count), 1, this.#scrollRegion.bottom - row + 1);
    if (this.#hasHorizontalMargins()) {
      this.#scrollRegionDown(row, this.#scrollRegion.bottom, amount);
      return;
    }
    for (let index = 0; index < amount; index += 1) {
      this.#state.cells.splice(row, 0, this.#eraseRow());
      for (const removed of this.#state.cells.splice(this.#scrollRegion.bottom + 1, 1)) this.#releaseGlyphRow(removed);
    }
  }

  #deleteLines(count: number): void {
    const row = this.#state.cursor.row;
    if (row < this.#scrollRegion.top || row > this.#scrollRegion.bottom) return;
    if (
      this.#hasHorizontalMargins() &&
      (this.#state.cursor.column < this.#horizontalMargins.left ||
        this.#state.cursor.column > this.#horizontalMargins.right)
    ) {
      return;
    }
    const amount = clamp(Math.floor(count), 1, this.#scrollRegion.bottom - row + 1);
    if (this.#hasHorizontalMargins()) {
      this.#scrollRegionUp(row, this.#scrollRegion.bottom, amount);
      return;
    }
    for (let index = 0; index < amount; index += 1) {
      for (const removed of this.#state.cells.splice(row, 1)) this.#releaseGlyphRow(removed);
      this.#state.cells.splice(this.#scrollRegion.bottom, 0, this.#eraseRow());
    }
  }

  #insertColumns(count: number): void {
    const { row, column } = this.#state.cursor;
    const { top, bottom } = this.#scrollRegion;
    const { left, right } = this.#horizontalMargins;
    if (row < top || row > bottom || column < left || column > right) return;
    const rightBound = right + 1;
    const amount = clamp(Math.floor(count), 1, rightBound - column);
    const fill = this.#eraseCell();
    for (let current = top; current <= bottom; current += 1) {
      const cells = this.#state.cells[current]!;
      shiftCellsRight(cells, column, amount, rightBound, fill);
      this.#repairRow(cells);
    }
  }

  #deleteColumns(count: number): void {
    const { row, column } = this.#state.cursor;
    const { top, bottom } = this.#scrollRegion;
    const { left, right } = this.#horizontalMargins;
    if (row < top || row > bottom || column < left || column > right) return;
    const rightBound = right + 1;
    const amount = clamp(Math.floor(count), 1, rightBound - column);
    const fill = this.#eraseCell();
    for (let current = top; current <= bottom; current += 1) {
      const cells = this.#state.cells[current]!;
      shiftCellsLeft(cells, column, amount, rightBound, fill);
      this.#repairRow(cells);
    }
  }

  #setScrollRegion(params: number[]): void {
    if (params.length === 0) {
      this.#scrollRegion = fullScrollRegion(this.#rows);
      this.#state.cursor = { column: this.#homeColumn(), row: this.#homeRow() };
      return;
    }
    const top = clamp((params[0] || 1) - 1, 0, this.#rows - 1);
    const bottom = clamp((params[1] || this.#rows) - 1, 0, this.#rows - 1);
    if (bottom <= top) {
      this.#scrollRegion = fullScrollRegion(this.#rows);
      this.#state.cursor = { column: this.#homeColumn(), row: this.#homeRow() };
      return;
    }
    this.#scrollRegion = { top, bottom };
    this.#state.cursor = { column: this.#homeColumn(), row: this.#homeRow() };
  }

  #setHorizontalMargins(params: number[]): void {
    if (params.length === 0) {
      this.#horizontalMargins = fullHorizontalMargins(this.#columns);
      this.#pendingWrap = false;
      this.#state.cursor = { column: this.#homeColumn(), row: this.#homeRow() };
      return;
    }
    const left = clamp((params[0] || 1) - 1, 0, this.#columns - 1);
    const right = clamp((params[1] || this.#columns) - 1, 0, this.#columns - 1);
    if (left >= right) return;
    this.#horizontalMargins = { left, right };
    this.#pendingWrap = false;
    this.#state.cursor = { column: this.#homeColumn(), row: this.#homeRow() };
  }

  #scrollRegionUp(top: number, bottom: number, count: number): void {
    const amount = clamp(Math.floor(count), 1, bottom - top + 1);
    if (this.#hasHorizontalMargins()) {
      const { left, right } = this.#horizontalMargins;
      const fill = this.#eraseCell();
      for (let row = top; row <= bottom - amount; row += 1) {
        const dest = this.#state.cells[row]!;
        const source = this.#state.cells[row + amount]!;
        for (let column = left; column <= right; column += 1) dest[column] = source[column]!;
        this.#repairRow(dest);
      }
      for (let row = bottom - amount + 1; row <= bottom; row += 1) {
        const dest = this.#state.cells[row]!;
        fillCells(dest, left, right - left + 1, fill);
        this.#repairRow(dest);
      }
      return;
    }
    for (let index = 0; index < amount; index += 1) {
      const shifted = this.#state.cells.splice(top, 1)[0] ?? blankRow(this.#columns);
      // Inline TUIs scroll transcript rows above a fixed composer/footer.
      // Like tmux/Ghostty, retain rows leaving the top of the main screen even
      // when the scrolling region stops above the last physical row.
      if (top === 0 && !this.alternate) {
        this.#scrollback.push(shifted);
        if (this.#scrollback.length > this.#scrollbackLimit) this.#releaseGlyphRow(this.#scrollback.shift()!);
      } else {
        this.#releaseGlyphRow(shifted);
      }
      this.#state.cells.splice(bottom, 0, this.#eraseRow());
    }
  }

  #scrollRegionDown(top: number, bottom: number, count: number): void {
    const amount = clamp(Math.floor(count), 1, bottom - top + 1);
    if (this.#hasHorizontalMargins()) {
      const { left, right } = this.#horizontalMargins;
      const fill = this.#eraseCell();
      for (let row = bottom; row >= top + amount; row -= 1) {
        const dest = this.#state.cells[row]!;
        const source = this.#state.cells[row - amount]!;
        for (let column = left; column <= right; column += 1) dest[column] = source[column]!;
        this.#repairRow(dest);
      }
      for (let row = top; row < top + amount; row += 1) {
        const dest = this.#state.cells[row]!;
        fillCells(dest, left, right - left + 1, fill);
        this.#repairRow(dest);
      }
      return;
    }
    for (let index = 0; index < amount; index += 1) {
      for (const removed of this.#state.cells.splice(bottom, 1)) this.#releaseGlyphRow(removed);
      this.#state.cells.splice(top, 0, this.#eraseRow());
    }
  }

  #reverseIndex(): void {
    if (
      this.#hasHorizontalMargins() &&
      (this.#state.cursor.column < this.#horizontalMargins.left ||
        this.#state.cursor.column > this.#horizontalMargins.right)
    ) {
      this.#state.cursor.row = Math.max(0, this.#state.cursor.row - 1);
      return;
    }
    if (this.#state.cursor.row === this.#scrollRegion.top) {
      this.#scrollRegionDown(this.#scrollRegion.top, this.#scrollRegion.bottom, 1);
      return;
    }
    this.#state.cursor.row = Math.max(0, this.#state.cursor.row - 1);
  }

  #reset(): void {
    this.#mainState = undefined;
    this.#scrollback = [];
    this.#style = {};
    this.#savedCursor = {};
    this.#title = undefined;
    this.#workingDirectory = undefined;
    this.#hyperlink = undefined;
    this.#cursorVisible = true;
    this.#cursorStyle = { shape: "block", blinking: true };
    this.#cursorStyleCode = 0;
    this.#kittyKeyboard = { main: [], alternate: [] };
    this.#modifyOtherKeys = 0;
    this.#paletteOverrides.clear();
    this.#privateModes.clear();
    this.#leftRightMarginsMode = false;
    this.#originMode = false;
    this.#autoWrap = true;
    this.#insertMode = false;
    this.#lineFeedNewline = false;
    this.#lastPrintableCell = undefined;
    this.#lastPrintableWidth = 1;
    this.#rejectedClusters = 0;
    this.clear();
  }

  #enterAlternate(): void {
    if (this.#mainState) return;
    this.#mainState = cloneState(this.#state);
    this.#state = { cells: createRows(this.#columns, this.#rows), cursor: { column: 0, row: 0 } };
    this.#recountGlyphs();
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#horizontalMargins = fullHorizontalMargins(this.#columns);
    this.#pendingWrap = false;
  }

  #exitAlternate(): void {
    if (!this.#mainState) return;
    this.#state = this.#mainState;
    this.#mainState = undefined;
    this.#recountGlyphs();
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#horizontalMargins = fullHorizontalMargins(this.#columns);
    this.#originMode = false;
    this.#pendingWrap = false;
  }
}

/** DEC private modes this model acts on, and so can report as set or reset. */
const REPORTED_PRIVATE_MODES: ReadonlySet<number> = new Set([
  1,
  6,
  9,
  47,
  69,
  1000,
  1002,
  1003,
  1004,
  1005,
  1006,
  1015,
  1047,
  1048,
  1049,
  2004,
  2026,
]);
const MAX_KITTY_KEYBOARD_STACK = 16;
const KITTY_KEYBOARD_FLAG_MASK = 0b11111;
const EMPTY_PALETTE_OVERRIDES: ReadonlyMap<number, readonly [number, number, number]> = new Map();

function clampKittyFlags(value: number): number {
  return Number.isInteger(value) ? value & KITTY_KEYBOARD_FLAG_MASK : 0;
}

/** Parses `rgb:r/g/b` (1–4 hex digits per channel) or `#rgb`/`#rrggbb`/`#rrrrggggbbbb` into 8-bit RGB. */
function parseOscColorRgb(spec: string): readonly [number, number, number] | undefined {
  const rgbMatch = /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i.exec(spec);
  if (rgbMatch) {
    return [
      parseHexChannel8(rgbMatch[1]!),
      parseHexChannel8(rgbMatch[2]!),
      parseHexChannel8(rgbMatch[3]!),
    ];
  }
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{12})$/i.exec(spec);
  if (!hexMatch) return undefined;
  const digits = hexMatch[1]!;
  const step = digits.length / 3;
  return [
    parseHexChannel8(digits.slice(0, step)),
    parseHexChannel8(digits.slice(step, step * 2)),
    parseHexChannel8(digits.slice(step * 2)),
  ];
}

function parseHexChannel8(hex: string): number {
  const value = Number.parseInt(hex, 16);
  if (hex.length === 1) return value * 17;
  if (hex.length === 2) return value;
  const max = (1 << (hex.length * 4)) - 1;
  return Math.round((value * 255) / max);
}

/** Formats current SGR attributes for `DECRQSS m` and ANSI snapshots. */
function formatSgrState(style: Omit<TerminalScreenCell, "char">): string {
  const params: string[] = ["0"];
  if (style.bold) params.push("1");
  if (style.dim) params.push("2");
  if (style.italic) params.push("3");
  if (style.underline) {
    const sub = style.underlineStyle
      ? (["solid", "double", "wavy", "dotted", "dashed"] as const).indexOf(style.underlineStyle) + 1
      : 0;
    params.push(sub > 1 ? `4:${sub}` : "4");
  }
  if (style.inverse) params.push("7");
  if (style.strikethrough) params.push("9");
  if (style.overline) params.push("53");
  if (style.foreground !== undefined) appendEncodedSgrColor(params, style.foreground, false);
  if (style.background !== undefined) appendEncodedSgrColor(params, style.background, true);
  if (style.underlineColor !== undefined) appendEncodedUnderlineColor(params, style.underlineColor);
  return params.join(";");
}

function appendEncodedSgrColor(params: string[], code: number, background: boolean): void {
  const decoded = decodeTerminalColor(code, background);
  if (!decoded) return;
  if (decoded.kind === "ansi") {
    const base = decoded.index < 8
      ? (background ? 40 : 30) + decoded.index
      : (background ? 100 : 90) + decoded.index - 8;
    params.push(String(base));
  } else if (decoded.kind === "indexed") {
    params.push(background ? "48" : "38", "5", String(decoded.index));
  } else {
    params.push(background ? "48" : "38", "2", String(decoded.red), String(decoded.green), String(decoded.blue));
  }
}

function appendEncodedUnderlineColor(params: string[], code: number): void {
  const decoded = decodeTerminalColor(code, false);
  if (!decoded) return;
  if (decoded.kind === "ansi" || decoded.kind === "indexed") {
    params.push("58", "5", String(decoded.index));
  } else {
    params.push("58", "2", String(decoded.red), String(decoded.green), String(decoded.blue));
  }
}

/** One 8-bit channel as the 16-bit hex XParseColor form terminals answer with. */
function colorChannel16(value: number): string {
  const byte = clamp(Math.round(Number.isFinite(value) ? value : 0), 0, 255);
  return byte.toString(16).padStart(2, "0").repeat(2);
}

/** XTVERSION text: printable ASCII only, so the reply cannot carry a control sequence of its own. */
function terminalIdentity(identity: { name: string; version?: string } | undefined): string {
  const text = identity ? `${identity.name}${identity.version ? ` ${identity.version}` : ""}` : "exotui";
  const safe = text.replace(/[^\x20-\x7e]/g, "").slice(0, 64).trim();
  return safe || "exotui";
}

interface TerminalScreenScrollRegion {
  top: number;
  bottom: number;
}

interface TerminalScreenHorizontalMargins {
  left: number;
  right: number;
}

function sortedPrivateModes(modes: ReadonlySet<number>): number[] {
  const sorted: number[] = [];
  for (const mode of modes) {
    let insertAt = sorted.length;
    while (insertAt > 0 && sorted[insertAt - 1]! > mode) insertAt -= 1;
    sorted.splice(insertAt, 0, mode);
  }
  return sorted;
}

function createRows(columns: number, rows: number): TerminalScreenCell[][] {
  const output = new Array<TerminalScreenCell[]>(rows);
  for (let row = 0; row < rows; row += 1) {
    output[row] = blankRow(columns);
  }
  return output;
}

function blankRow(columns: number): TerminalScreenCell[] {
  return new Array<TerminalScreenCell>(columns).fill(BLANK_CELL);
}

function readTerminalGraphic(text: string, index: number): string {
  const code = text.charCodeAt(index);
  if (code < 0x80) return text[index] ?? "";

  const codePoint = text.codePointAt(index);
  return codePoint === undefined ? text[index] ?? "" : String.fromCodePoint(codePoint);
}

function incompleteTerminalControl(suffix: string): boolean {
  if (suffix === "\x1b") return true;
  // An OSC stays pending until its BEL/ST terminator arrives.
  if (suffix.startsWith("\x1b]")) return true;
  // A string sequence (DCS/APC/PM/SOS) stays pending until ST. These carry
  // payloads — kitty graphics chunks arrive in APC at ~4 KB each — so a chunk
  // boundary in the middle of one is the normal case, not the edge case.
  {
    const opener = suffix[1];
    if (opener === "P" || opener === "_" || opener === "^" || opener === "X") return true;
  }
  if (suffix.startsWith("\x1b[")) {
    // A CSI is only genuinely pending while every byte after the introducer is
    // a parameter/intermediate byte (0x20-0x3F). Anything else means the
    // sequence is malformed, so report it complete and let the writer skip the
    // ESC rather than buffering the rest of the stream forever.
    for (let index = 2; index < suffix.length; index += 1) {
      const code = suffix.charCodeAt(index);
      if (code < 0x20 || code > 0x3f) return false;
    }
    return true;
  }
  // A trailing ESC plus only intermediates (e.g. a chunk-split `ESC (`) still
  // awaits its final byte; never let its pieces print as literal glyphs.
  for (let index = 1; index < suffix.length; index += 1) {
    const code = suffix.charCodeAt(index);
    if (code < 0x20 || code > 0x2f) return false;
  }
  return true;
}

function glyphBudget(value: number | undefined, minimum: number, maximum: number): number {
  if (value === undefined) return maximum;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`Terminal glyph budget must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function glyphExtra(cell: TerminalScreenCell | undefined): number {
  return Math.max(0, (cell?.char.length ?? 0) - 2);
}

function terminalGraphicWidth(char: string): number {
  return Math.max(1, Math.min(2, measureCharacterWidth(char)));
}

function fillCells(
  row: TerminalScreenCell[],
  start: number,
  count: number,
  cell: TerminalScreenCell = BLANK_CELL,
): void {
  const end = Math.min(row.length, start + Math.max(0, count));
  for (let column = Math.max(0, start); column < end; column += 1) {
    row[column] = cell;
  }
}

function shiftCellsRight(
  row: TerminalScreenCell[],
  start: number,
  amount: number,
  columns: number,
  fill: TerminalScreenCell,
): void {
  const shift = Math.max(0, amount);
  if (shift === 0) return;
  for (let column = columns - 1; column >= start + shift; column -= 1) {
    row[column] = row[column - shift] ?? BLANK_CELL;
  }
  fillCells(row, start, Math.min(shift, columns - start), fill);
}

function shiftCellsLeft(
  row: TerminalScreenCell[],
  start: number,
  amount: number,
  columns: number,
  fill: TerminalScreenCell,
): void {
  const shift = Math.max(0, amount);
  if (shift === 0) return;
  const fillStart = Math.max(start, columns - shift);
  for (let column = start; column < columns - shift; column += 1) {
    row[column] = row[column + shift] ?? BLANK_CELL;
  }
  fillCells(row, fillStart, columns - fillStart, fill);
}

function terminalCellRowsToText(rows: readonly TerminalScreenCell[][]): string[] {
  const output = new Array<string>(rows.length);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    let lastContentColumn = -1;
    for (let column = row.length - 1; column >= 0; column--) {
      if ((row[column]?.char ?? " ") !== " ") {
        lastContentColumn = column;
        break;
      }
    }
    const chars = new Array<string>(lastContentColumn + 1);
    for (let column = 0; column <= lastContentColumn; column++) {
      chars[column] = row[column]?.char ?? " ";
    }
    output[rowIndex] = chars.join("");
  }
  return output;
}

function cloneTerminalCellRows(rows: readonly TerminalScreenCell[][]): TerminalScreenCell[][] {
  const output = new Array<TerminalScreenCell[]>(rows.length);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    output[rowIndex] = cloneTerminalCellRow(rows[rowIndex]!);
  }
  return output;
}

function cloneTerminalCellRow(row: readonly TerminalScreenCell[]): TerminalScreenCell[] {
  const cloned = new Array<TerminalScreenCell>(row.length);
  for (let column = 0; column < row.length; column++) cloned[column] = { ...row[column]! };
  return cloned;
}

function fullScrollRegion(rows: number): TerminalScreenScrollRegion {
  return { top: 0, bottom: rows - 1 };
}

function fullHorizontalMargins(columns: number): TerminalScreenHorizontalMargins {
  return { left: 0, right: columns - 1 };
}

function defaultTabStops(columns: number): Set<number> {
  const stops = new Set<number>();
  for (let column = 8; column < columns; column += 8) stops.add(column);
  return stops;
}

function preservesPendingWrap(sequence: ParsedTerminalControlSequence): boolean {
  if (
    sequence.kind === "osc" || sequence.kind === "dcs" || sequence.kind === "apc" ||
    sequence.kind === "pm" || sequence.kind === "sos"
  ) {
    return true;
  }
  if (sequence.kind === "esc") {
    if (sequence.intermediates) return true;
    return sequence.command === "=" || sequence.command === ">" || sequence.command === "H" ||
      sequence.command === "7";
  }
  // CSI sequences that do not move the cursor or edit cells leave the
  // deferred-wrap latch untouched; DECSET/DECRST modes that move the cursor or
  // disable autowrap clear it themselves in `#applyPrivateModes`.
  if (sequence.prefix && sequence.prefix !== "?") return true;
  if (sequence.command === "t" || sequence.command === "m") return true;
  if (sequence.command === "h" || sequence.command === "l") return true;
  if (sequence.private) {
    if (!sequence.intermediates && sequence.command === "W" && sequence.params === "5") return true;
    return sequence.command !== "J" && sequence.command !== "K";
  }
  if (sequence.intermediates) return true;
  return sequence.command === "g" || sequence.command === "s" || sequence.command === "b";
}

function resizeTabStops(stops: Set<number>, previousColumns: number, columns: number): Set<number> {
  const resized = new Set<number>();
  for (const stop of stops) {
    if (stop > 0 && stop < columns) resized.add(stop);
  }
  // Widening a terminal populates default 8-column stops in the newly added
  // columns, matching xterm, Ghostty and tmux; without this, inline renderers
  // using HT/CBT after a widen jump straight to the right margin.
  for (let column = 8; column < columns; column += 8) {
    if (column >= previousColumns) resized.add(column);
  }
  return resized;
}

function isBlankTerminalRow(row: readonly TerminalScreenCell[]): boolean {
  for (let column = 0; column < row.length; column += 1) {
    const cell = row[column];
    if (!cell) continue;
    if (cell.continuation || cell.char !== " " || cell.background !== undefined) return false;
  }
  return true;
}

function isDefaultBlankCell(cell: TerminalScreenCell | undefined): boolean {
  if (!cell) return true;
  return !cell.continuation && !cell.wrapPadding && cell.char === " " &&
    cell.background === undefined && cell.foreground === undefined &&
    !cell.bold && !cell.dim && !cell.italic && !cell.underline &&
    !cell.overline && !cell.strikethrough && !cell.inverse && cell.hyperlink === undefined;
}

function stripWrapMetadata(cell: TerminalScreenCell): TerminalScreenCell {
  if (!cell.softWrapped && !cell.wrapPadding && !cell.clipped && !cell.continuation) return cell;
  const { softWrapped: _sw, wrapPadding: _wp, clipped: _cl, continuation: _ct, ...clean } = cell;
  return clean;
}

function packLogicalLine(
  items: readonly { cell: TerminalScreenCell; width: 1 | 2 }[],
  columns: number,
  cursorAnchor: { index: number; trailing: number } | undefined,
  savedAnchor: { index: number; trailing: number } | undefined,
  baseRow: number,
): {
  rows: TerminalScreenCell[][];
  cursor?: TerminalScreenCursor;
  saved?: TerminalScreenCursor;
} {
  const rows: TerminalScreenCell[][] = [];
  let row = blankRow(columns);
  let column = 0;
  let cursor: TerminalScreenCursor | undefined;
  let saved: TerminalScreenCursor | undefined;

  for (let index = 0; index < items.length; index += 1) {
    const { cell, width } = items[index]!;
    if (width > columns) {
      if (cursorAnchor && cursorAnchor.index === index) {
        cursor = { row: baseRow + rows.length, column: clamp(column, 0, columns - 1) };
      }
      if (savedAnchor && savedAnchor.index === index) {
        saved = { row: baseRow + rows.length, column: clamp(column, 0, columns - 1) };
      }
      continue;
    }
    if (column + width > columns) {
      for (let pad = column; pad < columns; pad += 1) {
        row[pad] = { char: " ", wrapPadding: true };
      }
      row[columns - 1] = { ...row[columns - 1]!, softWrapped: true };
      rows.push(row);
      row = blankRow(columns);
      column = 0;
    }
    if (cursorAnchor && cursorAnchor.index === index) {
      cursor = { row: baseRow + rows.length, column };
    }
    if (savedAnchor && savedAnchor.index === index) {
      saved = { row: baseRow + rows.length, column };
    }
    row[column] = cell;
    if (width === 2) row[column + 1] = CONTINUATION_CELL;
    column += width;
  }

  if (cursorAnchor && !cursor) {
    cursor = { row: baseRow + rows.length, column: clamp(column + cursorAnchor.trailing, 0, columns - 1) };
  }
  if (savedAnchor && !saved) {
    saved = { row: baseRow + rows.length, column: clamp(column + savedAnchor.trailing, 0, columns - 1) };
  }
  rows.push(row);
  return { rows, cursor, saved };
}

function resizeCellRow(source: readonly TerminalScreenCell[], columns: number): TerminalScreenCell[] {
  const target = blankRow(columns);
  // Resize does not reflow text, so a soft wrap survives only while the row
  // still ends where it wrapped: widening pads the gap as wrap padding, and
  // narrowing may drop nothing but such padding.
  const dropped = source.slice(columns);
  const wrapped = source.at(-1)?.softWrapped === true && dropped.every((cell) => cell.wrapPadding);
  const clipped = !wrapped &&
    dropped.some((cell) => cell.continuation || (!cell.wrapPadding && cell.char.trim() !== ""));
  for (let column = 0; column < Math.min(columns, source.length); column += 1) {
    const { softWrapped: _softWrapped, wrapPadding, ...cell } = source[column]!;
    target[column] = wrapped && wrapPadding ? { ...cell, wrapPadding } : cell;
  }
  if (clipped) target[columns - 1] = { ...target[columns - 1]!, clipped: true };
  if (!wrapped) return target;
  for (let column = source.length; column < columns; column += 1) target[column] = { char: " ", wrapPadding: true };
  target[columns - 1] = { ...target[columns - 1]!, softWrapped: true };
  return target;
}

function nextTabStop(stops: Set<number>, column: number, columns: number): number {
  let next = columns - 1;
  for (const stop of stops) {
    if (stop > column && stop < next) next = stop;
  }
  return next;
}

function previousTabStop(stops: Set<number>, column: number): number {
  let previous = 0;
  for (const stop of stops) {
    if (stop < column && stop > previous) previous = stop;
  }
  return previous;
}

function resizeState(state: TerminalScreenState, columns: number, rows: number): TerminalScreenState {
  const cells = createRows(columns, rows);
  for (let row = 0; row < Math.min(rows, state.cells.length); row += 1) {
    cells[row] = resizeCellRow(state.cells[row]!, columns);
  }
  return {
    cells,
    cursor: {
      column: clamp(state.cursor.column, 0, columns - 1),
      row: clamp(state.cursor.row, 0, rows - 1),
    },
  };
}

function cloneState(state: TerminalScreenState): TerminalScreenState {
  return {
    cells: cloneTerminalCellRows(state.cells),
    cursor: { ...state.cursor },
  };
}

/** Frozen screen frame held while DEC synchronized output (mode 2026) is open. */
export interface TerminalSynchronizedOutputSnapshot {
  readonly cells: readonly (readonly TerminalScreenCell[])[];
  readonly inspection: TerminalScreenInspection;
}

/** Options for {@linkcode TerminalSynchronizedOutputController}. */
export interface TerminalSynchronizedOutputControllerOptions {
  readonly screen: TerminalScreenController;
  /** Maximum hold duration before releasing live frames if a child never closes mode 2026. Defaults to 150 ms. */
  readonly timeoutMs?: number;
  /** Invoked when the safety timeout releases a held snapshot so the renderer repaints. */
  readonly onTimeout?: () => void;
}

/**
 * Reusable DEC synchronized output (mode 2026) frame holder for any terminal
 * renderer (`exomux`, `exowebtui`, embedded shells). Freezes the last complete
 * frame across split `?2026h ... ?2026l` chunks so repaint ticks never draw
 * mid-erase or mid-redraw states, bounded by a safety timeout.
 */
export class TerminalSynchronizedOutputController {
  readonly #screen: TerminalScreenController;
  readonly #timeoutMs: number;
  readonly #onTimeout?: () => void;
  #snapshot?: TerminalSynchronizedOutputSnapshot;
  #timer?: ReturnType<typeof setTimeout>;
  #timedOut = false;
  #lastStableFrame?: TerminalSynchronizedOutputSnapshot;
  #pendingPreSnapshot?: TerminalSynchronizedOutputSnapshot;

  constructor(options: TerminalSynchronizedOutputControllerOptions) {
    this.#screen = options.screen;
    this.#timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 150));
    this.#onTimeout = options.onTimeout;
  }

  /** Held pre-sync frame while mode 2026 is open, or undefined when painting live. */
  get snapshot(): TerminalSynchronizedOutputSnapshot | undefined {
    return this.#snapshot;
  }

  /** Captures a pre-write snapshot only when `data` could leave mode 2026 open. */
  beforeWrite(data: string | Uint8Array, live: boolean): void {
    this.#pendingPreSnapshot = undefined;
    if (!live || this.#snapshot || this.#timedOut || !chunkMayLeaveSynchronizedOutputOpen(data)) return;
    const beforeInspection = this.#screen.inspect();
    if (!beforeInspection.privateModes.includes(2026)) {
      this.#pendingPreSnapshot = { cells: this.#screen.cellRows(), inspection: beforeInspection };
    }
  }

  /**
   * Reconciles hold state after writing to the screen. Returns `true` when the
   * caller should schedule a repaint, or `false` while a frozen frame is held.
   */
  afterWrite(inspection: TerminalScreenInspection, live: boolean): boolean {
    const preSnapshot = this.#pendingPreSnapshot;
    this.#pendingPreSnapshot = undefined;
    const syncActive = inspection.privateModes.includes(2026);
    if (!syncActive) {
      this.#timedOut = false;
      this.#clearSnapshot();
      return true;
    }
    if (!live || this.#timedOut) return true;
    if (this.#snapshot) return false;
    const hold = preSnapshot ?? this.#lastStableFrame;
    if (!hold) return true;
    this.#snapshot = hold;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (!this.#snapshot) return;
      this.#timedOut = true;
      this.#snapshot = undefined;
      this.#onTimeout?.();
    }, this.#timeoutMs);
    return false;
  }

  /** Records the last painted live frame for reuse if a sync opener splits across chunks. */
  recordStableFrame(cells: readonly (readonly TerminalScreenCell[])[], inspection: TerminalScreenInspection): void {
    if (!inspection.privateModes.includes(2026)) {
      this.#lastStableFrame = { cells, inspection };
    }
  }

  /** Clears any held frame, timer, and cached stable base (on resize, clear, detach, or exit). */
  reset(): void {
    this.#clearSnapshot();
    this.#timedOut = false;
    this.#lastStableFrame = undefined;
    this.#pendingPreSnapshot = undefined;
  }

  /** Disposes any active safety timer and releases retained snapshots. */
  dispose(): void {
    this.reset();
  }

  #clearSnapshot(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#snapshot = undefined;
  }
}

function chunkMayLeaveSynchronizedOutputOpen(data: string | Uint8Array): boolean {
  if (typeof data === "string") {
    let cursor = data.length;
    while (cursor >= 4) {
      const index = data.lastIndexOf("2026", cursor - 4);
      if (index < 0) return false;
      for (let pos = index + 4; pos < data.length; pos += 1) {
        const code = data.charCodeAt(pos);
        if (code === 0x68) return true;
        if (code === 0x6c) return false;
        if (code >= 0x40 && code <= 0x7e) break;
      }
      cursor = index;
    }
    return false;
  }
  for (let index = data.length - 4; index >= 0; index -= 1) {
    if (
      data[index] === 0x32 && data[index + 1] === 0x30 &&
      data[index + 2] === 0x32 && data[index + 3] === 0x36
    ) {
      for (let pos = index + 4; pos < data.length; pos += 1) {
        const byte = data[pos]!;
        if (byte === 0x68) return true;
        if (byte === 0x6c) return false;
        if (byte >= 0x40 && byte <= 0x7e) break;
      }
    }
  }
  return false;
}
