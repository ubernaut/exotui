// Copyright 2023 Im-Beast. MIT license.

// TERM-003: every decoded token becomes a VERSIONED operation event
// before any screen applies it. Recognized ECMA-48/DEC operations parse
// into named events with numeric parameters; recognized-but-unhandled
// shapes classify as unsupported; parser bound-breaches surface as
// malformed; deliberately inert controls classify as ignored. EVERY
// event carries the exact raw serialization of its token, so unknown
// controls stay lossless and consumers audit behavior — or forward the
// stream byte-exactly — without ever reparsing raw bytes.

import { createIncrementalTerminalParser, type TerminalParserLimits, type TerminalToken } from "./terminal_parser.ts";

/** Operation event schema version. */
export const TERMINAL_OPERATION_EVENT_VERSION = 1 as const;

/** Event classifications. */
export type OperationClassification = "parsed" | "unsupported" | "malformed" | "ignored";

/** One versioned operation event. */
export interface TerminalOperationEvent {
  readonly version: typeof TERMINAL_OPERATION_EVENT_VERSION;
  readonly classification: OperationClassification;
  /** Named operation for parsed events (e.g. "cursor-up", "sgr"). */
  readonly operation?: string;
  /** Decoded numeric parameters, defaults applied. */
  readonly params?: readonly number[];
  /** The EXACT raw serialization — lossless for every classification. */
  readonly raw: string;
  readonly detail?: string;
}

const CSI_OPERATIONS: Readonly<Record<string, string>> = {
  "A": "cursor-up",
  "B": "cursor-down",
  "C": "cursor-forward",
  "D": "cursor-back",
  "E": "cursor-next-line",
  "F": "cursor-previous-line",
  "G": "cursor-column",
  "H": "cursor-position",
  "f": "cursor-position",
  "J": "erase-display",
  "K": "erase-line",
  "L": "insert-lines",
  "M": "delete-lines",
  "P": "delete-characters",
  "@": "insert-characters",
  "S": "scroll-up",
  "T": "scroll-down",
  "X": "erase-characters",
  "d": "cursor-row",
  "m": "sgr",
  "r": "set-scroll-region",
  "s": "save-cursor",
  "u": "restore-cursor",
  "n": "device-status-report",
  "c": "device-attributes",
};

const DEC_PRIVATE_OPERATIONS: Readonly<Record<string, string>> = {
  "h": "dec-private-set",
  "l": "dec-private-reset",
};

const ESC_OPERATIONS: Readonly<Record<string, string>> = {
  "c": "full-reset",
  "7": "save-cursor",
  "8": "restore-cursor",
  "D": "index",
  "E": "next-line",
  "M": "reverse-index",
  "=": "keypad-application",
  ">": "keypad-numeric",
};

const OSC_OPERATIONS: Readonly<Record<string, string>> = {
  "0": "set-title-and-icon",
  "1": "set-icon",
  "2": "set-title",
  "4": "set-palette",
  "8": "hyperlink",
  "52": "clipboard",
};

/** Controls that are deliberately inert for screen state. */
const IGNORED_CONTROLS = new Set([0x00, 0x05, 0x0e, 0x0f, 0x7f]);

const CONTROL_OPERATIONS: Readonly<Record<number, string>> = {
  0x07: "bell",
  0x08: "backspace",
  0x09: "tab",
  0x0a: "line-feed",
  0x0b: "line-feed",
  0x0c: "line-feed",
  0x0d: "carriage-return",
};

function serialize(token: TerminalToken): string {
  switch (token.kind) {
    case "text":
      return token.text;
    case "control":
      return String.fromCharCode(token.code);
    case "esc":
      return `\x1b${token.intermediates}${token.final}`;
    case "csi":
      return `\x1b[${token.prefix}${token.params}${token.intermediates}${token.final}`;
    case "osc":
      return `\x1b]${token.data}${token.terminator === "bel" ? "\x07" : "\x1b\\"}`;
    case "dcs":
      return `\x1bP${token.data}\x1b\\`;
    case "apc":
      return `\x1b_${token.data}\x1b\\`;
    case "pm":
      return `\x1b^${token.data}\x1b\\`;
    case "sos":
      return `\x1bX${token.data}\x1b\\`;
    case "diagnostic":
      return "";
  }
}

function numericParams(params: string, fallback: number): number[] {
  if (params === "") return [fallback];
  return params.split(";").map((part) => part === "" ? fallback : Number.parseInt(part, 10));
}

function classify(token: TerminalToken): TerminalOperationEvent {
  const raw = serialize(token);
  const base = { version: TERMINAL_OPERATION_EVENT_VERSION, raw } as const;
  switch (token.kind) {
    case "text":
      return { ...base, classification: "parsed", operation: "print" };
    case "control": {
      if (IGNORED_CONTROLS.has(token.code)) {
        return { ...base, classification: "ignored", detail: `inert control 0x${token.code.toString(16)}` };
      }
      const operation = CONTROL_OPERATIONS[token.code];
      if (operation) return { ...base, classification: "parsed", operation };
      return { ...base, classification: "unsupported", detail: `control 0x${token.code.toString(16)}` };
    }
    case "csi": {
      // Only plain and DEC-private ("?") prefixes are recognized; other
      // prefixes (">", "=", "<") are vendor extensions — unsupported.
      const table = token.prefix === "?" ? DEC_PRIVATE_OPERATIONS : token.prefix === "" ? CSI_OPERATIONS : undefined;
      const operation = table !== undefined && token.intermediates === "" ? table[token.final] : undefined;
      if (operation) {
        return {
          ...base,
          classification: "parsed",
          operation,
          params: numericParams(token.params, defaultFor(token.final)),
        };
      }
      return {
        ...base,
        classification: "unsupported",
        detail: `CSI ${token.prefix}${token.intermediates}${token.final}`,
      };
    }
    case "esc": {
      const operation = token.intermediates === "" ? ESC_OPERATIONS[token.final] : undefined;
      if (operation) return { ...base, classification: "parsed", operation };
      if (token.intermediates === "(" || token.intermediates === ")") {
        return { ...base, classification: "parsed", operation: "designate-charset" };
      }
      return { ...base, classification: "unsupported", detail: `ESC ${token.intermediates}${token.final}` };
    }
    case "osc": {
      const selector = token.data.split(";", 1)[0] ?? "";
      const operation = OSC_OPERATIONS[selector];
      if (operation) return { ...base, classification: "parsed", operation };
      return { ...base, classification: "unsupported", detail: `OSC ${selector}` };
    }
    case "dcs":
    case "apc":
    case "pm":
    case "sos":
      return { ...base, classification: "unsupported", detail: `${token.kind.toUpperCase()} string` };
    case "diagnostic":
      return {
        ...base,
        classification: "malformed",
        detail: `${token.reason} (${token.dropped} bytes dropped)`,
      };
  }
}

function defaultFor(final: string): number {
  // Most cursor/erase parameters default to 1; erase selectors to 0.
  return final === "J" || final === "K" || final === "m" ? 0 : 1;
}

/** The operation decoder: bytes in, versioned events out. */
export class TerminalOperationDecoder {
  readonly #parser: ReturnType<typeof createIncrementalTerminalParser>;

  constructor(limits: TerminalParserLimits = {}) {
    this.#parser = createIncrementalTerminalParser(limits);
  }

  write(chunk: Uint8Array | string): TerminalOperationEvent[] {
    return this.#parser.write(chunk).map(classify);
  }

  flush(): TerminalOperationEvent[] {
    return this.#parser.flush().map(classify);
  }
}

/** Creates a terminal operation decoder. */
export function createTerminalOperationDecoder(limits: TerminalParserLimits = {}): TerminalOperationDecoder {
  return new TerminalOperationDecoder(limits);
}
