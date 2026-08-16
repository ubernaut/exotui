// Copyright 2023 Im-Beast. MIT license.

// FRM-008: draft autosave as a guarded pipeline. Saves debounce on the
// caller's clock, secret fields are excluded by default (persisting one
// takes an explicit allow-list entry), drafts carry a schema version and an
// expiry, and restore NEVER overwrites live values directly — it returns
// the draft for the application to apply, and corrupt, expired, or
// unmigratable drafts return nothing at all.

/** Injectable storage. */
export interface DraftStorage {
  read(key: string): string | undefined;
  write(key: string, text: string): void;
  remove(key: string): void;
}

/** Options for the autosaver. */
export interface FormDraftOptions {
  readonly key: string;
  readonly schemaVersion: number;
  /** Idle time before a scheduled save commits (default 500ms, caller clock). */
  readonly debounceMs?: number;
  /** Draft lifetime from save (default 7 days). */
  readonly expiryMs?: number;
  /** Field names ALLOWED to persist even when marked secret. */
  readonly persistSecrets?: readonly string[];
  /** Field names that are secret (excluded unless allow-listed). */
  readonly secretFields?: readonly string[];
  /** fromVersion → upgrader. */
  readonly migrations?: Readonly<Record<number, (values: Record<string, unknown>) => Record<string, unknown>>>;
}

/** A restored draft, for the application to apply deliberately. */
export interface RestoredDraft {
  readonly values: Readonly<Record<string, unknown>>;
  readonly savedAt: number;
  readonly migratedFrom?: number;
}

/** The autosaver. */
export class FormDraftAutosaver {
  readonly #storage: DraftStorage;
  readonly #options: FormDraftOptions;
  #pending: Record<string, unknown> | undefined;
  #pendingAt = 0;

  constructor(storage: DraftStorage, options: FormDraftOptions) {
    this.#storage = storage;
    this.#options = options;
  }

  /** Schedules a save; commits after the debounce window via advance(). */
  schedule(values: Record<string, unknown>, nowMs: number): void {
    this.#pending = values;
    this.#pendingAt = nowMs;
  }

  /** Advances the caller's clock; commits a due pending save. */
  advance(nowMs: number): boolean {
    if (!this.#pending || nowMs - this.#pendingAt < (this.#options.debounceMs ?? 500)) return false;
    this.saveNow(this.#pending, nowMs);
    this.#pending = undefined;
    return true;
  }

  /** Saves immediately, excluding secret fields not on the allow-list. */
  saveNow(values: Record<string, unknown>, nowMs: number): { readonly excludedFields: readonly string[] } {
    const excluded: string[] = [];
    const sanitized: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(values)) {
      const secret = this.#options.secretFields?.includes(field) ?? false;
      if (secret && !this.#options.persistSecrets?.includes(field)) {
        excluded.push(field);
        continue;
      }
      sanitized[field] = value;
    }
    this.#storage.write(
      this.#options.key,
      JSON.stringify({ schemaVersion: this.#options.schemaVersion, savedAt: nowMs, values: sanitized }),
    );
    return { excludedFields: excluded };
  }

  /**
   * Restores the draft for the APPLICATION to apply — live values are never
   * touched here. Corrupt, expired, future-schema, or unmigratable drafts
   * return undefined (and corrupt/expired ones are removed).
   */
  restore(nowMs: number): RestoredDraft | undefined {
    const text = this.#storage.read(this.#options.key);
    if (text === undefined) return undefined;
    let parsed: { schemaVersion?: number; savedAt?: number; values?: Record<string, unknown> };
    try {
      parsed = JSON.parse(text);
    } catch {
      this.#storage.remove(this.#options.key); // corrupt: never applied
      return undefined;
    }
    const savedAt = parsed.savedAt ?? 0;
    if (nowMs - savedAt > (this.#options.expiryMs ?? 7 * 24 * 3600 * 1000)) {
      this.#storage.remove(this.#options.key);
      return undefined;
    }
    const from = parsed.schemaVersion ?? 0;
    let values = parsed.values ?? {};
    if (from > this.#options.schemaVersion) return undefined; // fail closed
    for (let version = from; version < this.#options.schemaVersion; version += 1) {
      const migrate = this.#options.migrations?.[version];
      if (!migrate) return undefined;
      try {
        values = migrate(values);
      } catch {
        return undefined;
      }
    }
    return { values, savedAt, migratedFrom: from < this.#options.schemaVersion ? from : undefined };
  }

  /** Discards the draft (e.g. after a successful submit). */
  discard(): void {
    this.#pending = undefined;
    this.#storage.remove(this.#options.key);
  }
}

/** Creates a draft autosaver. */
export function createFormDraftAutosaver(storage: DraftStorage, options: FormDraftOptions): FormDraftAutosaver {
  return new FormDraftAutosaver(storage, options);
}
