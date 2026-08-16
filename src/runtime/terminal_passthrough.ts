// Copyright 2023 Im-Beast. MIT license.

// TERM-010: passthrough is ENCODING, not hope. tmux wraps a payload in
// `DCS tmux;` with every ESC doubled; screen chops payloads into bounded
// DCS chunks; wrapping composes innermost-out with an explicit nesting
// limit, and every unsupported combination is a named capability
// diagnostic instead of a stream that a multiplexer will mangle. The
// simulated decoders implement the multiplexers' unwrap side so golden
// streams can prove round-trips are byte-exact — no double escaping, no
// early termination.

/** Multiplexer layers a payload can traverse. */
export type PassthroughLayer = "tmux" | "screen";

/** Screen truncates DCS payloads; chunk below its historic limit. */
export const SCREEN_CHUNK_BYTES = 720;

/** A capability diagnostic for one requested wrap. */
export interface PassthroughDiagnostic {
  readonly supported: boolean;
  readonly reason?: string;
}

/** Typed passthrough failure. */
export class PassthroughError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PassthroughError";
  }
}

/** tmux: DCS tmux; payload-with-doubled-ESC ST. */
export function encodeTmuxPassthrough(payload: string): string {
  return `\x1bPtmux;${payload.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`;
}

/** The tmux side: unwraps one tmux passthrough exactly. */
export function decodeTmuxPassthrough(wrapped: string): string | undefined {
  if (!wrapped.startsWith("\x1bPtmux;") || !wrapped.endsWith("\x1b\\")) return undefined;
  const body = wrapped.slice("\x1bPtmux;".length, -"\x1b\\".length);
  // Reject un-doubled ESC: a lone ESC not followed by ESC is malformed
  // (it would have terminated the DCS inside real tmux).
  let out = "";
  let index = 0;
  while (index < body.length) {
    const char = body[index]!;
    if (char === "\x1b") {
      if (body[index + 1] !== "\x1b") return undefined;
      out += "\x1b";
      index += 2;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

/**
 * screen: bounded DCS chunks, concatenated by the terminal. An embedded
 * ST (`ESC \`) would terminate a chunk early, so the encoder always
 * splits BETWEEN the ESC and the backslash — no chunk body ever contains
 * the full terminator, and concatenation restores the pair exactly.
 */
export function encodeScreenPassthrough(payload: string): string {
  const chunks: string[] = [];
  let current = "";
  for (const char of payload) {
    if (char === "\\" && current.endsWith("\x1b")) {
      chunks.push(current);
      current = "\\";
      continue;
    }
    current += char;
    if (current.length >= SCREEN_CHUNK_BYTES && !current.endsWith("\x1b")) {
      chunks.push(current);
      current = "";
    }
  }
  if (current !== "" || chunks.length === 0) chunks.push(current);
  return chunks.map((chunk) => `\x1bP${chunk}\x1b\\`).join("");
}

/** The screen side: unwraps consecutive DCS chunks exactly. */
export function decodeScreenPassthrough(wrapped: string): string | undefined {
  let out = "";
  let cursor = 0;
  while (cursor < wrapped.length) {
    if (!wrapped.startsWith("\x1bP", cursor)) return undefined;
    const end = wrapped.indexOf("\x1b\\", cursor + 2);
    if (end < 0) return undefined;
    out += wrapped.slice(cursor + 2, end);
    cursor = end + 2;
  }
  return out;
}

/**
 * Diagnoses one wrap request. screen inside tmux is fine; screen cannot
 * sit INSIDE screen (its chunk terminators collide), and nesting beyond
 * the limit is refused with the reason named.
 */
export function diagnosePassthrough(
  layers: readonly PassthroughLayer[],
  options: { readonly maxNesting?: number } = {},
): PassthroughDiagnostic {
  const maxNesting = options.maxNesting ?? 2;
  if (layers.length === 0) return { supported: false, reason: "no layers requested" };
  if (layers.length > maxNesting) {
    return { supported: false, reason: `nesting depth ${layers.length} exceeds the limit of ${maxNesting}` };
  }
  for (let index = 0; index < layers.length - 1; index += 1) {
    // layers[index] is INSIDE layers[index + 1].
    if (layers[index] === "screen") {
      return {
        supported: false,
        reason: "screen chunking cannot ride inside another layer: its ST terminators collide",
      };
    }
  }
  return { supported: true };
}

/**
 * Wraps a payload for the given layers, innermost multiplexer first.
 * Refuses unsupported combinations with the capability diagnostic.
 */
export function wrapPassthrough(
  payload: string,
  layers: readonly PassthroughLayer[],
  options: { readonly maxNesting?: number } = {},
): string {
  const diagnostic = diagnosePassthrough(layers, options);
  if (!diagnostic.supported) throw new PassthroughError(diagnostic.reason!);
  let wrapped = payload;
  for (const layer of layers) {
    wrapped = layer === "tmux" ? encodeTmuxPassthrough(wrapped) : encodeScreenPassthrough(wrapped);
  }
  return wrapped;
}

/** Simulates the multiplexers unwrapping, outermost first. */
export function unwrapPassthrough(
  wrapped: string,
  layers: readonly PassthroughLayer[],
): string | undefined {
  let current: string | undefined = wrapped;
  for (const layer of [...layers].reverse()) {
    if (current === undefined) return undefined;
    current = layer === "tmux" ? decodeTmuxPassthrough(current) : decodeScreenPassthrough(current);
  }
  return current;
}
