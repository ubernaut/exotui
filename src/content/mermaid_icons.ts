// Copyright 2023 Im-Beast. MIT license.
import type { IconLoader, SyncIconLoader } from "mermaid";

/** The upstream Iconify JSON format, including aliases, transformations and pack metadata. */
export type MermaidIconData = SyncIconLoader["icons"];

/** An explicit host loader receives the active compiler cancellation signal. */
export interface MermaidIconContext {
  signal: AbortSignal;
}

/** Host-owned static or lazy icon registration; never supplied by diagram configuration. */
export type MermaidIconPack =
  | { name: string; icons: MermaidIconData }
  | { name: string; loader: (context: MermaidIconContext) => Promise<MermaidIconData> };

/** Registry allocation and lazy-loading bounds; hosts can explicitly raise the defaults. */
export interface MermaidIconLimits {
  maxPacks?: number;
  maxPackBytes?: number;
  maxTotalBytes?: number;
  timeoutMs?: number;
}

/** Host registration options, separate from Mermaid's source-controlled configuration. */
export interface MermaidIconOptions {
  limits?: MermaidIconLimits;
  signal?: AbortSignal;
}

interface Entry {
  name: string;
  icons?: MermaidIconData;
  bytes: number;
  loader?: (context: MermaidIconContext) => Promise<MermaidIconData>;
  limits: Required<MermaidIconLimits>;
  pending?: Promise<MermaidIconData>;
}

const defaults: Required<MermaidIconLimits> = {
  maxPacks: 128,
  maxPackBytes: 8 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  timeoutMs: 30_000,
};
const maxima: Required<MermaidIconLimits> = {
  maxPacks: 1024,
  maxPackBytes: 64 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  timeoutMs: 300_000,
};

/** Validate and snapshot host limits before touching a runtime or starting a browser. */
export function iconLimits(value: MermaidIconLimits = {}): Required<MermaidIconLimits> {
  const limits = { ...defaults, ...value };
  for (const key of Object.keys(defaults) as (keyof MermaidIconLimits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > maxima[key]) {
      throw new RangeError(`Invalid Mermaid icon ${key} limit.`);
    }
  }
  if (limits.maxPackBytes > limits.maxTotalBytes) throw new RangeError("Icon pack limit exceeds the total byte limit.");
  return limits;
}

/** Private host capability registry. Callers serialize registration and compilation around it. */
export class MermaidIconRegistry {
  #entries = new Map<string, Entry>();
  #operation?: { signal: AbortSignal; diagnostics: Set<string> };

  /** Snapshot a batch before queueing it so caller mutation cannot change installed capabilities. */
  prepare(packs: readonly MermaidIconPack[], options: MermaidIconOptions = {}): Entry[] {
    options.signal?.throwIfAborted();
    const limits = iconLimits(options.limits);
    if (!Array.isArray(packs) || packs.length > limits.maxPacks) {
      throw new RangeError("Mermaid icon pack count budget exceeded.");
    }
    return packs.map((pack) => {
      if (!pack || typeof pack.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.name)) {
        throw new TypeError("Mermaid icon pack name must be an Iconify prefix.");
      }
      const entry: Entry = { name: pack.name, bytes: 0, limits };
      if ("loader" in pack) {
        if (typeof pack.loader !== "function" || "icons" in pack) throw new TypeError("Invalid Mermaid icon loader.");
        entry.loader = pack.loader;
      } else if ("icons" in pack) {
        const data = snapshot(pack.icons, limits);
        entry.icons = data.icons;
        entry.bytes = data.bytes;
      } else throw new TypeError("A Mermaid icon pack needs icons or a loader.");
      return entry;
    });
  }

  /** Commit only after the runtime accepts the entire preflighted batch. */
  async install(prepared: Entry[], apply: (packs: IconLoader[]) => void | Promise<void>): Promise<void> {
    const next = new Map(this.#entries);
    for (const entry of prepared) {
      const previous = next.get(entry.name);
      // Upstream's static cache takes precedence over subsequently registered
      // loaders. Do not pretend replacing a loader revokes an already loaded pack.
      if (entry.loader && previous?.icons) {
        entry.icons = previous.icons;
        entry.bytes = previous.bytes;
      }
      next.set(entry.name, entry);
    }
    for (const entry of prepared) this.#budget(next, entry.limits);
    const packs = prepared.map((entry): IconLoader =>
      entry.loader ? { name: entry.name, loader: () => this.#load(entry) } : { name: entry.name, icons: entry.icons! }
    );
    await apply(packs);
    this.#entries = next;
  }

  /** Effective registrations for a recreated private DOM, preserving sticky upstream cache semantics. */
  bindings(): { name: string; icons?: MermaidIconData; limits: Required<MermaidIconLimits> }[] {
    return [...this.#entries.values()].map(({ name, icons, limits }) => ({ name, icons, limits }));
  }

  /** Release an owned headless registry after its DOM runtime is permanently closed. */
  clear(): void {
    this.#entries.clear();
  }

  /** Resolve a capability requested across the private headless process boundary. */
  async load(name: string): Promise<MermaidIconData> {
    const entry = this.#entries.get(name);
    if (!entry) throw new Error(`Mermaid icon pack is not registered: ${name}`);
    return await this.#load(entry);
  }

  /** Bind lazy work to one serialized compiler operation and retain warnings even if upstream catches errors. */
  begin(signal?: AbortSignal): { diagnostics: Set<string>; finish: () => void } {
    if (this.#operation) throw new Error("Overlapping Mermaid icon registry operations.");
    const controller = new AbortController();
    const operation = {
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      diagnostics: new Set<string>(),
    };
    this.#operation = operation;
    return {
      diagnostics: operation.diagnostics,
      finish: () => {
        controller.abort(new DOMException("Mermaid icon operation finished.", "AbortError"));
        if (this.#operation === operation) this.#operation = undefined;
      },
    };
  }

  async #load(entry: Entry): Promise<MermaidIconData> {
    if (entry.icons) return entry.icons;
    if (entry.pending) return await entry.pending;
    const operation = this.#operation;
    if (!operation) throw new Error("Lazy Mermaid icons need an active compiler operation.");
    const timeout = new AbortController();
    const signal = AbortSignal.any([operation.signal, timeout.signal]);
    const timer = setTimeout(
      () => timeout.abort(new DOMException("Mermaid icon loading timed out.", "TimeoutError")),
      entry.limits.timeoutMs,
    );
    let onAbort: () => void;
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    entry.pending = Promise.resolve().then(async () => {
      try {
        signal.throwIfAborted();
        const loaded = await Promise.race([Promise.resolve().then(() => entry.loader!({ signal })), interrupted]);
        signal.throwIfAborted();
        const data = snapshot(loaded, entry.limits);
        this.#budget(this.#entries, entry.limits, entry, data.bytes);
        entry.icons = data.icons;
        entry.bytes = data.bytes;
        return data.icons;
      } catch (error) {
        if (operation.diagnostics.size < 128) {
          operation.diagnostics.add(
            `Icon pack ${entry.name}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240),
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort!);
        entry.pending = undefined;
      }
    });
    return await entry.pending;
  }

  #budget(entries: Map<string, Entry>, limits: Required<MermaidIconLimits>, replaced?: Entry, bytes = 0): void {
    if (entries.size > limits.maxPacks) throw new RangeError("Mermaid icon pack count budget exceeded.");
    const total = [...entries.values()].reduce((sum, entry) => sum + (entry === replaced ? bytes : entry.bytes), 0);
    if (total > limits.maxTotalBytes) throw new RangeError("Mermaid icon total byte budget exceeded.");
  }
}

function snapshot(
  value: MermaidIconData,
  limits: Required<MermaidIconLimits>,
): { icons: MermaidIconData; bytes: number } {
  if (
    !value || typeof value !== "object" || typeof value.prefix !== "string" || !value.icons ||
    typeof value.icons !== "object"
  ) {
    throw new TypeError("Mermaid icons must be an Iconify JSON pack.");
  }
  // Do not maintain a second Iconify schema or strip aliases/transformations.
  // JSON also rules out executable values crossing the headless boundary.
  const encoded = JSON.stringify(value);
  if (encoded.length > limits.maxPackBytes) throw new RangeError("Mermaid icon pack byte budget exceeded.");
  const bytes = new TextEncoder().encode(encoded).length;
  if (bytes > limits.maxPackBytes) throw new RangeError("Mermaid icon pack byte budget exceeded.");
  return { icons: JSON.parse(encoded) as MermaidIconData, bytes };
}
