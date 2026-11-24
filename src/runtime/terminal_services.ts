// Copyright 2023 Im-Beast. MIT license.
import { parseTerminalControlSequence } from "./terminal_sequences.ts";

const ESC = "\x1b";
const BEL = "\x07";
const ST = `${ESC}\\`;

/** Supported OSC string terminator. */
export type TerminalOscTerminator = "st" | "bel";

/** Explicitly gated terminal service built on OSC sequences. */
export type TerminalOscCapability = "title" | "dynamicColors" | "clipboard" | "notifications" | "queries";

/** Host policy. Every OSC service is disabled unless explicitly enabled. */
export type TerminalOscPolicy = Record<TerminalOscCapability, boolean>;

/** Clipboard selection used by OSC 52. */
export type TerminalClipboardSelection = "clipboard" | "primary" | "secondary";

/** Decoded, bounded OSC 52 clipboard write emitted by a child application. */
export interface TerminalClipboardWrite {
  readonly text: string;
  readonly selection: TerminalClipboardSelection;
}

/** One parsed OSC message routed from terminal input. */
export interface TerminalOscMessage {
  command: string;
  data: string;
  params: string;
  raw: string;
}

/** Parsed xterm dynamic-color or palette response. */
export interface TerminalOscColorResponse {
  command: "4" | "10" | "11";
  target: "palette" | "foreground" | "background";
  paletteIndex?: number;
  color: string;
  rawColor: string;
}

/** Result of a policy-gated terminal service request. */
export interface TerminalOscActionResult {
  capability: TerminalOscCapability;
  sent: boolean;
  sequence?: string;
  reason?: string;
}

/** Serializable capability and limit diagnostics for one OSC service. */
export interface TerminalOscServiceInspection {
  policy: TerminalOscPolicy;
  terminator: TerminalOscTerminator;
  maxClipboardBytes: number;
  maxTextLength: number;
}

/** Options for a policy-gated terminal OSC service. */
export interface TerminalOscServiceOptions {
  write: (sequence: string) => void;
  policy?: Partial<TerminalOscPolicy>;
  terminator?: TerminalOscTerminator;
  maxClipboardBytes?: number;
  maxTextLength?: number;
}

/** Raw OSC subscription callback. */
export type TerminalOscHandler = (message: TerminalOscMessage) => void;

/** Options for raw OSC routing diagnostics. */
export interface TerminalOscRouterOptions {
  onHandlerError?: (error: Error, message: TerminalOscMessage) => void;
  maxPendingBytes?: number;
}

/** Serializable state for OSC routing diagnostics. */
export interface TerminalOscRouterInspection {
  subscriptions: number;
  commands: string[];
  pendingBytes: number;
  dispatched: number;
  handlerErrors: number;
  droppedBytes: number;
}

/** Coarse terminal theme classification derived from a reported background. */
export type TerminalThemeAppearance = "dark" | "light" | "unknown";

/** Configuration for an explicit terminal theme/palette query cycle. */
export interface TerminalThemeProbeOptions {
  service: TerminalOscService;
  router: TerminalOscRouter;
  paletteIndices?: readonly number[];
}

/** Serializable state for terminal theme detection and diagnostics. */
export interface TerminalThemeProbeInspection {
  active: boolean;
  disposed: boolean;
  complete: boolean;
  revision: number;
  appearance: TerminalThemeAppearance;
  foreground?: string;
  background?: string;
  palette: Record<string, string>;
  requested: string[];
  pending: string[];
  failures: string[];
}

/** A fail-closed policy suitable for unknown or noninteractive hosts. */
export const disabledTerminalOscPolicy: Readonly<TerminalOscPolicy> = Object.freeze({
  title: false,
  dynamicColors: false,
  clipboard: false,
  notifications: false,
  queries: false,
});

/** Builds a sanitized Operating System Command sequence. */
export function terminalOscSequence(
  command: string | number,
  data = "",
  terminator: TerminalOscTerminator = "st",
): string {
  const normalizedCommand = String(command).replace(/[^0-9]/g, "");
  if (!normalizedCommand) throw new Error("terminal OSC command must contain at least one decimal digit");
  const body = data.length > 0 ? `${normalizedCommand};${sanitizeTerminalOscText(data)}` : normalizedCommand;
  return `${ESC}]${body}${terminator === "bel" ? BEL : ST}`;
}

/** Builds OSC 0 or OSC 2 title control without permitting control injection. */
export function terminalTitleSequence(
  title: string,
  options: { includeIconName?: boolean; terminator?: TerminalOscTerminator; maxLength?: number } = {},
): string {
  const value = sanitizeTerminalOscText(title, options.maxLength ?? 1024);
  return terminalOscSequence(options.includeIconName ? 0 : 2, value, options.terminator);
}

/** Builds an xterm dynamic foreground/background color sequence. */
export function terminalDynamicColorSequence(
  target: "foreground" | "background",
  color: string,
  terminator: TerminalOscTerminator = "st",
): string {
  return terminalOscSequence(target === "foreground" ? 10 : 11, normalizeTerminalColorSpec(color), terminator);
}

/** Builds an xterm dynamic-color reset sequence. */
export function terminalResetDynamicColorSequence(
  target: "foreground" | "background",
  terminator: TerminalOscTerminator = "st",
): string {
  return terminalOscSequence(target === "foreground" ? 110 : 111, "", terminator);
}

/** Builds an xterm foreground/background or indexed-palette query. */
export function terminalColorQuerySequence(
  target: "foreground" | "background" | number,
  terminator: TerminalOscTerminator = "st",
): string {
  if (typeof target === "number") {
    const index = Math.max(0, Math.min(255, Math.floor(target)));
    return terminalOscSequence(4, `${index};?`, terminator);
  }
  return terminalOscSequence(target === "foreground" ? 10 : 11, "?", terminator);
}

/** Builds a size-bounded OSC 52 clipboard sequence from UTF-8 text. */
export function terminalClipboardSequence(
  value: string,
  options: {
    selection?: TerminalClipboardSelection;
    terminator?: TerminalOscTerminator;
    maxBytes?: number;
  } = {},
): string {
  const bytes = new TextEncoder().encode(value);
  const maxBytes = Math.max(0, Math.floor(options.maxBytes ?? 100_000));
  if (bytes.byteLength > maxBytes) {
    throw new RangeError(`clipboard payload is ${bytes.byteLength} bytes; maximum is ${maxBytes}`);
  }
  const selection = options.selection === "primary" ? "p" : options.selection === "secondary" ? "s" : "c";
  return terminalOscSequence(52, `${selection};${encodeBase64(bytes)}`, options.terminator);
}

/**
 * Decodes an OSC 52 clipboard write (`<selection>;<base64>` or full OSC 52
 * sequence) with strict bounds and UTF-8 validation. Read queries (`?`),
 * malformed base64, invalid UTF-8, unknown selection flags, and oversized
 * payloads return `undefined`.
 */
export function parseTerminalClipboardWrite(
  payload: string,
  options: { maxBytes?: number } = {},
): TerminalClipboardWrite | undefined {
  let body = payload;
  if (payload.startsWith(`${ESC}]`)) {
    const message = parseTerminalOscMessage(payload);
    if (!message || message.command !== "52") return undefined;
    body = message.data;
  }
  const separator = body.indexOf(";");
  if (separator < 0) return undefined;
  const rawSelection = body.slice(0, separator);
  const encoded = body.slice(separator + 1);
  if (encoded === "?" || !/^[cps0-7]*$/.test(rawSelection)) return undefined;
  const maxBytes = Math.max(0, Math.floor(options.maxBytes ?? 65_536));
  const maxEncodedLength = Math.ceil(maxBytes / 3) * 4 + 4;
  if (encoded.length > maxEncodedLength) return undefined;
  const bytes = decodeBase64(encoded, maxBytes);
  if (!bytes) return undefined;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const selection: TerminalClipboardSelection = rawSelection.includes("p") && !rawSelection.includes("c")
    ? "primary"
    : rawSelection.includes("s") && !rawSelection.includes("c")
    ? "secondary"
    : "clipboard";
  return { text, selection };
}

/** Builds the widely supported legacy OSC 9 desktop-notification sequence. */
export function terminalNotificationSequence(
  message: string,
  options: { title?: string; terminator?: TerminalOscTerminator; maxLength?: number } = {},
): string {
  const maxLength = Math.max(0, Math.floor(options.maxLength ?? 2048));
  const title = options.title ? `${sanitizeTerminalOscText(options.title, 256)}: ` : "";
  return terminalOscSequence(9, `${title}${sanitizeTerminalOscText(message, maxLength)}`, options.terminator);
}

/** Parses the command and payload from an OSC body or complete OSC sequence. */
export function parseTerminalOscMessage(value: string): TerminalOscMessage | undefined {
  let params = value;
  let raw = value;
  if (value.startsWith(`${ESC}]`)) {
    const parsed = parseTerminalControlSequence(value, 0);
    if (!parsed || parsed.kind !== "osc" || parsed.length !== value.length) return undefined;
    params = parsed.params;
    raw = value.slice(0, parsed.length);
  }
  const separator = params.indexOf(";");
  const command = (separator < 0 ? params : params.slice(0, separator)).trim();
  if (!/^\d+$/.test(command)) return undefined;
  return {
    command,
    data: separator < 0 ? "" : params.slice(separator + 1),
    params,
    raw,
  };
}

/** Parses OSC 4/10/11 color replies into normalized six-digit RGB. */
export function parseTerminalOscColorResponse(value: string): TerminalOscColorResponse | undefined {
  const message = parseTerminalOscMessage(value);
  if (!message) return undefined;
  if (message.command === "10" || message.command === "11") {
    const color = parseTerminalRgbSpec(message.data);
    if (!color) return undefined;
    return {
      command: message.command,
      target: message.command === "10" ? "foreground" : "background",
      color,
      rawColor: message.data,
    };
  }
  if (message.command !== "4") return undefined;
  const separator = message.data.indexOf(";");
  if (separator < 0) return undefined;
  const indexText = message.data.slice(0, separator);
  const paletteIndex = Number(indexText);
  if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex > 255) return undefined;
  const rawColor = message.data.slice(separator + 1);
  const color = parseTerminalRgbSpec(rawColor);
  if (!color) return undefined;
  return { command: "4", target: "palette", paletteIndex, color, rawColor };
}

/**
 * Policy-gated OSC writer. Hosts must opt into each side effect explicitly;
 * unknown terminals therefore fail closed without emitting escape bytes.
 */
export class TerminalOscService {
  readonly #write: (sequence: string) => void;
  readonly #policy: TerminalOscPolicy;
  readonly #terminator: TerminalOscTerminator;
  readonly #maxClipboardBytes: number;
  readonly #maxTextLength: number;

  constructor(options: TerminalOscServiceOptions) {
    this.#write = options.write;
    this.#policy = { ...disabledTerminalOscPolicy, ...options.policy };
    this.#terminator = options.terminator ?? "st";
    this.#maxClipboardBytes = Math.max(0, Math.floor(options.maxClipboardBytes ?? 100_000));
    this.#maxTextLength = Math.max(0, Math.floor(options.maxTextLength ?? 2048));
  }

  setTitle(title: string, includeIconName = false): TerminalOscActionResult {
    return this.#emit(
      "title",
      () =>
        terminalTitleSequence(title, { includeIconName, terminator: this.#terminator, maxLength: this.#maxTextLength }),
    );
  }

  setColor(target: "foreground" | "background", color: string): TerminalOscActionResult {
    return this.#emit(
      "dynamicColors",
      () => terminalDynamicColorSequence(target, color, this.#terminator),
    );
  }

  resetColor(target: "foreground" | "background"): TerminalOscActionResult {
    return this.#emit(
      "dynamicColors",
      () => terminalResetDynamicColorSequence(target, this.#terminator),
    );
  }

  queryColor(target: "foreground" | "background" | number): TerminalOscActionResult {
    return this.#emit("queries", () => terminalColorQuerySequence(target, this.#terminator));
  }

  copy(value: string, selection: TerminalClipboardSelection = "clipboard"): TerminalOscActionResult {
    return this.#emit(
      "clipboard",
      () =>
        terminalClipboardSequence(value, {
          selection,
          terminator: this.#terminator,
          maxBytes: this.#maxClipboardBytes,
        }),
    );
  }

  notify(message: string, title?: string): TerminalOscActionResult {
    return this.#emit(
      "notifications",
      () =>
        terminalNotificationSequence(message, { title, terminator: this.#terminator, maxLength: this.#maxTextLength }),
    );
  }

  inspect(): TerminalOscServiceInspection {
    return {
      policy: { ...this.#policy },
      terminator: this.#terminator,
      maxClipboardBytes: this.#maxClipboardBytes,
      maxTextLength: this.#maxTextLength,
    };
  }

  #emit(capability: TerminalOscCapability, build: () => string): TerminalOscActionResult {
    if (!this.#policy[capability]) {
      return { capability, sent: false, reason: `${capability} is disabled by terminal OSC policy` };
    }
    let sequence: string;
    try {
      sequence = build();
      this.#write(sequence);
    } catch (error) {
      return {
        capability,
        sent: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    return { capability, sent: true, sequence };
  }
}

/** Creates a policy-gated terminal OSC service. */
export function createTerminalOscService(options: TerminalOscServiceOptions): TerminalOscService {
  return new TerminalOscService(options);
}

/** Incremental router for raw OSC terminal replies and custom subscriptions. */
export class TerminalOscRouter {
  readonly #handlers = new Map<string, Set<TerminalOscHandler>>();
  readonly #onHandlerError?: (error: Error, message: TerminalOscMessage) => void;
  readonly #maxPendingBytes: number;
  #pending = "";
  #dispatched = 0;
  #handlerErrors = 0;
  #droppedBytes = 0;

  constructor(options: TerminalOscRouterOptions = {}) {
    this.#onHandlerError = options.onHandlerError;
    this.#maxPendingBytes = Math.max(16, Math.floor(options.maxPendingBytes ?? 65_536));
  }

  /** Subscribes to one decimal OSC command or `*` for every command. */
  subscribe(command: string | number | "*", handler: TerminalOscHandler): () => void {
    const key = command === "*" ? "*" : String(command);
    if (key !== "*" && !/^\d+$/.test(key)) throw new Error(`invalid OSC subscription command: ${key}`);
    let handlers = this.#handlers.get(key);
    if (!handlers) {
      handlers = new Set();
      this.#handlers.set(key, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) this.#handlers.delete(key);
    };
  }

  /** Dispatches a parsed OSC message to exact and wildcard subscribers. */
  dispatch(message: TerminalOscMessage): number {
    let called = 0;
    for (const key of [message.command, "*"]) {
      for (const handler of [...(this.#handlers.get(key) ?? [])]) {
        called += 1;
        try {
          handler(message);
        } catch (error) {
          this.#handlerErrors += 1;
          try {
            this.#onHandlerError?.(error instanceof Error ? error : new Error(String(error)), message);
          } catch {
            // Diagnostic observers cannot interrupt terminal input routing.
          }
        }
      }
    }
    if (called > 0) this.#dispatched += 1;
    return called;
  }

  /** Feeds arbitrary terminal input, retaining a bounded trailing partial OSC. */
  push(chunk: string): number {
    let source = this.#pending + chunk;
    this.#pending = "";
    let dispatched = 0;
    let index = 0;
    while (index < source.length) {
      const start = source.indexOf(`${ESC}]`, index);
      if (start < 0) break;
      const parsed = parseTerminalControlSequence(source, start);
      if (!parsed) {
        this.#pending = source.slice(start);
        break;
      }
      const raw = source.slice(start, start + parsed.length);
      const message = parseTerminalOscMessage(raw);
      if (message) {
        this.dispatch(message);
        dispatched += 1;
      }
      index = start + parsed.length;
    }
    if (this.#pending.length > this.#maxPendingBytes) {
      const overflow = this.#pending.length - this.#maxPendingBytes;
      this.#pending = this.#pending.slice(overflow);
      this.#droppedBytes += overflow;
    }
    source = "";
    return dispatched;
  }

  reset(): void {
    this.#pending = "";
  }

  clear(): void {
    this.#handlers.clear();
    this.#pending = "";
  }

  inspect(): TerminalOscRouterInspection {
    let subscriptions = 0;
    for (const handlers of this.#handlers.values()) subscriptions += handlers.size;
    return {
      subscriptions,
      commands: [...this.#handlers.keys()].sort(),
      pendingBytes: this.#pending.length,
      dispatched: this.#dispatched,
      handlerErrors: this.#handlerErrors,
      droppedBytes: this.#droppedBytes,
    };
  }
}

/** Creates an incremental raw OSC subscription router. */
export function createTerminalOscRouter(options: TerminalOscRouterOptions = {}): TerminalOscRouter {
  return new TerminalOscRouter(options);
}

/**
 * Explicit, bounded theme/palette detector built from OSC queries and replies.
 *
 * It never enables queries itself, owns no timers, and therefore cannot leave
 * a hidden timeout or terminal mode behind. Hosts call `finish` when their
 * response deadline expires and can inspect every unanswered query.
 */
export class TerminalThemeProbe {
  readonly #service: TerminalOscService;
  readonly #paletteIndices: number[];
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  readonly #requested = new Set<string>();
  readonly #pending = new Set<string>();
  readonly #failures: string[] = [];
  readonly #palette = new Map<number, string>();
  #foreground?: string;
  #background?: string;
  #active = false;
  #disposed = false;
  #revision = 0;

  constructor(options: TerminalThemeProbeOptions) {
    this.#service = options.service;
    this.#paletteIndices = uniquePaletteIndices(options.paletteIndices ?? []);
    this.#unsubscribe = ["4", "10", "11"].map((command) =>
      options.router.subscribe(command, (message) => this.accept(message))
    );
  }

  /** Starts a fresh query cycle and returns every policy-gated write result. */
  start(): TerminalOscActionResult[] {
    if (this.#disposed) throw new Error("terminal theme probe is disposed");
    this.#resetState();
    this.#active = true;
    const targets: ("foreground" | "background" | number)[] = [
      "foreground",
      "background",
      ...this.#paletteIndices,
    ];
    const results: TerminalOscActionResult[] = [];
    for (const target of targets) {
      const key = terminalColorTargetKey(target);
      this.#requested.add(key);
      const result = this.#service.queryColor(target);
      results.push(result);
      if (result.sent) this.#pending.add(key);
      else this.#failures.push(`${key}: ${result.reason ?? "query was not sent"}`);
    }
    if (this.#pending.size === 0) this.#active = false;
    this.#changed();
    return results;
  }

  /** Accepts one routed OSC reply and returns whether it answered this probe. */
  accept(message: TerminalOscMessage): boolean {
    if (!this.#active || this.#disposed) return false;
    const response = parseTerminalOscColorResponse(message.raw);
    if (!response) return false;
    const key = response.target === "palette" ? `palette:${response.paletteIndex}` : response.target;
    if (!this.#pending.delete(key)) return false;
    if (response.target === "foreground") this.#foreground = response.color;
    else if (response.target === "background") this.#background = response.color;
    else this.#palette.set(response.paletteIndex!, response.color);
    if (this.#pending.size === 0) this.#active = false;
    this.#changed();
    return true;
  }

  /** Ends the current cycle while retaining unanswered-query diagnostics. */
  finish(reason = "terminal did not answer before the host deadline"): TerminalThemeProbeInspection {
    if (this.#active) {
      for (const key of this.#pending) this.#failures.push(`${key}: ${reason}`);
      this.#active = false;
      this.#changed();
    }
    return this.inspect();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  inspect(): TerminalThemeProbeInspection {
    return {
      active: this.#active,
      disposed: this.#disposed,
      complete: this.#requested.size > 0 && !this.#active && this.#pending.size === 0,
      revision: this.#revision,
      appearance: classifyTerminalTheme(this.#background),
      foreground: this.#foreground,
      background: this.#background,
      palette: Object.fromEntries(
        [...this.#palette.entries()].sort(([left], [right]) => left - right).map((
          [index, color],
        ) => [String(index), color]),
      ),
      requested: [...this.#requested].sort(compareTerminalColorTargetKeys),
      pending: [...this.#pending].sort(compareTerminalColorTargetKeys),
      failures: this.#failures.slice(),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    if (this.#active) this.finish("probe was disposed before a reply arrived");
    this.#disposed = true;
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#unsubscribe.length = 0;
    this.#changed();
    this.#listeners.clear();
  }

  #resetState(): void {
    this.#requested.clear();
    this.#pending.clear();
    this.#failures.length = 0;
    this.#palette.clear();
    this.#foreground = undefined;
    this.#background = undefined;
  }

  #changed(): void {
    this.#revision += 1;
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // Probe observers cannot interrupt terminal input routing.
      }
    }
  }
}

/** Creates an explicit, policy-gated terminal theme/palette detector. */
export function createTerminalThemeProbe(options: TerminalThemeProbeOptions): TerminalThemeProbe {
  return new TerminalThemeProbe(options);
}

/** Removes OSC terminators and C0/C1 controls from untrusted terminal text. */
export function sanitizeTerminalOscText(value: string, maxLength = 4096): string {
  const limit = Math.max(0, Math.floor(maxLength));
  let result = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      if ((code === 0x09 || code === 0x0a || code === 0x0d) && result.length < limit) result += " ";
      continue;
    }
    if (result.length + char.length > limit) break;
    result += char;
  }
  return result;
}

function normalizeTerminalColorSpec(color: string): string {
  const normalized = color.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(normalized)?.[1];
  if (short) return `rgb:${short[0]}${short[0]}/${short[1]}${short[1]}/${short[2]}${short[2]}`;
  const full = /^#([0-9a-f]{6})$/.exec(normalized)?.[1];
  if (full) return `rgb:${full.slice(0, 2)}/${full.slice(2, 4)}/${full.slice(4, 6)}`;
  if (/^rgb:[0-9a-f]{1,4}\/[0-9a-f]{1,4}\/[0-9a-f]{1,4}$/.test(normalized)) return normalized;
  throw new Error(`unsupported terminal color: ${color}`);
}

function uniquePaletteIndices(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Math.max(0, Math.min(255, Math.floor(value)))))]
    .sort((left, right) => left - right);
}

function terminalColorTargetKey(target: "foreground" | "background" | number): string {
  return typeof target === "number" ? `palette:${target}` : target;
}

function compareTerminalColorTargetKeys(left: string, right: string): number {
  const rank = (value: string): number => value === "foreground" ? -2 : value === "background" ? -1 : 0;
  return rank(left) - rank(right) || left.localeCompare(right, undefined, { numeric: true });
}

function classifyTerminalTheme(background: string | undefined): TerminalThemeAppearance {
  if (!background || !/^#[0-9a-f]{6}$/i.test(background)) return "unknown";
  const red = Number.parseInt(background.slice(1, 3), 16) / 255;
  const green = Number.parseInt(background.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(background.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * linearRgb(red) + 0.7152 * linearRgb(green) + 0.0722 * linearRgb(blue);
  return luminance < 0.179 ? "dark" : "light";
}

function linearRgb(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function parseTerminalRgbSpec(value: string): string | undefined {
  const match = /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i.exec(value.trim());
  if (!match) return undefined;
  return `#${normalizeRgbChannel(match[1]!)}${normalizeRgbChannel(match[2]!)}${normalizeRgbChannel(match[3]!)}`;
}

function normalizeRgbChannel(value: string): string {
  if (value.length === 1) return `${value}${value}`.toLowerCase();
  if (value.length === 2) return value.toLowerCase();
  const maximum = 16 ** value.length - 1;
  return Math.round(Number.parseInt(value, 16) * 255 / maximum).toString(16).padStart(2, "0");
}

function encodeBase64(bytes: Uint8Array): string {
  let result = "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    result += second === undefined ? "=" : alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? "=" : alphabet[third & 0x3f];
  }
  return result;
}

const BASE64_VALUES: Readonly<Record<string, number>> = (() => {
  const table: Record<string, number> = Object.create(null);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let index = 0; index < alphabet.length; index += 1) table[alphabet[index]!] = index;
  return table;
})();

function decodeBase64(encoded: string, maxBytes: number): Uint8Array | undefined {
  if (encoded.length === 0) return new Uint8Array(0);
  if (encoded.length % 4 === 1) return undefined;
  let padding = 0;
  if (encoded.endsWith("==")) padding = 2;
  else if (encoded.endsWith("=")) padding = 1;
  const bodyLength = encoded.length - padding;
  if (padding > 0 && encoded.length % 4 !== 0) return undefined;
  const byteLength = Math.floor((bodyLength * 3) / 4);
  if (byteLength > maxBytes) return undefined;
  const output = new Uint8Array(byteLength);
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < bodyLength; index += 1) {
    const value = BASE64_VALUES[encoded[index]!];
    if (value === undefined) return undefined;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return output;
}
