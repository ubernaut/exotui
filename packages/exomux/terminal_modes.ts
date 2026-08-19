// Copyright 2023 Im-Beast. MIT license.

import { parseTerminalControlSequence } from "@ubernaut/exotui/terminal";

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
]);

const STICKY_MODE_SET: ReadonlySet<number> = new Set(STICKY_PRIVATE_MODES);
/** Alternate-screen modes are emitted last so entering does not clobber the rest. */
const ALTERNATE_MODES: ReadonlySet<number> = new Set([47, 1047, 1049]);

/** Serializable view of the sticky state one session currently holds. */
export interface ExomuxTerminalModeInspection {
  readonly modes: readonly number[];
  readonly cursorVisible: boolean;
}

/**
 * Tracks the DEC private modes a child program has set, so a client attaching
 * after the raw replay buffer has rotated can still be told what the program
 * expects. Without this a long-running session loses mouse reporting, bracketed
 * paste and the alternate screen the moment its opening bytes are evicted.
 *
 * Deliberately not a screen model: it skips printable runs wholesale and only
 * inspects escape sequences, so a daemon can run one per session cheaply.
 */
export class ExomuxTerminalModeTracker {
  #pending = "";
  readonly #modes = new Set<number>();
  #cursorVisible = true;
  readonly #decoder = new TextDecoder();

  /** Feeds one raw output chunk from the child. */
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

  #apply(sequence: ReturnType<typeof parseTerminalControlSequence>): void {
    if (!sequence) return;
    // A full reset drops everything the program had established.
    if (sequence.kind === "esc" && sequence.command === "c") {
      this.#modes.clear();
      this.#cursorVisible = true;
      return;
    }
    if (sequence.kind !== "csi" || sequence.prefix !== "?") return;
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

  /**
   * Sequences that re-establish the tracked state on a view that never saw the
   * originals. Safe to replay ahead of retained output: it only asserts what is
   * true right now, and the replay that follows ends in the same state.
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
    for (const mode of alternate) output += `\x1b[?${mode}h`;
    if (!this.#cursorVisible) output += "\x1b[?25l";
    return output;
  }

  inspect(): ExomuxTerminalModeInspection {
    return { modes: [...this.#modes].sort((left, right) => left - right), cursorVisible: this.#cursorVisible };
  }
}
