// Copyright 2023 Im-Beast. MIT license.
import type { KeyPressEvent, MousePressEvent, MouseScrollEvent, PasteEvent } from "../input_reader/types.ts";

/** Terminal input routing mode for focused process windows. */
export type TerminalInputMode = "workbench" | "raw";

/** DEC mouse tracking mode currently negotiated by a child terminal application. */
export type TerminalMouseTrackingMode = "none" | "press" | "button" | "any";

/** Paste safety policy for raw terminal input routing. */
export type TerminalPasteConfirmationPolicy = "never" | "multiline" | "control";

/** Minimal process or PTY target accepted by terminal input routing helpers. */
export interface TerminalInputTarget {
  readonly running?: boolean;
  inspect?: () => { running: boolean };
  writeInput?: (data: string | Uint8Array) => Promise<boolean>;
  write?: (data: string | Uint8Array) => Promise<boolean>;
}

/** Options for encoding and routing terminal input. */
export interface TerminalInputRoutingOptions {
  mode?: TerminalInputMode;
  bracketedPaste?: boolean;
  pasteConfirmationPolicy?: TerminalPasteConfirmationPolicy;
  confirmPaste?: (inspection: TerminalPasteInspection) => boolean | Promise<boolean>;
  mouseTracking?: TerminalMouseTrackingMode;
  sgrMouse?: boolean;
  mouseOrigin?: { column: number; row: number };
  reservedKeys?: readonly string[];
  reservedCtrlKeys?: readonly string[];
  /** Kitty keyboard flags the child has in force (`TerminalScreenController.keyboardProtocol`). */
  kittyFlags?: number;
  /** xterm modifyOtherKeys level the child set. */
  modifyOtherKeys?: number;
  /** DECCKM (`CSI ? 1 h`): emit SS3 cursor/Home/End keys instead of CSI when unmodified. */
  applicationCursorKeys?: boolean;
  /** DECSET 1004 (`CSI ? 1004 h`): forward terminal focus-in (`CSI I`) and focus-out (`CSI O`) reports. */
  focusReporting?: boolean;
}

/** Inspection summary used by paste confirmation policies. */
export interface TerminalPasteInspection {
  byteLength: number;
  lineCount: number;
  multiline: boolean;
  containsControlCharacters: boolean;
}

/** Serializable decision for whether a key was routed to a child process. */
export interface TerminalInputRouteDecision {
  routed: boolean;
  reason:
    | "encoded"
    | "workbench-mode"
    | "reserved"
    | "unencodable"
    | "not-running"
    | "write-failed"
    | "paste-rejected";
  bytes?: Uint8Array;
  paste?: TerminalPasteInspection;
}

/** Minimal mouse event shape accepted by terminal mouse encoders. */
export interface TerminalMouseInputEvent {
  buffer: Uint8Array;
  x: number;
  y: number;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  drag?: boolean;
  release?: boolean;
  button?: 0 | 1 | 2;
  scroll?: -1 | 0 | 1;
}

const textEncoder = new TextEncoder();
const defaultReservedKeys = new Set(["f10", "escape"]);
const defaultReservedCtrlKeys = new Set(["c"]);

/** The key reporting a child program asked its terminal for. */
export interface TerminalKeyEncodingOptions {
  /** Kitty keyboard flags the child has in force (`TerminalScreenController.keyboardProtocol`). */
  kittyFlags?: number;
  /** xterm modifyOtherKeys level the child set. */
  modifyOtherKeys?: number;
  /**
   * DECCKM (`CSI ? 1 h`): when `true`, unmodified cursor and Home/End keys
   * encode as SS3 (`ESC O A/B/C/D/H/F`); when `false`, as CSI (`ESC [ ...`).
   * Omit to preserve the host buffer verbatim.
   */
  applicationCursorKeys?: boolean;
}

/**
 * Encodes a decoded key press into terminal input bytes for a child process.
 *
 * With no options the child gets the bytes the host terminal sent, unchanged.
 * Three things break that identity. A child that asked for the kitty keyboard
 * protocol or modifyOtherKeys gets the chords it asked to tell apart in the
 * form it asked for. A child that toggled DECCKM (`CSI ? 1 h`) gets SS3 or CSI
 * cursor/Home/End bytes to match its own mode rather than the host's. And a
 * host that reports keys in an enhanced form — because the embedding
 * application asked it to — must not leak that form into a child that never
 * asked: the key is re-encoded from its decoded fields instead.
 */
export function encodeTerminalKeyPress(
  event: Pick<KeyPressEvent, "key" | "buffer" | "ctrl" | "meta" | "shift">,
  options: TerminalKeyEncodingOptions = {},
): Uint8Array | undefined {
  const enhancedSource = isEnhancedKeyReport(event.buffer);
  const kitty = ((options.kittyFlags ?? 0) & (KITTY_DISAMBIGUATE | KITTY_REPORT_ALL)) !== 0;
  const modifyOtherKeys = options.modifyOtherKeys ?? 0;
  if (kitty || modifyOtherKeys > 0 || enhancedSource) {
    const chord = keyChord(event, enhancedSource);
    const enhanced = kitty
      ? kittyKeyBytes(chord)
      : modifyOtherKeys > 0
      ? modifyOtherKeysBytes(chord, modifyOtherKeys)
      : undefined;
    if (enhanced !== undefined) return textEncoder.encode(enhanced);
    if (enhancedSource) {
      const legacy = legacyChordBytes(chord);
      return legacy === undefined ? undefined : textEncoder.encode(legacy);
    }
  }
  if (options.applicationCursorKeys !== undefined && !event.ctrl && !event.meta && !event.shift) {
    const cursorBytes = cursorKeyBytes(event.key, options.applicationCursorKeys);
    if (cursorBytes !== undefined) return textEncoder.encode(cursorBytes);
  }
  if (event.buffer.byteLength > 0) return new Uint8Array(event.buffer);
  if (event.meta) return undefined;
  if (event.ctrl && /^[a-z]$/.test(event.key)) {
    return new Uint8Array([event.key.charCodeAt(0) - 96]);
  }

  const special = specialKeyBytes(event.key);
  if (special) return textEncoder.encode(special);
  if (event.key.length === 1) {
    const value = event.shift && /^[a-z]$/.test(event.key) ? event.key.toUpperCase() : event.key;
    return textEncoder.encode(value);
  }
  return undefined;
}

const KITTY_DISAMBIGUATE = 1;
const KITTY_REPORT_ALL = 8;

interface KeyChord {
  key: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

/** `CSI code ; modifiers u` (kitty) or `CSI 27 ; modifiers ; code ~` (modifyOtherKeys). */
function isEnhancedKeyReport(buffer: Uint8Array): boolean {
  const length = buffer.byteLength;
  if (length < 4 || buffer[0] !== 0x1b || buffer[1] !== 0x5b) return false;
  const final = buffer[length - 1];
  if (final === 0x75) {
    for (let index = 2; index < length - 1; index += 1) {
      const byte = buffer[index]!;
      if (!(byte >= 0x30 && byte <= 0x3b)) return false;
    }
    return true;
  }
  return final === 0x7e && buffer[2] === 0x32 && buffer[3] === 0x37 && buffer[4] === 0x3b;
}

/**
 * The chord a key event stands for. A legacy `ESC` + byte report of Alt+Enter,
 * Alt+Tab or Alt+Backspace decodes without its Alt, so that one modifier is
 * read back off the bytes.
 */
function keyChord(
  event: Pick<KeyPressEvent, "key" | "buffer" | "ctrl" | "meta" | "shift">,
  enhancedSource: boolean,
): KeyChord {
  let alt = event.meta;
  if (!enhancedSource && !alt && event.buffer.byteLength === 2 && event.buffer[0] === 0x1b) {
    alt = event.key === "return" || event.key === "tab" || event.key === "backspace" || event.key === "space";
  }
  return { key: event.key, shift: event.shift, alt, ctrl: event.ctrl };
}

function chordModifier(chord: KeyChord): number {
  return 1 + (chord.shift ? 1 : 0) + (chord.alt ? 2 : 0) + (chord.ctrl ? 4 : 0);
}

/** The code point both enhanced protocols name a key by: unshifted, lower case. */
function chordCodepoint(chord: KeyChord): number | undefined {
  switch (chord.key) {
    case "return":
      return 13;
    case "tab":
      return 9;
    case "backspace":
      return 127;
    case "escape":
      return 27;
    case "space":
      return 32;
  }
  if ([...chord.key].length !== 1) return undefined;
  return chord.key.toLowerCase().codePointAt(0);
}

/**
 * Kitty "disambiguate escape codes": Escape, and every text key held with Ctrl
 * or Alt, and Enter, Tab or Backspace held with any modifier, become
 * `CSI code ; modifiers u`. Plain and shifted text stays text, and the cursor
 * and function keys keep the legacy forms the protocol leaves them in.
 */
function kittyKeyBytes(chord: KeyChord): string | undefined {
  const codepoint = chordCodepoint(chord);
  if (codepoint === undefined) return undefined;
  const modifier = chordModifier(chord);
  const functional = codepoint === 13 || codepoint === 9 || codepoint === 127;
  if (codepoint === 27) return modifier === 1 ? "\x1b[27u" : `\x1b[27;${modifier}u`;
  if (functional ? modifier === 1 : !(chord.ctrl || chord.alt)) return undefined;
  return `\x1b[${codepoint};${modifier}u`;
}

/**
 * modifyOtherKeys: only the chords the legacy encoding cannot express are
 * rewritten — modified Enter, Tab, Backspace and Escape, and Ctrl held with
 * Shift or with a key that has no control byte. Ctrl+letter and Alt+key keep
 * their legacy bytes, which every level's reader accepts.
 */
function modifyOtherKeysBytes(chord: KeyChord, level: number): string | undefined {
  const codepoint = chordCodepoint(chord);
  if (codepoint === undefined) return undefined;
  const modifier = chordModifier(chord);
  if (modifier === 1) return undefined;
  const functional = codepoint === 13 || codepoint === 9 || codepoint === 127 || codepoint === 27;
  if (functional) {
    // Shift+Tab has a legacy form of its own, and Alt alone is an ESC prefix.
    if (codepoint === 9 && modifier === 2) return undefined;
    if (modifier === 3) return undefined;
    return `\x1b[27;${modifier};${codepoint}~`;
  }
  if (!chord.ctrl) return undefined;
  const letter = codepoint >= 97 && codepoint <= 122;
  if (letter && !chord.shift) return undefined;
  if (!letter && level < 2 && legacyControlByte(chord.key) !== undefined) return undefined;
  return `\x1b[27;${modifier};${codepoint}~`;
}

/** The control byte a legacy terminal sends for Ctrl held with this key, when it has one. */
function legacyControlByte(key: string): number | undefined {
  if (/^[a-zA-Z]$/.test(key)) return key.toLowerCase().charCodeAt(0) - 96;
  switch (key) {
    case "space":
    case "@":
    case "2":
      return 0x00;
    case "[":
    case "3":
      return 0x1b;
    case "\\":
    case "4":
      return 0x1c;
    case "]":
    case "5":
      return 0x1d;
    case "^":
    case "6":
      return 0x1e;
    case "_":
    case "-":
    case "/":
    case "7":
      return 0x1f;
    case "?":
    case "8":
      return 0x7f;
    default:
      return undefined;
  }
}

/** Legacy bytes for a chord that arrived in an enhanced form the child did not ask for. */
function legacyChordBytes(chord: KeyChord): string | undefined {
  const prefix = chord.alt ? "\x1b" : "";
  if (chord.key === "tab" && chord.shift) return `${prefix}\x1b[Z`;
  if (chord.key === "backspace") return `${prefix}${chord.ctrl ? "\b" : "\x7f"}`;
  if (chord.ctrl) {
    const control = legacyControlByte(chord.key);
    if (control !== undefined) return `${prefix}${String.fromCharCode(control)}`;
  }
  const special = specialKeyBytes(chord.key);
  if (special) return `${prefix}${special}`;
  if ([...chord.key].length !== 1) return undefined;
  return `${prefix}${chord.shift ? chord.key.toUpperCase() : chord.key}`;
}

/** Encodes a DECSET 1004 focus-in (`CSI I`) or focus-out (`CSI O`) report for a child process. */
export function encodeTerminalFocusEvent(focused: boolean): Uint8Array {
  return textEncoder.encode(focused ? "\x1b[I" : "\x1b[O");
}

/** Encodes paste payload text for a child process, optionally using xterm bracketed paste framing. */
export function encodeTerminalPaste(
  event: Pick<PasteEvent, "text" | "buffer">,
  options: Pick<TerminalInputRoutingOptions, "bracketedPaste"> = {},
): Uint8Array {
  if (event.buffer.byteLength > 0) return new Uint8Array(event.buffer);
  const text = options.bracketedPaste ? `\x1b[200~${event.text}\x1b[201~` : event.text;
  return textEncoder.encode(text);
}

/** Inspects paste payloads before they are routed into a raw child terminal. */
export function inspectTerminalPaste(event: Pick<PasteEvent, "text" | "buffer">): TerminalPasteInspection {
  if (event.buffer.byteLength > 0) {
    return inspectTerminalPasteBytes(event.buffer);
  }
  return inspectTerminalPasteText(event.text);
}

/** Encodes a mouse press or wheel event as xterm SGR mouse input for a child process. */
export function encodeTerminalMouse(
  event: TerminalMouseInputEvent,
  options: Pick<TerminalInputRoutingOptions, "mouseTracking" | "sgrMouse" | "mouseOrigin"> = {},
): Uint8Array | undefined {
  if (event.buffer.byteLength > 0) return new Uint8Array(event.buffer);
  const tracking = options.mouseTracking ?? "none";
  if (tracking === "none" || !options.sgrMouse) return undefined;
  const scroll = event.scroll ?? 0;
  const drag = Boolean(event.drag);
  if (drag && tracking === "press") return undefined;

  const localX = event.x - (options.mouseOrigin?.column ?? 0);
  const localY = event.y - (options.mouseOrigin?.row ?? 0);
  if (localX < 0 || localY < 0) return undefined;

  let code: number;
  let suffix = "M";
  if (scroll !== 0) {
    code = scroll < 0 ? 64 : 65;
  } else if (event.release) {
    // SGR mouse releases retain the changed button when it is known; the
    // legacy button-none value remains a compatible fallback.
    code = event.button ?? 3;
    suffix = "m";
  } else if (drag && event.button === undefined) {
    // DECSET 1003 reports hover motion as button-none plus the motion bit.
    if (tracking !== "any") return undefined;
    code = 35;
  } else if (event.button === undefined) {
    return undefined;
  } else {
    code = event.button;
    if (drag) code += 32;
  }
  if (event.shift) code += 4;
  if (event.meta) code += 8;
  if (event.ctrl) code += 16;
  return textEncoder.encode(`\x1b[<${code};${Math.floor(localX) + 1};${Math.floor(localY) + 1}${suffix}`);
}

/** Derives supported xterm mouse routing settings from DEC private modes tracked by a terminal screen. */
export function terminalMouseRoutingFromPrivateModes(
  modes: Iterable<number>,
): Pick<TerminalInputRoutingOptions, "mouseTracking" | "sgrMouse"> {
  let hasPress = false;
  let hasButton = false;
  let hasAny = false;
  let sgrMouse = false;
  for (const mode of modes) {
    if (mode === 1000) hasPress = true;
    else if (mode === 1002) hasButton = true;
    else if (mode === 1003) hasAny = true;
    else if (mode === 1006) sgrMouse = true;
  }
  const mouseTracking: TerminalMouseTrackingMode = hasAny ? "any" : hasButton ? "button" : hasPress ? "press" : "none";
  return {
    mouseTracking,
    sgrMouse,
  };
}

/** Returns true when a key should stay with the host workbench instead of the child process. */
export function isReservedTerminalKey(
  event: Pick<KeyPressEvent, "key" | "ctrl" | "meta">,
  options: TerminalInputRoutingOptions = {},
): boolean {
  return event.meta ||
    terminalReservedKeyIncludes(options.reservedKeys, defaultReservedKeys, event.key) ||
    (event.ctrl && terminalReservedKeyIncludes(options.reservedCtrlKeys, defaultReservedCtrlKeys, event.key));
}

/** Routes a key press to a process session when raw terminal input mode is active. */
export async function routeTerminalKeyPress(
  session: TerminalInputTarget,
  event: KeyPressEvent,
  options: TerminalInputRoutingOptions = {},
): Promise<TerminalInputRouteDecision> {
  if ((options.mode ?? "workbench") !== "raw") return { routed: false, reason: "workbench-mode" };
  if (isReservedTerminalKey(event, options)) return { routed: false, reason: "reserved" };
  if (!terminalInputTargetRunning(session)) return { routed: false, reason: "not-running" };
  const bytes = encodeTerminalKeyPress(event, options);
  if (!bytes) return { routed: false, reason: "unencodable" };
  const routed = await writeTerminalInput(session, bytes);
  return routed ? { routed, reason: "encoded", bytes } : { routed, reason: "write-failed", bytes };
}

/** Routes a paste payload to a process session when raw terminal input mode is active. */
export async function routeTerminalPaste(
  session: TerminalInputTarget,
  event: PasteEvent,
  options: TerminalInputRoutingOptions = {},
): Promise<TerminalInputRouteDecision> {
  if ((options.mode ?? "workbench") !== "raw") return { routed: false, reason: "workbench-mode" };
  if (!terminalInputTargetRunning(session)) return { routed: false, reason: "not-running" };
  const paste = inspectTerminalPaste(event);
  if (terminalPasteRequiresConfirmation(paste, options.pasteConfirmationPolicy ?? "never")) {
    const confirmed = await options.confirmPaste?.(paste);
    if (!confirmed) return { routed: false, reason: "paste-rejected", paste };
  }
  const bytes = encodeTerminalPaste(event, options);
  const routed = await writeTerminalInput(session, bytes);
  return routed ? { routed, reason: "encoded", bytes, paste } : { routed, reason: "write-failed", bytes, paste };
}

/** Routes a mouse event to a process session when raw terminal input and negotiated mouse mode are active. */
export async function routeTerminalMouse(
  session: TerminalInputTarget,
  event: MousePressEvent | MouseScrollEvent,
  options: TerminalInputRoutingOptions = {},
): Promise<TerminalInputRouteDecision> {
  if ((options.mode ?? "workbench") !== "raw") return { routed: false, reason: "workbench-mode" };
  if (!terminalInputTargetRunning(session)) return { routed: false, reason: "not-running" };
  const bytes = encodeTerminalMouse(event, options);
  if (!bytes) return { routed: false, reason: "unencodable" };
  const routed = await writeTerminalInput(session, bytes);
  return routed ? { routed, reason: "encoded", bytes } : { routed: false, reason: "write-failed", bytes };
}

function terminalInputTargetRunning(session: TerminalInputTarget): boolean {
  if (typeof session.running === "boolean") return session.running;
  return session.inspect?.().running ?? false;
}

function terminalPasteRequiresConfirmation(
  paste: TerminalPasteInspection,
  policy: TerminalPasteConfirmationPolicy,
): boolean {
  if (policy === "never") return false;
  if (policy === "multiline") return paste.multiline;
  return paste.multiline || paste.containsControlCharacters;
}

function inspectTerminalPasteText(text: string): TerminalPasteInspection {
  let lineCount = text.length > 0 ? 1 : 0;
  let containsControlCharacters = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10) {
      lineCount += 1;
    } else if (code < 32 && code !== 9 && code !== 13) {
      containsControlCharacters = true;
    }
  }
  return {
    byteLength: textEncoder.encode(text).byteLength,
    lineCount,
    multiline: lineCount > 1,
    containsControlCharacters,
  };
}

function inspectTerminalPasteBytes(buffer: Uint8Array): TerminalPasteInspection {
  let lineCount = buffer.byteLength > 0 ? 1 : 0;
  let containsControlCharacters = false;
  for (let index = 0; index < buffer.byteLength; index += 1) {
    const byte = buffer[index]!;
    if (byte === 10) {
      lineCount += 1;
    } else if (byte < 32 && byte !== 9 && byte !== 13) {
      containsControlCharacters = true;
    }
  }
  return {
    byteLength: buffer.byteLength,
    lineCount,
    multiline: lineCount > 1,
    containsControlCharacters,
  };
}

function writeTerminalInput(session: TerminalInputTarget, data: Uint8Array): Promise<boolean> {
  if (session.writeInput) return session.writeInput(data);
  if (session.write) return session.write(data);
  return Promise.resolve(false);
}

function terminalReservedKeyIncludes(
  override: readonly string[] | undefined,
  defaults: ReadonlySet<string>,
  key: string,
): boolean {
  if (!override) return defaults.has(key);
  for (let index = 0; index < override.length; index += 1) {
    if (override[index] === key) return true;
  }
  return false;
}

function cursorKeyBytes(key: string, application: boolean): string | undefined {
  const prefix = application ? "\x1bO" : "\x1b[";
  switch (key) {
    case "up":
      return `${prefix}A`;
    case "down":
      return `${prefix}B`;
    case "right":
      return `${prefix}C`;
    case "left":
      return `${prefix}D`;
    case "home":
      return `${prefix}H`;
    case "end":
      return `${prefix}F`;
    default:
      return undefined;
  }
}

function specialKeyBytes(key: string): string | undefined {
  switch (key) {
    case "return":
      return "\r";
    case "tab":
      return "\t";
    case "backspace":
      return "\x7f";
    case "escape":
      return "\x1b";
    case "space":
      return " ";
    case "up":
      return "\x1b[A";
    case "down":
      return "\x1b[B";
    case "right":
      return "\x1b[C";
    case "left":
      return "\x1b[D";
    case "home":
      return "\x1b[H";
    case "end":
      return "\x1b[F";
    case "insert":
      return "\x1b[2~";
    case "delete":
      return "\x1b[3~";
    case "pageup":
      return "\x1b[5~";
    case "pagedown":
      return "\x1b[6~";
    default:
      return undefined;
  }
}
