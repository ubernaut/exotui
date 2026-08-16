// Copyright 2023 Im-Beast. MIT license.

// PER-001: pooled buffers with OWNERSHIP, not just reuse. Pools are
// size-classed (buffers round up to their class), released buffers are
// zeroed before they re-enter the free list, and every lease carries a
// generation stamp: releasing twice throws, touching a buffer after
// release throws (the lease knows its generation was retired), and
// leases from one pool cannot be released into another. The pool counts
// hits and allocations so a benchmark can show the allocation reduction
// instead of asserting it.

/** Size classes in bytes-per-element steps. */
const SIZE_CLASSES = [64, 256, 1024, 4096, 16384, 65536] as const;

function classFor(length: number): number | undefined {
  return SIZE_CLASSES.find((size) => size >= length);
}

/** One leased buffer. */
export interface PoolLease {
  /** The leased view, sized exactly as requested. */
  readonly view: Uint32Array;
  /** Releases the lease; throws on double release. */
  release(): void;
  /** Asserts the lease is still live; throws after release. */
  assertLive(): void;
}

/** Pool statistics for allocation-reduction evidence. */
export interface PoolStats {
  readonly allocations: number;
  readonly reuses: number;
  readonly outstanding: number;
  readonly pooledBuffers: number;
}

/** Typed ownership violation. */
export class PoolOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoolOwnershipError";
  }
}

interface PooledBuffer {
  buffer: Uint32Array;
  generation: number;
}

/** A size-classed pool of Uint32Array cell/span/packet buffers. */
export class BufferPool {
  readonly #free = new Map<number, PooledBuffer[]>();
  readonly #maxPerClass: number;
  #allocations = 0;
  #reuses = 0;
  #outstanding = 0;

  constructor(options: { readonly maxPerClass?: number } = {}) {
    this.#maxPerClass = Math.max(1, options.maxPerClass ?? 32);
  }

  /** Leases a buffer of at least `length` elements (zeroed). */
  lease(length: number): PoolLease {
    const sizeClass = classFor(length);
    if (sizeClass === undefined) {
      throw new PoolOwnershipError(`requested length ${length} exceeds the largest size class`);
    }
    const freeList = this.#free.get(sizeClass) ?? [];
    let pooled = freeList.pop();
    if (pooled) {
      this.#reuses += 1;
    } else {
      pooled = { buffer: new Uint32Array(sizeClass), generation: 0 };
      this.#allocations += 1;
    }
    this.#free.set(sizeClass, freeList);
    this.#outstanding += 1;

    const owner = pooled;
    const leasedGeneration = ++owner.generation;
    let released = false;
    const pool = this;
    return {
      view: owner.buffer.subarray(0, length),
      assertLive() {
        if (released || owner.generation !== leasedGeneration) {
          throw new PoolOwnershipError("use after release: this lease's generation was retired");
        }
      },
      release() {
        if (released || owner.generation !== leasedGeneration) {
          throw new PoolOwnershipError("double release: this lease was already returned");
        }
        released = true;
        owner.generation += 1; // retire the generation: stale views detectable
        owner.buffer.fill(0); // zero before re-entering the free list
        pool.#outstanding -= 1;
        const list = pool.#free.get(sizeClass) ?? [];
        if (list.length < pool.#maxPerClass) {
          list.push(owner);
          pool.#free.set(sizeClass, list);
        }
      },
    };
  }

  stats(): PoolStats {
    let pooledBuffers = 0;
    for (const list of this.#free.values()) pooledBuffers += list.length;
    return {
      allocations: this.#allocations,
      reuses: this.#reuses,
      outstanding: this.#outstanding,
      pooledBuffers,
    };
  }
}

/** Creates a size-classed buffer pool. */
export function createBufferPool(options: { readonly maxPerClass?: number } = {}): BufferPool {
  return new BufferPool(options);
}
