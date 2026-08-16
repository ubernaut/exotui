// Copyright 2023 Im-Beast. MIT license.

// TERM-001: incremental terminal decoding. One parser instance receives raw
// PTY bytes in arbitrary chunk boundaries and emits the same token stream
// as if the whole corpus had arrived in one write: incomplete UTF-8 bytes
// ride the streaming TextDecoder, and incomplete escape sequences (ESC,
// CSI, OSC, DCS, APC, PM, SOS) are carried between writes instead of being
// misread as text. Tokens are structural — printable runs, C0 controls,
// and parsed control sequences — so screen models, mode trackers, and
// sanitizers all consume one decoder instead of re-splitting bytes
// chunk-locally.

/** One decoded terminal token. */
export type TerminalToken =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "control"; readonly code: number }
  | { readonly kind: "esc"; readonly intermediates: string; readonly final: string }
  | {
    readonly kind: "csi";
    readonly prefix: string;
    readonly params: string;
    readonly intermediates: string;
    readonly final: string;
  }
  | { readonly kind: "osc"; readonly data: string; readonly terminator: "bel" | "st" }
  | { readonly kind: "dcs" | "apc" | "pm" | "sos"; readonly data: string }
  | { readonly kind: "diagnostic"; readonly reason: TerminalParserBreach; readonly dropped: number };

/** TERM-002 bound-breach classifications. */
export type TerminalParserBreach =
  | "string-bytes-exceeded"
  | "csi-params-exceeded"
  | "pending-bytes-exceeded"
  | "pending-writes-exceeded";

/** TERM-002 configurable bounds. */
export interface TerminalParserLimits {
  /** Max OSC/DCS/APC/PM/SOS payload before the sequence is discarded. */
  readonly maxStringBytes?: number;
  /** Max CSI parameter characters before the sequence is discarded. */
  readonly maxCsiParamBytes?: number;
  /** Max bytes an incomplete sequence may hold between writes. */
  readonly maxPendingBytes?: number;
  /** Max write() calls an incomplete sequence may survive. */
  readonly maxPendingWrites?: number;
}

const ESC = "\x1b";
const BEL = "\x07";
const STRING_OPENERS: Readonly<Record<string, "dcs" | "apc" | "pm" | "sos" | "osc">> = {
  "P": "dcs",
  "_": "apc",
  "^": "pm",
  "X": "sos",
  "]": "osc",
};

/** The incremental parser. */
export class IncrementalTerminalParser {
  readonly #decoder = new TextDecoder();
  /** Undecided tail: an escape sequence still waiting for its terminator. */
  #carry = "";
  /** Writes the current carry has survived (TERM-002 lifetime bound). */
  #carryAge = 0;
  /** Active discard of an overlong string sequence until its terminator. */
  #discard?: { kind: "osc" | "dcs" | "apc" | "pm" | "sos"; dropped: number };
  /** The discarded chunk ended in ESC — the ST may complete next write. */
  #discardSawEsc = false;
  readonly #maxStringBytes: number;
  readonly #maxCsiParamBytes: number;
  readonly #maxPendingBytes: number;
  readonly #maxPendingWrites: number;

  constructor(limits: TerminalParserLimits = {}) {
    this.#maxStringBytes = limits.maxStringBytes ?? 64 * 1024;
    this.#maxCsiParamBytes = limits.maxCsiParamBytes ?? 256;
    this.#maxPendingBytes = limits.maxPendingBytes ?? 64 * 1024;
    this.#maxPendingWrites = limits.maxPendingWrites ?? 1024;
  }

  /**
   * Feeds one chunk and returns the tokens it completed. Split points never
   * change the token stream — partial UTF-8 and partial sequences wait —
   * and every TERM-002 bound breach recovers to ground state with one
   * classified diagnostic token instead of unbounded buffering.
   */
  write(chunk: Uint8Array | string): TerminalToken[] {
    const decoded = typeof chunk === "string" ? chunk : this.#decoder.decode(chunk, { stream: true });
    const tokens: TerminalToken[] = [];
    let incoming = decoded;

    // An overlong string sequence is being discarded: swallow bytes until
    // its terminator, holding no memory and doing one linear scan.
    if (this.#discard) {
      const ended = this.#consumeDiscard(incoming, tokens);
      if (ended < 0) return tokens;
      incoming = incoming.slice(ended);
    }

    if (this.#carry !== "") {
      this.#carryAge += 1;
      if (this.#carryAge > this.#maxPendingWrites) {
        tokens.push({ kind: "diagnostic", reason: "pending-writes-exceeded", dropped: this.#carry.length });
        this.#carry = "";
        this.#carryAge = 0;
      }
    }
    const text = this.#carry + incoming;
    this.#carry = "";
    let index = 0;
    let textStart = 0;

    const flushText = (end: number): void => {
      if (end > textStart) tokens.push({ kind: "text", text: text.slice(textStart, end) });
    };

    while (index < text.length) {
      const char = text[index]!;
      const code = char.charCodeAt(0);
      if (char === ESC) {
        flushText(index);
        const consumed = this.#parseEscape(text, index, tokens);
        if (consumed === 0) {
          // Incomplete sequence: carry the tail into the next write —
          // unless it already breaches a bound, in which case recover to
          // ground now with a classified diagnostic.
          const tail = text.slice(index);
          if (tail.length > this.#maxPendingBytes) {
            const stringKind = tail.length >= 2 ? STRING_OPENERS[tail[1]!] : undefined;
            tokens.push({ kind: "diagnostic", reason: "pending-bytes-exceeded", dropped: tail.length });
            if (stringKind) {
              // Keep swallowing until the terminator, holding no memory.
              this.#discard = { kind: stringKind, dropped: tail.length };
            }
            this.#carryAge = 0;
            return tokens;
          }
          this.#carry = tail;
          return tokens;
        }
        index += consumed;
        textStart = index;
        continue;
      }
      if (code < 0x20 || code === 0x7f) {
        flushText(index);
        tokens.push({ kind: "control", code });
        index += 1;
        textStart = index;
        continue;
      }
      index += 1;
    }
    flushText(text.length);
    this.#carryAge = 0;
    return tokens;
  }

  /** Ends the stream: an unterminated sequence is surfaced as text. */
  flush(): TerminalToken[] {
    const tail = this.#carry + this.#decoder.decode();
    this.#carry = "";
    this.#carryAge = 0;
    this.#discard = undefined;
    this.#discardSawEsc = false;
    return tail.length > 0 ? [{ kind: "text", text: tail }] : [];
  }

  /**
   * Swallows discarded string-sequence bytes until the terminator. Returns
   * the index just past the terminator, or -1 when the chunk ends inside
   * the discard (the diagnostic was already emitted at breach time).
   */
  #consumeDiscard(text: string, _tokens: TerminalToken[]): number {
    const discard = this.#discard!;
    // A chunk boundary may split the ST terminator (ESC | \).
    if (this.#discardSawEsc && text[0] === "\\") {
      this.#discard = undefined;
      this.#discardSawEsc = false;
      return 1;
    }
    this.#discardSawEsc = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]!;
      if (discard.kind === "osc" && char === BEL) {
        this.#discard = undefined;
        return index + 1;
      }
      if (char === ESC) {
        if (index + 1 >= text.length) {
          this.#discardSawEsc = true;
          break;
        }
        if (text[index + 1] === "\\") {
          this.#discard = undefined;
          return index + 2;
        }
      }
    }
    discard.dropped += text.length;
    return -1;
  }

  /** Bytes currently held back waiting for completion (diagnostics). */
  pendingLength(): number {
    return this.#carry.length;
  }

  /** Parses one escape sequence at `start`; 0 means incomplete. */
  #parseEscape(text: string, start: number, tokens: TerminalToken[]): number {
    if (start + 1 >= text.length) return 0;
    const introducer = text[start + 1]!;

    if (introducer === "[") {
      // CSI: ESC [ prefix? params intermediates final(0x40-0x7E)
      let index = start + 2;
      let prefix = "";
      if (index < text.length && "<=>?".includes(text[index]!)) {
        prefix = text[index]!;
        index += 1;
      }
      const paramsStart = index;
      while (index < text.length && /[0-9;:]/.test(text[index]!)) index += 1;
      const params = text.slice(paramsStart, index);
      if (params.length > this.#maxCsiParamBytes) {
        // Ground-state recovery: the malformed CSI is dropped whole.
        tokens.push({ kind: "diagnostic", reason: "csi-params-exceeded", dropped: index - start });
        return index - start;
      }
      const intermediatesStart = index;
      while (index < text.length && text[index]! >= " " && text[index]! <= "/") index += 1;
      const intermediates = text.slice(intermediatesStart, index);
      if (index >= text.length) return 0;
      const final = text[index]!;
      const finalCode = final.charCodeAt(0);
      if (finalCode < 0x40 || finalCode > 0x7e) {
        // Malformed: emit what we have as an ESC token and resume after it.
        tokens.push({ kind: "esc", intermediates: "[", final });
        return index + 1 - start;
      }
      tokens.push({ kind: "csi", prefix, params, intermediates, final });
      return index + 1 - start;
    }

    const stringKind = STRING_OPENERS[introducer];
    if (stringKind) {
      // String sequences run to ST (ESC \) — OSC also accepts BEL.
      let index = start + 2;
      while (index < text.length) {
        const char = text[index]!;
        if (index - (start + 2) > this.#maxStringBytes) {
          tokens.push({ kind: "diagnostic", reason: "string-bytes-exceeded", dropped: index - start });
          this.#discard = { kind: stringKind, dropped: index - start };
          // The discard consumer owns the rest of this chunk.
          const remainder = this.#consumeDiscard(text.slice(index), tokens);
          return remainder < 0 ? text.length - start : index - start + remainder;
        }
        if (stringKind === "osc" && char === BEL) {
          tokens.push({ kind: "osc", data: text.slice(start + 2, index), terminator: "bel" });
          return index + 1 - start;
        }
        if (char === ESC) {
          if (index + 1 >= text.length) return 0;
          if (text[index + 1] === "\\") {
            const data = text.slice(start + 2, index);
            if (stringKind === "osc") tokens.push({ kind: "osc", data, terminator: "st" });
            else tokens.push({ kind: stringKind, data });
            return index + 2 - start;
          }
        }
        index += 1;
      }
      return 0;
    }

    // Plain ESC sequence: intermediates 0x20-0x2F then one final 0x30-0x7E.
    let index = start + 1;
    const intermediatesStart = index;
    while (index < text.length && text[index]! >= " " && text[index]! <= "/") index += 1;
    if (index >= text.length) return 0;
    tokens.push({ kind: "esc", intermediates: text.slice(intermediatesStart, index), final: text[index]! });
    return index + 1 - start;
  }
}

/** Creates an incremental terminal parser. */
export function createIncrementalTerminalParser(limits: TerminalParserLimits = {}): IncrementalTerminalParser {
  return new IncrementalTerminalParser(limits);
}
