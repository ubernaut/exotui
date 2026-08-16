// Copyright 2023 Im-Beast. MIT license.
import { isAsciiWhitespaceCharacter } from "../utils/formatting.ts";

/** CSS-like declaration for the TUI layout subset. */
export interface TuiCssDeclaration {
  property: string;
  value: string;
  /** True when the declaration carried `!important`. */
  important?: boolean;
}

/** Supported viewport features for CSS-like media rules. */
export type TuiCssMediaFeature = "min-width" | "max-width" | "min-height" | "max-height";

/** One terminal-cell viewport condition from a CSS-like media rule. */
export interface TuiCssMediaCondition {
  feature: TuiCssMediaFeature;
  value: number;
}

/** Parsed media query metadata attached to rules inside `@media` blocks. */
export interface TuiCssMediaQuery {
  source: string;
  conditions: TuiCssMediaCondition[];
}

/** CSS-like rule for the TUI layout subset. */
export interface TuiCssRule {
  selector: string;
  declarations: TuiCssDeclaration[];
  specificity: number;
  order: number;
  media?: TuiCssMediaQuery;
}

/** Parsed CSS-like stylesheet for TUI layout. */
export interface TuiCssStylesheet {
  rules: TuiCssRule[];
}

/** Parses a CSS-like stylesheet into ordered TUI layout rules. */
export function parseCssStylesheet(source: string): TuiCssStylesheet {
  const rules: TuiCssRule[] = [];
  const cleaned = stripCssComments(source);
  let order = 0;

  parseRules(cleaned, undefined);
  return { rules };

  function parseRules(block: string, media: TuiCssMediaQuery | undefined): void {
    let index = 0;
    while (index < block.length) {
      index = skipWhitespace(block, index);
      if (index >= block.length) break;

      if (block.startsWith("@media", index)) {
        const preludeStart = index + "@media".length;
        const open = block.indexOf("{", preludeStart);
        if (open < 0) break;
        const close = findMatchingBrace(block, open);
        if (close < 0) break;
        const query = parseCssMediaQuery(block.slice(preludeStart, open).trim());
        if (query) parseRules(block.slice(open + 1, close), mergeMediaQueries(media, query));
        index = close + 1;
        continue;
      }

      const open = block.indexOf("{", index);
      if (open < 0) break;
      const close = findMatchingBrace(block, open);
      if (close < 0) break;
      const selectors = splitSelectorList(block.slice(index, open));
      addRuleTree(selectors, block.slice(open + 1, close), media, 0);
      index = close + 1;
    }
  }

  /**
   * Adds one rule body, recursing into bounded CSS-style nested rules: `&`
   * splices the parent selector in place, a bare nested selector nests as a
   * descendant, and selector lists cross-multiply. At-rules inside a body and
   * nesting past the depth cap are dropped rather than misparsed.
   */
  function addRuleTree(
    selectors: readonly string[],
    body: string,
    media: TuiCssMediaQuery | undefined,
    depth: number,
  ): void {
    const { declarationSource, nested } = splitRuleBody(body);
    addRules(selectors, parseCssDeclarations(declarationSource), media);
    if (depth >= 8) return;
    for (const sub of nested) {
      if (sub.prelude.startsWith("@")) continue;
      const combined: string[] = [];
      for (const parent of selectors) {
        for (const child of splitSelectorList(sub.prelude)) {
          combined.push(child.includes("&") ? child.replaceAll("&", parent) : `${parent} ${child}`);
        }
      }
      if (combined.length > 0) addRuleTree(combined, sub.body, media, depth + 1);
    }
  }

  function addRules(
    selectors: readonly string[],
    declarations: readonly TuiCssDeclaration[],
    media: TuiCssMediaQuery | undefined,
  ): void {
    for (const selector of selectors) {
      rules.push({
        selector,
        declarations: [...declarations],
        specificity: cssSelectorSpecificity(selector),
        order: order++,
        media,
      });
    }
  }
}

/** Parses CSS-like declarations from a rule body or inline style attribute. */
export function parseCssDeclarations(source: string): TuiCssDeclaration[] {
  const parts = splitDeclarations(source);
  const declarations: TuiCssDeclaration[] = [];
  for (const part of parts) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim();
    let important = false;
    const bang = value.match(/!\s*important$/i);
    if (bang) {
      important = true;
      value = value.slice(0, -bang[0].length).trim();
    }
    if (property && value) declarations.push({ property, value, ...(important ? { important: true } : {}) });
  }
  return declarations;
}

/** Returns a compact CSS specificity score for a selector. */
export function cssSelectorSpecificity(selector: string): number {
  const idCount = (selector.match(/#[A-Za-z_][\w-]*/g) ?? []).length;
  const classCount = (selector.match(/\.[A-Za-z_][\w-]*/g) ?? []).length;
  const attributeCount = (selector.match(/\[[^\]]+\]/g) ?? []).length;
  const pseudoCount = (selector.match(/:[A-Za-z_][\w-]*/g) ?? []).length;
  let tagCount = 0;
  for (const part of selectorParts(selector)) {
    const tag = /^(#text|[A-Za-z][\w-]*|\*)/.exec(part.simple)?.[1];
    if (tag !== undefined && tag !== "*") tagCount += 1;
  }
  return idCount * 100 + (classCount + attributeCount + pseudoCount) * 10 + tagCount;
}

/** Public helper for parsing selector parts from left to right. */
export function selectorParts(selector: string): Array<{ simple: string; combinator?: "child" | "descendant" }> {
  const parts: Array<{ simple: string; combinator?: "child" | "descendant" }> = [];
  let combinator: "child" | "descendant" = "descendant";
  let tokenStart = -1;
  const flushToken = (end: number) => {
    if (tokenStart < 0) return;
    const token = selector.slice(tokenStart, end);
    if (token.length > 0) {
      parts.push({ simple: token, combinator: parts.length === 0 ? undefined : combinator });
      combinator = "descendant";
    }
    tokenStart = -1;
  };

  for (let index = 0; index <= selector.length; index += 1) {
    const char = index < selector.length ? selector[index] : " ";
    if (char === ">") {
      flushToken(index);
      combinator = "child";
      continue;
    }
    if (char === undefined || isAsciiWhitespaceCharacter(char)) {
      flushToken(index);
      continue;
    }
    if (tokenStart < 0) tokenStart = index;
  }
  return parts;
}

function splitSelectorList(source: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index !== source.length && source[index] !== ",") continue;
    const selector = source.slice(start, index).trim();
    if (selector) selectors.push(selector);
    start = index + 1;
  }
  return selectors;
}

function splitDeclarations(source: string): string[] {
  const declarations: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === ";" && depth === 0) {
      declarations.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = source.slice(start).trim();
  if (last) declarations.push(last);
  return declarations;
}

/** Splits a rule body into its declaration text and any nested rule blocks. */
function splitRuleBody(body: string): {
  declarationSource: string;
  nested: Array<{ prelude: string; body: string }>;
} {
  const nested: Array<{ prelude: string; body: string }> = [];
  let declarationSource = "";
  let segmentStart = 0;
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char === ";") {
      declarationSource += body.slice(segmentStart, index + 1);
      segmentStart = index + 1;
      index += 1;
      continue;
    }
    if (char === "{") {
      const prelude = body.slice(segmentStart, index).trim();
      const close = findMatchingBrace(body, index);
      if (close < 0) break;
      nested.push({ prelude, body: body.slice(index + 1, close) });
      segmentStart = close + 1;
      index = close + 1;
      continue;
    }
    index += 1;
  }
  declarationSource += body.slice(segmentStart);
  return { declarationSource, nested };
}

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Parses a supported CSS-like media query prelude. */
export function parseCssMediaQuery(source: string): TuiCssMediaQuery | undefined {
  const conditions: TuiCssMediaCondition[] = [];
  const pattern = /\(\s*((?:min|max)-(?:width|height))\s*:\s*([^)]+)\)/g;
  for (const match of source.matchAll(pattern)) {
    const feature = match[1] as TuiCssMediaFeature | undefined;
    const value = parseCssMediaLength(match[2] ?? "");
    if (feature && Number.isFinite(value)) conditions.push({ feature, value });
  }
  return conditions.length > 0 ? { source: source.trim(), conditions } : undefined;
}

function mergeMediaQueries(
  outer: TuiCssMediaQuery | undefined,
  inner: TuiCssMediaQuery,
): TuiCssMediaQuery {
  if (!outer) return inner;
  return {
    source: `${outer.source} and ${inner.source}`,
    conditions: [...outer.conditions, ...inner.conditions],
  };
}

function parseCssMediaLength(value: string): number {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.endsWith("px")) return Number.parseFloat(trimmed.slice(0, -2));
  if (trimmed.endsWith("ch")) return Number.parseFloat(trimmed.slice(0, -2));
  if (trimmed.endsWith("cell")) return Number.parseFloat(trimmed.slice(0, -4));
  if (trimmed.endsWith("cells")) return Number.parseFloat(trimmed.slice(0, -5));
  return Number.parseFloat(trimmed);
}

function skipWhitespace(source: string, index: number): number {
  let next = index;
  while (next < source.length && /\s/.test(source[next]!)) next += 1;
  return next;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
