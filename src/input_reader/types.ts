// Copyright 2023 Im-Beast. MIT license.
import type { Range } from "../types.ts";

/** Interface defining key press issued to stdin */
export interface KeyPressEvent {
  key: Key;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  buffer: Uint8Array;
}

/** Interface defining any mouse event issued to stdin */
export interface MouseEvent {
  key: "mouse";
  buffer: Uint8Array;
  x: number;
  y: number;
  movementX: number;
  movementY: number;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
}

/** Interface defining mouse press issued to stdin */
export interface MousePressEvent extends MouseEvent {
  drag: boolean;
  release: boolean;
  /** undefined when `release` is true */
  button: 0 | 1 | 2 | undefined;
}

/** Interface defining mouse wheel scroll events issued to stdin. */
export interface MouseScrollEvent extends MouseEvent {
  drag: boolean;
  /**
   *  - 1 – Scrolls downwards
   *  - 0 – Doesn't scroll
   *  - -1 – Scrolls upwards
   */
  scroll: 1 | 0 | -1;
}

/** Bracketed paste payload emitted as one event instead of command-like keypresses. */
export interface PasteEvent {
  key: "paste";
  text: string;
  buffer: Uint8Array;
}

/** Terminal focus-in/focus-out event from xterm focus tracking mode. */
export interface TerminalFocusEvent {
  key: "focus";
  focused: boolean;
  buffer: Uint8Array;
}

/**
 * An APC string from the terminal (`ESC _ … ESC \`).
 *
 * Terminals speak APC back at applications in exactly one common case: kitty
 * graphics replies — `ESC _ G i=…;OK ESC \` answering a query. A multiplexer
 * relaying graphics for its children needs these to route the answer to the
 * child that asked; everything else can ignore them, which is also what
 * dropping them silently used to do, minus the routing.
 */
export interface TerminalApcEvent {
  key: "apc";
  /** APC payload between the introducer and ST. */
  data: string;
  buffer: Uint8Array;
}

/** Union of all decoded terminal input event shapes. */
export type InputEvent =
  | KeyPressEvent
  | MouseEvent
  | MousePressEvent
  | MouseScrollEvent
  | PasteEvent
  | TerminalFocusEvent
  | TerminalApcEvent;

/** Normalized key name emitted by the input reader. */
export type Key =
  | Alphabet
  | Chars
  | SpecialKeys
  | `${Range<0, 10>}`
  | `f${Range<1, 12>}`;

/** Type defining letters from the latin alphabet */
export type Alphabet =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

/** Type defining special keys */
export type SpecialKeys =
  | "return"
  | "tab"
  | "backspace"
  | "escape"
  | "space"
  | "up"
  | "down"
  | "left"
  | "right"
  | "clear"
  | "insert"
  | "delete"
  | "pageup"
  | "pagedown"
  | "home"
  | "end"
  | "tab";

/** Type defining interpunction characters */
export type Chars =
  | "!"
  | "@"
  | "#"
  | "$"
  | "%"
  | "^"
  | "&"
  | "*"
  | "("
  | ")"
  | "-"
  | "_"
  | "="
  | "+"
  | "["
  | "{"
  | "]"
  | "}"
  | "'"
  | '"'
  | ";"
  | ":"
  | ","
  | "<"
  | "."
  | ">"
  | "/"
  | "?"
  | "\\"
  | "|";
