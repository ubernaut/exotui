// Copyright 2023 Im-Beast. MIT license.

// NAV-010: one location, three spellings. A navigation location (route id +
// string params) maps to a browser URL and to a terminal deep-link string,
// and both parse back to the identical location. The journal serializes
// under a schema whitelist — route id and params only, so private runtime
// state is excluded structurally, not by convention — and restores through
// chained migrations that fail closed on unknown or unmigratable versions.

/** One canonical location. */
export interface NavigationLocation {
  readonly routeId: string;
  readonly params: Readonly<Record<string, string>>;
  /** Runtime-only state; never serialized (excluded by schema). */
  readonly privateState?: unknown;
}

/** Options for the journal. */
export interface NavigationJournalOptions {
  readonly schemaVersion: number;
  /** Journal length bound (default 64). */
  readonly maxEntries?: number;
  /** fromVersion → upgrader over serialized entries. */
  readonly migrations?: Readonly<
    Record<
      number,
      (entries: ReadonlyArray<{ routeId: string; params: Record<string, string> }>) => ReadonlyArray<
        { routeId: string; params: Record<string, string> }
      >
    >
  >;
}

const DEEP_LINK_PREFIX = "tui://";

function encodeParams(params: Readonly<Record<string, string>>): string {
  const entries = Object.entries(params).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (entries.length === 0) return "";
  return "?" + entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}

function decodeParams(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const [key, value = ""] = pair.split("=");
    params[decodeURIComponent(key!)] = decodeURIComponent(value);
  }
  return params;
}

/** The journal and the location codec. */
export class NavigationJournal {
  readonly #options: NavigationJournalOptions;
  #entries: NavigationLocation[] = [];

  constructor(options: NavigationJournalOptions) {
    this.#options = options;
  }

  /** Records a visit (bounded, oldest dropped). */
  record(location: NavigationLocation): void {
    this.#entries.push(location);
    const max = Math.max(1, this.#options.maxEntries ?? 64);
    while (this.#entries.length > max) this.#entries.shift();
  }

  get entries(): readonly NavigationLocation[] {
    return [...this.#entries];
  }

  /** The browser-URL spelling. */
  toUrl(location: NavigationLocation): string {
    return `/${location.routeId}${encodeParams(location.params)}`;
  }

  /** The terminal deep-link spelling. */
  toDeepLink(location: NavigationLocation): string {
    return `${DEEP_LINK_PREFIX}${location.routeId}${encodeParams(location.params)}`;
  }

  /** Parses either spelling back to the same canonical location. */
  parse(input: string): NavigationLocation | undefined {
    let path: string;
    if (input.startsWith(DEEP_LINK_PREFIX)) path = input.slice(DEEP_LINK_PREFIX.length);
    else if (input.startsWith("/")) path = input.slice(1);
    else return undefined;
    const [routePart, query = ""] = path.split("?");
    if (!routePart) return undefined;
    return { routeId: routePart, params: decodeParams(query) };
  }

  /** Serializes under the schema whitelist: routeId and params only. */
  serialize(): string {
    return JSON.stringify({
      schemaVersion: this.#options.schemaVersion,
      entries: this.#entries.map((entry) => ({ routeId: entry.routeId, params: { ...entry.params } })),
    });
  }

  /** Restores a serialized journal; unknown versions fail closed. */
  restore(text: string): { readonly restored: number; readonly error?: string } {
    let parsed: { schemaVersion?: number; entries?: Array<{ routeId: string; params: Record<string, string> }> };
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { restored: 0, error: `journal is not valid JSON: ${error instanceof Error ? error.message : error}` };
    }
    const from = parsed.schemaVersion ?? 0;
    let entries = parsed.entries ?? [];
    if (from > this.#options.schemaVersion) {
      return { restored: 0, error: `schema ${from} is newer than supported ${this.#options.schemaVersion}` };
    }
    for (let version = from; version < this.#options.schemaVersion; version += 1) {
      const migrate = this.#options.migrations?.[version];
      if (!migrate) return { restored: 0, error: `no migration from schema ${version}; failing closed` };
      try {
        entries = [...migrate(entries)];
      } catch (error) {
        return {
          restored: 0,
          error: `migration from schema ${version} failed: ${error instanceof Error ? error.message : error}`,
        };
      }
    }
    this.#entries = entries.map((entry) => ({ routeId: entry.routeId, params: entry.params }));
    return { restored: this.#entries.length };
  }
}

/** Creates a navigation journal. */
export function createNavigationJournal(options: NavigationJournalOptions): NavigationJournal {
  return new NavigationJournal(options);
}
