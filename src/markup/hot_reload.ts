// Copyright 2023 Im-Beast. MIT license.

// C1 hot reload: live markup/CSS source swapping with parse diagnostics and
// last-known-good rollback. The markup parser is deliberately recovery-based
// (it never throws on malformed input), so a hot-reload gate needs its own
// well-formedness checks: a candidate that fails them is rejected with
// diagnostics while the running UI keeps its last good sources — a typo mid
// edit must never destroy the live tree. File watching is host-owned and
// injectable; the controller itself is renderer-neutral and side-effect free.

const VOID_MARKUP_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** One candidate source set offered to the controller. */
export interface MarkupHotReloadSource {
  readonly markup: string;
  readonly css: string | readonly string[];
}

/** One structured finding from validating a candidate. */
export interface MarkupHotReloadDiagnostic {
  readonly severity: "error" | "warning";
  readonly source: "markup" | "css";
  readonly code: "unbalanced-tag" | "stray-close" | "unbalanced-braces" | "no-rules" | "read-failed";
  readonly message: string;
}

/** Result of offering a candidate: applied, or rejected with the reasons. */
export interface MarkupHotReloadResult {
  readonly status: "applied" | "rejected";
  /** The live version after this offer (unchanged on rejection). */
  readonly version: number;
  readonly diagnostics: readonly MarkupHotReloadDiagnostic[];
}

/** Bounded inspection of the controller's history. */
export interface MarkupHotReloadInspection {
  readonly version: number;
  readonly applied: number;
  readonly rejected: number;
  readonly lastDiagnostics: readonly MarkupHotReloadDiagnostic[];
}

/** Options for one hot-reload controller. */
export interface MarkupHotReloadControllerOptions {
  readonly initial: MarkupHotReloadSource;
  /** Called after every successful apply with the new sources and version. */
  readonly onApply?: (source: MarkupHotReloadSource, version: number) => void;
}

/** Tag-balance well-formedness scan; the parser itself recovers silently. */
export function markupHotReloadDiagnostics(markup: string): MarkupHotReloadDiagnostic[] {
  const diagnostics: MarkupHotReloadDiagnostic[] = [];
  const stack: string[] = [];
  const cleaned = markup.replace(/<!--[\s\S]*?-->/g, "");
  for (const match of cleaned.matchAll(/<(\/?)([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g)) {
    const closing = match[1] === "/";
    const tag = match[2]!.toLowerCase();
    const selfClosed = match[4] === "/" || VOID_MARKUP_TAGS.has(tag);
    if (closing) {
      const open = stack.lastIndexOf(tag);
      if (open < 0) {
        diagnostics.push({
          severity: "error",
          source: "markup",
          code: "stray-close",
          message: `</${tag}> has no matching open tag`,
        });
      } else {
        stack.length = open;
      }
    } else if (!selfClosed) {
      stack.push(tag);
    }
  }
  for (const tag of stack) {
    diagnostics.push({
      severity: "error",
      source: "markup",
      code: "unbalanced-tag",
      message: `<${tag}> is never closed`,
    });
  }
  return diagnostics;
}

/** Brace-balance and emptiness checks for one CSS source. */
export function cssHotReloadDiagnostics(css: string): MarkupHotReloadDiagnostic[] {
  const diagnostics: MarkupHotReloadDiagnostic[] = [];
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  for (const char of cleaned) {
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth < 0) break;
    }
  }
  if (depth !== 0) {
    diagnostics.push({
      severity: "error",
      source: "css",
      code: "unbalanced-braces",
      message: depth > 0 ? `${depth} unclosed { in stylesheet` : "stray } in stylesheet",
    });
  } else if (cleaned.trim().length > 0 && !cleaned.includes("{")) {
    diagnostics.push({
      severity: "warning",
      source: "css",
      code: "no-rules",
      message: "stylesheet has content but no rules",
    });
  }
  return diagnostics;
}

/** Validates a full candidate; errors reject it, warnings ride along. */
export function validateMarkupHotReloadSource(source: MarkupHotReloadSource): MarkupHotReloadDiagnostic[] {
  const sheets = typeof source.css === "string" ? [source.css] : source.css;
  const diagnostics = markupHotReloadDiagnostics(source.markup);
  for (const sheet of sheets) diagnostics.push(...cssHotReloadDiagnostics(sheet));
  return diagnostics;
}

/** Live source holder: offers apply atomically or roll back to last-known-good. */
export class MarkupHotReloadController {
  #current: MarkupHotReloadSource;
  #version = 1;
  #applied = 0;
  #rejected = 0;
  #lastDiagnostics: readonly MarkupHotReloadDiagnostic[] = [];
  readonly #onApply?: (source: MarkupHotReloadSource, version: number) => void;

  constructor(options: MarkupHotReloadControllerOptions) {
    this.#current = options.initial;
    this.#onApply = options.onApply;
  }

  /** The last-known-good sources and their version. */
  current(): MarkupHotReloadSource & { readonly version: number } {
    return { ...this.#current, version: this.#version };
  }

  /**
   * Validates and applies a candidate. Any error diagnostic rejects it whole —
   * the live sources are untouched and the caller gets the reasons; warnings
   * apply but are reported.
   */
  offer(candidate: MarkupHotReloadSource): MarkupHotReloadResult {
    const diagnostics = validateMarkupHotReloadSource(candidate);
    this.#lastDiagnostics = Object.freeze([...diagnostics]);
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      this.#rejected += 1;
      return { status: "rejected", version: this.#version, diagnostics: this.#lastDiagnostics };
    }
    this.#current = candidate;
    this.#version += 1;
    this.#applied += 1;
    this.#onApply?.(candidate, this.#version);
    return { status: "applied", version: this.#version, diagnostics: this.#lastDiagnostics };
  }

  inspect(): MarkupHotReloadInspection {
    return {
      version: this.#version,
      applied: this.#applied,
      rejected: this.#rejected,
      lastDiagnostics: this.#lastDiagnostics,
    };
  }
}

/** Injectable file access for the watcher; tests and browser hosts fake it. */
export interface MarkupHotReloadWatchIo {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly watch: (paths: readonly string[]) => AsyncIterable<{ paths: string[] }>;
}

/** Options for watching local files into a hot-reload controller. */
export interface MarkupHotReloadWatchOptions {
  readonly markupPath: string;
  readonly cssPaths?: readonly string[];
  readonly signal?: AbortSignal;
  readonly io?: MarkupHotReloadWatchIo;
  /** Coalesce a burst of fs events into one reload after this many ms. */
  readonly debounceMs?: number;
  readonly onResult?: (result: MarkupHotReloadResult) => void;
}

const defaultWatchIo: MarkupHotReloadWatchIo = {
  readTextFile: (path) => Deno.readTextFile(path),
  watch: (paths) => Deno.watchFs([...paths]),
};

/**
 * Watches local markup/CSS files and offers every settled change to the
 * controller. Read failures surface as diagnostics through `onResult` without
 * touching the live sources. Resolves when the signal aborts.
 */
export async function watchMarkupHotReload(
  controller: MarkupHotReloadController,
  options: MarkupHotReloadWatchOptions,
): Promise<void> {
  const io = options.io ?? defaultWatchIo;
  const paths = [options.markupPath, ...(options.cssPaths ?? [])];
  const debounceMs = Math.max(0, options.debounceMs ?? 30);
  let pending = false;
  const reload = async (): Promise<void> => {
    if (pending) return;
    pending = true;
    if (debounceMs > 0) await new Promise((resolve) => setTimeout(resolve, debounceMs));
    pending = false;
    try {
      const markup = await io.readTextFile(options.markupPath);
      const css = await Promise.all((options.cssPaths ?? []).map((path) => io.readTextFile(path)));
      options.onResult?.(controller.offer({ markup, css }));
    } catch (error) {
      options.onResult?.({
        status: "rejected",
        version: controller.current().version,
        diagnostics: [{
          severity: "error",
          source: "markup",
          code: "read-failed",
          message: `hot reload read failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
      });
    }
  };
  for await (const _event of io.watch(paths)) {
    if (options.signal?.aborted) return;
    await reload();
    if (options.signal?.aborted) return;
  }
}
