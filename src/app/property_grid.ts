// Copyright 2023 Im-Beast. MIT license.

// WID-005: the property grid as a controller. Rows group by declared
// group; every row's editor is chosen through the editor REGISTRY by the
// property's type (a type with no registered editor renders read-only
// with a diagnostic — never a guessed editor); values resolve local-over-
// inherited with reset-to-inherited as a first-class operation; edits
// validate through the registry editor and the per-property rule; and one
// property edit is exactly ONE history transaction carrying provenance
// (who changed it, when in caller time, from what to what) — undo/redo
// walk whole transactions, never partial states.

/** One property's declaration. */
export interface PropertySpec {
  readonly key: string;
  readonly label?: string;
  readonly group: string;
  /** Editor type key resolved through the registry. */
  readonly type: string;
  readonly validate?: (value: unknown) => string | undefined;
}

/** One registered inline editor. */
export interface PropertyEditor {
  readonly type: string;
  /** Parses raw editor input into the stored value. */
  readonly parse?: (raw: unknown) => unknown;
  readonly validate?: (value: unknown) => string | undefined;
}

/** Registry mapping property types to editors. */
export class PropertyEditorRegistry {
  readonly #editors = new Map<string, PropertyEditor>();

  register(editor: PropertyEditor): void {
    this.#editors.set(editor.type, editor);
  }

  editorFor(type: string): PropertyEditor | undefined {
    return this.#editors.get(type);
  }
}

/** Where a row's effective value comes from. */
export type PropertyValueSource = "inherited" | "local";

/** One rendered row. */
export interface PropertyRow {
  readonly key: string;
  readonly label: string;
  readonly group: string;
  readonly effective: unknown;
  readonly source: PropertyValueSource;
  /** The registry-resolved editor type; undefined renders read-only. */
  readonly editor?: string;
  /** Set when no editor is registered for the property's type. */
  readonly diagnostic?: string;
}

/** One history transaction — exactly one property edit. */
export interface PropertyTransaction {
  readonly key: string;
  readonly kind: "edit" | "reset";
  readonly before: { readonly value: unknown; readonly source: PropertyValueSource };
  readonly after: { readonly value: unknown; readonly source: PropertyValueSource };
  /** Change provenance: who made the change, and the caller's timestamp. */
  readonly actor: string;
  readonly at: number;
}

/** An edit attempt's outcome. */
export type PropertyEditResult =
  | { readonly ok: true; readonly transaction: PropertyTransaction }
  | { readonly ok: false; readonly error: string };

/** Grid options. */
export interface PropertyGridOptions {
  readonly properties: readonly PropertySpec[];
  readonly registry: PropertyEditorRegistry;
  /** The inherited (base) value per property key. */
  readonly inherited: Readonly<Record<string, unknown>>;
}

/** The property-grid controller. */
export class PropertyGridController {
  readonly #properties: readonly PropertySpec[];
  readonly #registry: PropertyEditorRegistry;
  readonly #inherited: Readonly<Record<string, unknown>>;
  readonly #local = new Map<string, unknown>();
  #undoStack: PropertyTransaction[] = [];
  #redoStack: PropertyTransaction[] = [];

  constructor(options: PropertyGridOptions) {
    this.#properties = options.properties;
    this.#registry = options.registry;
    this.#inherited = options.inherited;
  }

  /** Rows grouped in declaration order. */
  groups(): { group: string; rows: PropertyRow[] }[] {
    const groups: { group: string; rows: PropertyRow[] }[] = [];
    for (const property of this.#properties) {
      let bucket = groups.find((candidate) => candidate.group === property.group);
      if (!bucket) {
        bucket = { group: property.group, rows: [] };
        groups.push(bucket);
      }
      const editor = this.#registry.editorFor(property.type);
      const local = this.#local.has(property.key);
      bucket.rows.push({
        key: property.key,
        label: property.label ?? property.key,
        group: property.group,
        effective: local ? this.#local.get(property.key) : this.#inherited[property.key],
        source: local ? "local" : "inherited",
        editor: editor?.type,
        diagnostic: editor ? undefined : `no editor registered for type "${property.type}"`,
      });
    }
    return groups;
  }

  /** One row's current state. */
  row(key: string): PropertyRow | undefined {
    for (const group of this.groups()) {
      const row = group.rows.find((candidate) => candidate.key === key);
      if (row) return row;
    }
    return undefined;
  }

  /**
   * Edits one property through its registry editor. Raw input is parsed by
   * the editor, validated by editor and property rules, and committed as
   * ONE transaction with provenance.
   */
  edit(key: string, raw: unknown, provenance: { actor: string; at: number }): PropertyEditResult {
    const property = this.#properties.find((candidate) => candidate.key === key);
    if (!property) return { ok: false, error: `unknown property "${key}"` };
    const editor = this.#registry.editorFor(property.type);
    if (!editor) return { ok: false, error: `no editor registered for type "${property.type}"` };
    let value: unknown;
    try {
      value = editor.parse ? editor.parse(raw) : raw;
    } catch (error) {
      return { ok: false, error: `editor rejected input: ${String(error)}` };
    }
    const invalid = editor.validate?.(value) ?? property.validate?.(value);
    if (invalid) return { ok: false, error: invalid };

    const before = this.#stateOf(key);
    this.#local.set(key, value);
    const transaction: PropertyTransaction = {
      key,
      kind: "edit",
      before,
      after: { value, source: "local" },
      actor: provenance.actor,
      at: provenance.at,
    };
    this.#commit(transaction);
    return { ok: true, transaction };
  }

  /** Resets one property to its inherited value — also one transaction. */
  resetToInherited(key: string, provenance: { actor: string; at: number }): PropertyEditResult {
    const property = this.#properties.find((candidate) => candidate.key === key);
    if (!property) return { ok: false, error: `unknown property "${key}"` };
    if (!this.#local.has(key)) return { ok: false, error: "already inherited" };
    const before = this.#stateOf(key);
    this.#local.delete(key);
    const transaction: PropertyTransaction = {
      key,
      kind: "reset",
      before,
      after: { value: this.#inherited[key], source: "inherited" },
      actor: provenance.actor,
      at: provenance.at,
    };
    this.#commit(transaction);
    return { ok: true, transaction };
  }

  /** Undoes one whole transaction. */
  undo(): boolean {
    const transaction = this.#undoStack.pop();
    if (!transaction) return false;
    this.#restore(transaction.key, transaction.before);
    this.#redoStack.push(transaction);
    return true;
  }

  /** Redoes one whole transaction. */
  redo(): boolean {
    const transaction = this.#redoStack.pop();
    if (!transaction) return false;
    this.#restore(transaction.key, transaction.after);
    this.#undoStack.push(transaction);
    return true;
  }

  /** The transaction journal, oldest first. */
  history(): readonly PropertyTransaction[] {
    return [...this.#undoStack];
  }

  #stateOf(key: string): { value: unknown; source: PropertyValueSource } {
    return this.#local.has(key)
      ? { value: this.#local.get(key), source: "local" }
      : { value: this.#inherited[key], source: "inherited" };
  }

  #restore(key: string, state: { readonly value: unknown; readonly source: PropertyValueSource }): void {
    if (state.source === "local") this.#local.set(key, state.value);
    else this.#local.delete(key);
  }

  #commit(transaction: PropertyTransaction): void {
    this.#undoStack.push(transaction);
    this.#redoStack = [];
    if (this.#undoStack.length > 512) this.#undoStack.shift();
  }
}

/** Creates a property-editor registry. */
export function createPropertyEditorRegistry(): PropertyEditorRegistry {
  return new PropertyEditorRegistry();
}

/** Creates a property-grid controller. */
export function createPropertyGridController(options: PropertyGridOptions): PropertyGridController {
  return new PropertyGridController(options);
}
