// Copyright 2023 Im-Beast. MIT license.

/** Explicit host-owned font bytes; diagram source cannot register fonts or request these capabilities. */
export interface MermaidFontFace {
  family: string;
  data: Uint8Array;
  descriptors?: Readonly<FontFaceDescriptors>;
}

/** Bounds for retained encoded font bytes and browser readiness/layout work, not decoded font memory. */
export interface MermaidFontLimits {
  maxFonts?: number;
  maxBytes?: number;
  maxTotalBytes?: number;
  maxObservedFonts?: number;
  maxLayoutPasses?: number;
  timeoutMs?: number;
}

/** Optional private font registrations plus readiness limits for the measuring document's borrowed fonts. */
export interface MermaidFontOptions {
  faces?: readonly MermaidFontFace[];
  limits?: MermaidFontLimits;
}

const defaults: Required<MermaidFontLimits> = {
  maxFonts: 64,
  maxBytes: 8 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  maxObservedFonts: 1024,
  maxLayoutPasses: 4,
  timeoutMs: 30_000,
};
const ceilings: Required<MermaidFontLimits> = {
  maxFonts: 256,
  maxBytes: 32 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  maxObservedFonts: 4096,
  maxLayoutPasses: 16,
  timeoutMs: 300_000,
};

/** Validate and snapshot capabilities before queuing work or starting an external host. */
export function snapshotMermaidFonts(options: MermaidFontOptions = {}): {
  faces: readonly MermaidFontFace[];
  limits: Required<MermaidFontLimits>;
} {
  const limits = { ...defaults, ...options.limits };
  for (const key of Object.keys(defaults) as (keyof MermaidFontLimits)[]) {
    if (!Number.isInteger(limits[key]) || limits[key] < 1 || limits[key] > ceilings[key]) {
      throw new RangeError(`Invalid Mermaid font limit: ${key}.`);
    }
  }
  if ((options.faces?.length ?? 0) > limits.maxFonts) throw new RangeError("Mermaid font count budget exceeded.");
  let bytes = 0;
  const faces = (options.faces ?? []).map((face) => {
    if (!face.family.trim() || face.family.length > 256 || /\p{Cc}/u.test(face.family)) {
      throw new TypeError("Invalid Mermaid font family.");
    }
    if (!(face.data instanceof Uint8Array) || !face.data.length || face.data.length > limits.maxBytes) {
      throw new RangeError("Mermaid font encoded-byte budget exceeded.");
    }
    bytes += face.data.length;
    if (bytes > limits.maxTotalBytes) throw new RangeError("Mermaid total font encoded-byte budget exceeded.");
    const descriptors = { ...face.descriptors };
    if (Object.keys(descriptors).length > 32) throw new RangeError("Mermaid font descriptor count budget exceeded.");
    for (const value of Object.values(descriptors)) {
      if (typeof value !== "string" || value.length > 1024) throw new TypeError("Invalid Mermaid font descriptor.");
    }
    return Object.freeze({
      family: face.family,
      data: new Uint8Array(face.data),
      descriptors: Object.freeze(descriptors),
    });
  });
  return { faces: Object.freeze(faces), limits: Object.freeze(limits) };
}

/** Compiler-owned registrations; borrowed document fonts are observed, never removed or cancelled. */
export class MermaidFontScope {
  /** Frozen host readiness and retained-byte limits. */
  readonly limits: Required<MermaidFontLimits>;
  #faces: readonly MermaidFontFace[];
  #installed?: { set: FontFaceSet; faces: FontFace[] };
  #closed = false;

  /** Copy font bytes before caller mutation can affect browser decoding. */
  constructor(options: MermaidFontOptions = {}) {
    const snapshot = snapshotMermaidFonts(options);
    this.#faces = snapshot.faces;
    this.limits = snapshot.limits;
  }

  /** Decode owned byte registrations transactionally, then wait for the borrowed document's current loads. */
  async prepare(document: Document, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.#closed) throw new Error("Mermaid font scope is disposed.");
    if (!this.#installed && this.#faces.length) {
      const Constructor = document.defaultView?.FontFace;
      if (!Constructor || !document.fonts) throw new Error("Mermaid host font registration requires CSS Font Loading.");
      const faces: FontFace[] = [];
      const loading: Promise<FontFace>[] = [];
      for (const definition of this.#faces) {
        const face = new Constructor(definition.family, new Uint8Array(definition.data).buffer, definition.descriptors);
        faces.push(face);
        const pending = face.load();
        // A later constructor failure must not leave earlier decode rejections unobserved.
        pending.catch(() => {});
        loading.push(pending);
      }
      await this.wait(Promise.all(loading), signal);
      signal.throwIfAborted();
      if (this.#closed) throw new Error("Mermaid font scope is disposed.");
      for (const face of faces) document.fonts.add(face);
      this.#installed = { set: document.fonts, faces };
    }
    await this.ready(document, signal);
  }

  /** Observe identity and status, including loads that start and finish during an upstream render. */
  state(document: Document): readonly (readonly [FontFace, FontFaceLoadStatus])[] {
    const result: [FontFace, FontFaceLoadStatus][] = [];
    if (document.fonts) {
      for (const face of document.fonts) {
        if (result.length >= this.limits.maxObservedFonts) {
          throw new RangeError("Mermaid observed-font budget exceeded.");
        }
        result.push([face, face.status]);
      }
    }
    return result;
  }

  /** Bound the current FontFaceSet readiness promise without cancelling borrowed browser work. */
  async ready(document: Document, signal: AbortSignal): Promise<void> {
    if (document.fonts) await this.wait(document.fonts.ready, signal);
    signal.throwIfAborted();
  }

  /** Release timeout/abort observers on every outcome; late browser decoding cannot commit registrations. */
  async wait<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    let interrupt!: () => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      interrupt = () => reject(signal.reason);
      signal.addEventListener("abort", interrupt, { once: true });
      timer = setTimeout(
        () => reject(new DOMException("Mermaid font readiness timed out.", "TimeoutError")),
        this.limits.timeoutMs,
      );
    });
    try {
      return await Promise.race([work, stopped]);
    } finally {
      signal.removeEventListener("abort", interrupt);
      clearTimeout(timer);
    }
  }

  /** Delete precisely the owned registrations; never clear the host's FontFaceSet. */
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const face of this.#installed?.faces ?? []) this.#installed!.set.delete(face);
    this.#installed = undefined;
    this.#faces = [];
  }
}

/** Changes require a new upstream layout, not just re-extracting labels from fallback-sized shapes. */
export function sameMermaidFontState(
  before: readonly (readonly [FontFace, FontFaceLoadStatus])[],
  after: readonly (readonly [FontFace, FontFaceLoadStatus])[],
): boolean {
  return before.length === after.length &&
    before.every(([face, status], index) => face === after[index]![0] && status === after[index]![1]);
}
