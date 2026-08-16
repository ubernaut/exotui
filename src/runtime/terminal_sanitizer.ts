// Copyright 2023 Im-Beast. MIT license.

// SEC-005: untrusted terminal text passes through an ALLOWLIST, never a
// blocklist. The sanitizer feeds the TERM-001 incremental parser (so
// split chunks cannot smuggle a sequence past it) and re-serializes only
// the token classes its profile grants: plain text with CR/LF/TAB, SGR
// styling, OSC 8 hyperlinks, cursor movement. Everything else — titles,
// clipboard writes, input-mode switches, alternate screen, graphics
// (DCS/sixel/APC), unknown CSIs — is dropped and counted, whole, under
// every profile that did not explicitly allow it.

import { createIncrementalTerminalParser, type TerminalParserLimits, type TerminalToken } from "./terminal_parser.ts";

/** Allowlist profiles, cumulative from plain text up. */
export type TerminalSanitizerProfile = "plain-text" | "sgr" | "links" | "cursor";

/** What one sanitize pass dropped, by class. */
export interface SanitizerDropReport {
  readonly osc: number;
  readonly dcs: number;
  readonly apc: number;
  readonly csi: number;
  readonly esc: number;
  readonly control: number;
  readonly diagnostics: number;
}

const ALLOWED_CONTROLS = new Set([0x09, 0x0a, 0x0d]); // TAB LF CR
const CURSOR_FINALS = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "s", "u"]);

/** The streaming sanitizer. */
export class StreamingTerminalSanitizer {
  readonly #parser: ReturnType<typeof createIncrementalTerminalParser>;
  readonly #profile: TerminalSanitizerProfile;
  #dropped = { osc: 0, dcs: 0, apc: 0, csi: 0, esc: 0, control: 0, diagnostics: 0 };

  constructor(options: { profile?: TerminalSanitizerProfile; limits?: TerminalParserLimits } = {}) {
    this.#profile = options.profile ?? "sgr";
    this.#parser = createIncrementalTerminalParser(options.limits);
  }

  /** Sanitizes one chunk; safe output only, split points never matter. */
  write(chunk: Uint8Array | string): string {
    return this.#serialize(this.#parser.write(chunk));
  }

  /** Ends the stream. An unterminated tail is dropped, not emitted. */
  flush(): string {
    const tail = this.#parser.flush();
    // flush() surfaces unterminated sequences as text; for UNTRUSTED input
    // that text still begins with ESC, so it is discarded here.
    for (const token of tail) {
      if (token.kind === "text" && !token.text.startsWith("\x1b")) return this.#clean(token.text);
    }
    return "";
  }

  /** Cumulative drop counts by class. */
  dropped(): SanitizerDropReport {
    return { ...this.#dropped };
  }

  #serialize(tokens: TerminalToken[]): string {
    let out = "";
    for (const token of tokens) {
      switch (token.kind) {
        case "text":
          out += this.#clean(token.text);
          break;
        case "control":
          if (ALLOWED_CONTROLS.has(token.code)) out += String.fromCharCode(token.code);
          else this.#dropped.control += 1;
          break;
        case "csi":
          if (this.#allowCsi(token)) {
            out += `\x1b[${token.prefix}${token.params}${token.intermediates}${token.final}`;
          } else this.#dropped.csi += 1;
          break;
        case "osc":
          if (this.#allowOsc(token.data)) out += `\x1b]${token.data}\x1b\\`;
          else this.#dropped.osc += 1;
          break;
        case "dcs":
          this.#dropped.dcs += 1;
          break;
        case "apc":
        case "pm":
        case "sos":
          this.#dropped.apc += 1;
          break;
        case "esc":
          // No plain ESC sequence is styling; all are dropped (charset
          // switches, keypad modes, RIS).
          this.#dropped.esc += 1;
          break;
        case "diagnostic":
          this.#dropped.diagnostics += 1;
          break;
      }
    }
    return out;
  }

  /** Strips stray C0/DEL that may sit inside decoded text runs. */
  #clean(text: string): string {
    let out = "";
    for (const char of text) {
      const code = char.codePointAt(0)!;
      if (code >= 0x20 && code !== 0x7f) out += char;
      else if (ALLOWED_CONTROLS.has(code)) out += char;
      else this.#dropped.control += 1;
    }
    return out;
  }

  #allowCsi(token: { prefix: string; intermediates: string; final: string }): boolean {
    // Private-prefix CSIs (DEC modes: mouse, paste, alt screen) are never
    // styling or cursor movement — refused under every profile.
    if (token.prefix !== "" || token.intermediates !== "") return false;
    if (token.final === "m") return this.#profile !== "plain-text";
    if (CURSOR_FINALS.has(token.final)) return this.#profile === "cursor";
    return false;
  }

  #allowOsc(data: string): boolean {
    if (this.#profile !== "links" && this.#profile !== "cursor") return false;
    // OSC 8 hyperlinks only; titles (0/2), clipboard (52), palette (4/10+)
    // and everything else stay dropped.
    return data.startsWith("8;");
  }
}

/** Creates a streaming sanitizer (default profile: SGR styling only). */
export function createStreamingTerminalSanitizer(
  options: { profile?: TerminalSanitizerProfile; limits?: TerminalParserLimits } = {},
): StreamingTerminalSanitizer {
  return new StreamingTerminalSanitizer(options);
}
