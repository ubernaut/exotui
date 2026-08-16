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
  | { readonly kind: "dcs" | "apc" | "pm" | "sos"; readonly data: string };

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

  /**
   * Feeds one chunk and returns the tokens it completed. Split points never
   * change the token stream — partial UTF-8 and partial sequences wait.
   */
  write(chunk: Uint8Array | string): TerminalToken[] {
    const decoded = typeof chunk === "string" ? chunk : this.#decoder.decode(chunk, { stream: true });
    const text = this.#carry + decoded;
    this.#carry = "";
    const tokens: TerminalToken[] = [];
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
          // Incomplete sequence: carry the tail into the next write.
          this.#carry = text.slice(index);
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
    return tokens;
  }

  /** Ends the stream: an unterminated sequence is surfaced as text. */
  flush(): TerminalToken[] {
    const tail = this.#carry + this.#decoder.decode();
    this.#carry = "";
    return tail.length > 0 ? [{ kind: "text", text: tail }] : [];
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
export function createIncrementalTerminalParser(): IncrementalTerminalParser {
  return new IncrementalTerminalParser();
}
