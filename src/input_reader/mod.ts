// Copyright 2023 Im-Beast. MIT license.

// The event shapes are part of the contract: nothing can write a key or mouse
// handler without naming them, so they belong on the public barrel rather than
// only on the internal module.
export type * from "./types.ts";

import type {
  Alphabet,
  InputEvent,
  Key,
  KeyPressEvent,
  MouseEvent,
  MousePressEvent,
  MouseScrollEvent,
  PasteEvent,
  TerminalApcEvent,
  TerminalFocusEvent,
} from "./types.ts";
import type { Stdin } from "../types.ts";
import type { EmitterEvent, EventEmitter } from "../event_emitter.ts";

/** Public type alias for an input Event Record. */
export type InputEventRecord = {
  inputEvent: EmitterEvent<[InputEvent]>;
  keyPress: EmitterEvent<[KeyPressEvent]>;
  mouseEvent: EmitterEvent<[MouseEvent | MousePressEvent | MouseScrollEvent]>;
  mousePress: EmitterEvent<[MousePressEvent]>;
  mouseScroll: EmitterEvent<[MouseScrollEvent]>;
  paste: EmitterEvent<[PasteEvent]>;
  terminalFocus: EmitterEvent<[TerminalFocusEvent]>;
  terminalApc: EmitterEvent<[TerminalApcEvent]>;
};

const BRACKETED_PASTE_START_TEXT = "\x1b[200~";
const BRACKETED_PASTE_END_TEXT = "\x1b[201~";
const BRACKETED_PASTE_START = new TextEncoder().encode(BRACKETED_PASTE_START_TEXT);
const BRACKETED_PASTE_END = new TextEncoder().encode(BRACKETED_PASTE_END_TEXT);

/**
 * Read keypresses from given stdin, parse them and emit to given emitter.
 */
export async function emitInputEvents(
  stdin: Stdin,
  emitter: EventEmitter<InputEventRecord>,
  minReadInterval = 0,
  options: { signal?: AbortSignal; cbreak?: boolean } = {},
): Promise<void> {
  try {
    // cbreak keeps ISIG enabled, so Ctrl+C/Ctrl+Z become process signals. Apps
    // that must see those chords as keypresses (terminal multiplexers that
    // forward them to a child PTY) pass cbreak: false for full raw mode.
    stdin.setRaw(true, { cbreak: options.cbreak ?? (Deno.build.os !== "windows") });
  } catch {
    // omit
  }

  const maxbuffer = new Uint8Array(1024);
  let pending = new Uint8Array(0);
  let pendingRead: Promise<number | null> | null = null;
  const interval = Math.max(0, Number.isFinite(minReadInterval) ? minReadInterval : 0);

  const emitEvent = (event: InputEvent) => {
    emitter.emit("inputEvent", event);
    if (event.key === "mouse") {
      emitter.emit("mouseEvent", event);

      if ("button" in event) {
        emitter.emit("mousePress", event);
      } else if ("scroll" in event) {
        emitter.emit("mouseScroll", event);
      }
    } else if (event.key === "paste") {
      emitter.emit("paste", event);
    } else if (event.key === "focus") {
      emitter.emit("terminalFocus", event);
    } else if (event.key === "apc") {
      emitter.emit("terminalApc", event);
    } else {
      emitter.emit("keyPress", event);
    }
  };

  while (!options.signal?.aborted) {
    pendingRead ??= stdin.read(maxbuffer);
    let size: number | null;
    if (pending.length > 0) {
      // A held-back tail is usually a lone ESC that may or may not be the
      // start of a sequence. Real sequences arrive in one write; if no
      // continuation shows up quickly, deliver it as the escape key instead
      // of fusing it with the next unrelated keypress into an alt-chord.
      const raced = await Promise.race([
        pendingRead,
        waitForInputInterval(ESCAPE_FLUSH_MS, options.signal).then(() => FLUSH_PENDING),
      ]);
      if (typeof raced === "symbol") {
        if (options.signal?.aborted) return;
        const flushed = pending;
        pending = new Uint8Array(0);
        for (const event of decodeBuffer(flushed, true)) emitEvent(event);
        continue;
      }
      size = raced;
    } else {
      size = await pendingRead;
    }
    pendingRead = null;
    if (size == null || options.signal?.aborted) return;
    // A conforming blocking terminal reader normally returns data or EOF, but
    // custom adapters may transiently report zero bytes. Yield in that case so
    // the unthrottled default cannot become a hot spin.
    if (size === 0) {
      await waitForInputInterval(interval, options.signal);
      continue;
    }

    const buffer = maxbuffer.subarray(0, size);
    const combined = pending.length > 0 ? concatBuffers(pending, buffer) : buffer;
    const { complete, remainder } = splitInputBuffer(combined);
    pending = new Uint8Array(remainder);

    for (const event of decodeBuffer(complete)) emitEvent(event);

    if (interval > 0) await waitForInputInterval(interval, options.signal);
  }
}

const FLUSH_PENDING = Symbol("flushPending");
/** How long a lone ESC may wait for sequence continuation bytes. */
const ESCAPE_FLUSH_MS = 40;

const textDecoder = new TextDecoder();
const lowerCaseAlphabet = "abcdefghijklmnopqrstuvwxyz";
const sequenceMap: Partial<Record<string, Key>> = {
  OP: "f1",
  "[P": "f1",
  OQ: "f2",
  "[Q": "f2",
  OR: "f3",
  "[R": "f3",
  OS: "f4",
  "[S": "f4",
  "[[A": "f1",
  "[[B": "f2",
  "[[C": "f3",
  "[[D": "f4",
  "[[E": "f5",
  "[11~": "f1",
  "[12~": "f2",
  "[13~": "f3",
  "[14~": "f4",
  "[15~": "f5",
  "[17~": "f6",
  "[18~": "f7",
  "[19~": "f8",
  "[20~": "f9",
  "[21~": "f10",
  "[23~": "f11",
  "[24~": "f12",
  OA: "up",
  "[A": "up",
  OB: "down",
  "[B": "down",
  OC: "right",
  "[C": "right",
  OD: "left",
  "[D": "left",
  OH: "home",
  "[H": "home",
  OF: "end",
  "[F": "end",
  "[2~": "insert",
  "[3~": "delete",
  "[5~": "pageup",
  "[6~": "pagedown",
  "[E": "clear",
};

const keyPress: KeyPressEvent = {
  buffer: undefined as unknown as Uint8Array,
  key: "-",
  meta: false,
  ctrl: false,
  shift: false,
};
let modifierStart = -1;
let modifierEnd = -1;

let mouseEvent: MouseEvent = {
  key: "mouse",
  x: 0,
  y: 0,
  movementX: 0,
  movementY: 0,
  buffer: undefined as unknown as Uint8Array,
  shift: false,
  ctrl: false,
  meta: false,
};
let lastMouseEvent: MouseEvent = { ...mouseEvent };

/**
 * Decode character(s) from buffer that was sent to stdin from terminal on mostly
 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.txt for reference used to create this function
 */
export function* decodeBuffer(
  buffer: Uint8Array,
  flush = false,
): Generator<InputEvent, void, void> {
  let index = 0;
  while (index < buffer.length) {
    // With flush set, an incomplete tail (a lone ESC whose continuation
    // never arrived) is decoded as-is instead of being held back.
    const boundary = nextInputBoundary(buffer, index) ?? (flush ? buffer.length : null);
    if (boundary == null) return;
    const chunk = buffer.subarray(index, boundary);
    const code = textDecoder.decode(chunk);
    yield decodeApc(chunk, code) ?? decodeBracketedPaste(chunk, code) ?? decodeTerminalFocus(chunk, code) ??
      decodeMouseVT_UTF8(chunk, code) ?? decodeMouseSGR(chunk, code) ?? decodeKey(chunk, code);
    index = boundary;
  }
}

function decodeBracketedPaste(
  buffer: Uint8Array,
  code: string,
  decoder = textDecoder,
): PasteEvent | undefined {
  if (!code.startsWith(BRACKETED_PASTE_START_TEXT) || !code.endsWith(BRACKETED_PASTE_END_TEXT)) {
    return undefined;
  }
  const payload = buffer.subarray(BRACKETED_PASTE_START.length, buffer.length - BRACKETED_PASTE_END.length);
  return {
    key: "paste",
    text: decoder.decode(payload),
    buffer,
  };
}

function decodeApc(buffer: Uint8Array, code: string): TerminalApcEvent | undefined {
  if (!code.startsWith("\x1b_")) return undefined;
  const end = code.endsWith("\x1b\\") ? code.length - 2 : code.length;
  return { key: "apc", data: code.slice(2, end), buffer };
}

function decodeTerminalFocus(buffer: Uint8Array, code: string): TerminalFocusEvent | undefined {
  if (code === "\x1b[I") {
    return { key: "focus", focused: true, buffer };
  }
  if (code === "\x1b[O") {
    return { key: "focus", focused: false, buffer };
  }
  return undefined;
}

function decodeKey(buffer: Uint8Array, code: string): KeyPressEvent {
  if (code[0] === "\x1b") code = code.slice(1);
  keyPress.buffer = buffer;
  keyPress.key = code as Key;
  keyPress.ctrl = false;
  keyPress.meta = false;
  keyPress.shift = false;

  switch (code) {
    case "\r":
    case "\n":
      keyPress.key = "return";
      break;
    case "\t":
      keyPress.key = "tab";
      break;
    case "\b":
    case "\x7f":
      keyPress.key = "backspace";
      break;
    case "\x1b":
      keyPress.key = "escape";
      break;
    case " ":
      keyPress.key = "space";
      break;
    default:
      {
        if (buffer[0] !== 27) {
          const offset96 = String.fromCharCode(buffer[0] + 96);
          if (lowerCaseAlphabet.indexOf(offset96) !== -1) {
            keyPress.key = offset96 as Alphabet;
            keyPress.ctrl = true;
            break;
          }
        }

        if (code.length === 1) {
          keyPress.shift = code !== code.toLowerCase();
          keyPress.meta = buffer[0] === 27;
          break;
        } else if (buffer.length === 1) {
          keyPress.key = "escape";
          break;
        }

        const modifier = terminalKeyModifier(code);
        switch (modifier) {
          case 5:
            keyPress.ctrl = true;
            break;
          case 3:
            keyPress.meta = true;
            break;
          case 2:
            keyPress.shift = true;
            break;
        }

        if (modifier > 0) {
          code = normalizeModifiedKeySequence(code, modifierStart, modifierEnd);
        }
        const normalizedKey = sequenceMap[code];
        if (normalizedKey) {
          keyPress.key = normalizedKey;
        }
      }
      break;
  }

  return keyPress;
}

function terminalKeyModifier(code: string): number {
  const semicolon = code.lastIndexOf(";");
  modifierStart = -1;
  modifierEnd = -1;
  if (semicolon < 0 || semicolon + 1 >= code.length) return 0;

  let value = 0;
  let end = semicolon + 1;
  for (; end < code.length; end += 1) {
    const char = code.charCodeAt(end);
    if (char < 48 || char > 57) break;
    value = value * 10 + char - 48;
  }
  if (end === semicolon + 1) return 0;
  modifierStart = semicolon + 1;
  modifierEnd = end;
  return value;
}

function normalizeModifiedKeySequence(code: string, modifierStart: number, modifierEnd: number): string {
  if (modifierStart >= 2 && code.charCodeAt(modifierStart - 2) === 49) {
    return `${code.slice(0, modifierStart - 2)}${code.slice(modifierEnd)}`;
  }
  return `${code.slice(0, modifierStart - 1)}${code.slice(modifierEnd)}`;
}

function decodeMouseSGR(
  buffer: Uint8Array,
  code: string,
): MousePressEvent | MouseScrollEvent | undefined {
  const action = code.at(-1);
  if (!code.startsWith("\x1b[<") || (action !== "m" && action !== "M")) {
    return undefined;
  }

  const release = action === "m";

  const xSeparator = code.indexOf(";");
  let modifiers = +code.slice(3, xSeparator);
  const ySeparator = code.indexOf(";", xSeparator + 1);
  let x = +code.slice(xSeparator + 1, ySeparator);
  let y = +code.slice(ySeparator + 1, code.length - 1);

  x -= 1;
  y -= 1;

  const movementX = lastMouseEvent ? x - lastMouseEvent.x : 0;
  const movementY = lastMouseEvent ? y - lastMouseEvent.y : 0;

  let scroll: MouseScrollEvent["scroll"] = 0;
  if (modifiers >= 64 && modifiers < 128) {
    const wheel = modifiers & ~0b11100;
    // SGR 66/67 report horizontal wheel motion; never surface it as vertical.
    if (wheel !== 64 && wheel !== 65) return undefined;
    scroll = wheel === 64 ? -1 : 1;
    modifiers -= wheel;
  }

  let drag = false;
  if (modifiers >= 32) {
    drag = true;
    modifiers -= 32;
  }

  let ctrl = false;
  if (modifiers >= 16) {
    ctrl = true;
    modifiers -= 16;
  }

  let meta = false;
  if (modifiers >= 8) {
    meta = true;
    modifiers -= 8;
  }

  let shift = false;
  if (modifiers >= 4) {
    shift = true;
    modifiers -= 4;
  }

  let button: MousePressEvent["button"];
  if (!scroll) {
    button = modifiers as MousePressEvent["button"];
  }

  lastMouseEvent = mouseEvent;
  const previous = lastMouseEvent;
  mouseEvent = previous;

  const allMouseEvents = mouseEvent as Partial<MousePressEvent & MouseScrollEvent>;
  delete allMouseEvents.scroll;
  delete allMouseEvents.drag;
  delete allMouseEvents.button;
  delete allMouseEvents.release;

  mouseEvent.buffer = buffer;
  mouseEvent.x = x;
  mouseEvent.y = y;
  mouseEvent.ctrl = ctrl;
  mouseEvent.meta = meta;
  mouseEvent.shift = shift;
  mouseEvent.movementX = movementX;
  mouseEvent.movementY = movementY;

  if (scroll) {
    const mouseScrollEvent = mouseEvent as MouseScrollEvent;
    mouseScrollEvent.scroll = scroll;
    return mouseScrollEvent;
  }

  const mousePressEvent = mouseEvent as MousePressEvent;
  mousePressEvent.drag = drag;
  mousePressEvent.button = button!;
  mousePressEvent.release = release;
  return mousePressEvent;
}

function decodeMouseVT_UTF8(
  buffer: Uint8Array,
  code: string,
): MousePressEvent | MouseScrollEvent | undefined {
  if (!code.startsWith("\x1b[M")) return undefined;

  const modifiers = code.charCodeAt(3);
  let x = code.charCodeAt(4);
  let y = code.charCodeAt(5);

  x -= 0o41;
  y -= 0o41;

  const movementX = lastMouseEvent ? x - lastMouseEvent.x : 0;
  const movementY = lastMouseEvent ? y - lastMouseEvent.y : 0;

  const buttonInfo = modifiers & 3;
  const wheelRange = !!(modifiers & 32) && !!(modifiers & 64);
  // Legacy wheel buttons: 0 up, 1 down, 2/3 horizontal (never vertical scroll).
  if (wheelRange && buttonInfo >= 2) return undefined;
  let release = false;

  let button: MousePressEvent["button"];
  if (buttonInfo === 3) {
    release = true;
  } else {
    button = buttonInfo as MousePressEvent["button"];
  }

  const shift = !!(modifiers & 4);
  const meta = !!(modifiers & 8);
  const ctrl = !!(modifiers & 16);
  const scroll = wheelRange ? (buttonInfo === 0 ? -1 : 1) as -1 | 1 : 0;
  if (scroll) button = undefined;
  const drag = !scroll && !!(modifiers & 64);

  lastMouseEvent = mouseEvent;
  const previous = lastMouseEvent;
  mouseEvent = previous;

  const allMouseEvents = mouseEvent as Partial<MousePressEvent & MouseScrollEvent>;
  delete allMouseEvents.scroll;
  delete allMouseEvents.drag;
  delete allMouseEvents.button;
  delete allMouseEvents.release;

  mouseEvent.buffer = buffer;
  mouseEvent.x = x;
  mouseEvent.y = y;
  mouseEvent.ctrl = ctrl;
  mouseEvent.meta = meta;
  mouseEvent.shift = shift;
  mouseEvent.movementX = movementX;
  mouseEvent.movementY = movementY;

  if (scroll) {
    const mouseScrollEvent = mouseEvent as MouseScrollEvent;
    mouseScrollEvent.scroll = scroll;
    return mouseScrollEvent;
  }

  const mousePressEvent = mouseEvent as MousePressEvent;
  mousePressEvent.drag = drag;
  mousePressEvent.button = button!;
  mousePressEvent.release = release;
  return mousePressEvent;
}

function splitInputBuffer(buffer: Uint8Array) {
  let end = 0;
  let nextIndex = 0;
  while (nextIndex < buffer.length) {
    const boundary = nextInputBoundary(buffer, nextIndex);
    if (boundary == null) {
      break;
    }
    end = boundary;
    nextIndex = boundary;
  }

  return {
    complete: buffer.subarray(0, end),
    remainder: buffer.subarray(end),
  };
}

function nextInputBoundary(buffer: Uint8Array, start: number): number | null {
  const first = buffer[start];
  if (first == null) {
    return null;
  }

  if (first !== 0x1b) {
    const width = utf8ByteWidth(first);
    return start + width <= buffer.length ? start + width : null;
  }

  const second = buffer[start + 1];
  if (second == null) {
    return null;
  }
  if (second === 0x1b) {
    return start + 1;
  }

  // An APC string (`ESC _ … ESC \`) contains an interior ESC in its own
  // terminator, so the generic ESC boundary would cut it in half and decode
  // the pieces as an alt-chord. It spans to its ST or is held for more input.
  if (second === 0x5f) {
    for (let index = start + 2; index + 1 < buffer.length; index += 1) {
      if (buffer[index] === 0x1b && buffer[index + 1] === 0x5c) return index + 2;
    }
    return null;
  }

  if (second === 0x5b) {
    const third = buffer[start + 2];
    if (third == null) {
      return null;
    }

    if (startsWithBytes(buffer, BRACKETED_PASTE_START, start)) {
      const end = indexOfBytes(buffer, BRACKETED_PASTE_END, start + BRACKETED_PASTE_START.length);
      return end < 0 ? null : end + BRACKETED_PASTE_END.length;
    }

    if (third === 0x4d) {
      return start + 6 <= buffer.length ? start + 6 : null;
    }

    if (third === 0x3c) {
      for (let index = start + 3; index < buffer.length; index += 1) {
        const byte = buffer[index];
        if (byte === 0x4d || byte === 0x6d) {
          return index + 1;
        }
      }
      return null;
    }

    if (third === 0x5b) {
      return scanEscapeSequence(buffer, start + 3);
    }

    return scanEscapeSequence(buffer, start + 2);
  }

  if (second === 0x4f) {
    return scanEscapeSequence(buffer, start + 2);
  }

  const width = utf8ByteWidth(second);
  return start + 1 + width <= buffer.length ? start + 1 + width : null;
}

function scanEscapeSequence(buffer: Uint8Array, start: number): number | null {
  for (let index = start; index < buffer.length; index += 1) {
    const byte = buffer[index];
    if (byte >= 0x40 && byte <= 0x7e) {
      return index + 1;
    }
  }
  return null;
}

function utf8ByteWidth(byte: number) {
  if ((byte & 0x80) === 0) {
    return 1;
  }
  if ((byte & 0xe0) === 0xc0) {
    return 2;
  }
  if ((byte & 0xf0) === 0xe0) {
    return 3;
  }
  if ((byte & 0xf8) === 0xf0) {
    return 4;
  }
  return 1;
}

function concatBuffers(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left);
  merged.set(right, left.length);
  return merged;
}

function waitForInputInterval(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

function startsWithBytes(buffer: Uint8Array, sequence: Uint8Array, start: number): boolean {
  if (start + sequence.length > buffer.length) return false;
  for (let index = 0; index < sequence.length; index += 1) {
    if (buffer[start + index] !== sequence[index]) return false;
  }
  return true;
}

function indexOfBytes(buffer: Uint8Array, sequence: Uint8Array, start: number): number {
  for (let index = start; index <= buffer.length - sequence.length; index += 1) {
    if (startsWithBytes(buffer, sequence, index)) return index;
  }
  return -1;
}
