// Copyright 2023 Im-Beast. MIT license.

// PER-007: one coordinator owns the AGGREGATE cache budget. Caches
// register with a priority and an eviction callback; every charge is
// counted against the shared cap, and when it would overflow, the
// coordinator asks lower-priority UNPINNED caches to shed cost through
// their callbacks (lowest priority first) until the charge fits. Pinned
// caches — active frame resources — are never asked to evict; when only
// pinned cost remains and the charge still does not fit, the charge is
// REFUSED outright rather than evicting what the current frame needs.

/** One registered cache's contract. */
export interface BudgetedCache {
  readonly id: string;
  /** Higher priority sheds later. */
  readonly priority: number;
  /**
   * Sheds up to `cost` units; returns how much was actually freed. The
   * coordinator adjusts its accounting by the returned amount.
   */
  evict(cost: number): number;
}

/** A charge outcome. */
export type ChargeResult =
  | { readonly ok: true; readonly evicted: readonly { id: string; freed: number }[] }
  | { readonly ok: false; readonly reason: string };

/** The coordinator. */
export class CacheBudgetCoordinator {
  readonly #caches = new Map<string, { cache: BudgetedCache; used: number; pinned: boolean }>();
  readonly #totalBudget: number;

  constructor(options: { readonly totalBudget: number }) {
    this.#totalBudget = Math.max(1, options.totalBudget);
  }

  register(cache: BudgetedCache): void {
    this.#caches.set(cache.id, { cache, used: 0, pinned: false });
  }

  /** Pins a cache: its entries belong to the active frame. */
  pin(id: string): void {
    const entry = this.#caches.get(id);
    if (entry) entry.pinned = true;
  }

  unpin(id: string): void {
    const entry = this.#caches.get(id);
    if (entry) entry.pinned = false;
  }

  aggregate(): number {
    let total = 0;
    for (const entry of this.#caches.values()) total += entry.used;
    return total;
  }

  used(id: string): number {
    return this.#caches.get(id)?.used ?? 0;
  }

  /** Charges cost to one cache, evicting lower-priority unpinned cost. */
  charge(id: string, cost: number): ChargeResult {
    const target = this.#caches.get(id);
    if (!target) return { ok: false, reason: `cache "${id}" is not registered` };
    if (cost > this.#totalBudget) {
      return { ok: false, reason: `cost ${cost} exceeds the whole budget ${this.#totalBudget}` };
    }

    const evicted: { id: string; freed: number }[] = [];
    let needed = this.aggregate() + cost - this.#totalBudget;
    if (needed > 0) {
      // Shed from unpinned caches, lowest priority first; the charging
      // cache itself may shed too (it is not implicitly protected).
      const candidates = [...this.#caches.values()]
        .filter((entry) => !entry.pinned && entry.used > 0)
        .sort((left, right) => left.cache.priority - right.cache.priority);
      for (const entry of candidates) {
        if (needed <= 0) break;
        const freed = Math.min(entry.used, entry.cache.evict(Math.min(needed, entry.used)));
        entry.used -= freed;
        needed -= freed;
        if (freed > 0) evicted.push({ id: entry.cache.id, freed });
      }
    }
    if (needed > 0) {
      // Only pinned cost remains: refuse rather than touch the frame.
      return { ok: false, reason: `budget cap: ${needed} units short and remaining cost is pinned` };
    }
    target.used += cost;
    return { ok: true, evicted };
  }

  /** Releases cost a cache no longer holds. */
  release(id: string, cost: number): void {
    const entry = this.#caches.get(id);
    if (entry) entry.used = Math.max(0, entry.used - cost);
  }

  inspect(): {
    aggregate: number;
    budget: number;
    caches: readonly { id: string; used: number; pinned: boolean; priority: number }[];
  } {
    return {
      aggregate: this.aggregate(),
      budget: this.#totalBudget,
      caches: [...this.#caches.values()].map((entry) => ({
        id: entry.cache.id,
        used: entry.used,
        pinned: entry.pinned,
        priority: entry.cache.priority,
      })),
    };
  }
}

/** Creates a cache budget coordinator. */
export function createCacheBudgetCoordinator(options: { readonly totalBudget: number }): CacheBudgetCoordinator {
  return new CacheBudgetCoordinator(options);
}
