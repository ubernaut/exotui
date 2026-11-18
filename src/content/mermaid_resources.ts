// Copyright 2023 Im-Beast. MIT license.

/** Explicit per-operation network budgets for an optional isolated compiler. */
export interface MermaidResourceLimits {
  /** HTTP-decoded bytes per image/font, not pixel memory; default 8 MiB, hard ceiling 32 MiB. */
  maxBytes?: number;
  /** Decoded bytes across this operation; default 32 MiB, hard ceiling 256 MiB. */
  maxTotalBytes?: number;
  /** HTTP requests including redirect hops; default 128, hard ceiling 4096. */
  maxRequests?: number;
  /** Concurrent streaming downloads; default 4, hard ceiling 32. */
  maxConcurrent?: number;
}

/** Serializable evidence of owned image/font work, including queued downloads. */
export interface MermaidResourceInspection {
  /** Started HTTP requests, including redirects. */
  requests: number;
  /** Downloads currently owning a lane. */
  active: number;
  /** Unsettled jobs, including active downloads and queued reservations. */
  pending: number;
  /** Accepted HTTP-decoded bytes; an over-budget chunk is not counted or retained. */
  bytes: number;
  /** Bounded policy, quota and download failures; no response bodies are retained. */
  diagnostics: readonly string[];
}

/** A bounded, decoded response ready for private local fulfilment. */
export interface MermaidResourceResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** Validate budgets before any browser/subprocess/network capability is used. */
export function resourceLimits(options: MermaidResourceLimits = {}): Required<MermaidResourceLimits> {
  const limits = {
    maxBytes: options.maxBytes ?? 8 * 1024 * 1024,
    maxTotalBytes: options.maxTotalBytes ?? 32 * 1024 * 1024,
    maxRequests: options.maxRequests ?? 128,
    maxConcurrent: options.maxConcurrent ?? 4,
  };
  for (
    const [key, maximum] of [["maxBytes", 32 * 1024 * 1024], ["maxTotalBytes", 256 * 1024 * 1024], [
      "maxRequests",
      4096,
    ], ["maxConcurrent", 32]] as const
  ) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > maximum) {
      throw new RangeError(`Invalid Mermaid resource budget: ${key}.`);
    }
  }
  return limits;
}

/** Owned HTTP streams: exact approval per hop, no ambient browser cookies, bounded queues and cancellable readers. */
export class MermaidResourceScope {
  readonly #limits: Required<MermaidResourceLimits>;
  readonly #approve: (url: URL) => boolean;
  readonly #deny: (url: URL) => void;
  readonly #abort = new AbortController();
  readonly #signal: AbortSignal;
  readonly #lanes: Promise<unknown>[];
  readonly #diagnostics = new Set<string>();
  readonly #jobs = new Set<Promise<unknown>>();
  #nextLane = 0;
  #requests = 0;
  #reserved = 0;
  #active = 0;
  #bytes = 0;
  #closed = false;

  constructor(
    limits: Required<MermaidResourceLimits>,
    signal: AbortSignal,
    approve: (url: URL) => boolean,
    deny: (url: URL) => void,
  ) {
    this.#limits = resourceLimits(limits);
    this.#signal = AbortSignal.any([signal, this.#abort.signal]);
    this.#approve = approve;
    this.#deny = deny;
    this.#lanes = Array.from({ length: this.#limits.maxConcurrent }, () => Promise.resolve());
  }

  /** Approve and reserve a bounded job, then stream on one of the owned lanes. */
  async load(url: URL): Promise<MermaidResourceResponse> {
    url = new URL(url.href);
    this.#signal.throwIfAborted();
    if (this.#closed) throw new Error("Mermaid resource scope is closed.");
    if (!this.#allowed(url)) throw new Error("Mermaid resource is not approved.");
    if (++this.#reserved > this.#limits.maxRequests) {
      this.#failure(url, "Mermaid resource request budget exceeded.");
      throw new RangeError("Mermaid resource request budget exceeded.");
    }
    const lane = this.#nextLane++ % this.#lanes.length;
    const job = this.#lanes[lane]!.catch(() => {}).then(async () => {
      this.#signal.throwIfAborted();
      this.#active++;
      try {
        return await this.#fetch(url);
      } catch (error) {
        this.#failure(url, error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        this.#active--;
      }
    });
    this.#lanes[lane] = job.then(() => {}, () => {});
    this.#jobs.add(job);
    try {
      return await job;
    } finally {
      this.#jobs.delete(job);
    }
  }

  /** Cancel headers/readers and wait for every active/queued job to release its resources. */
  async dispose(): Promise<void> {
    this.#closed = true;
    this.#abort.abort(new DOMException("Mermaid resource scope disposed.", "AbortError"));
    await Promise.allSettled([...this.#jobs]);
  }

  /** Per-operation counters remain inspectable after cleanup; response bytes are never retained here. */
  inspect(): MermaidResourceInspection {
    return {
      requests: this.#requests,
      active: this.#active,
      pending: this.#jobs.size,
      bytes: this.#bytes,
      diagnostics: [...this.#diagnostics],
    };
  }

  #allowed(url: URL): boolean {
    let approved = false;
    if (url.protocol === "http:" || url.protocol === "https:") {
      try {
        approved = this.#approve(new URL(url.href)) === true;
      } catch { /* Fail closed. */ }
    }
    if (!approved) this.#failure(url, "Mermaid resource is not approved.");
    return approved;
  }

  #failure(url: URL, message: string): void {
    this.#deny(url);
    if (this.#diagnostics.size < 128) this.#diagnostics.add(`${message.slice(0, 300)} ${url.href.slice(0, 1000)}`);
  }

  async #fetch(initial: URL): Promise<MermaidResourceResponse> {
    let url = initial;
    for (let redirects = 0;; redirects++) {
      this.#signal.throwIfAborted();
      if (this.#requests >= this.#limits.maxRequests) {
        throw new RangeError("Mermaid resource request budget exceeded.");
      }
      this.#requests++;
      const response = await fetch(url, { redirect: "manual", signal: this.#signal, credentials: "omit" });
      try {
        const location = response.headers.get("location");
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
          const destination = new URL(location, url);
          if (redirects >= 8 || !this.#allowed(destination)) {
            throw new Error("Mermaid resource redirect denied or exceeds eight hops.");
          }
          url = destination;
          continue;
        }
        const chunks: Uint8Array[] = [];
        let length = 0;
        const reader = response.body?.getReader();
        try {
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            this.#signal.throwIfAborted();
            if (length + value.byteLength > this.#limits.maxBytes) {
              throw new RangeError("Mermaid resource byte budget exceeded.");
            }
            if (this.#bytes + value.byteLength > this.#limits.maxTotalBytes) {
              const error = new RangeError("Mermaid total resource byte budget exceeded.");
              this.#abort.abort(error);
              throw error;
            }
            length += value.byteLength;
            this.#bytes += value.byteLength;
            chunks.push(value);
          }
        } finally {
          await reader?.cancel().catch(() => {});
          reader?.releaseLock();
        }
        const body = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        const headers: Record<string, string> = {};
        // Bodies are decoded by fetch. Never forward compression/length headers,
        // cookies or hop-by-hop fields into the private browser's response.
        for (
          const name of [
            "content-type",
            "access-control-allow-origin",
            "cache-control",
            "expires",
            "etag",
            "last-modified",
          ]
        ) {
          const value = response.headers.get(name);
          if (value) headers[name] = value;
        }
        return { status: response.status, headers, body };
      } finally {
        await response.body?.cancel().catch(() => {});
      }
    }
  }
}
