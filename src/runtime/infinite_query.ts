// Copyright 2023 Im-Beast. MIT license.

// DAT-007: infinite queries as an explicit page window. The controller
// fetches forward and backward from cursors, keeps pages in stable reading
// order (backward pages prepend, forward pages append), suppresses duplicate
// cursor fetches — repeated or concurrent — via a fetched-cursor ledger, and
// evicts beyond the window while recording boundary cursors as scroll
// anchors, so the evicted side restores with one fetch instead of losing
// the user's position.

/** One fetched page. */
export interface InfiniteQueryPage<TItem, TCursor> {
  /** Cursor that produced this page (undefined for the initial page). */
  readonly cursor: TCursor | undefined;
  readonly items: readonly TItem[];
  readonly nextCursor?: TCursor;
  readonly previousCursor?: TCursor;
}

/** Fetches one page in a direction. */
export type InfiniteQueryFetcher<TItem, TCursor> = (
  cursor: TCursor | undefined,
  direction: "forward" | "backward",
  signal: AbortSignal,
) => Promise<InfiniteQueryPage<TItem, TCursor>>;

/** Options for the controller. */
export interface InfiniteQueryOptions<TItem, TCursor> {
  readonly fetchPage: InfiniteQueryFetcher<TItem, TCursor>;
  /** Window size; older pages on the far side evict past it (default 16). */
  readonly maxPages?: number;
}

/** Cursor-based bidirectional infinite query. */
export class InfiniteQueryController<TItem, TCursor = string> {
  readonly #fetchPage: InfiniteQueryFetcher<TItem, TCursor>;
  readonly #maxPages: number;
  #pages: InfiniteQueryPage<TItem, TCursor>[] = [];
  readonly #fetched = new Set<string>();
  readonly #inFlight = new Set<string>();
  #evictedStart: TCursor | undefined;
  #evictedEnd: TCursor | undefined;
  #controller = new AbortController();

  constructor(options: InfiniteQueryOptions<TItem, TCursor>) {
    this.#fetchPage = options.fetchPage;
    this.#maxPages = Math.max(2, options.maxPages ?? 16);
  }

  get pages(): readonly InfiniteQueryPage<TItem, TCursor>[] {
    return [...this.#pages];
  }

  /** All items in stable reading order. */
  get items(): readonly TItem[] {
    return this.#pages.flatMap((page) => page.items);
  }

  /** Boundary cursors that restore evicted content (the scroll anchors). */
  anchors(): { readonly start?: TCursor; readonly end?: TCursor } {
    return { start: this.#evictedStart, end: this.#evictedEnd };
  }

  async fetchInitial(): Promise<boolean> {
    return await this.#fetch(undefined, "forward");
  }

  /** Fetches after the last page (or restores the evicted end anchor). */
  async fetchNext(): Promise<boolean> {
    const cursor = this.#pages.at(-1)?.nextCursor ?? this.#evictedEnd;
    if (cursor === undefined) return false;
    return await this.#fetch(cursor, "forward");
  }

  /** Fetches before the first page (or restores the evicted start anchor). */
  async fetchPrevious(): Promise<boolean> {
    const cursor = this.#pages[0]?.previousCursor ?? this.#evictedStart;
    if (cursor === undefined) return false;
    return await this.#fetch(cursor, "backward");
  }

  inspect(): {
    readonly pages: number;
    readonly fetchedCursors: number;
    readonly inFlight: number;
    readonly anchors: { readonly start?: TCursor; readonly end?: TCursor };
  } {
    return {
      pages: this.#pages.length,
      fetchedCursors: this.#fetched.size,
      inFlight: this.#inFlight.size,
      anchors: this.anchors(),
    };
  }

  dispose(): void {
    this.#controller.abort();
  }

  async #fetch(cursor: TCursor | undefined, direction: "forward" | "backward"): Promise<boolean> {
    const key = `${direction === "backward" ? "<" : ">"}${JSON.stringify(cursor)}`;
    const dupKey = JSON.stringify(cursor);
    // Duplicate suppression: the same cursor never fetches twice, and a
    // concurrent request for it coalesces into a no-op.
    if (this.#fetched.has(dupKey) || this.#inFlight.has(key)) return false;
    this.#inFlight.add(key);
    try {
      const page = await this.#fetchPage(cursor, direction, this.#controller.signal);
      if (this.#controller.signal.aborted) return false;
      this.#fetched.add(dupKey);
      if (direction === "backward") {
        this.#pages.unshift(page);
        if (cursor !== undefined && this.#evictedStart !== undefined && dupKey === JSON.stringify(this.#evictedStart)) {
          this.#evictedStart = page.previousCursor;
        }
      } else {
        this.#pages.push(page);
        if (cursor !== undefined && this.#evictedEnd !== undefined && dupKey === JSON.stringify(this.#evictedEnd)) {
          this.#evictedEnd = page.nextCursor;
        }
      }
      this.#evict(direction);
      return true;
    } finally {
      this.#inFlight.delete(key);
    }
  }

  /** Evicts from the side opposite the latest fetch, recording anchors. */
  #evict(direction: "forward" | "backward"): void {
    while (this.#pages.length > this.#maxPages) {
      if (direction === "forward") {
        const evicted = this.#pages.shift()!;
        // The initial page has no cursor of its own; the remaining first
        // page's previousCursor re-fetches the same content.
        this.#evictedStart = evicted.cursor ?? this.#pages[0]?.previousCursor ?? this.#evictedStart;
        this.#fetched.delete(JSON.stringify(evicted.cursor));
      } else {
        const evicted = this.#pages.pop()!;
        this.#evictedEnd = evicted.cursor ?? this.#pages.at(-1)?.nextCursor ?? this.#evictedEnd;
        this.#fetched.delete(JSON.stringify(evicted.cursor));
      }
    }
  }
}

/** Creates an infinite-query controller. */
export function createInfiniteQueryController<TItem, TCursor = string>(
  options: InfiniteQueryOptions<TItem, TCursor>,
): InfiniteQueryController<TItem, TCursor> {
  return new InfiniteQueryController(options);
}
