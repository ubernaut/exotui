// Copyright 2023 Im-Beast. MIT license.

// LOC-003: Unicode MessageFormat 2 messages, compiled and rendered. The
// compiler parses declarations (`.input`, `.local`), matchers (`.match` with
// plural/exact/star variant keys), placeholders with annotations, and escape
// sequences, and validates every function reference against the registry —
// an unregistered function fails at compile time, before anything renders.
// Rendering resolves local variables lazily, formats through the registry's
// functions (Intl-backed built-ins for :number/:integer/:string), selects
// variants by exact key first, then plural category, then `*`, and emits
// stable parts as well as joined text.

import type { UnicodeLocaleContext } from "./locale.ts";

/** A resolved value flowing through formatting. */
export interface MessageFormatValue {
  readonly value: unknown;
  /** Formatted display text. */
  readonly formatted: string;
  /** Keys this value matches during selection, best first. */
  readonly selectionKeys: readonly string[];
}

/** A message-format function: formats a value and offers selection keys. */
export type MessageFormatFunction = (
  input: unknown,
  options: Readonly<Record<string, string>>,
  locale: string,
) => MessageFormatValue;

/** One part of a formatted message. */
export interface MessageFormatPart {
  readonly type: "text" | "value";
  readonly value: string;
  /** The originating variable or literal for value parts. */
  readonly source?: string;
}

class MessageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageFormatError";
  }
}

interface Expression {
  readonly kind: "variable" | "literal";
  readonly ref: string;
  readonly functionName?: string;
  readonly options: Readonly<Record<string, string | { readonly variable: string }>>;
}

type PatternElement = { readonly kind: "text"; readonly text: string } | {
  readonly kind: "placeholder";
  readonly expression: Expression;
};

interface Variant {
  readonly keys: readonly string[];
  readonly pattern: readonly PatternElement[];
}

interface CompiledMessage {
  readonly declarations: ReadonlyMap<string, Expression>;
  readonly selectors: readonly Expression[];
  readonly variants: readonly Variant[];
  readonly pattern: readonly PatternElement[];
}

const NAME_PATTERN = /^[a-zA-Z][\w.-]*$/;

function builtinNumber(kind: "number" | "integer"): MessageFormatFunction {
  return (input, options, locale) => {
    const value = typeof input === "number" ? input : Number(input);
    if (!Number.isFinite(value)) throw new MessageFormatError(`:${kind} received a non-numeric value`);
    const formatterOptions: Intl.NumberFormatOptions = {};
    if (options["style"] === "percent") formatterOptions.style = "percent";
    if (options["minimumFractionDigits"]) {
      formatterOptions.minimumFractionDigits = Number(options["minimumFractionDigits"]);
    }
    if (options["maximumFractionDigits"]) {
      formatterOptions.maximumFractionDigits = Number(options["maximumFractionDigits"]);
    }
    if (kind === "integer") formatterOptions.maximumFractionDigits = 0;
    const rounded = kind === "integer" ? Math.trunc(value) : value;
    const category = new Intl.PluralRules(locale, {
      type: options["select"] === "ordinal" ? "ordinal" : "cardinal",
    }).select(rounded);
    return {
      value: rounded,
      formatted: new Intl.NumberFormat(locale, formatterOptions).format(rounded),
      selectionKeys: [String(rounded), category],
    };
  };
}

const BUILTINS: ReadonlyMap<string, MessageFormatFunction> = new Map([
  ["number", builtinNumber("number")],
  ["integer", builtinNumber("integer")],
  ["string", (input) => {
    const text = String(input ?? "");
    return { value: text, formatted: text, selectionKeys: [text] };
  }],
]);

/** Registry of message-format functions; custom names must be identifiers. */
export class MessageFormatFunctionRegistry {
  readonly #functions = new Map<string, MessageFormatFunction>(BUILTINS);

  register(name: string, fn: MessageFormatFunction): () => void {
    if (!NAME_PATTERN.test(name)) throw new MessageFormatError(`invalid function name "${name}"`);
    if (BUILTINS.has(name)) throw new MessageFormatError(`built-in :${name} cannot be replaced`);
    this.#functions.set(name, fn);
    return () => {
      this.#functions.delete(name);
    };
  }

  resolve(name: string): MessageFormatFunction | undefined {
    return this.#functions.get(name);
  }

  has(name: string): boolean {
    return this.#functions.has(name);
  }
}

/** A compiled MessageFormat 2 message bound to a locale context. */
export class MessageFormat {
  readonly #compiled: CompiledMessage;
  readonly #registry: MessageFormatFunctionRegistry;
  readonly #locale: string;

  constructor(source: string, context: UnicodeLocaleContext, registry?: MessageFormatFunctionRegistry) {
    this.#registry = registry ?? new MessageFormatFunctionRegistry();
    this.#locale = context.resolve().resolved;
    this.#compiled = compile(source, this.#registry);
  }

  /** Formats to stable parts. */
  formatToParts(values: Readonly<Record<string, unknown>> = {}): readonly MessageFormatPart[] {
    const scope = new Map<string, MessageFormatValue>();
    const pattern = this.#selectPattern(values, scope);
    const parts: MessageFormatPart[] = [];
    for (const element of pattern) {
      if (element.kind === "text") {
        parts.push({ type: "text", value: element.text });
      } else {
        const resolved = this.#evaluate(element.expression, values, scope);
        parts.push({ type: "value", value: resolved.formatted, source: element.expression.ref });
      }
    }
    return parts;
  }

  format(values: Readonly<Record<string, unknown>> = {}): string {
    return this.formatToParts(values).map((part) => part.value).join("");
  }

  #selectPattern(
    values: Readonly<Record<string, unknown>>,
    scope: Map<string, MessageFormatValue>,
  ): readonly PatternElement[] {
    if (this.#compiled.selectors.length === 0) return this.#compiled.pattern;
    const resolved = this.#compiled.selectors.map((selector) => this.#evaluate(selector, values, scope));
    let best: Variant | undefined;
    let bestScore = -1;
    for (const variant of this.#compiled.variants) {
      let score = 0;
      let matches = true;
      for (let index = 0; index < resolved.length; index += 1) {
        const key = variant.keys[index] ?? "*";
        const keys = resolved[index]!.selectionKeys;
        if (key === "*") continue;
        const at = keys.indexOf(key);
        if (at < 0) {
          matches = false;
          break;
        }
        // Earlier selection keys (exact value before plural category) and
        // earlier selectors weigh more.
        score += (keys.length - at) * (resolved.length - index);
      }
      if (matches && score > bestScore) {
        best = variant;
        bestScore = score;
      }
    }
    if (!best) throw new MessageFormatError("no variant matched and no `*` fallback exists");
    return best.pattern;
  }

  #evaluate(
    expression: Expression,
    values: Readonly<Record<string, unknown>>,
    scope: Map<string, MessageFormatValue>,
  ): MessageFormatValue {
    if (expression.kind === "variable") {
      const declaration = this.#compiled.declarations.get(expression.ref);
      let input: unknown;
      if (scope.has(expression.ref)) {
        input = scope.get(expression.ref)!.value;
      } else if (declaration && declaration.ref !== expression.ref) {
        const local = this.#evaluate(declaration, values, scope);
        scope.set(expression.ref, local);
        input = local.value;
      } else if (expression.ref in values) {
        input = values[expression.ref];
      } else {
        throw new MessageFormatError(`unbound variable $${expression.ref}`);
      }
      const annotation = expression.functionName ??
        (declaration && declaration.ref === expression.ref ? declaration.functionName : undefined);
      const options = expression.functionName
        ? expression.options
        : declaration && declaration.ref === expression.ref
        ? declaration.options
        : expression.options;
      const result = this.#apply(annotation, input, options, values, scope);
      scope.set(expression.ref, result);
      return result;
    }
    return this.#apply(expression.functionName, expression.ref, expression.options, values, scope);
  }

  #apply(
    functionName: string | undefined,
    input: unknown,
    options: Expression["options"],
    values: Readonly<Record<string, unknown>>,
    scope: Map<string, MessageFormatValue>,
  ): MessageFormatValue {
    if (!functionName) {
      const text = String(input ?? "");
      return { value: input, formatted: text, selectionKeys: [text] };
    }
    const fn = this.#registry.resolve(functionName);
    if (!fn) throw new MessageFormatError(`unknown function :${functionName}`); // guarded at compile too
    const resolvedOptions: Record<string, string> = {};
    for (const [name, value] of Object.entries(options)) {
      if (typeof value === "string") resolvedOptions[name] = value;
      else {
        const variable = this.#evaluate({ kind: "variable", ref: value.variable, options: {} }, values, scope);
        resolvedOptions[name] = variable.formatted;
      }
    }
    return fn(input, resolvedOptions, this.#locale);
  }
}

// ── parser ──────────────────────────────────────────────────────────────────

function compile(source: string, registry: MessageFormatFunctionRegistry): CompiledMessage {
  const declarations = new Map<string, Expression>();
  const selectors: Expression[] = [];
  const variants: Variant[] = [];
  let body = source.trim();

  while (body.startsWith(".")) {
    if (body.startsWith(".input")) {
      const { expression, rest } = parseBracedExpression(body.slice(".input".length).trimStart());
      if (expression.kind !== "variable") throw new MessageFormatError(".input requires a $variable expression");
      declarations.set(expression.ref, expression);
      body = rest.trimStart();
    } else if (body.startsWith(".local")) {
      const local = body.slice(".local".length).trimStart();
      const match = /^\$([\w.-]+)\s*=\s*/.exec(local);
      if (!match) throw new MessageFormatError(".local requires `$name = {expression}`");
      const { expression, rest } = parseBracedExpression(local.slice(match[0].length));
      declarations.set(match[1]!, expression);
      body = rest.trimStart();
    } else if (body.startsWith(".match")) {
      body = body.slice(".match".length).trimStart();
      while (body.startsWith("$") || body.startsWith("{")) {
        if (body.startsWith("{")) {
          const { expression, rest } = parseBracedExpression(body);
          selectors.push(expression);
          body = rest.trimStart();
        } else {
          const match = /^\$([\w.-]+)/.exec(body)!;
          selectors.push({ kind: "variable", ref: match[1]!, options: {} });
          body = body.slice(match[0].length).trimStart();
        }
      }
      while (body.length > 0) {
        const keys: string[] = [];
        while (!body.startsWith("{{")) {
          const key = /^(\*|\|(?:[^|\\]|\\.)*\||[\w.-]+)\s*/.exec(body);
          if (!key) throw new MessageFormatError(`expected variant key at: ${body.slice(0, 24)}`);
          keys.push(unquoteKey(key[1]!));
          body = body.slice(key[0].length);
        }
        const { pattern, rest } = parseQuotedPattern(body);
        variants.push({ keys, pattern });
        body = rest.trimStart();
      }
    } else {
      throw new MessageFormatError(`unknown declaration at: ${body.slice(0, 16)}`);
    }
  }

  let pattern: readonly PatternElement[] = [];
  if (selectors.length > 0) {
    if (variants.length === 0) throw new MessageFormatError(".match requires at least one variant");
    if (!variants.some((variant) => variant.keys.every((key) => key === "*"))) {
      throw new MessageFormatError(".match requires a `*` fallback variant");
    }
  } else if (body.startsWith("{{")) {
    pattern = parseQuotedPattern(body).pattern;
  } else {
    pattern = parsePattern(body);
  }

  // Fail before rendering: every referenced function must exist now.
  const check = (expression: Expression): void => {
    if (expression.functionName && !registry.has(expression.functionName)) {
      throw new MessageFormatError(`unknown function :${expression.functionName}`);
    }
  };
  for (const declaration of declarations.values()) check(declaration);
  for (const selector of selectors) check(selector);
  for (const element of [...pattern, ...variants.flatMap((variant) => variant.pattern)]) {
    if (element.kind === "placeholder") check(element.expression);
  }
  return { declarations, selectors, variants, pattern };
}

function unquoteKey(key: string): string {
  if (key.startsWith("|") && key.endsWith("|")) return key.slice(1, -1).replace(/\\(.)/g, "$1");
  return key;
}

function parseQuotedPattern(body: string): { pattern: readonly PatternElement[]; rest: string } {
  if (!body.startsWith("{{")) throw new MessageFormatError("expected `{{` pattern");
  let depth = 0;
  for (let index = 2; index < body.length; index += 1) {
    const char = body[index]!;
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      if (depth === 0 && body[index + 1] === "}") {
        return { pattern: parsePattern(body.slice(2, index)), rest: body.slice(index + 2) };
      }
      depth -= 1;
    }
  }
  throw new MessageFormatError("unterminated `{{` pattern");
}

function parsePattern(text: string): readonly PatternElement[] {
  const elements: PatternElement[] = [];
  let buffer = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === "\\") {
      buffer += text[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (char === "{") {
      if (buffer) {
        elements.push({ kind: "text", text: buffer });
        buffer = "";
      }
      const { expression, rest } = parseBracedExpression(text.slice(index));
      elements.push({ kind: "placeholder", expression });
      index = text.length - rest.length - 1;
      continue;
    }
    buffer += char;
  }
  if (buffer) elements.push({ kind: "text", text: buffer });
  return elements;
}

function parseBracedExpression(body: string): { expression: Expression; rest: string } {
  if (!body.startsWith("{")) throw new MessageFormatError(`expected \`{\` at: ${body.slice(0, 16)}`);
  const end = findExpressionEnd(body);
  const inner = body.slice(1, end).trim();
  const rest = body.slice(end + 1);

  let kind: Expression["kind"];
  let ref: string;
  let tail: string;
  if (inner.startsWith("$")) {
    const match = /^\$([\w.-]+)/.exec(inner);
    if (!match) throw new MessageFormatError(`invalid variable in {${inner}}`);
    kind = "variable";
    ref = match[1]!;
    tail = inner.slice(match[0].length).trim();
  } else if (inner.startsWith("|")) {
    const match = /^\|((?:[^|\\]|\\.)*)\|/.exec(inner);
    if (!match) throw new MessageFormatError(`invalid literal in {${inner}}`);
    kind = "literal";
    ref = match[1]!.replace(/\\(.)/g, "$1");
    tail = inner.slice(match[0].length).trim();
  } else {
    const match = /^([\w.+-]+)/.exec(inner);
    if (!match) throw new MessageFormatError(`invalid expression in {${inner}}`);
    kind = "literal";
    ref = match[1]!;
    tail = inner.slice(match[0].length).trim();
  }

  let functionName: string | undefined;
  const options: Record<string, string | { variable: string }> = {};
  if (tail.startsWith(":")) {
    const match = /^:([\w.-]+)\s*/.exec(tail);
    if (!match) throw new MessageFormatError(`invalid annotation in {${inner}}`);
    functionName = match[1]!;
    tail = tail.slice(match[0].length);
    const optionPattern = /([\w.-]+)\s*=\s*(\$[\w.-]+|\|(?:[^|\\]|\\.)*\||[\w.+-]+)\s*/g;
    for (const option of tail.matchAll(optionPattern)) {
      const raw = option[2]!;
      options[option[1]!] = raw.startsWith("$") ? { variable: raw.slice(1) } : unquoteKey(raw);
    }
  } else if (tail.length > 0) {
    throw new MessageFormatError(`unexpected content in {${inner}}`);
  }
  return { expression: { kind, ref, functionName, options }, rest };
}

function findExpressionEnd(body: string): number {
  for (let index = 1; index < body.length; index += 1) {
    const char = body[index]!;
    if (char === "\\") index += 1;
    else if (char === "|") {
      index += 1;
      while (index < body.length && body[index] !== "|") index += body[index] === "\\" ? 2 : 1;
    } else if (char === "}") return index;
  }
  throw new MessageFormatError("unterminated expression");
}

/** Static analysis of one message source, non-throwing. */
export interface MessageFormatAnalysis {
  /** External variables the message needs from the caller. */
  readonly externalVariables: readonly string[];
  readonly usesMatch: boolean;
  /** Compile error text, when the message is invalid. */
  readonly error?: string;
}

/** Analyzes a message without rendering it (for extraction/lint tooling). */
export function analyzeMessageFormat(
  source: string,
  registry: MessageFormatFunctionRegistry = new MessageFormatFunctionRegistry(),
): MessageFormatAnalysis {
  try {
    const compiled = compile(source, registry);
    const external = new Set<string>();
    const locals = new Set<string>();
    for (const [name, declaration] of compiled.declarations) {
      if (declaration.kind === "variable" && declaration.ref === name) continue; // .input: external
      locals.add(name);
    }
    const visit = (expression: Expression): void => {
      if (expression.kind === "variable" && !locals.has(expression.ref)) external.add(expression.ref);
      for (const value of Object.values(expression.options)) {
        if (typeof value !== "string" && !locals.has(value.variable)) external.add(value.variable);
      }
    };
    for (const declaration of compiled.declarations.values()) visit(declaration);
    for (const selector of compiled.selectors) visit(selector);
    for (const element of [...compiled.pattern, ...compiled.variants.flatMap((variant) => variant.pattern)]) {
      if (element.kind === "placeholder") visit(element.expression);
    }
    return {
      externalVariables: [...external].sort(),
      usesMatch: compiled.selectors.length > 0,
    };
  } catch (error) {
    return {
      externalVariables: [],
      usesMatch: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Compiles a MessageFormat 2 message against a locale context. */
export function compileMessageFormat(
  source: string,
  context: UnicodeLocaleContext,
  registry?: MessageFormatFunctionRegistry,
): MessageFormat {
  return new MessageFormat(source, context, registry);
}

/** Creates a function registry seeded with the built-ins. */
export function createMessageFormatFunctionRegistry(): MessageFormatFunctionRegistry {
  return new MessageFormatFunctionRegistry();
}
