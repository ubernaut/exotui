// Copyright 2023 Im-Beast. MIT license.
import { extractMermaidScene, type MermaidScene } from "./mermaid_scene.ts";
import { captureMermaidImages } from "./mermaid_image_dom.ts";
import { imageLimits, type MermaidImageOptions } from "./mermaid_image.ts";
import { type MermaidIconOptions, type MermaidIconPack, MermaidIconRegistry } from "./mermaid_icons.ts";
export type { MermaidImageLimits, MermaidImageOptions, MermaidImageResource } from "./mermaid_image.ts";
export type {
  MermaidIconContext,
  MermaidIconData,
  MermaidIconLimits,
  MermaidIconOptions,
  MermaidIconPack,
} from "./mermaid_icons.ts";
import type { IconLoader } from "mermaid";
import { type MermaidFontOptions, MermaidFontScope, sameMermaidFontState } from "./mermaid_fonts.ts";
import { beginMermaidInteractions } from "./mermaid_interactions.ts";
import { captureMermaidStylesheetText } from "./mermaid_stylesheet_dom.ts";
import { preserveCounterContentForCSSOM } from "./mermaid_counter_content_css.ts";
import { preserveMermaidCounterSourceConfig } from "./mermaid_counter_source_config.ts";
import { applyMermaidAccessibilityPreamble, mermaidAccessibilityPreamble } from "./mermaid_accessibility_dom.ts";
export type { MermaidFontFace, MermaidFontLimits, MermaidFontOptions } from "./mermaid_fonts.ts";

/** The exact official implementation used by the optional full-standard surface. */
export const MERMAID_STANDARD_VERSION = "12.1.0";

/** Host configuration passed to the official Mermaid engine without maintaining a second schema. */
export type MermaidStandardConfig = Readonly<Record<string, unknown>>;

/** Structural boundary around the upstream runtime, also usable with a host-provided full Mermaid engine. */
export interface MermaidStandardRuntime {
  initialize(config: MermaidStandardConfig): void;
  parse(source: string): Promise<{ diagramType: string; config?: unknown } | false>;
  render(id: string, source: string, container?: Element): Promise<{
    svg: string;
    diagramType: string;
    bindFunctions?: (element: Element) => void;
  }>;
  getRegisteredDiagramsMetadata(): { id: string }[];
  /** Optional for custom engines; registration fails explicitly when unavailable. */
  registerIconPacks?(packs: IconLoader[]): void;
  /** Optional upstream effective configuration/semantic DB access for counter CSS and portable interactions. */
  mermaidAPI?: {
    getDiagramFromText(source: string): Promise<unknown>;
    getConfig(): MermaidStandardConfig;
  };
}

/** Compile options; input never changes the host's security policy. */
export interface MermaidStandardOptions {
  config?: MermaidStandardConfig;
  signal?: AbortSignal;
  /** Explicitly trusted host configuration may enable upstream interactive callbacks. */
  trusted?: boolean;
  /** Extract renderer-neutral geometry and labels in addition to the authoritative SVG. */
  scene?: boolean;
  /** Real measuring-container width in CSS pixels; upstream still owns responsive SVG/layout behaviour. */
  containerWidth?: number;
}

/** Authoritative upstream rendering plus a portable, terminal-native scene. */
export interface MermaidStandardDiagram {
  source: string;
  diagramType: string;
  version: string;
  svg: string;
  /** Measured host viewport for upstream diagrams that omit an intrinsic SVG viewBox (for example info). */
  viewport?: { width: number; height: number };
  scene?: MermaidScene;
  /** Host loader failures remain observable even when upstream draws its missing-icon placeholder. */
  diagnostics?: readonly string[];
  /** Attach upstream interactions only to a host-owned SVG when explicitly requested. */
  bindFunctions?: (element: Element) => void;
}

// Upstream configuration is process-global. Serialize across renderer instances,
// not just within one document, so concurrent windows cannot exchange themes.
const queues = new WeakMap<MermaidStandardRuntime, Promise<unknown>>();
const defaultExtensions = new WeakMap<MermaidStandardRuntime, Promise<void>>();
const operationSignals = new WeakMap<MermaidStandardRuntime, AbortSignal>();
const iconRegistries = new WeakMap<MermaidStandardRuntime, MermaidIconRegistry>();
let nextId = 0;

/** Full Mermaid compiler; parsing, configuration and SVG layout are owned by upstream. */
export class MermaidStandardRenderer {
  readonly version: string;
  readonly #runtime: MermaidStandardRuntime;
  readonly #document?: Document;
  readonly #requiresDOM: boolean;
  readonly #images: MermaidImageOptions;
  readonly #icons: MermaidIconRegistry;
  readonly #fonts: MermaidFontScope;
  readonly #shutdown = new AbortController();

  constructor(
    runtime: MermaidStandardRuntime,
    options: {
      document?: Document;
      version?: string;
      requiresDOM?: boolean;
      images?: MermaidImageOptions;
      fonts?: MermaidFontOptions;
    } = {},
  ) {
    this.#runtime = runtime;
    this.#document = options.document;
    this.#requiresDOM = options.requiresDOM ?? false;
    this.#images = { load: options.images?.load, limits: imageLimits(options.images?.limits) };
    this.#fonts = new MermaidFontScope(options.fonts);
    let icons = iconRegistries.get(runtime);
    if (!icons) iconRegistries.set(runtime, icons = new MermaidIconRegistry());
    this.#icons = icons;
    this.version = options.version ?? MERMAID_STANDARD_VERSION;
  }

  /** Register explicit host packs in this upstream runtime's shared registry, not in diagram configuration. */
  async registerIconPacks(packs: readonly MermaidIconPack[], options: MermaidIconOptions = {}): Promise<void> {
    const prepared = this.#icons.prepare(packs, options);
    return await this.#run(async () => {
      options.signal?.throwIfAborted();
      if (!this.#runtime.registerIconPacks) throw new Error("This Mermaid runtime cannot register icon packs.");
      await this.#icons.install(prepared, (packs) => this.#runtime.registerIconPacks!(packs));
    });
  }

  /** Upstream's current catalogue, including external diagrams registered by the host. */
  async diagramTypes(): Promise<readonly string[]> {
    return await this.#run(() => {
      this.#runtime.initialize({ startOnLoad: false });
      return this.#runtime.getRegisteredDiagramsMetadata().map(({ id }) => id).filter((id) =>
        id !== "error" && id !== "---"
      );
    });
  }

  /** Validate any upstream-supported diagram family; no flowchart-only pre-parser. */
  async parse(source: string, options: MermaidStandardOptions = {}): Promise<string> {
    validateSource(source);
    const prepared = mermaidAccessibilityPreamble(source);
    if (this.#requiresDOM && !this.#document?.body) {
      throw new Error("Full Mermaid parsing needs a DOM host; compile in a browser or an isolated headless DOM host.");
    }
    return await this.#run(async () => {
      options.signal?.throwIfAborted();
      this.#runtime.initialize(configuration(options));
      const result = await this.#runtime.parse(prepared.source);
      options.signal?.throwIfAborted();
      if (!result) throw new SyntaxError("Invalid Mermaid diagram.");
      return result.diagramType;
    }, options.signal);
  }

  /** Compile using a real DOM for accurate text, SVG and HTML-label measurement. */
  async compile(source: string, options: MermaidStandardOptions = {}): Promise<MermaidStandardDiagram> {
    options = {
      ...options,
      signal: AbortSignal.any([this.#shutdown.signal, ...options.signal ? [options.signal] : []]),
    };
    validateSource(source);
    const prepared = mermaidAccessibilityPreamble(source);
    if (
      options.containerWidth !== undefined &&
      (!Number.isFinite(options.containerWidth) || options.containerWidth < 1 || options.containerWidth > 32768)
    ) throw new RangeError("Mermaid measuring width must be between 1 and 32768 CSS pixels.");
    const document = this.#document;
    if (!document?.body) {
      throw new Error(
        "Full Mermaid rendering needs a DOM host; compile in a browser or an isolated headless DOM host.",
      );
    }
    return await this.#run(async () => {
      options.signal?.throwIfAborted();
      const container = document.createElement("div");
      let viewport: { width: number; height: number } | undefined;
      const config = configuration(options);
      const parser = document.createElement("span").style;
      const validateContent = (value: string) => {
        parser.cssText = `content:${value}`;
        return { valid: !!parser.getPropertyValue("content"), important: !!parser.getPropertyPriority("content") };
      };
      if (typeof config.themeCSS === "string") {
        this.#runtime.initialize({
          ...config,
          themeCSS: preserveCounterContentForCSSOM(config.themeCSS, validateContent),
        });
      } else this.#runtime.initialize(config);
      // Do not use display:none: upstream must measure real text/foreignObject
      // layout. This is an offscreen compiler, never the primary document view.
      container.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none";
      if (options.containerWidth !== undefined) container.style.width = `${options.containerWidth}px`;
      document.body.append(container);
      const icons = this.#icons.begin(options.signal);
      let interactions: Awaited<ReturnType<typeof beginMermaidInteractions>> | undefined;
      try {
        const renderSource = await preserveMermaidCounterSourceConfig(
          this.#runtime,
          prepared.source,
          validateContent,
          options.signal!,
        );
        await this.#fonts.prepare(document, options.signal!);
        if (options.scene !== false) {
          interactions = await beginMermaidInteractions(this.#runtime, renderSource, !!options.trusted);
        }
        options.signal!.throwIfAborted();
        let result!: Awaited<ReturnType<MermaidStandardRuntime["render"]>>;
        let scene: MermaidScene | undefined;
        for (let pass = 0;; pass++) {
          const before = this.#fonts.state(document);
          container.replaceChildren();
          interactions?.reset();
          const id = `exotui-mermaid-standard-${++nextId}`;
          const stylesheet = captureMermaidStylesheetText(container, id);
          try {
            result = await this.#runtime.render(id, renderSource, container);
            result = { ...result, svg: stylesheet.finish(result.svg) };
          } finally {
            stylesheet.dispose();
          }
          options.signal!.throwIfAborted();
          // Reinsertion also triggers fonts used only by final SVG/HTML labels.
          container.innerHTML = result.svg;
          const root = container.querySelector("svg");
          if (!root) throw new Error("Mermaid returned no SVG root.");
          const svg = root;
          applyMermaidAccessibilityPreamble(svg, prepared.accessibility);
          if (prepared.accessibility) result = { ...result, svg: svg.outerHTML };
          svg.getBoundingClientRect();
          await this.#fonts.ready(document, options.signal!);
          const bounds = svg.getBoundingClientRect();
          viewport = { width: bounds.width, height: bounds.height };
          if (options.scene !== false) {
            const captured = await captureMermaidImages(svg, this.#images, options.signal);
            scene = extractMermaidScene(svg, { images: captured.images, interactions: interactions?.resolve(svg) });
            if (!this.#runtime.mermaidAPI && svg.querySelector(".clickable")) {
              scene.diagnostics = [
                ...scene.diagnostics,
                "This custom Mermaid runtime cannot supply portable callbacks or Gantt link metadata.",
              ];
            }
            scene.diagnostics = [...new Set([...scene.diagnostics, ...captured.diagnostics, ...icons.diagnostics])];
          }
          // Native measurement probes can themselves introduce a newly used font.
          await this.#fonts.ready(document, options.signal!);
          if (sameMermaidFontState(before, this.#fonts.state(document))) break;
          if (pass + 1 >= this.#fonts.limits.maxLayoutPasses) {
            throw new RangeError("Mermaid font layout did not stabilize within its pass budget.");
          }
        }
        options.signal?.throwIfAborted();
        return {
          source,
          diagramType: result.diagramType,
          version: this.version,
          svg: result.svg,
          viewport,
          scene,
          diagnostics: [...icons.diagnostics],
          bindFunctions: options.trusted ? result.bindFunctions : undefined,
        };
      } finally {
        interactions?.dispose();
        icons.finish();
        container.remove();
      }
    }, options.signal);
  }

  /** Release only this compiler's font registrations and cancel owned readiness waits; borrowed fonts/icons survive. */
  dispose(): void {
    this.#shutdown.abort(new DOMException("Mermaid compiler disposed.", "AbortError"));
    this.#fonts.dispose();
  }

  async #run<T>(operation: () => T | Promise<T>, signal?: AbortSignal): Promise<T> {
    this.#shutdown.signal.throwIfAborted();
    const lifetime = signal ? AbortSignal.any([this.#shutdown.signal, signal]) : this.#shutdown.signal;
    const pending = (queues.get(this.#runtime) ?? Promise.resolve()).catch(() => {}).then(async () => {
      lifetime.throwIfAborted();
      operationSignals.set(this.#runtime, lifetime);
      try {
        return await operation();
      } finally {
        operationSignals.delete(this.#runtime);
      }
    });
    queues.set(this.#runtime, pending);
    return await pending;
  }
}

/** Load the optional, version-pinned upstream engine without adding it to the core import graph. */
export async function createMermaidStandardRenderer(
  options: { document?: Document; images?: MermaidImageOptions; fonts?: MermaidFontOptions } = {},
): Promise<MermaidStandardRenderer> {
  const { default: runtime } = await import("mermaid");
  const host = runtime as unknown as MermaidStandardRuntime;
  let initialized = defaultExtensions.get(host);
  if (!initialized) {
    // Registration shares the upstream queue and is installed exactly once per
    // runtime, even when independent document windows create factories together.
    initialized = (queues.get(host) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const { default: zenuml } = await import("@mermaid-js/mermaid-zenuml");
      await runtime.registerExternalDiagrams([{
        ...zenuml,
        loader: async () => {
          const [{ id, diagram }, { parseZenUml }] = await withoutZenUmlViewerStyles(() =>
            Promise.all([
              zenuml.loader!(),
              import("./mermaid_zenuml.ts"),
            ])
          );
          const valid = new Map<string, true>();
          return {
            id,
            diagram: {
              ...diagram,
              parser: {
                ...diagram.parser,
                async parse(source: string) {
                  // The plugin is a no-op; the SDK public parser retains Errors
                  // forever. Use its exact generated grammar/runtime in one
                  // disposable realm per uncached request, not a different grammar.
                  if (!valid.has(source)) {
                    const result = await parseZenUml(source.replace(/^\s*zenuml/, ""), operationSignals.get(host));
                    if (!result.pass) {
                      const error = result.error;
                      throw new SyntaxError(
                        error
                          ? `ZenUML parse error on line ${error.line}, column ${error.column}: ${error.msg}`
                          : "Invalid ZenUML diagram.",
                      );
                    }
                    valid.set(source, true);
                    if (valid.size > 10) valid.delete(valid.keys().next().value!);
                  }
                  return diagram.parser.parse(source);
                },
              },
            },
          };
        },
      }]);
    }).catch((error) => {
      defaultExtensions.delete(host);
      throw error;
    });
    defaultExtensions.set(host, initialized);
    queues.set(host, initialized);
  }
  await initialized;
  return new MermaidStandardRenderer(host, {
    document: options.document ?? globalThis.document,
    requiresDOM: true,
    images: options.images,
    fonts: options.fonts,
  });
}

/** Remove only newly injected, byte-identified legacy viewer CSS from our SDK load.
 * Native SVG has its own authoritative defs/style; borrowed host sheets and DOM
 * globals are never patched. Pure SHA-256 works in insecure local HTTP hosts too.
 */
async function withoutZenUmlViewerStyles<T>(load: () => Promise<T>): Promise<T> {
  const document = globalThis.document, view = document?.defaultView, head = document?.head;
  if (!view || !head) return await load();
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const styles = new Set<Element>();
  let nodes = 0, error: Error | undefined;
  const collect = (records: readonly MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (++nodes > 2048) {
          error = new RangeError("ZenUML SDK stylesheet observation exceeds its node budget.");
          return;
        }
        if (node instanceof view.HTMLStyleElement) {
          styles.add(node);
          if (styles.size > 64) {
            error = new RangeError("ZenUML SDK stylesheet observation exceeds its style budget.");
            return;
          }
        }
      }
    }
  };
  const observer = new view.MutationObserver(collect);
  observer.observe(head, { childList: true });
  let result: T;
  try {
    result = await load();
  } finally {
    collect(observer.takeRecords());
    observer.disconnect();
    for (const style of styles) {
      const text = style.textContent ?? "";
      if (text.length !== 893447) continue;
      const hash = [...sha256(new TextEncoder().encode(text))].map((value) => value.toString(16).padStart(2, "0")).join(
        "",
      );
      if (hash === "22e2e9473b184efcbe59e53e8d77da236f9fe4c699ebaeaf852cb7e4a47bc788") style.remove();
    }
  }
  if (error) throw error;
  return result;
}

function configuration(options: MermaidStandardOptions): MermaidStandardConfig {
  const config: MermaidStandardConfig = { ...options.config, startOnLoad: false };
  if (options.trusted) return config;
  // Mermaid's secure site-config keys prevent source directives/front matter
  // from changing these settings. They apply even when the host supplies config.
  return {
    ...config,
    securityLevel: "strict",
    suppressErrorRendering: true,
    secure: [
      ...new Set([
        "securityLevel",
        "startOnLoad",
        "suppressErrorRendering",
        "maxTextSize",
        "maxEdges",
        "secure",
        ...Array.isArray(config.secure)
          ? config.secure.filter((key: unknown): key is string => typeof key === "string")
          : [],
      ]),
    ],
    maxTextSize: 128_000,
    maxEdges: 1024,
  };
}

function validateSource(source: string): void {
  if (!source.trim()) throw new SyntaxError("A Mermaid diagram cannot be empty.");
  if (source.length > 128_000) throw new RangeError("Mermaid source is limited to 128,000 characters.");
}
