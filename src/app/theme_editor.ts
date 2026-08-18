// Copyright 2023 Im-Beast. MIT license.

// Plan 042 slice D. The editor itself: a library of documents on some storage
// the host provides, and a controller that edits exactly one of them.
//
// The controller owns no colours. It owns a document, a selection, and a
// picker; every list it exposes is derived from the document by the pure
// functions in theme_editor_model.ts. That is deliberate — the failure mode
// for an editor like this is two copies of a colour that drift apart, and the
// only way to be sure that cannot happen is to have one copy.

import { Signal } from "../signals/mod.ts";
import type { Rgb } from "../theme_expressions.ts";
import { exportThemeDocument, importThemeDocument, type ThemeDocument } from "../theme_interchange.ts";
import {
  ColorPickerController,
  type ColorPickerController as ColorPicker,
  type ColorPickerSwatch,
} from "../components/color_picker.ts";
import {
  clearThemeToken,
  duplicateThemeDocument,
  formatHexColor,
  missingCoreTokens,
  renameThemeDocument,
  setThemeToken,
  themeContrastFailures,
  type ThemeContrastVerdict,
  type ThemeEditorGroup,
  themeEditorGroups,
  themeEntry,
  themeOverrides,
  type ThemeSwatch,
  themeSwatches,
} from "../theme_editor_model.ts";

/** Where theme documents live. Injected, so tests use memory and apps use disk. */
export interface ThemeStoragePort {
  list(): Promise<readonly string[]>;
  read(id: string): Promise<string | undefined>;
  write(id: string, json: string): Promise<void>;
  remove(id: string): Promise<void>;
}

/** One theme the editor can open. */
export interface ThemeLibraryEntry {
  readonly id: string;
  readonly name: string;
  /** Built-in themes are read-only; editing one saves a copy. */
  readonly editable: boolean;
}

/** In-memory storage, for tests and for a host with nowhere to write. */
export class MemoryThemeStorage implements ThemeStoragePort {
  readonly #files = new Map<string, string>();

  list(): Promise<readonly string[]> {
    return Promise.resolve([...this.#files.keys()].sort());
  }

  read(id: string): Promise<string | undefined> {
    return Promise.resolve(this.#files.get(id));
  }

  write(id: string, json: string): Promise<void> {
    this.#files.set(id, json);
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.#files.delete(id);
    return Promise.resolve();
  }
}

/** A theme name reduced to a filename-safe id. */
export function themeDocumentId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug.length > 0 ? slug : "theme";
}

/** Options for a theme library. */
export interface ThemeLibraryOptions {
  readonly storage: ThemeStoragePort;
  /** Themes the host ships, which the editor may open but never overwrite. */
  readonly builtIns?: readonly ThemeDocument[];
}

/** The set of themes available to open, built-in and saved alike. */
export class ThemeLibrary {
  readonly #storage: ThemeStoragePort;
  readonly #builtIns: ReadonlyMap<string, ThemeDocument>;

  constructor(options: ThemeLibraryOptions) {
    this.#storage = options.storage;
    this.#builtIns = new Map((options.builtIns ?? []).map((document) => [themeDocumentId(document.name), document]));
  }

  /** Every theme, built-ins first, then saved ones by id. */
  async list(): Promise<readonly ThemeLibraryEntry[]> {
    const entries: ThemeLibraryEntry[] = [...this.#builtIns.values()].map((document) => ({
      id: themeDocumentId(document.name),
      name: document.name,
      editable: false,
    }));
    for (const id of await this.#storage.list()) {
      const document = await this.#read(id);
      if (!document) continue;
      const existing = entries.findIndex((entry) => entry.id === id);
      const entry = { id, name: document.name, editable: true };
      // A saved theme shadows a built-in of the same id: editing "Miami" and
      // saving it is how you fix the built-in, not how you get two of them.
      if (existing >= 0) entries[existing] = entry;
      else entries.push(entry);
    }
    return entries;
  }

  /** Loads one theme; a saved copy wins over a built-in with the same id. */
  async load(id: string): Promise<ThemeDocument | undefined> {
    return await this.#read(id) ?? this.#builtIns.get(id);
  }

  /** Whether an id belongs to a theme the host ships. */
  isBuiltIn(id: string): boolean {
    return this.#builtIns.has(id);
  }

  /**
   * Writes a theme and returns the id it was written under. A built-in is
   * READ-ONLY: presets are the floor everyone can get back to, so saving over
   * one is refused rather than shadowing it. Copy it and edit the copy.
   */
  async save(document: ThemeDocument): Promise<string> {
    const id = themeDocumentId(document.name);
    if (this.isBuiltIn(id)) {
      throw new TypeError(`"${document.name}" is a preset; copy it under another name to save changes`);
    }
    await this.#storage.write(id, exportThemeDocument(document));
    return id;
  }

  /**
   * A name like `base`, `base 2`, `base 3` — whichever is free. Used when a
   * preset is opened for editing, which always produces a new theme.
   */
  async uniqueName(base: string): Promise<string> {
    const taken = new Set((await this.list()).map((entry) => themeDocumentId(entry.name)));
    if (!taken.has(themeDocumentId(base))) return base;
    for (let suffix = 2; suffix < 1_000; suffix += 1) {
      const candidate = `${base} ${suffix}`;
      if (!taken.has(themeDocumentId(candidate))) return candidate;
    }
    return `${base} ${Date.now()}`;
  }

  /** Deletes a saved theme. Built-ins cannot be deleted, only shadowed. */
  async remove(id: string): Promise<boolean> {
    const saved = await this.#storage.read(id);
    if (saved === undefined) return false;
    await this.#storage.remove(id);
    return true;
  }

  async #read(id: string): Promise<ThemeDocument | undefined> {
    const json = await this.#storage.read(id);
    if (json === undefined) return undefined;
    try {
      return importThemeDocument(json);
    } catch {
      // A corrupt file is skipped rather than taking the whole list down.
      return undefined;
    }
  }
}

/** Options for the theme editor. */
export interface ThemeEditorOptions {
  readonly document: ThemeDocument;
  readonly library?: ThemeLibrary;
  /** Called whenever the edited document changes, for live preview. */
  readonly onApply?: (document: ThemeDocument) => void;
}

/** The editor's state, for a view to render. */
export interface ThemeEditorInspection {
  readonly name: string;
  readonly token: string;
  readonly groups: readonly ThemeEditorGroup[];
  readonly swatches: readonly ThemeSwatch[];
  readonly failures: readonly ThemeContrastVerdict[];
  readonly overrides: readonly string[];
  readonly dirty: boolean;
  /** The contrast of the selected token against what it is read on, or 0. */
  readonly contrast: number;
}

/** Edits one theme document. */
export class ThemeEditorController {
  readonly document: Signal<ThemeDocument>;
  /** The control token being edited. */
  readonly token: Signal<string>;
  readonly dirty: Signal<boolean>;
  readonly picker: ColorPicker;
  readonly library?: ThemeLibrary;
  readonly #onApply?: (document: ThemeDocument) => void;
  #saved: string;
  #applying = false;

  constructor(options: ThemeEditorOptions) {
    this.document = new Signal<ThemeDocument>(options.document);
    this.token = new Signal<string>(themeEditorGroups(options.document)[0]?.entries[0]?.token.name ?? "chrome:accent");
    this.dirty = new Signal(false);
    this.library = options.library;
    this.#onApply = options.onApply;
    this.#saved = exportThemeDocument(options.document);
    this.picker = new ColorPickerController({
      color: this.#colorOf(this.token.peek()),
      swatches: this.#swatchList(),
      // Every move of the picker writes straight through to the document, so
      // the preview IS the theme rather than a copy that has to be committed.
      onChange: (color) => this.#applyColor(color),
    });
  }

  /** Selects a token to edit, pointing the picker at its current colour. */
  selectToken(name: string): boolean {
    if (!themeEntry(this.document.peek(), name)) return false;
    this.token.value = name;
    this.#applying = true;
    try {
      this.picker.setColor(this.#colorOf(name));
      this.picker.setSwatches(this.#swatchList());
      this.picker.resetDraft();
    } finally {
      this.#applying = false;
    }
    return true;
  }

  /** Clears the selected token so it inherits again. */
  clearToken(): boolean {
    const name = this.token.peek();
    const next = clearThemeToken(this.document.peek(), name);
    if (next === this.document.peek()) return false;
    this.#commit(next);
    this.selectToken(name);
    return true;
  }

  /** Renames the theme being edited. */
  setName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === this.document.peek().name) return;
    this.#commit(renameThemeDocument(this.document.peek(), trimmed));
  }

  /** Starts editing another document, discarding nothing that was saved. */
  open(document: ThemeDocument): void {
    this.document.value = document;
    this.#saved = exportThemeDocument(document);
    this.dirty.value = false;
    this.#onApply?.(document);
    this.selectToken(this.token.peek()) || this.selectToken("chrome:accent");
  }

  /** Copies the current theme under a new name, and edits the copy. */
  duplicate(name: string): ThemeDocument {
    const copy = duplicateThemeDocument(this.document.peek(), name.trim() || `${this.document.peek().name} copy`);
    this.open(copy);
    this.dirty.value = true;
    return copy;
  }

  /** Writes the theme to the library, if there is one. */
  async save(): Promise<string | undefined> {
    if (!this.library) return undefined;
    const document = this.document.peek();
    if (missingCoreTokens(document).length > 0) return undefined;
    // A preset cannot be written over; the caller renames and tries again.
    if (this.library.isBuiltIn(themeDocumentId(document.name))) return undefined;
    const id = await this.library.save(document);
    this.#saved = exportThemeDocument(document);
    this.dirty.value = false;
    return id;
  }

  /** Whether this document would overwrite a preset if saved as it stands. */
  editingPreset(): boolean {
    return this.library?.isBuiltIn(themeDocumentId(this.document.peek().name)) ?? false;
  }

  /** Throws away every change since the last save or open. */
  revert(): void {
    this.open(importThemeDocument(this.#saved));
  }

  /** The colour the selected token paints with. */
  color(): Rgb {
    return this.#colorOf(this.token.peek());
  }

  /** Everything a view needs. */
  inspect(): ThemeEditorInspection {
    const document = this.document.peek();
    const name = this.token.peek();
    const entry = themeEntry(document, name);
    const against = entry?.token.against;
    const contrast = against ? this.picker.contrastAgainst(this.#colorOf(against)) : 0;
    return {
      name: document.name,
      token: name,
      groups: themeEditorGroups(document),
      swatches: themeSwatches(document),
      failures: themeContrastFailures(document),
      overrides: themeOverrides(document),
      dirty: this.dirty.peek(),
      contrast,
    };
  }

  dispose(): void {
    this.picker.dispose();
    this.document.dispose();
    this.token.dispose();
    this.dirty.dispose();
  }

  #applyColor(color: Rgb): void {
    if (this.#applying) return;
    this.#commit(setThemeToken(this.document.peek(), this.token.peek(), color));
  }

  #commit(document: ThemeDocument): void {
    this.document.value = document;
    this.dirty.value = exportThemeDocument(document) !== this.#saved;
    this.#onApply?.(document);
    // A new colour becomes reusable the moment it is chosen.
    this.picker.setSwatches(this.#swatchList());
  }

  #colorOf(name: string): Rgb {
    return themeEntry(this.document.peek(), name)?.color ?? [0, 0, 0];
  }

  #swatchList(): readonly ColorPickerSwatch[] {
    return themeSwatches(this.document.peek()).map((swatch) => ({
      color: swatch.color,
      hex: formatHexColor(swatch.color),
      label: swatch.tokens[0],
    }));
  }
}
