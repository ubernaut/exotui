// Copyright 2023 Im-Beast. MIT license.
import type { TerminalMultiplexer } from "./terminal_capabilities.ts";
import { detectTerminalMultiplexer } from "./terminal_values.ts";

/** Kitty graphics protocol command action. */
export type KittyGraphicsAction = "a" | "c" | "d" | "f" | "p" | "q" | "t" | "T";

/** Kitty graphics image payload format. */
export type KittyGraphicsFormat = 24 | 32 | 100;

/** Kitty graphics transmission medium. */
export type KittyGraphicsTransmissionMedium = "d" | "f" | "s" | "t";

/** Kitty graphics response suppression mode. */
export type KittyGraphicsQuietMode = 0 | 1 | 2;

/** Kitty graphics support mode selected for the current terminal. */
export type KittyGraphicsMode = "direct" | "tmux-passthrough" | "disabled" | "unknown";

/** Primitive control value accepted by the Kitty graphics protocol encoder. */
export type KittyGraphicsControlValue = string | number | boolean | undefined;

/** Generic Kitty graphics control data. Keys are the protocol's one-letter fields. */
export type KittyGraphicsControl = Record<string, KittyGraphicsControlValue>;

/** Options for encoding one Kitty graphics command. */
export interface KittyGraphicsCommandOptions {
  control: KittyGraphicsControl;
  payload?: string;
}

/** Options for splitting a Kitty graphics command payload into protocol chunks. */
export interface KittyGraphicsChunkOptions {
  control: KittyGraphicsControl;
  payload: Uint8Array | string;
  payloadEncoding?: "base64" | "bytes" | "utf8";
  maxChunkBytes?: number;
}

/** Options for a transmit or transmit-and-display Kitty graphics command. */
export interface KittyGraphicsTransmitOptions {
  data: Uint8Array | string;
  payloadEncoding?: "base64" | "bytes" | "utf8";
  display?: boolean;
  format?: KittyGraphicsFormat;
  medium?: KittyGraphicsTransmissionMedium;
  imageId?: number;
  imageNumber?: number;
  placementId?: number;
  columns?: number;
  rows?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  zIndex?: number;
  quiet?: KittyGraphicsQuietMode;
  maxChunkBytes?: number;
}

/** Options for a Kitty graphics delete command. */
export interface KittyGraphicsDeleteOptions {
  mode?: string;
  imageId?: number;
  imageNumber?: number;
  placementId?: number;
  column?: number;
  row?: number;
  zIndex?: number;
  quiet?: KittyGraphicsQuietMode;
}

/** Options for detecting whether Kitty graphics should be used. */
export interface KittyGraphicsDetectionOptions {
  env?: Record<string, string | undefined> | ((name: string) => string | undefined);
  isTty?: boolean;
  term?: string;
  termProgram?: string;
  multiplexer?: TerminalMultiplexer;
  force?: boolean;
  tmuxPassthrough?: boolean;
}

/** Detected Kitty graphics support for status panels and renderer selection. */
export interface KittyGraphicsCapability {
  supported: boolean;
  mode: KittyGraphicsMode;
  reason: string;
  term: string;
  termProgram: string;
  multiplexer: TerminalMultiplexer;
  remote: boolean;
}

/** Serializable inspection snapshot for a Kitty graphics command. */
export interface KittyGraphicsCommandInspection {
  control: string;
  payloadLength: number;
  sequenceLength: number;
  tmuxWrappedLength?: number;
}

/** Kitty graphics application protocol control wrapper. */
export const KITTY_GRAPHICS_START = "\x1b_G";

/** Kitty graphics application protocol terminator. */
export const KITTY_GRAPHICS_END = "\x1b\\";

const CONTROL_KEY_ORDER = [
  "a",
  "q",
  "f",
  "t",
  "s",
  "v",
  "i",
  "I",
  "p",
  "c",
  "r",
  "x",
  "y",
  "w",
  "h",
  "z",
  "d",
  "m",
];

/** Encodes Kitty graphics control fields into a deterministic comma-separated string. */
export function encodeKittyGraphicsControl(control: KittyGraphicsControl): string {
  const entries = orderedControlEntries(control);
  let encoded = "";
  for (let index = 0; index < entries.length; index += 1) {
    const [key, value] = entries[index]!;
    if (index > 0) encoded += ",";
    encoded += `${key}=${encodeKittyGraphicsControlValue(value)}`;
  }
  return encoded;
}

/** Encodes one complete Kitty graphics command sequence. */
export function encodeKittyGraphicsCommand(options: KittyGraphicsCommandOptions): string {
  const control = encodeKittyGraphicsControl(options.control);
  const payload = options.payload ?? "";
  return `${KITTY_GRAPHICS_START}${control};${payload}${KITTY_GRAPHICS_END}`;
}

/** Encodes binary or text payload data as base64 for Kitty graphics transmission. */
export function encodeKittyGraphicsPayload(
  data: Uint8Array | string,
  encoding: "bytes" | "utf8" | "base64" = "bytes",
): string {
  if (encoding === "base64") return typeof data === "string" ? data : base64Encode(data);
  if (typeof data === "string") return base64Encode(new TextEncoder().encode(data));
  return base64Encode(data);
}

/** Splits one Kitty graphics payload into protocol commands with continuation metadata. */
export function chunkKittyGraphicsCommand(options: KittyGraphicsChunkOptions): string[] {
  const maxChunkBytes = Math.max(1, Math.floor(options.maxChunkBytes ?? 4096));
  const payload = encodeKittyGraphicsPayload(options.payload, options.payloadEncoding ?? "bytes");
  if (payload.length <= maxChunkBytes) {
    return [encodeKittyGraphicsCommand({ control: { ...options.control, m: 0 }, payload })];
  }

  const chunks: string[] = [];
  for (let offset = 0; offset < payload.length; offset += maxChunkBytes) {
    const chunk = payload.slice(offset, offset + maxChunkBytes);
    const more = offset + maxChunkBytes < payload.length;
    chunks.push(encodeKittyGraphicsCommand({
      control: { ...options.control, m: more ? 1 : 0 },
      payload: chunk,
    }));
  }
  return chunks;
}

/** Builds one or more Kitty graphics transmit commands for an image payload. */
export function createKittyGraphicsTransmitCommands(options: KittyGraphicsTransmitOptions): string[] {
  return chunkKittyGraphicsCommand({
    control: cleanControl({
      a: (options.display ?? true) ? "T" : "t",
      f: options.format ?? 100,
      t: options.medium ?? "d",
      i: options.imageId,
      I: options.imageNumber,
      p: options.placementId,
      c: options.columns,
      r: options.rows,
      s: options.pixelWidth,
      v: options.pixelHeight,
      z: options.zIndex,
      q: options.quiet,
    }),
    payload: options.data,
    payloadEncoding: options.payloadEncoding,
    maxChunkBytes: options.maxChunkBytes,
  });
}

/** Builds a Kitty graphics delete command. */
export function createKittyGraphicsDeleteCommand(options: KittyGraphicsDeleteOptions = {}): string {
  return encodeKittyGraphicsCommand({
    control: cleanControl({
      a: "d",
      d: options.mode ?? "a",
      i: options.imageId,
      I: options.imageNumber,
      p: options.placementId,
      x: options.column,
      y: options.row,
      z: options.zIndex,
      q: options.quiet,
    }),
  });
}

/** Wraps a graphics command for tmux passthrough mode. */
export function wrapKittyGraphicsForTmux(sequence: string): string {
  return `\x1bPtmux;${sequence.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`;
}

/** Inspects a command sequence without requiring a terminal. */
export function inspectKittyGraphicsCommand(sequence: string): KittyGraphicsCommandInspection {
  const start = sequence.indexOf(KITTY_GRAPHICS_START);
  const end = sequence.indexOf(KITTY_GRAPHICS_END, start + KITTY_GRAPHICS_START.length);
  if (start < 0 || end < 0) {
    return {
      control: "",
      payloadLength: 0,
      sequenceLength: sequence.length,
      tmuxWrappedLength: sequence.startsWith("\x1bPtmux;") ? sequence.length : undefined,
    };
  }
  const body = sequence.slice(start + KITTY_GRAPHICS_START.length, end);
  const separator = body.indexOf(";");
  const control = separator < 0 ? body : body.slice(0, separator);
  const payload = separator < 0 ? "" : body.slice(separator + 1);
  return {
    control,
    payloadLength: payload.length,
    sequenceLength: end + KITTY_GRAPHICS_END.length - start,
    tmuxWrappedLength: sequence.startsWith("\x1bPtmux;") ? sequence.length : undefined,
  };
}

/** Detects whether the current terminal should use Kitty graphics. */
export function detectKittyGraphicsCapability(options: KittyGraphicsDetectionOptions = {}): KittyGraphicsCapability {
  const env = envGetter(options.env);
  const term = options.term ?? env("TERM") ?? "";
  const termProgram = options.termProgram ?? env("TERM_PROGRAM") ?? "";
  const multiplexer = options.multiplexer ?? detectTerminalMultiplexer(term, env);
  const remote = Boolean(env("SSH_TTY") || env("SSH_CONNECTION") || env("SSH_CLIENT"));
  const isTty = options.isTty ?? true;
  const disabled = env("DENO_TUI_KITTY") === "0" || env("DENO_TUI_KITTY") === "false";
  const forced = options.force || env("DENO_TUI_KITTY") === "1" || env("DENO_TUI_KITTY") === "true";
  const tmuxPassthrough = options.tmuxPassthrough || env("DENO_TUI_KITTY_TMUX") === "1" ||
    env("DENO_TUI_KITTY_TMUX") === "true";
  // Ghostty implements the kitty graphics protocol and identifies itself by
  // TERM, TERM_PROGRAM and its resources directory — any one of them is the
  // same claim.
  const likelyKitty = Boolean(
    env("KITTY_WINDOW_ID") || /xterm-kitty/i.test(term) || /ghostty/i.test(term) ||
      /ghostty/i.test(termProgram) || env("GHOSTTY_RESOURCES_DIR"),
  );

  if (disabled) return capability(false, "disabled", "Kitty graphics were disabled by configuration.");
  if (!isTty && !forced) return capability(false, "disabled", "No interactive terminal is attached.");

  if (multiplexer === "tmux") {
    if ((forced || likelyKitty) && tmuxPassthrough) {
      return capability(true, "tmux-passthrough", "Kitty graphics can be sent through tmux passthrough.");
    }
    if (forced) {
      return capability(false, "unknown", "Kitty graphics were forced, but tmux passthrough was not enabled.");
    }
    if (likelyKitty) {
      return capability(false, "unknown", "Kitty graphics are likely outside tmux, but passthrough must be enabled.");
    }
    return capability(false, "unknown", "tmux is active and Kitty graphics support could not be confirmed.");
  }

  if (forced) return capability(true, "direct", "Kitty graphics were enabled by configuration.");
  if (likelyKitty) {
    return capability(true, "direct", "Kitty graphics support was detected from the terminal environment.");
  }
  if (/wezterm/i.test(termProgram)) {
    return capability(
      false,
      "unknown",
      "This terminal may support Kitty graphics, but active confirmation is required.",
    );
  }
  return capability(false, "unknown", "Kitty graphics support was not detected.");

  function capability(supported: boolean, mode: KittyGraphicsMode, reason: string): KittyGraphicsCapability {
    return {
      supported,
      mode,
      reason,
      term,
      termProgram,
      multiplexer,
      remote,
    };
  }
}

function cleanControl(control: KittyGraphicsControl): KittyGraphicsControl {
  const cleaned: KittyGraphicsControl = {};
  for (const key in control) {
    const value = control[key];
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

function orderedControlEntries(
  control: KittyGraphicsControl,
): Array<[string, Exclude<KittyGraphicsControlValue, undefined>]> {
  const entries: Array<[string, Exclude<KittyGraphicsControlValue, undefined>]> = [];
  const emitted = new Set<string>();
  for (let index = 0; index < CONTROL_KEY_ORDER.length; index += 1) {
    const key = CONTROL_KEY_ORDER[index]!;
    const value = control[key];
    if (value === undefined) continue;
    entries.push([key, value]);
    emitted.add(key);
  }
  const extraKeys: string[] = [];
  for (const key in control) {
    if (emitted.has(key) || control[key] === undefined) continue;
    extraKeys.push(key);
  }
  extraKeys.sort();
  for (let index = 0; index < extraKeys.length; index += 1) {
    const key = extraKeys[index]!;
    entries.push([key, control[key] as Exclude<KittyGraphicsControlValue, undefined>]);
  }
  return entries;
}

function encodeKittyGraphicsControlValue(value: Exclude<KittyGraphicsControlValue, undefined>): string {
  const encoded = typeof value === "boolean" ? value ? "1" : "0" : String(value);
  if (!/^[\w.+:/=-]+$/.test(encoded)) {
    throw new TypeError(`Kitty graphics control values must be unescaped ASCII tokens: ${encoded}`);
  }
  return encoded;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function envGetter(env: KittyGraphicsDetectionOptions["env"]): (name: string) => string | undefined {
  if (typeof env === "function") return env;
  if (env) return (name) => env[name];
  const deno = (globalThis as {
    Deno?: { env?: { get(name: string): string | undefined } };
  }).Deno;
  return deno?.env?.get ? (name) => deno.env!.get(name) : () => undefined;
}
