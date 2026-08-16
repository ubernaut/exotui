// Copyright 2023 Im-Beast. MIT license.

// WID-003: the token/tag editor as a controller. Input text parses with
// quote support ("New York, NY" is one token), tokens carry per-token
// validation and a declared duplicate policy (reject | ignore | allow),
// reordering and removal are first-class, async suggestions attach through
// a caller-owned request hook keyed by a monotonically stamped query so
// stale responses can never clobber newer ones, and EVERY mutation —
// add, remove, reorder, edit — is a reversible journal entry: undo applies
// the entry's inverse, redo re-applies it. Draft-text editing helpers are
// grapheme-safe: backspace removes one user-perceived character, never
// half a flag or a ZWJ family.

import { previousGraphemeBoundary, segmentGraphemes } from "../unicode/grapheme.ts";

/** One committed token. */
export interface Token {
  readonly id: number;
  readonly text: string;
  /** undefined = valid; otherwise the per-token validation message. */
  readonly error?: string;
}

/** Duplicate handling when a token with identical text is committed. */
export type DuplicatePolicy = "reject" | "ignore" | "allow";

/** Editor configuration. */
export interface TokenEditorOptions {
  /** Per-token validator; returns a message for invalid tokens. */
  readonly validate?: (text: string) => string | undefined;
  readonly duplicates?: DuplicatePolicy;
  /** Separators that commit the current draft (default comma). */
  readonly separators?: readonly string[];
}

/** One async suggestion response. */
export interface TokenSuggestions {
  readonly query: string;
  readonly items: readonly string[];
}

/** One reversible mutation, stored as performed. */
type JournalEntry =
  | { readonly kind: "insert"; readonly index: number; readonly token: Token }
  | { readonly kind: "delete"; readonly index: number; readonly token: Token }
  | { readonly kind: "move"; readonly from: number; readonly to: number }
  | { readonly kind: "replace"; readonly index: number; readonly before: Token; readonly after: Token };

function invert(entry: JournalEntry): JournalEntry {
  switch (entry.kind) {
    case "insert":
      return { kind: "delete", index: entry.index, token: entry.token };
    case "delete":
      return { kind: "insert", index: entry.index, token: entry.token };
    case "move":
      return { kind: "move", from: entry.to, to: entry.from };
    case "replace":
      return { kind: "replace", index: entry.index, before: entry.after, after: entry.before };
  }
}

/** The token editor controller. */
export class TokenEditor {
  readonly #validate: (text: string) => string | undefined;
  readonly #duplicates: DuplicatePolicy;
  readonly #separators: readonly string[];
  #tokens: Token[] = [];
  #draft = "";
  #nextId = 1;
  #undoStack: JournalEntry[] = [];
  #redoStack: JournalEntry[] = [];
  #suggestionStamp = 0;
  #suggestions: TokenSuggestions = { query: "", items: [] };

  constructor(options: TokenEditorOptions = {}) {
    this.#validate = options.validate ?? (() => undefined);
    this.#duplicates = options.duplicates ?? "reject";
    this.#separators = options.separators ?? [","];
  }

  tokens(): readonly Token[] {
    return [...this.#tokens];
  }

  draft(): string {
    return this.#draft;
  }

  suggestions(): TokenSuggestions {
    return this.#suggestions;
  }

  /**
   * Types text into the draft. Separators outside quotes commit tokens;
   * quoted sections keep separators literal ("New York, NY" is one token).
   */
  type(text: string): void {
    for (const char of text) {
      const quoteCount = [...this.#draft].filter((c) => c === '"').length;
      const insideQuotes = quoteCount % 2 === 1;
      if (!insideQuotes && this.#separators.includes(char)) {
        this.commitDraft();
      } else {
        this.#draft += char;
      }
    }
  }

  /** Removes one grapheme cluster from the end of the draft. */
  backspace(): void {
    if (this.#draft.length === 0) return;
    this.#draft = this.#draft.slice(0, previousGraphemeBoundary(this.#draft, this.#draft.length));
  }

  /** The draft's user-perceived length. */
  draftGraphemeCount(): number {
    return segmentGraphemes(this.#draft).length;
  }

  /** Commits the current draft as a token (Enter / separator). */
  commitDraft(): Token | undefined {
    const raw = this.#draft.trim();
    this.#draft = "";
    if (raw === "") return undefined;
    const text = raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2 ? raw.slice(1, -1) : raw;
    return this.add(text);
  }

  /** Adds one token under the duplicate policy; returns it when added. */
  add(text: string): Token | undefined {
    const duplicate = this.#tokens.some((token) => token.text === text);
    if (duplicate && this.#duplicates === "ignore") return undefined;
    const error = duplicate && this.#duplicates === "reject" ? "duplicate token" : this.#validate(text);
    const token: Token = { id: this.#nextId++, text, error };
    this.#record({ kind: "insert", index: this.#tokens.length, token });
    return token;
  }

  /** Removes one token by ID. */
  remove(id: number): boolean {
    const index = this.#tokens.findIndex((token) => token.id === id);
    if (index === -1) return false;
    this.#record({ kind: "delete", index, token: this.#tokens[index]! });
    return true;
  }

  /** Moves one token to a new index. */
  move(id: number, to: number): boolean {
    const from = this.#tokens.findIndex((token) => token.id === id);
    const target = Math.max(0, Math.min(this.#tokens.length - 1, to));
    if (from === -1 || from === target) return false;
    this.#record({ kind: "move", from, to: target });
    return true;
  }

  /** Replaces one token's text, revalidating it. */
  edit(id: number, text: string): boolean {
    const index = this.#tokens.findIndex((token) => token.id === id);
    if (index === -1) return false;
    const before = this.#tokens[index]!;
    const after: Token = { id: before.id, text, error: this.#validate(text) };
    this.#record({ kind: "replace", index, before, after });
    return true;
  }

  /** Undoes the most recent mutation. */
  undo(): boolean {
    const entry = this.#undoStack.pop();
    if (!entry) return false;
    this.#apply(invert(entry));
    this.#redoStack.push(entry);
    return true;
  }

  /** Redoes the most recently undone mutation. */
  redo(): boolean {
    const entry = this.#redoStack.pop();
    if (!entry) return false;
    this.#apply(entry);
    this.#undoStack.push(entry);
    return true;
  }

  /**
   * Requests async suggestions for the current draft. The newest request
   * wins: responses carrying a stale stamp are discarded, so a slow early
   * response can never replace a newer one.
   */
  async requestSuggestions(
    fetch: (query: string) => Promise<readonly string[]>,
  ): Promise<TokenSuggestions> {
    const query = this.#draft;
    const stamp = ++this.#suggestionStamp;
    const items = await fetch(query);
    if (stamp === this.#suggestionStamp) {
      this.#suggestions = { query, items };
    }
    return this.#suggestions;
  }

  /** Applies a fresh mutation and journals it. */
  #record(entry: JournalEntry): void {
    this.#apply(entry);
    this.#undoStack.push(entry);
    this.#redoStack = [];
    if (this.#undoStack.length > 256) this.#undoStack.shift();
  }

  #apply(entry: JournalEntry): void {
    switch (entry.kind) {
      case "insert":
        this.#tokens.splice(entry.index, 0, entry.token);
        break;
      case "delete":
        this.#tokens.splice(entry.index, 1);
        break;
      case "move": {
        const [token] = this.#tokens.splice(entry.from, 1);
        this.#tokens.splice(entry.to, 0, token!);
        break;
      }
      case "replace":
        this.#tokens[entry.index] = entry.after;
        break;
    }
  }
}

/** Creates a token editor controller. */
export function createTokenEditor(options: TokenEditorOptions = {}): TokenEditor {
  return new TokenEditor(options);
}
