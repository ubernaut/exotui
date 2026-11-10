// Copyright 2023 Im-Beast. MIT license.
import { preserveCounterContentForCSSOM } from "./mermaid_counter_content_css.ts";
import type { MermaidStandardRuntime } from "./mermaid_standard.ts";

/** Append only changed, already resolved CSS; leave source grammar and other configuration untouched. */
export function counterThemeDirective(source: string, original: string, preserved: string): string {
  if (original === preserved) return source;
  if (source.length > 128_000 || preserved.length > 2_097_152) {
    throw new RangeError("Mermaid preserved source configuration exceeds its budget.");
  }
  // Upstream replaces apostrophes in directives and recognizes }%% without
  // tracking JSON strings. Its earlier HTML cleanup also sees angle brackets.
  // JSON escapes prevent those lexical rewrites; upstream still owns decoding,
  // sanitization, secure-key filtering and configuration precedence.
  const json = JSON.stringify({ themeCSS: preserved }).replace(
    /[<>'%\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const result = `${source}\n%%{init:${json}}%%\n`;
  if (result.length > 4_194_304) {
    throw new RangeError("Mermaid preserved source configuration encoding exceeds its budget.");
  }
  return result;
}

/** Use upstream's effective, sanitized configuration, not a second YAML/directive grammar or raw parse metadata. */
export async function preserveMermaidCounterSourceConfig(
  runtime: MermaidStandardRuntime,
  source: string,
  validate: (value: string) => { valid: boolean; important: boolean },
  signal: AbortSignal,
): Promise<string> {
  if (!runtime.mermaidAPI) return source;
  signal.throwIfAborted();
  const parsed = await runtime.parse(source);
  signal.throwIfAborted();
  if (!parsed) throw new SyntaxError("Invalid Mermaid diagram.");
  const css = runtime.mermaidAPI.getConfig().themeCSS;
  if (typeof css !== "string") return source;
  return counterThemeDirective(source, css, preserveCounterContentForCSSOM(css, validate));
}
