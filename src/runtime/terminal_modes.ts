// Copyright 2023 Im-Beast. MIT license.
import { parseTerminalControlSequence } from "./terminal_sequences.ts";

const MAX_PENDING_CONTROL_LENGTH = 4 * 1024;

/**
 * DEC private modes worth re-asserting on a fresh view. Everything here is
 * sticky terminal state a program sets once and never repeats, so it is exactly
 * what a truncated replay loses.
 */
const STICKY_PRIVATE_MODES: readonly number[] = Object.freeze([
  1, // DECCKM application cursor keys
  7, // autowrap
  9, // X10 mouse
  47, // legacy alternate screen
  1000, // mouse press tracking
  1002, // button-event tracking
  1003, // any-event tracking
  1004, // focus reporting
  1005, // UTF-8 mouse
  1006, // SGR mouse
  1015, // urxvt mouse
  1047, // alternate screen
  1049, // alternate screen + saved cursor
  2004, // bracketed paste
  2027, // grapheme cluster width mode
]);

const STICKY_MODE_SET: ReadonlySet<number> = new Set(STICKY_PRIVATE_MODES);
/** Alternate-screen modes are emitted last so entering does not clobber the rest. */
const ALTERNATE_MODES: ReadonlySet<number> = new Set([47, 1047, 1049]);
const MAX_KITTY_KEYBOARD_STACK = 16;
const KITTY_KEYBOARD_FLAG_MASK = 0b11111;

/** Serializable view of the sticky terminal mode state tracked across a raw byte stream. */
export interface TerminalModeInspection {
  readonly modes: readonly number[];
  readonly cursorVisible: boolean;
  readonly cursorStyleCode: number;
}

/**
 * Tracks sticky DEC private modes, cursor visibility/shape (`DECSCUSR`), and
 * enhanced keyboard protocol state (`CSI > ... u` / `modifyOtherKeys`) across
 * a raw PTY byte stream so a client attaching after a replay buffer rotates
 * can still receive an idempotent mode preamble.
 *
 * Deliberately lighter than a full screen model: it skips printable runs
 * wholesale and inspects only escape sequences.
 */
export class TerminalModeTracker {
  #pending = "";
  readonly #modes = new Set<number>();
  #cursorVisible = true;
  #cursorStyleCode = 0;
  #kittyKeyboard: { main: number[]; alternate: number[] } = { main: [], alternate: [] };
  #modifyOtherKeys = 0;
  readonly #decoder = new TextDecoder();

  /** Feeds one raw output chunk from the child process. */
  write(data: string | Uint8Array): void {
    const decoded = typeof data === "string"
      ? this.#decoder.decode() + data
      : this.#decoder.decode(data, { stream: true });
    const text = this.#pending + decoded;
    this.#pending = "";
    let index = 0;
    while (index < text.length) {
      const escape = text.indexOf("\x1b", index);
      // Printable runs carry no sticky state, so skip them in one jump.
      if (escape < 0) break;
      const parsed = parseTerminalControlSequence(text, escape);
      if (!parsed) {
        // A trailing partial sequence must survive into the next chunk.
        const suffix = text.slice(escape);
        if (suffix.length < MAX_PENDING_CONTROL_LENGTH) this.#pending = suffix;
        return;
      }
      this.#apply(parsed);
      index = escape + parsed.length;
    }
  }

  #isAlternate(): boolean {
    return this.#modes.has(47) || this.#modes.has(1047) || this.#modes.has(1049);
  }

  #apply(sequence: ReturnType<typeof parseTerminalControlSequence>): void {
    if (!sequence) return;
    // A full reset drops everything the program had established.
    if (sequence.kind === "esc" && sequence.command === "c") {
      this.#modes.clear();
      this.#cursorVisible = true;
      this.#cursorStyleCode = 0;
      this.#kittyKeyboard = { main: [], alternate: [] };
      this.#modifyOtherKeys = 0;
      return;
    }
    if (sequence.kind !== "csi") return;
    if (sequence.intermediates === " " && !sequence.prefix && sequence.command === "q") {
      const code = sequence.params === "" ? 0 : Number.parseInt(sequence.params.split(";")[0] ?? "0", 10);
      this.#cursorStyleCode = Number.isInteger(code) && code >= 0 && code <= 6 ? code : 0;
      return;
    }
    if (sequence.intermediates) return;
    if (sequence.prefix === ">" || sequence.prefix === "<" || sequence.prefix === "=") {
      this.#applyKeyboardProtocol(sequence);
      return;
    }
    if (sequence.prefix !== "?") return;
    if (sequence.command !== "h" && sequence.command !== "l") return;
    const enabled = sequence.command === "h";
    for (const raw of sequence.params.split(";")) {
      if (raw === "") continue;
      const mode = Number.parseInt(raw, 10);
      if (!Number.isInteger(mode)) continue;
      if (mode === 25) {
        this.#cursorVisible = enabled;
        continue;
      }
      if (!STICKY_MODE_SET.has(mode)) continue;
      if (enabled) this.#modes.add(mode);
      else this.#modes.delete(mode);
    }
  }

  #applyKeyboardProtocol(sequence: NonNullable<ReturnType<typeof parseTerminalControlSequence>>): void {
    const params = sequence.params === ""
      ? []
      : sequence.params.split(";").map((part) => (part === "" ? 0 : Number.parseInt(part, 10) || 0));
    if (sequence.command === "u") {
      const stack = this.#isAlternate() ? this.#kittyKeyboard.alternate : this.#kittyKeyboard.main;
      if (sequence.prefix === ">") {
        stack.push((params[0] ?? 0) & KITTY_KEYBOARD_FLAG_MASK);
        if (stack.length > MAX_KITTY_KEYBOARD_STACK) stack.shift();
      } else if (sequence.prefix === "<") {
        stack.splice(Math.max(0, stack.length - Math.max(1, params[0] || 1)));
      } else if (sequence.prefix === "=") {
        const flags = (params[0] ?? 0) & KITTY_KEYBOARD_FLAG_MASK;
        const current = stack.length > 0 ? stack[stack.length - 1]! : 0;
        const mode = params[1] || 1;
        const next = mode === 2 ? current | flags : mode === 3 ? current & ~flags : flags;
        if (stack.length > 0) stack[stack.length - 1] = next;
        else stack.push(next);
      }
      return;
    }
    if (sequence.command === "m" && sequence.prefix === ">") {
      if (params.length === 0 || params[0] === 4) {
        this.#modifyOtherKeys = Math.max(0, Math.min(2, params[1] ?? 0));
      }
      return;
    }
    if (sequence.command === "n" && sequence.prefix === ">") {
      if (params.length === 0 || params[0] === 4) this.#modifyOtherKeys = 0;
    }
  }

  /**
   * Returns escape sequences that re-establish the tracked sticky state on a
   * fresh view. Safe to replay ahead of retained output: every emitted control
   * is idempotent and leaves the terminal in the same state as the live child.
   */
  preamble(): string {
    const plain: number[] = [];
    const alternate: number[] = [];
    for (const mode of STICKY_PRIVATE_MODES) {
      if (!this.#modes.has(mode)) continue;
      (ALTERNATE_MODES.has(mode) ? alternate : plain).push(mode);
    }
    let output = "";
    for (const mode of plain) output += `\x1b[?${mode}h`;
    const mainKitty = this.#kittyKeyboard.main.at(-1) ?? 0;
    if (mainKitty !== 0) output += `\x1b[=${mainKitty};1u`;
    for (const mode of alternate) output += `\x1b[?${mode}h`;
    if (alternate.length > 0) {
      const altKitty = this.#kittyKeyboard.alternate.at(-1) ?? 0;
      if (altKitty !== 0) output += `\x1b[=${altKitty};1u`;
    }
    if (this.#modifyOtherKeys > 0) output += `\x1b[>4;${this.#modifyOtherKeys}m`;
    if (this.#cursorStyleCode !== 0) output += `\x1b[${this.#cursorStyleCode} q`;
    if (!this.#cursorVisible) output += "\x1b[?25l";
    return output;
  }

  /** Returns a clone-safe snapshot of tracked modes and cursor state. */
  inspect(): TerminalModeInspection {
    return {
      modes: [...this.#modes].sort((left, right) => left - right),
      cursorVisible: this.#cursorVisible,
      cursorStyleCode: this.#cursorStyleCode,
    };
  }
}
