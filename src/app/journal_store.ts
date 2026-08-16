// Copyright 2023 Im-Beast. MIT license.

// HIS-008: journal persistence with redaction, migrations, and retention.
// Sensitive field paths are removed BEFORE serialization — the stored bytes
// never contain them; retention is an application predicate applied on save;
// and loads migrate old schema versions through chained upgraders. A failing
// migration reports the error and leaves the original stored bytes exactly
// as they were: the store never rewrites what it could not understand.

/** Injectable storage — a file, localStorage, or a test buffer. */
export interface JournalStoreIo {
  read(): string | undefined;
  write(text: string): void;
}

/** Options for a journal store. */
export interface JournalStoreOptions {
  readonly schemaVersion: number;
  /** Dot-paths removed from every entry before serialization. */
  readonly redact?: readonly string[];
  /** Retention predicate; entries failing it are dropped on save. */
  readonly retain?: (entry: unknown, index: number, total: number) => boolean;
  /** fromVersion → upgrader producing the next version's entries. */
  readonly migrations?: Readonly<Record<number, (entries: readonly unknown[]) => readonly unknown[]>>;
}

/** Report of one save. */
export interface JournalSaveReport {
  readonly written: number;
  readonly droppedByRetention: number;
  readonly redactedFields: number;
}

/** Report of one load. */
export interface JournalLoadReport {
  readonly entries: readonly unknown[];
  readonly migratedFrom?: number;
  readonly error?: string;
}

function removePath(value: unknown, path: readonly string[]): number {
  if (value === null || typeof value !== "object" || path.length === 0) return 0;
  const record = value as Record<string, unknown>;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    if (head! in record) {
      delete record[head!];
      return 1;
    }
    return 0;
  }
  return removePath(record[head!], rest);
}

/** Redaction-aware, migration-capable journal persistence. */
export class RedactingJournalStore {
  readonly #io: JournalStoreIo;
  readonly #options: JournalStoreOptions;

  constructor(io: JournalStoreIo, options: JournalStoreOptions) {
    this.#io = io;
    this.#options = options;
  }

  /** Serializes entries — redacted, retained — under the current schema. */
  save(entries: readonly unknown[]): JournalSaveReport {
    const retain = this.#options.retain ?? (() => true);
    const kept = entries.filter((entry, index) => retain(entry, index, entries.length));
    let redactedFields = 0;
    const sanitized = kept.map((entry) => {
      const clone = structuredClone(entry);
      for (const path of this.#options.redact ?? []) {
        redactedFields += removePath(clone, path.split("."));
      }
      return clone;
    });
    this.#io.write(JSON.stringify({ schemaVersion: this.#options.schemaVersion, entries: sanitized }));
    return { written: sanitized.length, droppedByRetention: entries.length - kept.length, redactedFields };
  }

  /**
   * Loads and migrates. A migration failure (or missing migration step)
   * reports the error and returns no entries — the stored bytes stay
   * untouched for a later, corrected reader.
   */
  load(): JournalLoadReport {
    const text = this.#io.read();
    if (text === undefined) return { entries: [] };
    let parsed: { schemaVersion?: number; entries?: unknown[] };
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { entries: [], error: `journal is not valid JSON: ${error instanceof Error ? error.message : error}` };
    }
    const from = parsed.schemaVersion ?? 0;
    let entries: readonly unknown[] = parsed.entries ?? [];
    if (from === this.#options.schemaVersion) return { entries };
    if (from > this.#options.schemaVersion) {
      return { entries: [], error: `journal schema ${from} is newer than supported ${this.#options.schemaVersion}` };
    }
    for (let version = from; version < this.#options.schemaVersion; version += 1) {
      const migrate = this.#options.migrations?.[version];
      if (!migrate) {
        return { entries: [], error: `no migration from schema ${version}; original bytes preserved` };
      }
      try {
        entries = migrate(entries);
      } catch (error) {
        return {
          entries: [],
          error: `migration from schema ${version} failed: ${
            error instanceof Error ? error.message : error
          }; original bytes preserved`,
        };
      }
    }
    return { entries, migratedFrom: from };
  }
}

/** Creates a redacting journal store. */
export function createRedactingJournalStore(io: JournalStoreIo, options: JournalStoreOptions): RedactingJournalStore {
  return new RedactingJournalStore(io, options);
}
