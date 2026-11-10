// Copyright 2023 Im-Beast. MIT license.
import { MarkdownController, type MarkdownControllerOptions } from "../components/markdown.ts";
import { Signal } from "../signals/mod.ts";
import { getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import type { MarkdownDiagramFrame, MarkdownRenderLine, MarkdownRenderOptions } from "./markdown.ts";
import type { MermaidNativeOptions } from "./mermaid_cells.ts";
import { type MermaidMarkdownDocument, prepareMermaidMarkdown } from "./mermaid_markdown.ts";
import type { MermaidStandardDiagram, MermaidStandardOptions, MermaidStandardRenderer } from "./mermaid_standard.ts";

/** Explicit per-host retained-result and in-flight bounds, independent of the compiler's own resource limits. */
export interface MermaidMarkdownCacheOptions {
  maxEntries?: number;
  maxBytes?: number;
  maxPending?: number;
  timeoutMs?: number;
}

/** Retained cache evidence; cancellation releases a caller's lease, not another window's operation. */
export interface MermaidMarkdownCacheInspection {
  entries: number;
  bytes: number;
  pending: number;
  revision: number;
  disposed: boolean;
}

interface CacheEntry {
  diagram: MermaidStandardDiagram;
  bytes: number;
}
interface CacheJob {
  abort: AbortController;
  promise: Promise<MermaidStandardDiagram>;
  leases: number;
}

/** Bounded host-scoped full-engine cache. Never share one across different compilers or resource policies. */
export class MermaidMarkdownCache {
  /** Changes when the host invalidates capabilities/assets/fonts; subscribed document controllers refresh automatically. */
  readonly revision: Signal<number> = new Signal(0);
  readonly #renderer: Pick<MermaidStandardRenderer, "compile">;
  readonly #limits: Required<MermaidMarkdownCacheOptions>;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #jobs = new Map<string, CacheJob>();
  #bytes = 0;
  #disposed = false;

  constructor(renderer: Pick<MermaidStandardRenderer, "compile">, options: MermaidMarkdownCacheOptions = {}) {
    this.#renderer = renderer;
    this.#limits = {
      maxEntries: bounded(options.maxEntries, 32, 1024, "cache entries"),
      maxBytes: bounded(options.maxBytes, 32 * 1024 * 1024, 128 * 1024 * 1024, "cache bytes"),
      maxPending: bounded(options.maxPending, 64, 1024, "cache pending jobs"),
      timeoutMs: bounded(options.timeoutMs, 30_000, 300_000, "cache timeout"),
    };
  }

  /** Snapshot configuration before queueing; equal source/config/security/width requests share an operation. */
  async compile(source: string, options: MermaidStandardOptions = {}): Promise<MermaidStandardDiagram> {
    if (this.#disposed) throw new Error("Mermaid document cache is disposed.");
    options.signal?.throwIfAborted();
    if (!source.trim() || source.length > 128_000) throw new RangeError("Invalid or excessive cached Mermaid source.");
    const snapshot = JSON.parse(canonical({
      config: options.config,
      trusted: options.trusted ?? false,
      scene: true,
      containerWidth: options.containerWidth,
    })) as Omit<MermaidStandardOptions, "signal">;
    const key = `${source}\u0000${canonical(snapshot)}`;
    const cached = this.#entries.get(key);
    if (cached) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      return cached.diagram;
    }
    let job = this.#jobs.get(key);
    if (!job) {
      if (this.#jobs.size >= this.#limits.maxPending) throw new RangeError("Mermaid document cache queue is full.");
      const abort = new AbortController();
      job = { abort, leases: 0, promise: Promise.resolve(undefined as unknown as MermaidStandardDiagram) };
      this.#jobs.set(key, job);
      const current = job;
      const epoch = this.revision.peek();
      job.promise = (async () => {
        const timer = setTimeout(
          () => abort.abort(new DOMException("Mermaid document compilation timed out.", "TimeoutError")),
          this.#limits.timeoutMs,
        );
        try {
          // Install every rejection handler before invoking a host that can abort synchronously.
          const result = await interruptible(
            Promise.resolve().then(() => {
              abort.signal.throwIfAborted();
              return this.#renderer.compile(source, { ...snapshot, signal: abort.signal });
            }),
            abort.signal,
          );
          abort.signal.throwIfAborted();
          if (!result.scene) throw new Error("Cached Mermaid compilation must supply a measured native scene.");
          // Native documents do not invoke DOM bindFunctions. Keep portable immutable data only.
          const { bindFunctions: _bindings, ...portable } = result;
          const diagram = structuredClone(portable);
          const bytes = new TextEncoder().encode(JSON.stringify(diagram)).byteLength +
            new TextEncoder().encode(key).byteLength;
          if (bytes > this.#limits.maxBytes) {
            throw new RangeError("Mermaid result exceeds its retained cache byte budget.");
          }
          freeze(diagram);
          if (!this.#disposed && epoch === this.revision.peek() && !abort.signal.aborted) {
            while (this.#entries.size >= this.#limits.maxEntries || this.#bytes + bytes > this.#limits.maxBytes) {
              const oldest = this.#entries.keys().next().value!;
              this.#bytes -= this.#entries.get(oldest)!.bytes;
              this.#entries.delete(oldest);
            }
            this.#entries.set(key, { diagram, bytes });
            this.#bytes += bytes;
          }
          return diagram;
        } finally {
          clearTimeout(timer);
          if (this.#jobs.get(key) === current) this.#jobs.delete(key);
          abort.abort(new DOMException("Mermaid cache operation finished.", "AbortError"));
        }
      })();
    }
    job.leases++;
    try {
      return await interruptible(job.promise, options.signal);
    } finally {
      if (--job.leases === 0 && this.#jobs.get(key) === job) {
        // Detach before abort so a new window can immediately retry the same key.
        this.#jobs.delete(key);
        job.abort.abort(new DOMException("Mermaid document has no remaining consumers.", "AbortError"));
      }
    }
  }

  /** Revoke retained results and in-flight work after host icon/font/resource capability changes. */
  invalidate(): void {
    if (this.#disposed) return;
    this.#clear(new DOMException("Mermaid document cache invalidated.", "AbortError"));
    this.revision.value++;
  }

  /** Inspect only this cache, not the borrowed compiler's resources. */
  inspect(): MermaidMarkdownCacheInspection {
    return {
      entries: this.#entries.size,
      bytes: this.#bytes,
      pending: this.#jobs.size,
      revision: this.revision.peek(),
      disposed: this.#disposed,
    };
  }

  /** Release retained data and owned work; the host remains responsible for disposing its compiler. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clear(new DOMException("Mermaid document cache disposed.", "AbortError"));
    this.revision.value++;
    this.revision.dispose();
  }

  #clear(reason: Error): void {
    this.#entries.clear();
    this.#bytes = 0;
    const jobs = [...this.#jobs.values()];
    this.#jobs.clear();
    for (const job of jobs) job.abort.abort(reason);
  }
}

/** Reactive host configuration, including upstream theme/layout and the actual native backdrop. */
export interface MermaidMarkdownSettings {
  compile?: Omit<MermaidStandardOptions, "signal" | "scene" | "containerWidth">;
  native?: MermaidNativeOptions;
  /** Map terminal columns to the compiler's CSS-pixel container width, not to squeezed native glyphs. Defaults to 9. */
  columnPixels?: number;
}

/** Normal Markdown controller options plus borrowed cache and reactive full-engine configuration. */
export interface MermaidMarkdownControllerOptions extends Omit<MarkdownControllerOptions, "parse" | "render"> {
  settings?: MermaidMarkdownSettings | Signal<MermaidMarkdownSettings>;
  render?: Omit<MarkdownRenderOptions, "width" | "diagram">;
  /** Initial viewport columns; later component render(width) calls update the requested layout automatically. */
  width?: number;
  /** Host-owned horizontal pan; call invalidate() when its value changes. */
  diagramOffset?: (source: string, width: number) => number;
  /** Borrowed local animation milliseconds; ticks repaint without starting new compile/cache jobs. */
  time?: Signal<number>;
}

/** Observable async state; errors never silently downgrade to the old flowchart parser or source text. */
export interface MermaidMarkdownState {
  phase: "loading" | "ready" | "error" | "disposed";
  generation: number;
  width: number;
  diagnostics: readonly string[];
  error?: string;
}

interface DocumentDisplay {
  prepared?: MermaidMarkdownDocument;
  sizes: Map<string, { rows: number; columns: number }>;
  message: string;
}

/** Full Mermaid lifecycle on the existing synchronous Markdown model; mount it wherever a MarkdownController fits. */
export class MermaidMarkdownController extends MarkdownController {
  readonly settings: Signal<MermaidMarkdownSettings>;
  readonly state: Signal<MermaidMarkdownState>;
  readonly #cache: MermaidMarkdownCache;
  readonly #display: DocumentDisplay;
  readonly #ownsSettings: boolean;
  readonly #offset?: (source: string, width: number) => number;
  readonly #time?: Signal<number>;
  readonly #timeChanged = () => {
    if (this.#display.prepared?.diagrams.some((diagram) => diagram.diagram.scene?.animations?.length)) {
      this.invalidate();
    }
  };
  readonly #sourceChanged = () => this.#schedule();
  readonly #settingsChanged = () => this.#schedule();
  readonly #cacheChanged = () => this.#schedule();
  #width: number;
  #generation = 0;
  #abort?: AbortController;
  #scheduled = false;
  #pending: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(cache: MermaidMarkdownCache, options: MermaidMarkdownControllerOptions = {}) {
    const width = viewportWidth(options.width ?? 80);
    const display: DocumentDisplay = { sizes: new Map(), message: "Rendering Mermaid…" };
    super({
      source: options.source,
      offset: options.offset,
      render: {
        ...options.render,
        diagram: (code, width) => {
          const key = code.trim();
          return (display.prepared?.diagrams.some((diagram) => diagram.source === key)
            ? display.prepared.render.diagram?.(key, width)
            : undefined) ??
            placeholder(display.message, display.sizes.get(key));
        },
      },
    });
    this.#cache = cache;
    this.#display = display;
    this.#width = width;
    this.#offset = options.diagramOffset;
    this.#time = options.time;
    this.#ownsSettings = !(options.settings instanceof Signal);
    this.settings = options.settings instanceof Signal ? options.settings : new Signal(options.settings ?? {});
    this.state = new Signal<MermaidMarkdownState>({ phase: "loading", generation: 0, width, diagnostics: [] });
    this.source.subscribe(this.#sourceChanged);
    this.settings.subscribe(this.#settingsChanged);
    cache.revision.subscribe(this.#cacheChanged);
    this.#time?.subscribe(this.#timeChanged);
    this.#schedule();
  }

  /** Render remains synchronous; resize work is coalesced outside the component's reactive propagation pass. */
  override render(width: number): readonly MarkdownRenderLine[] {
    const next = viewportWidth(width);
    if (next !== this.#width) {
      this.#width = next;
      this.#schedule();
    }
    return super.render(next);
  }

  /** Wait for the latest generation, including source/theme/width changes that supersede one already running. */
  async settled(): Promise<MermaidMarkdownState> {
    while (!this.#disposed) {
      await Promise.resolve();
      const pending = this.#pending;
      await pending;
      if (!this.#scheduled && this.#pending === pending) break;
    }
    return this.state.peek();
  }

  /** Retry errors or refresh non-signal host changes; invalidate the cache separately when capabilities changed. */
  refresh(): Promise<MermaidMarkdownState> {
    this.#schedule();
    return this.settled();
  }

  /** Cancel this window's leases and subscriptions without disposing shared signals/cache/compiler. */
  override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#abort?.abort(new DOMException("Mermaid document controller disposed.", "AbortError"));
    this.source.unsubscribe(this.#sourceChanged);
    this.settings.unsubscribe(this.#settingsChanged);
    this.#cache.revision.unsubscribe(this.#cacheChanged);
    this.#time?.unsubscribe(this.#timeChanged);
    this.#display.prepared = undefined;
    this.#display.sizes.clear();
    this.state.value = { ...this.state.peek(), phase: "disposed" };
    this.state.dispose();
    if (this.#ownsSettings) this.settings.dispose();
    super.dispose();
  }

  #schedule(): void {
    if (this.#disposed) return;
    // Cancel immediately; even a late host result cannot publish between change and scheduled refresh.
    this.#abort?.abort(new DOMException("Mermaid document generation superseded.", "AbortError"));
    this.#display.prepared = undefined;
    this.#display.message = "Rendering Mermaid…";
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (!this.#disposed) this.#pending = this.#prepare();
    });
  }

  async #prepare(): Promise<void> {
    const generation = ++this.#generation;
    const width = this.#width;
    const source = this.source.peek();
    const abort = this.#abort = new AbortController();
    this.#display.prepared = undefined;
    this.#display.message = "Rendering Mermaid…";
    this.state.value = { phase: "loading", generation, width, diagnostics: [] };
    this.invalidate();
    try {
      const settings = JSON.parse(canonical(this.settings.peek())) as MermaidMarkdownSettings;
      const pixels = settings.columnPixels ?? 9;
      if (!Number.isFinite(pixels) || pixels <= 0 || width * pixels > 32768) {
        throw new RangeError("Invalid Mermaid document column-to-pixel scale.");
      }
      const prepared = await prepareMermaidMarkdown(source, this.#cache, {
        compile: { ...settings.compile, containerWidth: width * pixels, signal: abort.signal },
        native: settings.native,
        offset: this.#offset,
        time: this.#time ? () => this.#time!.peek() : undefined,
      });
      abort.signal.throwIfAborted();
      if (this.#disposed || generation !== this.#generation) return;
      this.#display.prepared = prepared;
      this.#display.sizes = new Map(prepared.diagrams.map((diagram) => [diagram.source, {
        rows: diagram.native.rows,
        columns: diagram.native.columns,
      }]));
      this.state.value = { phase: "ready", generation, width, diagnostics: prepared.diagnostics };
      this.invalidate();
    } catch (error) {
      if (this.#disposed || abort.signal.aborted || generation !== this.#generation) return;
      const message = safeMessage(error);
      this.#display.message = `Mermaid error: ${message}`;
      this.state.value = { phase: "error", generation, width, diagnostics: [], error: message };
      this.invalidate();
    }
  }
}

function placeholder(message: string, size?: { rows: number; columns: number }): MarkdownDiagramFrame {
  const cells: { char: string }[] = [];
  for (const char of getMultiCodePointCharacters(message)) {
    const width = textWidth(char);
    if (!width) continue;
    cells.push({ char });
    if (width === 2) cells.push({ char: "" });
  }
  const columns = size?.columns ?? cells.length;
  const rows = size?.rows ?? 1;
  const first = Array.from({ length: columns }, (_, index) => cells[index] ?? { char: " " });
  // A trailing wide glyph cannot own a missing continuation column.
  if (textWidth(first[columns - 1]!.char) === 2) first[columns - 1] = { char: " " };
  const empty = Array.from({ length: columns }, () => ({ char: " " }));
  return {
    columns,
    cells: [first, ...Array.from({ length: rows - 1 }, () => empty)],
  };
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return [...message].map((char) => {
    const point = char.codePointAt(0)!;
    return point < 32 || point >= 127 && point <= 159 ? " " : char;
  }).join("").slice(0, 240);
}

function viewportWidth(width: number): number {
  if (!Number.isInteger(width) || width < 1 || width > 2000) {
    throw new RangeError("Mermaid document viewports require 1–2000 columns.");
  }
  return width;
}

function bounded(value: number | undefined, fallback: number, ceiling: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > ceiling) throw new RangeError(`Invalid Mermaid ${name}.`);
  return result;
}

// Configuration is data, not arbitrary functions/prototypes. Stable sorted keys avoid order-dependent cache misses.
function canonical(value: unknown): string {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 8192 || depth > 64) throw new RangeError("Mermaid document configuration is too complex.");
    if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object") throw new TypeError("Mermaid document configuration must contain JSON data.");
    if (ancestors.has(value)) throw new TypeError("Cyclic Mermaid document configuration.");
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
      throw new TypeError("Mermaid document configuration must contain plain JSON objects.");
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1));
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, visit(Reflect.get(value, key), depth + 1)]),
      );
    } finally {
      ancestors.delete(value);
    }
  };
  const result = JSON.stringify(visit(value, 0));
  if (new TextEncoder().encode(result).byteLength > 256 * 1024) {
    throw new RangeError("Mermaid document configuration exceeds its byte budget.");
  }
  return result;
}

function freeze(value: object): void {
  const pending = [value];
  const seen = new Set<object>();
  while (pending.length) {
    const next = pending.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    Object.freeze(next);
    for (const child of Object.values(next)) if (child && typeof child === "object") pending.push(child);
  }
}

async function interruptible<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return await promise;
  let listener!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    listener = () => reject(signal.reason);
    if (signal.aborted) listener();
    else signal.addEventListener("abort", listener, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", listener);
  }
}
