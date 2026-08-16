// Copyright 2023 Im-Beast. MIT license.

// 036 R1: the structured Kitty keyboard protocol, complete with
// press/repeat/release event types and base-layout metadata, WITHOUT
// disturbing legacy input: the decoder recognizes exactly the CSI-u
// shape and passes every other byte through unchanged, so terminals
// that never enabled the protocol keep flowing down the existing path.
// Enabling uses the push/pop form (CSI > flags u / CSI < u) so nested
// applications restore the outer application's flags, and the flag set
// is explicit — event types and alternate keys are opt-in bits, not
// assumptions. The base-layout codepoint, when the terminal reports
// one, is what shortcut matching should use: it names the PHYSICAL key
// (a Cyrillic layout still reports the QWERTY base), which is the
// entire point of the metadata.

/** Kitty progressive-enhancement flag bits. */
export const KITTY_KEYBOARD_FLAGS = Object.freeze({
  disambiguateEscapeCodes: 1,
  reportEventTypes: 2,
  reportAlternateKeys: 4,
  reportAllKeysAsEscapeCodes: 8,
  reportAssociatedText: 16,
});

/** The standard app profile: disambiguation + events + base layout. */
export const KITTY_KEYBOARD_APP_FLAGS = KITTY_KEYBOARD_FLAGS.disambiguateEscapeCodes |
  KITTY_KEYBOARD_FLAGS.reportEventTypes | KITTY_KEYBOARD_FLAGS.reportAlternateKeys;

/** Pushes the flag set (nested apps pop back to the outer set). */
export function kittyKeyboardEnterSequence(flags = KITTY_KEYBOARD_APP_FLAGS): string {
  return `\x1b[>${flags}u`;
}

/** Pops this application's flag set. */
export function kittyKeyboardExitSequence(): string {
  return "\x1b[<u";
}

/** Queries the current flags (terminals answer CSI ? flags u). */
export function kittyKeyboardQuerySequence(): string {
  return "\x1b[?u";
}

/** One structured key event. */
export interface KittyKeyEvent {
  readonly codepoint: number;
  /** The shifted key, when alternate reporting is on. */
  readonly shiftedCodepoint?: number;
  /** The PHYSICAL key in the base layout — use this for shortcuts. */
  readonly baseLayoutCodepoint?: number;
  readonly eventType: "press" | "repeat" | "release";
  readonly modifiers: {
    readonly shift: boolean;
    readonly alt: boolean;
    readonly ctrl: boolean;
    readonly super: boolean;
    readonly capsLock: boolean;
    readonly numLock: boolean;
  };
  /** Associated text codepoints, when that reporting is on. */
  readonly text?: string;
}

const KITTY_PATTERN = /^\x1b\[([0-9]+(?::[0-9]*){0,2})(?:;([0-9]+(?::[0-9]+)?)(?:;([0-9:]+))?)?u/;

/** Parses one CSI-u sequence at the start of the input, or refuses. */
export function parseKittyKey(input: string): { readonly event: KittyKeyEvent; readonly length: number } | undefined {
  const match = input.match(KITTY_PATTERN);
  if (!match) return undefined;
  const keyParts = match[1]!.split(":");
  const codepoint = Number.parseInt(keyParts[0]!, 10);
  const shifted = keyParts[1] ? Number.parseInt(keyParts[1], 10) : undefined;
  const baseLayout = keyParts[2] ? Number.parseInt(keyParts[2], 10) : undefined;
  const modifierParts = (match[2] ?? "1").split(":");
  const bits = Math.max(0, Number.parseInt(modifierParts[0]!, 10) - 1);
  const eventCode = modifierParts[1] ? Number.parseInt(modifierParts[1], 10) : 1;
  const text = match[3]
    ? String.fromCodePoint(...match[3].split(":").map((part) => Number.parseInt(part, 10)))
    : undefined;
  return {
    length: match[0].length,
    event: {
      codepoint,
      ...(shifted !== undefined && Number.isFinite(shifted) ? { shiftedCodepoint: shifted } : {}),
      ...(baseLayout !== undefined && Number.isFinite(baseLayout) ? { baseLayoutCodepoint: baseLayout } : {}),
      eventType: eventCode === 3 ? "release" : eventCode === 2 ? "repeat" : "press",
      modifiers: {
        shift: (bits & 1) !== 0,
        alt: (bits & 2) !== 0,
        ctrl: (bits & 4) !== 0,
        super: (bits & 8) !== 0,
        capsLock: (bits & 64) !== 0,
        numLock: (bits & 128) !== 0,
      },
      ...(text !== undefined ? { text } : {}),
    },
  };
}

/** The key name shortcuts should match on: base layout first. */
export function kittyShortcutKey(event: KittyKeyEvent): string {
  const codepoint = event.baseLayoutCodepoint ?? event.codepoint;
  return String.fromCodePoint(codepoint);
}

/**
 * The stream decoder: CSI-u sequences become structured events, every
 * other byte passes through UNCHANGED for the legacy input path.
 */
export function createKittyKeyboardDecoder(): {
  feed(data: string): { readonly events: readonly KittyKeyEvent[]; readonly passthrough: string };
} {
  let pending = "";
  return {
    feed(data) {
      pending += data;
      const events: KittyKeyEvent[] = [];
      let passthrough = "";
      while (pending.length > 0) {
        const parsed = parseKittyKey(pending);
        if (parsed) {
          events.push(parsed.event);
          pending = pending.slice(parsed.length);
          continue;
        }
        // A CSI prefix that could still become a kitty sequence waits
        // for more bytes instead of leaking a partial escape.
        if (pending === "\x1b" || /^\x1b\[[0-9;:]*$/.test(pending)) break;
        passthrough += pending[0]!;
        pending = pending.slice(1);
      }
      return { events, passthrough };
    },
  };
}
