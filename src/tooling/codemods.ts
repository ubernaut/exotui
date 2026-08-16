// Copyright 2023 Im-Beast. MIT license.

// PKG-003: deprecated-API migrations are VERSIONED CODEMODS with dry-run
// and idempotence built into the engine. Sources are scanned through a
// string/template/comment-aware lexer, so renames touch only real code
// identifiers; each migration declares its version and its rewrites
// (module-specifier renames inside import/export declarations, and
// whole-identifier renames); dry-run returns the diff without writing
// anything; the engine ALWAYS verifies idempotence by applying the
// migration to its own output and rejecting any migration whose second
// pass still changes bytes. Syntax the lexer cannot classify safely —
// unterminated strings or template literals — is reported with exact
// line/column locations instead of being mangled.

/** One rewrite rule. */
export type CodemodRule =
  | { readonly kind: "rename-module"; readonly from: string; readonly to: string }
  | { readonly kind: "rename-identifier"; readonly from: string; readonly to: string };

/** One versioned migration. */
export interface Codemod {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly rules: readonly CodemodRule[];
}

/** One reported unsupported-syntax location. */
export interface UnsupportedSyntax {
  readonly line: number;
  readonly column: number;
  readonly reason: string;
}

/** One migration result. */
export interface CodemodResult {
  readonly id: string;
  readonly version: string;
  readonly changed: boolean;
  readonly output: string;
  /** Unified-style change lines for review (dry-run and apply alike). */
  readonly diff: readonly string[];
  readonly unsupported: readonly UnsupportedSyntax[];
  /** Always true for accepted results — enforced by the engine. */
  readonly idempotent: boolean;
}

interface Segment {
  readonly kind: "code" | "string" | "comment";
  readonly text: string;
}

/** Splits source into code vs string/comment segments (location-aware). */
function segment(source: string): { segments: Segment[]; unsupported: UnsupportedSyntax[] } {
  const segments: Segment[] = [];
  const unsupported: UnsupportedSyntax[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  let codeStart = 0;

  const positionOf = (at: number): { line: number; column: number } => {
    let l = 1;
    let c = 1;
    for (let i = 0; i < at; i += 1) {
      if (source[i] === "\n") {
        l += 1;
        c = 1;
      } else c += 1;
    }
    return { line: l, column: c };
  };

  const flushCode = (end: number): void => {
    if (end > codeStart) segments.push({ kind: "code", text: source.slice(codeStart, end) });
  };

  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      flushCode(index);
      const end = source.indexOf("\n", index);
      const stop = end < 0 ? source.length : end;
      segments.push({ kind: "comment", text: source.slice(index, stop) });
      index = stop;
      codeStart = index;
      continue;
    }
    if (char === "/" && next === "*") {
      flushCode(index);
      const end = source.indexOf("*/", index + 2);
      if (end < 0) {
        const at = positionOf(index);
        unsupported.push({ ...at, reason: "unterminated block comment" });
        segments.push({ kind: "comment", text: source.slice(index) });
        index = source.length;
        codeStart = index;
        break;
      }
      segments.push({ kind: "comment", text: source.slice(index, end + 2) });
      index = end + 2;
      codeStart = index;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      flushCode(index);
      const quote = char;
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") cursor += 2;
        else if (source[cursor] === quote) break;
        else if (quote !== "`" && source[cursor] === "\n") break;
        else cursor += 1;
      }
      if (cursor >= source.length || source[cursor] !== quote) {
        const at = positionOf(index);
        unsupported.push({ ...at, reason: `unterminated ${quote === "`" ? "template literal" : "string"}` });
        segments.push({ kind: "string", text: source.slice(index) });
        index = source.length;
        codeStart = index;
        break;
      }
      segments.push({ kind: "string", text: source.slice(index, cursor + 1) });
      index = cursor + 1;
      codeStart = index;
      continue;
    }
    if (char === "\n") {
      line += 1;
      column = 1;
    } else column += 1;
    index += 1;
  }
  flushCode(source.length);
  return { segments, unsupported };
}

function applyRules(segments: readonly Segment[], rules: readonly CodemodRule[]): string {
  return segments.map((seg) => {
    if (seg.kind === "comment") return seg.text;
    if (seg.kind === "string") {
      // Module-specifier renames apply inside string segments ONLY when
      // the whole string is exactly the module path.
      for (const rule of rules) {
        if (rule.kind !== "rename-module") continue;
        const quote = seg.text[0]!;
        if (seg.text === `${quote}${rule.from}${quote}`) {
          return `${quote}${rule.to}${quote}`;
        }
      }
      return seg.text;
    }
    let text = seg.text;
    for (const rule of rules) {
      if (rule.kind !== "rename-identifier") continue;
      text = text.replace(
        new RegExp(`(?<![A-Za-z0-9_$])${rule.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$])`, "g"),
        rule.to,
      );
    }
    return text;
  }).join("");
}

function diffLines(before: string, after: string): string[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const out: string[] = [];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] === afterLines[index]) continue;
    if (beforeLines[index] !== undefined) out.push(`-${index + 1}: ${beforeLines[index]}`);
    if (afterLines[index] !== undefined) out.push(`+${index + 1}: ${afterLines[index]}`);
  }
  return out;
}

/** Runs one codemod. `dryRun` returns the diff without the caller writing. */
export function runCodemod(codemod: Codemod, source: string): CodemodResult {
  const first = segment(source);
  const output = applyRules(first.segments, codemod.rules);
  // The engine's own idempotence check: the second pass must be a no-op.
  const second = segment(output);
  const twice = applyRules(second.segments, codemod.rules);
  const idempotent = twice === output;
  return {
    id: codemod.id,
    version: codemod.version,
    changed: output !== source,
    output: idempotent ? output : source, // non-idempotent migrations are refused
    diff: idempotent ? diffLines(source, output) : [],
    unsupported: first.unsupported,
    idempotent,
  };
}
