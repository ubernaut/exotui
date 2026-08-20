// Copyright 2023 Im-Beast. MIT license.

/** Parsed terminal control sequence emitted by the lightweight terminal parser. */
export interface ParsedTerminalControlSequence {
  kind: "csi" | "osc" | "esc" | "dcs" | "apc" | "pm" | "sos";
  private: boolean;
  /**
   * ECMA-48 private-parameter prefix byte (`<`, `=`, `>`, `?`) when present.
   * `?` selects DEC private modes; `<`/`=`/`>` mark xterm extensions such as
   * secondary DA (`ESC [ > c`), XTVERSION (`ESC [ > q`) and modifyOtherKeys.
   */
  prefix: string;
  params: string;
  intermediates: string;
  command: string;
  length: number;
}

/** Parses an OSC, CSI, or supported single-character ESC sequence at `start`. */
export function parseTerminalControlSequence(
  value: string,
  start = 0,
): ParsedTerminalControlSequence | undefined {
  const osc = parseOscSequence(value, start);
  if (osc) return osc;
  const string = parseStringSequence(value, start);
  if (string) return string;
  if (isSingleCharacterEscSequence(value, start)) {
    return {
      kind: "esc",
      private: false,
      prefix: "",
      params: "",
      intermediates: "",
      command: value[start + 1]!,
      length: 2,
    };
  }
  const intermediateEsc = parseIntermediateEscSequence(value, start);
  if (intermediateEsc) return intermediateEsc;
  if (value.charCodeAt(start) !== 0x1b || value[start + 1] !== "[") return undefined;

  let index = start + 2;
  // Accept every ECMA-48 private-parameter prefix (0x3C-0x3F), not just `?`.
  // Without this, queries such as tmux's `ESC [ > c` fail to parse and the
  // caller buffers the remainder of the stream forever.
  const prefixCode = value.charCodeAt(index);
  const prefix = prefixCode >= 0x3c && prefixCode <= 0x3f ? value[index]! : "";
  if (prefix) index++;

  const paramsStart = index;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if ((code >= 0x30 && code <= 0x39) || code === 0x3b || code === 0x3a) {
      index++;
      continue;
    }
    break;
  }
  const paramsEnd = index;

  const intermediatesStart = index;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code >= 0x20 && code <= 0x2f) {
      index++;
      continue;
    }
    break;
  }
  const intermediatesEnd = index;

  const commandCode = value.charCodeAt(index);
  if (!(commandCode >= 0x40 && commandCode <= 0x7e)) return undefined;

  return {
    kind: "csi",
    private: prefix === "?",
    prefix,
    params: value.slice(paramsStart, paramsEnd),
    intermediates: value.slice(intermediatesStart, intermediatesEnd),
    command: value[index]!,
    length: index - start + 1,
  };
}

/** Parses semicolon/colon-separated numeric terminal parameters. */
export function parseTerminalParams(params: string): number[] {
  if (!params) return [];
  const values: number[] = [];
  let value = 0;
  let sawDigit = false;
  for (let index = 0; index <= params.length; index += 1) {
    const code = index < params.length ? params.charCodeAt(index) : 0x3b;
    if (code >= 0x30 && code <= 0x39) {
      value = value * 10 + code - 0x30;
      sawDigit = true;
      continue;
    }
    if (code !== 0x3b && code !== 0x3a) continue;
    values.push(sawDigit ? value : 0);
    value = 0;
    sawDigit = false;
  }
  return values;
}

function parseOscSequence(value: string, start: number): ParsedTerminalControlSequence | undefined {
  if (!value.startsWith("\x1b]", start)) return undefined;
  const contentStart = start + 2;
  const belEnd = value.indexOf("\x07", contentStart);
  const stEnd = value.indexOf("\x1b\\", contentStart);
  const end = belEnd >= 0 && stEnd >= 0 ? Math.min(belEnd, stEnd) : belEnd >= 0 ? belEnd : stEnd;
  if (end < 0) return undefined;
  return {
    kind: "osc",
    private: false,
    prefix: "",
    params: value.slice(contentStart, end),
    intermediates: "",
    command: "]",
    length: end - start + (end === stEnd ? 2 : 1),
  };
}

/** ECMA-48 string-sequence openers and the kinds they introduce. */
const STRING_SEQUENCE_KINDS: Readonly<Record<string, "dcs" | "apc" | "pm" | "sos">> = {
  "P": "dcs",
  "_": "apc",
  "^": "pm",
  "X": "sos",
};

/**
 * Parses a DCS/APC/PM/SOS string sequence, terminated by ST only.
 *
 * BEL deliberately does not terminate these — that is an OSC-only concession
 * some terminals make, and the kitty graphics protocol (`ESC _ G … ESC \`)
 * carries base64 payloads in APC where a stray 0x07 must not cut the string.
 * The parse exists so those payloads are consumed as a sequence: an emulator
 * that fails to recognise `ESC _` prints an entire image transmission as
 * literal base64, a full screen of it per frame.
 */
function parseStringSequence(value: string, start: number): ParsedTerminalControlSequence | undefined {
  if (value.charCodeAt(start) !== 0x1b) return undefined;
  const opener = value[start + 1];
  const kind = opener === undefined ? undefined : STRING_SEQUENCE_KINDS[opener];
  if (!kind) return undefined;
  const end = value.indexOf("\x1b\\", start + 2);
  if (end < 0) return undefined;
  return {
    kind,
    private: false,
    prefix: "",
    params: value.slice(start + 2, end),
    intermediates: "",
    command: opener!,
    length: end - start + 2,
  };
}

function isSingleCharacterEscSequence(value: string, start: number): boolean {
  if (value.charCodeAt(start) !== 0x1b) return false;
  const command = value[start + 1];
  return command === "7" || command === "8" || command === "M" || command === "H" || command === "D" ||
    command === "E" || command === "c" || command === "=" || command === ">";
}

/** Parses ECMA-35 ESC sequences with 0x20-0x2F intermediates (charset designation, DECALN, `ESC % G`). */
function parseIntermediateEscSequence(
  value: string,
  start: number,
): ParsedTerminalControlSequence | undefined {
  if (value.charCodeAt(start) !== 0x1b) return undefined;
  let index = start + 1;
  const intermediatesStart = index;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code >= 0x20 && code <= 0x2f) {
      index++;
      continue;
    }
    break;
  }
  if (index === intermediatesStart) return undefined;
  const finalCode = value.charCodeAt(index);
  if (!(finalCode >= 0x30 && finalCode <= 0x7e)) return undefined;
  return {
    kind: "esc",
    private: false,
    prefix: "",
    params: "",
    intermediates: value.slice(intermediatesStart, index),
    command: value[index]!,
    length: index - start + 1,
  };
}
