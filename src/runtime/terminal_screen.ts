// Copyright 2023 Im-Beast. MIT license.
import {
  type ParsedTerminalControlSequence,
  parseTerminalControlSequence,
  parseTerminalParams,
} from "./terminal_sequences.ts";
import { clamp } from "../utils/numbers.ts";
import { textWidth, UNICODE_CHAR_REGEXP } from "../utils/strings.ts";
import { normalizeTerminalDimension } from "./terminal_values.ts";
import { encodeTerminalIndexedColor, encodeTerminalRgbColor } from "./terminal_color.ts";

/** Styled terminal cell tracked by TerminalScreenController. */
export interface TerminalScreenCell {
  char: string;
  bold?: boolean;
  foreground?: number;
  background?: number;
  hyperlink?: string;
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

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_SCROLLBACK_LIMIT = 1000;
const MAX_PENDING_CONTROL_LENGTH = 64 * 1024;
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
  #savedCursor?: TerminalScreenCursor;
  #title?: string;
  #workingDirectory?: string;
  #hyperlink?: string;
  #scrollRegion: TerminalScreenScrollRegion;
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
  #tabStops: Set<number>;
  #pendingControl = "";
  /** Swallowing an oversized DCS/APC/PM/SOS payload until its ST arrives. */
  #discardingString = false;
  #onKittyGraphics?: (data: string, cursor: { row: number; column: number }) => void;
  #onWindowSizeQuery?: (kind: 14 | 16 | 18) => void;
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
    this.#columns = normalizeTerminalDimension(options.columns, DEFAULT_COLUMNS);
    this.#rows = normalizeTerminalDimension(options.rows, DEFAULT_ROWS);
    this.#scrollbackLimit = Math.max(0, Math.floor(options.scrollbackLimit ?? DEFAULT_SCROLLBACK_LIMIT));
    this.#state = {
      cells: createRows(this.#columns, this.#rows),
      cursor: { column: 0, row: 0 },
    };
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#tabStops = defaultTabStops(this.#columns);
    this.#onKittyGraphics = options.onKittyGraphics;
    this.#onWindowSizeQuery = options.onWindowSizeQuery;
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

  get alternate(): boolean {
    return this.#mainState !== undefined;
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
      this.#scrollback.splice(0, this.#scrollback.length - this.#scrollbackLimit);
    }
  }

  /** How many kitty graphics sequences arrived and were swallowed undrawn. */
  get kittyGraphicsConsumed(): number {
    return this.#kittyGraphicsConsumed;
  }

  write(data: string | Uint8Array): void {
    const decoded = typeof data === "string"
      ? this.#decoder.decode() + data
      : this.#decoder.decode(data, { stream: true });
    let text = this.#pendingControl + decoded;
    this.#pendingControl = "";
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
      this.#writeChar(char);
      index += char.length;
    }
  }

  resize(columns: number, rows: number): void {
    const nextColumns = normalizeTerminalDimension(columns, this.#columns);
    const nextRows = normalizeTerminalDimension(rows, this.#rows);
    if (nextColumns === this.#columns && nextRows === this.#rows) return;
    this.#columns = nextColumns;
    this.#rows = nextRows;
    this.#state = resizeState(this.#state, nextColumns, nextRows);
    if (this.#mainState) this.#mainState = resizeState(this.#mainState, nextColumns, nextRows);
    // Narrowing can slice a wide glyph off at the new right edge.
    for (const row of this.#state.cells) this.#repairRow(row);
    if (this.#mainState) { for (const row of this.#mainState.cells) this.#repairRow(row); }
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#tabStops = resizeTabStops(this.#tabStops, this.#columns);
    this.#pendingWrap = false;
  }

  clear(): void {
    this.#decoder.decode();
    this.#pendingControl = "";
    this.#discardingString = false;
    this.#state.cells = createRows(this.#columns, this.#rows);
    this.#state.cursor = { column: 0, row: 0 };
    this.#scrollRegion = fullScrollRegion(this.#rows);
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
    // LF, VT and FF all index. They return to column 0 only under LNM; treating
    // them as newlines unconditionally drags every `cud1` cursor-down to the
    // left edge, which corrupts any full-screen app that moves down a column at
    // a time — and does it right where the app was drawing.
    if (char === "\n" || char === "\v" || char === "\f") {
      this.#pendingWrap = false;
      if (this.#lineFeedNewline) this.#state.cursor.column = 0;
      this.#index();
      return;
    }
    if (char === "\r") {
      this.#pendingWrap = false;
      this.#state.cursor.column = 0;
      return;
    }
    if (char === "\b") {
      this.#pendingWrap = false;
      this.#state.cursor.column = Math.max(0, this.#state.cursor.column - 1);
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
    const width = terminalGraphicWidth(glyph);
    const cell = this.#styledCell(glyph);
    this.#placeGlyph(cell, width);
    this.#lastPrintableCell = { ...cell };
    this.#lastPrintableWidth = width;
  }

  #placeGlyph(cell: TerminalScreenCell, width: number): void {
    // Resolve a wrap deferred from a previous edge write before placing this glyph.
    if (this.#pendingWrap) {
      if (this.#autoWrap) {
        this.#state.cursor.column = 0;
        this.#index();
      }
      this.#pendingWrap = false;
    }
    // A double-width glyph that cannot fit in the final column wraps first.
    if (width === 2 && this.#autoWrap && this.#state.cursor.column >= this.#columns - 1) {
      this.#putCellAt(this.#state.cursor.column, BLANK_CELL, false);
      this.#state.cursor.column = 0;
      this.#index();
    }
    const startColumn = this.#state.cursor.column;
    // Landing on either half of an existing wide pair erases the whole pair, so
    // no orphaned glyph or continuation is left behind to shift the row.
    this.#breakPairAt(startColumn);
    if (width === 2) this.#breakPairAt(startColumn + 1);
    this.#putCellAt(startColumn, cell, true);
    const lastColumn = Math.min(this.#columns - 1, startColumn + width - 1);
    for (let column = startColumn + 1; column <= lastColumn; column += 1) {
      this.#putCellAt(column, CONTINUATION_CELL, false);
    }
    // Insert mode shifted the rest of the row, which can cut a pair further along.
    if (this.#insertMode) this.#repairRow(this.#state.cells[this.#state.cursor.row]!);
    if (lastColumn >= this.#columns - 1) {
      // At the right edge park the cursor and defer the wrap; only the next
      // printable character (if autowrap is on) actually advances + scrolls.
      this.#state.cursor.column = this.#columns - 1;
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
    if (row[column]?.continuation && column > 0) row[column - 1] = this.#blankLike(row[column - 1]);
    if (row[column + 1]?.continuation && terminalGraphicWidth(row[column]?.char ?? " ") === 2) {
      row[column + 1] = this.#blankLike(row[column + 1]);
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
        row[column] = this.#blankLike(cell);
        column += 1;
        continue;
      }
      if (terminalGraphicWidth(cell?.char ?? " ") === 2) {
        if (column + 1 < this.#columns && row[column + 1]?.continuation) {
          column += 2;
          continue;
        }
        row[column] = this.#blankLike(cell);
      }
      column += 1;
    }
  }

  /** A blank that keeps the cell's background, so repairs leave no pale gap. */
  #blankLike(cell: TerminalScreenCell | undefined): TerminalScreenCell {
    return cell?.background === undefined ? BLANK_CELL : { char: " ", background: cell.background };
  }

  #putCellAt(column: number, cell: TerminalScreenCell, insert: boolean): void {
    const row = this.#state.cells[this.#state.cursor.row]!;
    if (insert && this.#insertMode) {
      row.splice(column, 0, { char: " " });
      row.length = this.#columns;
    }
    row[column] = cell;
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

  /** NEL: unlike a bare LF this always returns to column 0. */
  #newline(): void {
    this.#state.cursor.column = 0;
    this.#index();
  }

  #index(): void {
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

  #applyControl(sequence: ParsedTerminalControlSequence): void {
    // Any control sequence other than a pure style change (SGR `m`) breaks the
    // printable run, so the deferred-wrap latch no longer applies. SGR keeps it
    // so autowrap streams that recolor mid-line (pagers, syntax highlighting)
    // still wrap at the right edge.
    if (sequence.command !== "m") this.#pendingWrap = false;
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
    const params = parseTerminalParams(sequence.params);
    if (sequence.private && (sequence.command === "h" || sequence.command === "l")) {
      this.#applyPrivateModes(params, sequence.command === "h");
      return;
    }
    if (sequence.command === "h" || sequence.command === "l") {
      this.#applyModes(params, sequence.command === "h");
      return;
    }
    switch (sequence.command) {
      case "m":
        this.#applySgr(params);
        break;
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
      case "A":
        this.#state.cursor.row = clamp(this.#state.cursor.row - (params[0] || 1), 0, this.#rows - 1);
        break;
      case "B":
        this.#state.cursor.row = clamp(this.#state.cursor.row + (params[0] || 1), 0, this.#rows - 1);
        break;
      case "C":
        this.#state.cursor.column = clamp(this.#state.cursor.column + (params[0] || 1), 0, this.#columns - 1);
        break;
      case "a":
        this.#state.cursor.column = clamp(this.#state.cursor.column + (params[0] || 1), 0, this.#columns - 1);
        break;
      case "D":
        if (sequence.kind === "esc") {
          this.#index();
          break;
        }
        this.#state.cursor.column = clamp(this.#state.cursor.column - (params[0] || 1), 0, this.#columns - 1);
        break;
      case "E":
        if (sequence.kind === "esc") {
          this.#newline();
          break;
        }
        this.#state.cursor.row = clamp(this.#state.cursor.row + (params[0] || 1), 0, this.#rows - 1);
        this.#state.cursor.column = 0;
        break;
      case "F":
        this.#state.cursor.row = clamp(this.#state.cursor.row - (params[0] || 1), 0, this.#rows - 1);
        this.#state.cursor.column = 0;
        break;
      case "G":
        this.#state.cursor.column = clamp((params[0] || 1) - 1, 0, this.#columns - 1);
        break;
      case "`":
        this.#state.cursor.column = clamp((params[0] || 1) - 1, 0, this.#columns - 1);
        break;
      case "d":
        this.#setCursorPosition(params[0] || 1, this.#state.cursor.column + 1);
        break;
      case "e":
        this.#state.cursor.row = clamp(this.#state.cursor.row + (params[0] || 1), 0, this.#rows - 1);
        break;
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
      case "s":
      case "7":
        this.#saveCursor();
        break;
      case "u":
      case "8":
        this.#restoreCursor();
        break;
    }
  }

  #applyOsc(payload: string): void {
    const separator = payload.indexOf(";");
    if (separator < 0) return;
    const code = payload.slice(0, separator);
    if (code === "0" || code === "2") {
      this.#title = payload.slice(separator + 1);
      return;
    }
    if (code === "7") {
      this.#applyWorkingDirectory(payload.slice(separator + 1));
      return;
    }
    if (code === "8") this.#applyHyperlink(payload.slice(separator + 1));
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
          this.#state.cursor = {
            column: 0,
            row: enabled ? this.#scrollRegion.top : 0,
          };
        }
        if (mode === 7) this.#autoWrap = enabled;
        if (mode === 47 || mode === 1047) enabled ? this.#enterAlternate() : this.#exitAlternate();
        if (mode === 1048) enabled ? this.#saveCursor() : this.#restoreCursor();
        if (mode === 1049) {
          if (enabled) {
            this.#saveCursor();
            this.#enterAlternate();
          } else {
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
    const nextColumn = clamp(column - 1, 0, this.#columns - 1);
    if (!this.#originMode) {
      this.#state.cursor = {
        column: nextColumn,
        row: clamp(row - 1, 0, this.#rows - 1),
      };
      return;
    }
    this.#state.cursor = {
      column: nextColumn,
      row: clamp(this.#scrollRegion.top + row - 1, this.#scrollRegion.top, this.#scrollRegion.bottom),
    };
  }

  #setTabStop(): void {
    this.#tabStops.add(this.#state.cursor.column);
  }

  #saveCursor(): void {
    this.#savedCursor = { ...this.#state.cursor };
  }

  #restoreCursor(): void {
    if (!this.#savedCursor) return;
    this.#state.cursor = {
      column: clamp(this.#savedCursor.column, 0, this.#columns - 1),
      row: clamp(this.#savedCursor.row, 0, this.#rows - 1),
    };
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

  #applySgr(params: number[]): void {
    const values = params.length === 0 ? [0] : params;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index]!;
      if (value === 0) this.#style = {};
      else if (value === 1) this.#style.bold = true;
      else if (value === 22) this.#style.bold = false;
      else if (value >= 30 && value <= 37) this.#style.foreground = value;
      else if (value >= 90 && value <= 97) this.#style.foreground = value;
      else if (value === 39) delete this.#style.foreground;
      else if (value >= 40 && value <= 47) this.#style.background = value;
      else if (value >= 100 && value <= 107) this.#style.background = value;
      else if (value === 49) delete this.#style.background;
      else if (value === 38 || value === 48) {
        const parsed = parseExtendedSgrColor(values, index);
        if (parsed) {
          if (value === 38) this.#style.foreground = parsed.color;
          else this.#style.background = parsed.color;
          index = parsed.nextIndex;
        }
      }
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
      }
      // A full-row fill cannot leave half a pair, so no repair is needed here.
      // ED 3 additionally drops saved lines, matching xterm.
      if (mode === 3) this.#scrollback = [];
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
    const amount = clamp(Math.floor(count), 1, this.#columns - column);
    shiftCellsRight(row, column, amount, this.#columns, this.#eraseCell());
    this.#repairRow(row);
  }

  #deleteCharacters(count: number): void {
    const row = this.#state.cells[this.#state.cursor.row]!;
    const column = this.#state.cursor.column;
    const amount = clamp(Math.floor(count), 1, this.#columns - column);
    shiftCellsLeft(row, column, amount, this.#columns, this.#eraseCell());
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
    const amount = clamp(Math.floor(count), 1, this.#scrollRegion.bottom - row + 1);
    for (let index = 0; index < amount; index += 1) {
      this.#state.cells.splice(row, 0, this.#eraseRow());
      this.#state.cells.splice(this.#scrollRegion.bottom + 1, 1);
    }
  }

  #deleteLines(count: number): void {
    const row = this.#state.cursor.row;
    if (row < this.#scrollRegion.top || row > this.#scrollRegion.bottom) return;
    const amount = clamp(Math.floor(count), 1, this.#scrollRegion.bottom - row + 1);
    for (let index = 0; index < amount; index += 1) {
      this.#state.cells.splice(row, 1);
      this.#state.cells.splice(this.#scrollRegion.bottom, 0, this.#eraseRow());
    }
  }

  #setScrollRegion(params: number[]): void {
    if (params.length === 0) {
      this.#scrollRegion = fullScrollRegion(this.#rows);
      this.#state.cursor = { column: 0, row: 0 };
      return;
    }
    const top = clamp((params[0] || 1) - 1, 0, this.#rows - 1);
    const bottom = clamp((params[1] || this.#rows) - 1, 0, this.#rows - 1);
    if (bottom <= top) {
      this.#scrollRegion = fullScrollRegion(this.#rows);
      this.#state.cursor = { column: 0, row: 0 };
      return;
    }
    this.#scrollRegion = { top, bottom };
    this.#state.cursor = { column: 0, row: 0 };
  }

  #scrollRegionUp(top: number, bottom: number, count: number): void {
    const amount = clamp(Math.floor(count), 1, bottom - top + 1);
    for (let index = 0; index < amount; index += 1) {
      const shifted = this.#state.cells.splice(top, 1)[0] ?? blankRow(this.#columns);
      if (top === 0 && bottom === this.#rows - 1 && !this.alternate) {
        this.#scrollback.push(shifted);
        if (this.#scrollback.length > this.#scrollbackLimit) this.#scrollback.shift();
      }
      this.#state.cells.splice(bottom, 0, this.#eraseRow());
    }
  }

  #scrollRegionDown(top: number, bottom: number, count: number): void {
    const amount = clamp(Math.floor(count), 1, bottom - top + 1);
    for (let index = 0; index < amount; index += 1) {
      this.#state.cells.splice(bottom, 1);
      this.#state.cells.splice(top, 0, this.#eraseRow());
    }
  }

  #reverseIndex(): void {
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
    this.#savedCursor = undefined;
    this.#title = undefined;
    this.#workingDirectory = undefined;
    this.#hyperlink = undefined;
    this.#cursorVisible = true;
    this.#cursorStyle = { shape: "block", blinking: true };
    this.#privateModes.clear();
    this.#originMode = false;
    this.#autoWrap = true;
    this.#insertMode = false;
    this.#lineFeedNewline = false;
    this.#lastPrintableCell = undefined;
    this.#lastPrintableWidth = 1;
    this.clear();
  }

  #enterAlternate(): void {
    if (this.#mainState) return;
    this.#mainState = cloneState(this.#state);
    this.#state = { cells: createRows(this.#columns, this.#rows), cursor: { column: 0, row: 0 } };
    this.#scrollRegion = fullScrollRegion(this.#rows);
  }

  #exitAlternate(): void {
    if (!this.#mainState) return;
    this.#state = this.#mainState;
    this.#mainState = undefined;
    this.#scrollRegion = fullScrollRegion(this.#rows);
    this.#originMode = false;
  }
}

interface TerminalScreenScrollRegion {
  top: number;
  bottom: number;
}

function parseExtendedSgrColor(
  values: readonly number[],
  index: number,
): { color: number; nextIndex: number } | undefined {
  const mode = values[index + 1];
  if (mode === 5) {
    const color = values[index + 2];
    if (color === undefined) return undefined;
    return { color: encodeTerminalIndexedColor(color), nextIndex: index + 2 };
  }
  if (mode === 2) {
    const red = values[index + 2];
    const green = values[index + 3];
    const blue = values[index + 4];
    if (red === undefined || green === undefined || blue === undefined) return undefined;
    return {
      color: encodeTerminalRgbColor(red, green, blue),
      nextIndex: index + 4,
    };
  }
  return undefined;
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

  UNICODE_CHAR_REGEXP.lastIndex = index;
  const match = UNICODE_CHAR_REGEXP.exec(text);
  if (match?.index === index) return match[0];

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

function terminalGraphicWidth(char: string): number {
  return Math.max(1, Math.min(2, textWidth(char)));
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

function defaultTabStops(columns: number): Set<number> {
  const stops = new Set<number>();
  for (let column = 8; column < columns; column += 8) stops.add(column);
  return stops;
}

function resizeTabStops(stops: Set<number>, columns: number): Set<number> {
  const resized = new Set<number>();
  for (const stop of stops) {
    if (stop > 0 && stop < columns) resized.add(stop);
  }
  for (let column = 8; column < columns; column += 8) {
    if (stops.has(column)) resized.add(column);
  }
  return resized;
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
    for (let column = 0; column < Math.min(columns, state.cells[row]!.length); column += 1) {
      cells[row]![column] = { ...state.cells[row]![column]! };
    }
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
