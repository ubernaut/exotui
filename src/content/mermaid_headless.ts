// Copyright 2023 Im-Beast. MIT license.
import type { Browser, BrowserContext, Page } from "playwright";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { runtimeHost } from "../runtime/host.ts";
import {
  type MermaidResourceInspection,
  type MermaidResourceLimits,
  type MermaidResourceResponse,
  MermaidResourceScope,
  resourceLimits,
} from "./mermaid_resources.ts";
import { imageDimensions, imageLimits, type MermaidImageLimits } from "./mermaid_image.ts";
import { type MermaidFontOptions, snapshotMermaidFonts } from "./mermaid_fonts.ts";
export type { MermaidFontFace, MermaidFontLimits, MermaidFontOptions } from "./mermaid_fonts.ts";
import {
  type MermaidIconData,
  type MermaidIconOptions,
  type MermaidIconPack,
  MermaidIconRegistry,
} from "./mermaid_icons.ts";
export type { MermaidResourceInspection, MermaidResourceLimits } from "./mermaid_resources.ts";
export type {
  MermaidIconContext,
  MermaidIconData,
  MermaidIconLimits,
  MermaidIconOptions,
  MermaidIconPack,
} from "./mermaid_icons.ts";
import {
  MERMAID_STANDARD_VERSION,
  type MermaidStandardDiagram,
  type MermaidStandardOptions,
  type MermaidStandardRenderer,
} from "./mermaid_standard.ts";

/** Explicit capabilities/resources for the isolated full-standard DOM host. */
export interface HeadlessMermaidOptions {
  /** Host-installed Chromium. Omit to use Playwright's already installed browser. Never auto-download a browser. */
  executablePath?: string;
  /** Enabled by default. Disabling Chromium's sandbox is an explicit host decision, not an automatic fallback. */
  chromiumSandbox?: boolean;
  timeoutMs?: number;
  maxPending?: number;
  viewport?: { width: number; height: number };
  /** Prebuilt full browser module; supply this when running without a bundler/source tree. */
  browserBundle?: Uint8Array;
  /** Deno CLI used to bundle the package's optional browser entrypoint when browserBundle is absent. */
  denoExecutable?: string;
  /** Network is denied unless the host approves this exact HTTP(S) resource URL. Local files are never fetched. */
  allowResource?: (url: URL) => boolean;
  /** Per-operation decoded-byte, request and concurrency limits for approved images/fonts. */
  resources?: MermaidResourceLimits;
  /** Per-operation image decode/capture bounds. PNG/JPEG HTTP bodies are preflighted before browser decoding. */
  images?: MermaidImageLimits;
  /** Explicit private font bytes/descriptors; network policy is unchanged. Registrations survive owned-page recovery. */
  fonts?: MermaidFontOptions;
  signal?: AbortSignal;
}

/** Serializable compiler lifecycle diagnostics; this host never shares the application's browser/profile. */
export interface HeadlessMermaidInspection {
  version: string;
  pending: number;
  pages: number;
  closed: boolean;
  blockedResources: readonly string[];
  /** Current or most recent operation's streaming-resource counters and failures. */
  resources: MermaidResourceInspection;
  imageDiagnostics: readonly string[];
}

// Virtual origin: every owned request is fulfilled locally without a listener.
const origin = "http://exotui-mermaid.invalid";
const policy =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob: http: https:; font-src data: http: https:; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'";

/** A real, isolated DOM compiler behind the same parse/compile boundary used by browser applications. */
export class HeadlessMermaidRenderer {
  readonly version: string = MERMAID_STANDARD_VERSION;
  readonly #browser: Browser;
  readonly #context: BrowserContext;
  readonly #timeoutMs: number;
  readonly #maxPending: number;
  readonly #blocked: Set<string>;
  readonly #options: HeadlessMermaidOptions;
  readonly #icons = new MermaidIconRegistry();
  #iconDiagnostics: Set<string> = new Set();
  #resources?: MermaidResourceScope;
  #imageOperation?: {
    scope: MermaidResourceScope;
    bodies: Map<string, Promise<MermaidResourceResponse>>;
    sourcePixels: number;
    bytes: number;
  };
  #imageDiagnostics: string[] = [];
  readonly #shutdown = new AbortController();
  #queue: Promise<unknown> = Promise.resolve();
  #page?: Page;
  #pending = 0;
  #closed = false;
  #disposal?: Promise<void>;

  private constructor(
    browser: Browser,
    context: BrowserContext,
    options: HeadlessMermaidOptions,
    blocked: Set<string>,
  ) {
    this.#browser = browser;
    this.#context = context;
    this.#blocked = blocked;
    this.#options = options;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maxPending = options.maxPending ?? 64;
  }

  /** Start a private browser context with a local-only engine bundle and deny-by-default resources. */
  static async create(options: HeadlessMermaidOptions = {}): Promise<HeadlessMermaidRenderer> {
    options.signal?.throwIfAborted();
    // Capabilities are a snapshot, not a mutable caller-owned configuration.
    options = {
      ...options,
      resources: resourceLimits(options.resources),
      images: imageLimits(options.images),
      fonts: snapshotMermaidFonts(options.fonts),
      viewport: options.viewport ? { ...options.viewport } : undefined,
    };
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxPending = options.maxPending ?? 64;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new RangeError("Headless Mermaid timeout must be 1–300,000ms.");
    }
    if (!Number.isInteger(maxPending) || maxPending < 1 || maxPending > 1024) {
      throw new RangeError("Headless Mermaid pending limit must be 1–1024.");
    }
    const viewport = options.viewport ?? { width: 1440, height: 960 };
    if (![viewport.width, viewport.height].every((size) => Number.isInteger(size) && size >= 1 && size <= 8192)) {
      throw new RangeError("Invalid headless Mermaid viewport.");
    }
    const bundle = options.browserBundle ?? await browserBundle(options);
    if (!bundle.length || bundle.length > 32 * 1024 * 1024) {
      throw new RangeError("Headless Mermaid browser bundle must be 1–32 MiB.");
    }
    options.signal?.throwIfAborted();
    const script = new TextDecoder().decode(bundle);
    const { chromium } = await import("playwright");
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({
        executablePath: options.executablePath,
        chromiumSandbox: options.chromiumSandbox ?? true,
        headless: true,
        timeout: timeoutMs,
      });
      options.signal?.throwIfAborted();
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        acceptDownloads: false,
        serviceWorkers: "block",
      });
      const blocked = new Set<string>();
      const deny = (url: URL) => {
        if (blocked.size < 128) blocked.add(url.href);
      };
      const renderer = new HeadlessMermaidRenderer(browser, context, options, blocked);
      await context.exposeBinding("__exotuiMermaidIcon", async (_source, name: string) => {
        return await renderer.#icons.load(name);
      });
      await context.exposeBinding("__exotuiMermaidImage", async (_source, href: string) => {
        const response = await renderer.#loadImage(new URL(href));
        return {
          body: Buffer.from(response.body.buffer, response.body.byteOffset, response.body.byteLength).toString(
            "base64",
          ),
          contentType: response.headers["content-type"],
        };
      });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) {
          if (url.pathname === "/") {
            await route.fulfill({
              status: 200,
              contentType: "text/html",
              headers: { "content-security-policy": policy },
              body: "<!doctype html><title>Isolated ExotUI Mermaid compiler</title>",
            });
          } else if (url.pathname === "/engine.js") {
            await route.fulfill({ status: 200, contentType: "text/javascript", body: script });
          } else await route.fulfill({ status: 404, body: "Not found" });
          return;
        }
        if (
          renderer.#resources && route.request().method() === "GET" &&
          ["image", "font"].includes(route.request().resourceType())
        ) {
          // Fetch explicitly approved resources on the host. Virtual origins
          // have no real network address space; routing the response locally
          // avoids needing to disable Chromium's local-network protections.
          try {
            const response = route.request().resourceType() === "image"
              ? await renderer.#loadImage(url)
              : await renderer.#resources.load(url);
            await route.fulfill({
              status: response.status,
              headers: response.headers,
              body: Buffer.from(response.body.buffer, response.body.byteOffset, response.body.byteLength),
            });
          } catch {
            await route.abort("failed").catch(() => {});
          }
          return;
        }
        deny(url);
        await route.abort("blockedbyclient");
      });
      // Bootstrap now, so missing runtime capabilities fail before handing out a usable compiler.
      await renderer.diagramTypes({ signal: options.signal });
      return renderer;
    } catch (error) {
      await browser?.close().catch(() => {});
      throw error;
    }
  }

  /** Register static/lazy host packs in this compiler only; cached packs survive owned-page recovery. */
  async registerIconPacks(packs: readonly MermaidIconPack[], options: MermaidIconOptions = {}): Promise<void> {
    const prepared = this.#icons.prepare(packs, options);
    await this.#run(options.signal, async (page) => {
      await this.#icons.install(prepared, async (packs) => {
        const bindings = packs.map((pack) => ({ name: pack.name, icons: "icons" in pack ? pack.icons : undefined }));
        await page.evaluate(async ({ bindings, limits }) => {
          const host = globalThis as unknown as BrowserGlobals;
          await host.__exotuiMermaid.registerIconPacks(
            bindings.map((pack) =>
              pack.icons
                ? { name: pack.name, icons: pack.icons }
                : { name: pack.name, loader: () => host.__exotuiMermaidIcon(pack.name) }
            ),
            { limits },
          );
        }, { bindings, limits: prepared[0]?.limits });
      });
    });
  }

  /** Official registered diagram catalogue, compiled without touching the Deno process's globals. */
  async diagramTypes(options: { signal?: AbortSignal } = {}): Promise<readonly string[]> {
    return await this.#run(options.signal, (page) =>
      page.evaluate(async () => {
        return await (globalThis as unknown as BrowserGlobals).__exotuiMermaid.diagramTypes();
      }));
  }

  /** Full upstream grammar validation inside the private DOM host. */
  async parse(source: string, options: MermaidStandardOptions = {}): Promise<string> {
    validateSource(source);
    const config = wireOptions(options);
    return await this.#run(options.signal, (page) =>
      page.evaluate(async ({ source, config }) => {
        return await (globalThis as unknown as BrowserGlobals).__exotuiMermaid.parse(source, config);
      }, { source, config }));
  }

  /** Official SVG and serializable native scene, ready for terminal/browser/remote composition. */
  async compile(source: string, options: MermaidStandardOptions = {}): Promise<MermaidStandardDiagram> {
    validateSource(source);
    const config = wireOptions(options);
    return await this.#run(options.signal, async (page) => {
      const result = await page.evaluate(async ({ source, config }) => {
        const diagram = await (globalThis as unknown as BrowserGlobals).__exotuiMermaid.compile(source, config);
        // DOM functions cannot cross the process boundary. Native links remain scene metadata.
        const { bindFunctions: _bindings, ...result } = diagram;
        return result;
      }, { source, config });
      if (this.#iconDiagnostics.size) {
        result.diagnostics = [...new Set([...result.diagnostics ?? [], ...this.#iconDiagnostics])];
        if (result.scene) {
          result.scene.diagnostics = [...new Set([...result.scene.diagnostics, ...this.#iconDiagnostics])];
        }
      }
      return result;
    });
  }

  /** Check owned resources and resource-policy denials without exposing the private page. */
  inspect(): HeadlessMermaidInspection {
    return {
      version: this.version,
      pending: this.#pending,
      pages: this.#context.pages().length,
      closed: this.#closed,
      blockedResources: [...this.#blocked],
      resources: this.#resources?.inspect() ?? { requests: 0, active: 0, pending: 0, bytes: 0, diagnostics: [] },
      imageDiagnostics: [...this.#imageDiagnostics],
    };
  }

  /** Cancel queued/in-flight work and release this compiler's context/process. Safe to call repeatedly. */
  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#closed = true;
    this.#shutdown.abort(new DOMException("Headless Mermaid compiler disposed.", "AbortError"));
    this.#disposal = (async () => {
      try {
        await this.#context.close();
      } finally {
        try {
          await this.#resources?.dispose();
        } finally {
          await this.#browser.close();
          this.#icons.clear();
          this.#options.fonts = undefined;
        }
      }
    })();
    return this.#disposal;
  }

  async #getPage(signal: AbortSignal): Promise<Page> {
    signal.throwIfAborted();
    if (this.#page && !this.#page.isClosed()) return this.#page;
    const page = await this.#context.newPage();
    if (signal.aborted) {
      await page.close();
      signal.throwIfAborted();
    }
    this.#page = page;
    try {
      await page.goto(origin + "/", { timeout: this.#timeoutMs });
      await page.evaluate(async ({ limits, icons, fonts }) => {
        const enginePath: string = "/engine.js";
        const module = await import(enginePath) as typeof import("../../mod.mermaid.ts");
        const renderer = await module.createMermaidStandardRenderer({
          fonts: {
            limits: fonts?.limits,
            faces: fonts?.faces?.map((face) => ({
              family: face.family,
              descriptors: face.descriptors,
              data: Uint8Array.from(atob(face.data), (char) => char.charCodeAt(0)),
            })),
          },
          images: {
            limits,
            load: async (url) => {
              const resource = await (globalThis as unknown as BrowserGlobals).__exotuiMermaidImage(url.href);
              return {
                body: Uint8Array.from(atob(resource.body), (char) => char.charCodeAt(0)),
                contentType: resource.contentType,
              };
            },
          },
        });
        // Some upstream Error subclasses retain cyclic/deep parse results.
        // Only bounded diagnostic strings cross the owned-page boundary, not
        // parser state, causes, getters, or caller-provided string coercion.
        const field = (error: unknown, key: "name" | "message"): string | undefined => {
          if (key === "message" && typeof error === "string") return error;
          if (!error || typeof error !== "object") return;
          try {
            let owner: object | null = error;
            for (let depth = 0; owner && depth < 4; depth++, owner = Object.getPrototypeOf(owner)) {
              const descriptor = Object.getOwnPropertyDescriptor(owner, key);
              if (!descriptor) continue;
              if ("value" in descriptor) return typeof descriptor.value === "string" ? descriptor.value : undefined;
              // Read the branded native DOMException accessor directly, never
              // a replacement accessor on the thrown object or its subclass.
              if (owner === DOMException.prototype && descriptor.get) return descriptor.get.call(error);
              return;
            }
          } catch { /* Revoked/throwing proxy reflection cannot poison the next request. */ }
        };
        const diagnostic = (value: string, limit: number, lines = false): string => {
          let result = "";
          for (const char of value) {
            const code = char.codePointAt(0)!;
            const escaped = (code < 32 && !(lines && (code === 9 || code === 10))) ||
                (code >= 127 && code <= 159) || (code >= 0xd800 && code <= 0xdfff)
              ? `\\u${code.toString(16).padStart(4, "0")}`
              : char;
            if (result.length + escaped.length > limit - 12) return result + " [truncated]";
            result += escaped;
          }
          return result;
        };
        const protect = async <T>(operation: () => T | Promise<T>): Promise<T> => {
          try {
            return await operation();
          } catch (error) {
            const copy = new Error(diagnostic(field(error, "message") ?? "Mermaid operation failed.", 8192, true));
            copy.name = diagnostic(field(error, "name") ?? "Error", 80);
            throw copy;
          }
        };
        (globalThis as unknown as BrowserGlobals).__exotuiMermaid = {
          diagramTypes: () => protect(() => renderer.diagramTypes()),
          parse: (source, options) => protect(() => renderer.parse(source, options)),
          compile: (source, options) => protect(() => renderer.compile(source, options)),
          registerIconPacks: (packs, options) => protect(() => renderer.registerIconPacks(packs, options)),
        };
        if (icons.length) {
          const host = globalThis as unknown as BrowserGlobals;
          const limits = icons.reduce((result, pack) => ({
            maxPacks: Math.max(result.maxPacks, pack.limits.maxPacks),
            maxPackBytes: Math.max(result.maxPackBytes, pack.limits.maxPackBytes),
            maxTotalBytes: Math.max(result.maxTotalBytes, pack.limits.maxTotalBytes),
            timeoutMs: Math.max(result.timeoutMs, pack.limits.timeoutMs),
          }), icons[0]!.limits);
          await host.__exotuiMermaid.registerIconPacks(
            icons.map((pack) =>
              pack.icons
                ? { name: pack.name, icons: pack.icons }
                : { name: pack.name, loader: () => host.__exotuiMermaidIcon(pack.name) }
            ),
            { limits },
          );
        }
      }, {
        limits: this.#options.images,
        icons: this.#icons.bindings(),
        fonts: {
          limits: this.#options.fonts?.limits,
          faces: this.#options.fonts?.faces?.map((face) => ({
            family: face.family,
            descriptors: face.descriptors,
            data: Buffer.from(face.data).toString("base64"),
          })),
        },
      });
      signal.throwIfAborted();
      return page;
    } catch (error) {
      if (this.#page === page) this.#page = undefined;
      await page.close().catch(() => {});
      throw error;
    }
  }

  async #loadImage(url: URL): Promise<MermaidResourceResponse> {
    const operation = this.#imageOperation;
    if (!operation) throw new Error("No active Mermaid image operation.");
    let pending = operation.bodies.get(url.href);
    if (!pending) {
      const limits = imageLimits(this.#options.images);
      if (operation.bodies.size >= limits.maxImages) throw new RangeError("Mermaid image count budget exceeded.");
      pending = (async () => {
        const response = await operation.scope.load(url);
        if (response.body.length > limits.maxBytes || operation.bytes + response.body.length > limits.maxTotalBytes) {
          throw new RangeError("Mermaid image encoded-byte budget exceeded.");
        }
        operation.bytes += response.body.length;
        const dimensions = imageDimensions(response.body);
        if (dimensions) {
          const count = dimensions.width * dimensions.height;
          if (
            !Number.isSafeInteger(count) || count > limits.maxSourcePixels ||
            operation.sourcePixels + count > limits.maxTotalSourcePixels
          ) throw new RangeError("Mermaid image source-pixel budget exceeded before browser decoding.");
          operation.sourcePixels += count;
        }
        return response;
      })().catch((error) => {
        if (this.#imageDiagnostics.length < 128) this.#imageDiagnostics.push((error as Error).message.slice(0, 180));
        throw error;
      });
      operation.bodies.set(url.href, pending);
    }
    return await pending;
  }

  async #run<T>(callerSignal: AbortSignal | undefined, operation: (page: Page) => Promise<T>): Promise<T> {
    if (this.#closed) throw new Error("Headless Mermaid compiler is disposed.");
    callerSignal?.throwIfAborted();
    if (this.#pending >= this.#maxPending) {
      throw new RangeError("Headless Mermaid pending work exceeds its queue budget.");
    }
    this.#pending++;
    let started = false;
    const queued = this.#queue.catch(() => {}).then(async () => {
      started = true;
      if (this.#closed) throw new Error("Headless Mermaid compiler is disposed.");
      callerSignal?.throwIfAborted();
      const timeout = new AbortController();
      const signal = AbortSignal.any([this.#shutdown.signal, timeout.signal, ...callerSignal ? [callerSignal] : []]);
      const timer = setTimeout(
        () => timeout.abort(new DOMException("Headless Mermaid compilation timed out.", "TimeoutError")),
        this.#timeoutMs,
      );
      let interruptedClose: Promise<void> | undefined;
      const resources = new MermaidResourceScope(
        resourceLimits(this.#options.resources),
        signal,
        (url) => this.#options.allowResource?.(url) === true,
        (url) => {
          if (this.#blocked.size < 128) this.#blocked.add(url.href);
        },
      );
      this.#resources = resources;
      const images = {
        scope: resources,
        bodies: new Map<string, Promise<MermaidResourceResponse>>(),
        sourcePixels: 0,
        bytes: 0,
      };
      this.#imageOperation = images;
      this.#imageDiagnostics = [];
      const icons = this.#icons.begin(signal);
      this.#iconDiagnostics = icons.diagnostics;
      const interrupted = abortPromise(signal, () => {
        const page = this.#page;
        this.#page = undefined;
        interruptedClose = page?.close().catch(() => {});
      });
      try {
        const action = (async () => operation(await this.#getPage(signal)))();
        const result = await Promise.race([action, interrupted.promise]);
        signal.throwIfAborted();
        return result;
      } finally {
        icons.finish();
        clearTimeout(timer);
        interrupted.dispose();
        await interruptedClose;
        await resources.dispose();
        images.bodies.clear();
        if (this.#imageOperation === images) this.#imageOperation = undefined;
      }
    }).finally(() => {
      this.#pending--;
    });
    this.#queue = queued;
    // A queued request responds promptly to cancellation; its reserved slot is
    // retained until skipped, preventing a flood of cancelled promises.
    const interrupted = abortPromise(
      AbortSignal.any([this.#shutdown.signal, ...callerSignal ? [callerSignal] : []]),
      undefined,
      () => !started,
    );
    try {
      return await Promise.race([queued, interrupted.promise]);
    } finally {
      interrupted.dispose();
    }
  }
}

/** Create an optional full DOM compiler for Deno terminals or a native remote host. */
export async function createHeadlessMermaidRenderer(
  options: HeadlessMermaidOptions = {},
): Promise<HeadlessMermaidRenderer> {
  return await HeadlessMermaidRenderer.create(options);
}

interface BrowserGlobals {
  __exotuiMermaid: Pick<MermaidStandardRenderer, "diagramTypes" | "parse" | "compile" | "registerIconPacks">;
  __exotuiMermaidImage: (href: string) => Promise<{ body: string; contentType?: string }>;
  __exotuiMermaidIcon: (name: string) => Promise<MermaidIconData>;
}

function wireOptions(options: MermaidStandardOptions): Omit<MermaidStandardOptions, "signal"> {
  return structuredClone({
    config: options.config,
    trusted: options.trusted,
    scene: options.scene,
    containerWidth: options.containerWidth,
  });
}

function validateSource(source: string): void {
  if (!source.trim()) throw new SyntaxError("A Mermaid diagram cannot be empty.");
  if (source.length > 128_000) throw new RangeError("Mermaid source is limited to 128,000 characters.");
}

function abortPromise(
  signal: AbortSignal,
  onAbort?: () => void,
  shouldReject: () => boolean = () => true,
): { promise: Promise<never>; dispose: () => void } {
  let listener: () => void;
  const promise = new Promise<never>((_, reject) => {
    listener = () => {
      onAbort?.();
      if (shouldReject()) reject(signal.reason);
    };
    if (signal.aborted) listener();
    else signal.addEventListener("abort", listener, { once: true });
  });
  return { promise, dispose: () => signal.removeEventListener("abort", listener!) };
}

async function browserBundle(options: HeadlessMermaidOptions): Promise<Uint8Array> {
  if (runtimeHost.build.standalone && !options.denoExecutable) {
    throw new Error(
      "Compiled applications must supply a prebuilt Mermaid browserBundle or an explicit denoExecutable.",
    );
  }
  const moduleURL = new URL("../../mod.mermaid.ts", import.meta.url);
  if (runtimeHost.runtime === "bun" && !options.denoExecutable) {
    const { bundleBrowserForBun } = await import("../runtime/bun_browser_bundle.ts");
    return await bundleBrowserForBun(moduleURL, options.signal);
  }
  const jsr = moduleURL.href.match(/^https:\/\/jsr\.io\/(@[^/]+\/[^/]+)\/([^/]+)\//);
  const entry = jsr ? `jsr:${jsr[1]}@${jsr[2]}/mermaid` : moduleURL.href;
  const args = ["bundle", "--platform=browser", "--minify", "--conditions=browser,import"];
  if (moduleURL.protocol === "file:") {
    args.push("--config", fileURLToPath(new URL("../../deno.jsonc", import.meta.url)), "--frozen");
  } else args.push("--no-config", "--no-lock");
  args.push(entry);
  const signal = AbortSignal.any([
    AbortSignal.timeout(options.timeoutMs ?? 30_000),
    ...options.signal ? [options.signal] : [],
  ]);
  const output = await new runtimeHost.Command(options.denoExecutable ?? runtimeHost.execPath(), {
    args,
    // Match local lockfile discovery.
    env: { DENO_NO_PACKAGE_JSON: moduleURL.protocol === "file:" ? "0" : "1" },
    stdout: "piped",
    stderr: "piped",
    signal,
  }).output();
  signal.throwIfAborted();
  if (!output.success) {
    throw new Error(
      `Unable to build the optional Mermaid browser module: ${
        new TextDecoder().decode(output.stderr).slice(0, 4000)
      } Supply a prebuilt browserBundle if no Deno bundler/source tree is available.`,
    );
  }
  return output.stdout;
}
