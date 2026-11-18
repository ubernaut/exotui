// Copyright 2023 Im-Beast. MIT license.

/** Decode only browser-resolved CSS string lists; never evaluate functions, URLs or authored CSS. */
export function generatedContentText(content: string): string | undefined {
  if (content.length > 16_384) throw new RangeError("Mermaid generated content exceeds its source budget.");
  let at = 0, text = "", strings = 0;
  while (at < content.length) {
    while (/[\t\n\r\f ]/.test(content[at] ?? "") && at < content.length) at++;
    if (at === content.length) break;
    const quote = content[at++];
    if (quote !== '"' && quote !== "'") return;
    let closed = false;
    while (at < content.length) {
      let char = content[at++]!;
      if (char === quote) {
        closed = true;
        break;
      }
      if (char === "\n" || char === "\r" || char === "\f") return;
      if (char === "\\") {
        if (at === content.length) return;
        char = content[at++]!;
        if (char === "\n" || char === "\f") continue;
        if (char === "\r") {
          if (content[at] === "\n") at++;
          continue;
        }
        if (/[0-9a-f]/i.test(char)) {
          let hex = char;
          while (hex.length < 6 && /[0-9a-f]/i.test(content[at] ?? "")) hex += content[at++]!;
          if (/[\t\n\r\f ]/.test(content[at] ?? "")) {
            if (content[at++] === "\r" && content[at] === "\n") at++;
          }
          const code = Number.parseInt(hex, 16);
          char = String.fromCodePoint(!code || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? 0xfffd : code);
        }
      }
      text += char === "\0" ? "\ufffd" : char;
      if (text.length > 4096) throw new RangeError("Mermaid generated content exceeds its text budget.");
    }
    if (!closed) return;
    strings++;
  }
  // deno-lint-ignore no-control-regex -- generated strings cannot inject terminal control sequences
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) {
    throw new TypeError("Mermaid generated text cannot contain terminal controls.");
  }
  return strings ? text : undefined;
}

/** Decode visual strings and optional literal accessibility alternatives without evaluating CSS functions. */
export function generatedContentValue(content: string): { text: string; alternative?: string } | undefined {
  if (content.length > 16_384) throw new RangeError("Mermaid generated content exceeds its source budget.");
  let quote: string | undefined, slash = -1;
  for (let at = 0; at < content.length; at++) {
    const char = content[at];
    if (quote) {
      if (char === "\\") at++;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "/") {
      if (slash !== -1) return;
      slash = at;
    }
  }
  const text = generatedContentText(slash < 0 ? content : content.slice(0, slash));
  if (text === undefined) return;
  if (slash < 0) return { text };
  const alternative = generatedContentText(content.slice(slash + 1));
  if (alternative === undefined) return;
  if (text.length + alternative.length > 4096) {
    throw new RangeError("Mermaid generated content exceeds its combined visual/alternative text budget.");
  }
  return { text, alternative };
}

/** Compare computed styles exactly except measured sub-layout-unit CSSOM rounding of used dimensions/origins. */
export function generatedStyleMatches(property: string, original: string, materialized: string): boolean {
  if (original === materialized) return true;
  if (!["width", "height", "transform-origin"].includes(property)) return false;
  const values = (text: string): number[] | undefined => {
    const parts = text.trim().split(/\s+/);
    if (parts.length > (property === "transform-origin" ? 3 : 1)) return;
    if (parts.some((part) => !/^-?(?:\d+(?:\.\d+)?|\.\d+)px$/.test(part))) return;
    const values = parts.map((part) => Number.parseFloat(part));
    return values.every(Number.isFinite) ? values : undefined;
  };
  const before = values(original), after = values(materialized);
  // Current Chromium serializes 41.78125px as 41.7812px; reparsing can
  // truncate to 41.765625px. Never excuse color/font/transform changes,
  // keywords, different axes or a displacement of two layout units.
  return !!before && !!after && before.length === after.length &&
    before.every((value, index) => Math.abs(value - after[index]!) < 0.02);
}
