// Copyright 2023 Im-Beast. MIT license.
import { generatedContentText } from "./mermaid_generated_content.ts";
import { generatedCounterRequests } from "./mermaid_quotes.ts";
import { generatedCounterTokens } from "./mermaid_counter_styles.ts";

const whitespace = /[\t\n\f\r ]/;
const ident = /[-_a-zA-Z0-9\u0080-\uffff]/;

/**
 * Preserve original content token lists before CSSOM loses empty-separator
 * counters(). This is a bounded declaration-name projection, not a CSS parser
 * or cascade implementation: the host parser still validates every declaration.
 * Strings/comments/selectors/custom-property bodies are never rewritten.
 */
export function projectCounterContentDeclarations(
  source: string,
  property: string,
  accepts: (value: string) => boolean | string | undefined,
): string {
  if (source.length > 1_048_576) throw new RangeError("Mermaid counter stylesheet source exceeds its budget.");
  if (!/^--exotui-[a-z0-9-]{1,96}$/.test(property)) {
    throw new TypeError("Counter metadata requires an owned property name.");
  }
  const replacements: { from: number; to: number; value: string }[] = [];
  const escapeEnd = (at: number): number => {
    at++;
    let hex = 0;
    while (hex < 6 && /[\da-f]/i.test(source[at] ?? "")) {
      hex++;
      at++;
    }
    if (hex && whitespace.test(source[at] ?? "")) {
      if (source[at] === "\r" && source[at + 1] === "\n") at++;
      at++;
    } else if (!hex && at < source.length) at++;
    return at;
  };
  const stringEnd = (at: number): number => {
    const quote = source[at++]!;
    while (at < source.length) {
      if (source[at] === "\\") at = escapeEnd(at);
      else if (source[at++] === quote) break;
    }
    return at;
  };
  const commentEnd = (at: number) => {
    const end = source.indexOf("*/", at + 2);
    return end < 0 ? source.length : end + 2;
  };
  const triviaEnd = (at: number): number => {
    while (at < source.length) {
      if (whitespace.test(source[at]!)) at++;
      else if (source.startsWith("/*", at)) at = commentEnd(at);
      else break;
    }
    return at;
  };
  const identifierEnd = (at: number): number => {
    while (at < source.length) {
      if (ident.test(source[at]!)) at++;
      else if (source[at] === "\\") at = escapeEnd(at);
      else break;
    }
    return at;
  };
  const valueEnd = (at: number, blocks: boolean): number | undefined => {
    const closing: string[] = [];
    while (at < source.length) {
      const char = source[at]!;
      if (char === '"' || char === "'") at = stringEnd(at);
      else if (source.startsWith("/*", at)) at = commentEnd(at);
      else if (char === "\\") at = escapeEnd(at);
      else if (!closing.length && (char === ";" || char === "}")) return at;
      else if (char === "{" && !closing.length && !blocks) return;
      else {
        if (["(", "[", "{"].includes(char)) {
          if (closing.length >= 128) throw new RangeError("Mermaid counter declaration nesting exceeds its budget.");
          closing.push(char === "(" ? ")" : char === "[" ? "]" : "}");
        } else if (char === closing.at(-1)) closing.pop();
        at++;
      }
    }
    return at;
  };
  const frames: { declarations: boolean; start: number }[] = [{ declarations: false, start: 0 }];
  let at = 0;
  while (at < source.length) {
    const frame = frames.at(-1)!, char = source[at]!;
    if (source.startsWith("/*", at)) {
      at = commentEnd(at);
      continue;
    }
    if (char === '"' || char === "'") {
      at = stringEnd(at);
      continue;
    }
    if (char === "\\" || ident.test(char)) {
      const end = identifierEnd(at), first = frame.declarations && triviaEnd(frame.start) === at;
      if (first) {
        const colon = triviaEnd(end);
        const name = generatedContentText(`"${source.slice(at, end)}"`);
        if (source[colon] === ":" && name !== undefined) {
          const value = valueEnd(colon + 1, name.startsWith("--"));
          if (value !== undefined) {
            if (name.toLowerCase() === "content") {
              if (replacements.length >= 8192) {
                throw new RangeError("Mermaid counter declarations exceed their budget.");
              }
              const replacement = accepts(source.slice(colon + 1, value));
              replacements.push({
                from: at,
                to: end,
                value: replacement === undefined
                  ? source.slice(at, end)
                  : typeof replacement === "string"
                  ? replacement
                  : replacement
                  ? property
                  : `${property}-ignored`,
              });
            }
            at = value;
            continue;
          }
        }
      }
      at = end;
      continue;
    }
    if (char === "{") {
      if (frames.length >= 128) throw new RangeError("Mermaid counter stylesheet nesting exceeds its budget.");
      const header = source.slice(triviaEnd(frame.start), at).replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const grouped = header.startsWith("@");
      frames.push({ declarations: !grouped || frame.declarations, start: at + 1 });
    } else if (char === "}") {
      if (frames.length > 1) frames.pop();
      frames.at(-1)!.start = at + 1;
    } else if (char === ";") frame.start = at + 1;
    at++;
  }
  let result = "", last = 0;
  for (const replacement of replacements) {
    result += source.slice(last, replacement.from) + replacement.value;
    last = replacement.to;
  }
  result += source.slice(last);
  if (result.length > 2_097_152) throw new RangeError("Mermaid counter stylesheet projection exceeds its budget.");
  return result;
}

let preservation = 0;

/**
 * Preserve empty plural separators through upstream's lossy CSSOM stylesheet
 * serialization. A per-declaration custom variable retains the original tokens;
 * the real content declaration has exactly its original importance. The browser
 * still owns validation, variable substitution, cascade and generated layout.
 */
export function preserveCounterContentForCSSOM(
  source: string,
  validate: (value: string) => { valid: boolean; important: boolean },
): string {
  if (source.length > 1_048_576) throw new RangeError("Mermaid counter stylesheet source exceeds its budget.");
  const decoded = source.replace(
    /\\(?:[\da-fA-F]{1,6}(?:\r\n|[\t\n\r\f ])?|[^\n\r\f])/g,
    (escape) => generatedContentText(`"${escape}"`) ?? escape,
  );
  let property: string, collisions = 0, declarations = 0;
  do {
    if (++collisions > 64) throw new RangeError("Mermaid preserved counter names exceed their collision budget.");
    property = `--exotui-preserved-counter-${++preservation}`;
  } while (decoded.includes(property));
  return projectCounterContentDeclarations(source, property, (value) => {
    if (
      !generatedCounterRequests(value).some((request) => {
        if (request.name !== "counters") return false;
        const tokens = generatedCounterTokens(request.arguments);
        return tokens[1] === "," && generatedContentText(tokens[2] ?? "") === "";
      })
    ) return;
    const { valid, important } = validate(value);
    if (!valid) return;
    const variable = `${property}-${++declarations}`;
    return `content:var(${variable})${important ? "!important" : ""};${variable}`;
  });
}
