// Copyright 2023 Im-Beast. MIT license.

// 036 V1: the genuinely missing general widgets, as controllers that
// reuse existing contracts. MaskedInput fills a declared mask (# digit,
// A letter, * any) inserting literal characters automatically and
// refusing non-matching input; SelectionList tracks a keyboard cursor
// with single or multi selection; ContentSwitcher shows exactly one
// named panel with Collapsible sections; Loading advances declared
// spinner frames on the caller's clock; Digits renders numbers as
// three-row seven-segment-style glyphs for dashboard surfaces.

/** Masked input: # digit, A letter, * any; others are literals. */
export class MaskedInputController {
  readonly #mask: string;
  #filled: string[] = [];

  constructor(mask: string) {
    this.#mask = mask;
  }

  /** Types one character; literals auto-insert; mismatches refuse. */
  type(char: string): boolean {
    let position = this.#nextSlot();
    if (position >= this.#mask.length) return false;
    const slot = this.#mask[position]!;
    const matches = slot === "#" ? /^[0-9]$/.test(char) : slot === "A" ? /^[a-zA-Z]$/.test(char) : true;
    if (!matches) return false;
    this.#filled.push(char);
    return true;
  }

  backspace(): void {
    this.#filled.pop();
  }

  /** The raw typed value (no literals). */
  raw(): string {
    return this.#filled.join("");
  }

  /** The formatted value with mask literals in place. */
  formatted(): string {
    let out = "";
    let cursor = 0;
    for (const slot of this.#mask) {
      if (slot === "#" || slot === "A" || slot === "*") {
        if (cursor >= this.#filled.length) break;
        out += this.#filled[cursor]!;
        cursor += 1;
      } else {
        if (cursor >= this.#filled.length && cursor > 0) break;
        out += slot;
      }
    }
    return out;
  }

  complete(): boolean {
    return this.#nextSlot() >= this.#mask.length;
  }

  #nextSlot(): number {
    let cursor = 0;
    for (let index = 0; index < this.#mask.length; index += 1) {
      const slot = this.#mask[index]!;
      if (slot === "#" || slot === "A" || slot === "*") {
        if (cursor === this.#filled.length) return index;
        cursor += 1;
      }
    }
    return this.#mask.length;
  }
}

/** Selection list with keyboard cursor and single/multi modes. */
export class SelectionListController<T> {
  readonly #items: readonly T[];
  readonly #multi: boolean;
  readonly #selected = new Set<number>();
  #cursor = 0;

  constructor(items: readonly T[], options: { readonly multi?: boolean } = {}) {
    this.#items = items;
    this.#multi = options.multi ?? false;
  }

  cursor(): number {
    return this.#cursor;
  }

  moveCursor(delta: number): void {
    this.#cursor = Math.max(0, Math.min(this.#items.length - 1, this.#cursor + delta));
  }

  /** Toggles the cursored item (single mode replaces the selection). */
  toggle(): void {
    if (this.#selected.has(this.#cursor)) {
      this.#selected.delete(this.#cursor);
      return;
    }
    if (!this.#multi) this.#selected.clear();
    this.#selected.add(this.#cursor);
  }

  selectAll(): void {
    if (!this.#multi) return;
    for (let index = 0; index < this.#items.length; index += 1) this.#selected.add(index);
  }

  selected(): readonly T[] {
    return [...this.#selected].sort((a, b) => a - b).map((index) => this.#items[index]!);
  }
}

/** Content switcher: exactly one active panel. */
export class ContentSwitcherController {
  readonly #panels: readonly string[];
  #active: string;

  constructor(panels: readonly string[]) {
    if (panels.length === 0) throw new TypeError("a content switcher needs at least one panel");
    this.#panels = panels;
    this.#active = panels[0]!;
  }

  active(): string {
    return this.#active;
  }

  switch(panel: string): boolean {
    if (!this.#panels.includes(panel)) return false;
    this.#active = panel;
    return true;
  }

  /** Visibility per panel — exactly one true. */
  visibility(): Readonly<Record<string, boolean>> {
    return Object.fromEntries(this.#panels.map((panel) => [panel, panel === this.#active]));
  }
}

/** A collapsible section. */
export class CollapsibleController {
  #open: boolean;

  constructor(options: { readonly open?: boolean } = {}) {
    this.#open = options.open ?? false;
  }

  open(): boolean {
    return this.#open;
  }

  toggle(): boolean {
    this.#open = !this.#open;
    return this.#open;
  }
}

/** Loading spinner on the caller's clock. */
export class LoadingController {
  readonly #frames: readonly string[];
  readonly #intervalMs: number;
  readonly #startedAtMs: number;

  constructor(
    options: { readonly startedAtMs: number; readonly frames?: readonly string[]; readonly intervalMs?: number },
  ) {
    this.#frames = options.frames ?? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.#intervalMs = Math.max(1, options.intervalMs ?? 80);
    this.#startedAtMs = options.startedAtMs;
  }

  frame(nowMs: number): string {
    const ticks = Math.floor(Math.max(0, nowMs - this.#startedAtMs) / this.#intervalMs);
    return this.#frames[ticks % this.#frames.length]!;
  }

  elapsedMs(nowMs: number): number {
    return Math.max(0, nowMs - this.#startedAtMs);
  }
}

const DIGIT_ROWS: Readonly<Record<string, readonly [string, string, string]>> = {
  "0": ["┌─┐", "│ │", "└─┘"],
  "1": ["  ╷", "  │", "  ╵"],
  "2": ["╶─┐", "┌─┘", "└─╴"],
  "3": ["╶─┐", "╶─┤", "╶─┘"],
  "4": ["╷ ╷", "└─┤", "  ╵"],
  "5": ["┌─╴", "└─┐", "╶─┘"],
  "6": ["┌─╴", "├─┐", "└─┘"],
  "7": ["╶─┐", "  │", "  ╵"],
  "8": ["┌─┐", "├─┤", "└─┘"],
  "9": ["┌─┐", "└─┤", "╶─┘"],
  ":": [" ", "·", "·"],
  ".": [" ", " ", "·"],
  "-": ["   ", "╶─╴", "   "],
};

/** Renders a numeric string as three big-digit rows. */
export function renderDigits(text: string): [string, string, string] {
  const rows: [string[], string[], string[]] = [[], [], []];
  for (const char of text) {
    const glyph = DIGIT_ROWS[char] ?? ["?", "?", "?"];
    rows[0].push(glyph[0]);
    rows[1].push(glyph[1]);
    rows[2].push(glyph[2]);
  }
  return [rows[0].join(" "), rows[1].join(" "), rows[2].join(" ")];
}
