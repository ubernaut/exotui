// Copyright 2023 Im-Beast. MIT license.
import { generatedContentText } from "./mermaid_generated_content.ts";
import { graphemeBoundaries } from "../unicode/grapheme.ts";

type System = "cyclic" | "fixed" | "symbolic" | "alphabetic" | "numeric" | "additive" | "extends";

/** Inert, internal counter-style descriptors; prefix/suffix belong to marker composition, not counter(). */
export interface GeneratedCounterStyle {
  system: System;
  /** Known authored nontextual/unsupported definitions must not become decimal. */
  unsupported?: boolean;
  extends?: string;
  first?: number;
  symbols?: readonly string[];
  additive?: readonly (readonly [number, string])[];
  range?: "auto" | readonly (readonly [number, number])[];
  negative?: readonly [string, string];
  pad?: readonly [number, string];
  fallback?: string;
}

const limit = 4096;
const decimal: GeneratedCounterStyle = { system: "numeric", symbols: [..."0123456789"] };
const predefined = new Map<string, GeneratedCounterStyle>([["decimal", decimal]]);
predefined.set("decimal-leading-zero", { ...decimal, pad: [2, "0"] });
for (
  const [name, digits] of [
    ["arabic-indic", "٠١٢٣٤٥٦٧٨٩"],
    ["bengali", "০১২৩৪৫৬৭৮৯"],
    ["cambodian", "០១២៣៤៥៦៧៨៩"],
    ["khmer", "០១២៣៤៥៦៧៨៩"],
    ["cjk-decimal", "〇一二三四五六七八九"],
    ["devanagari", "०१२३४५६७८९"],
    ["gujarati", "૦૧૨૩૪૫૬૭૮૯"],
    ["gurmukhi", "੦੧੨੩੪੫੬੭੮੯"],
    ["kannada", "೦೧೨೩೪೫೬೭೮೯"],
    ["lao", "໐໑໒໓໔໕໖໗໘໙"],
    ["malayalam", "൦൧൨൩൪൫൬൭൮൯"],
    ["mongolian", "᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙"],
    ["myanmar", "၀၁၂၃၄၅၆၇၈၉"],
    ["oriya", "୦୧୨୩୪୫୬୭୮୯"],
    ["persian", "۰۱۲۳۴۵۶۷۸۹"],
    ["tamil", "௦௧௨௩௪௫௬௭௮௯"],
    ["telugu", "౦౧౨౩౪౫౬౭౮౯"],
    ["thai", "๐๑๒๓๔๕๖๗๘๙"],
    ["tibetan", "༠༡༢༣༤༥༦༧༨༩"],
  ]
) predefined.set(name!, { system: "numeric", symbols: [...digits!] });
predefined.set("cjk-decimal", { ...predefined.get("cjk-decimal")!, range: [[0, Infinity]] });
for (
  const [name, alphabet] of [
    ["lower-alpha", "abcdefghijklmnopqrstuvwxyz"],
    ["lower-latin", "abcdefghijklmnopqrstuvwxyz"],
    ["upper-alpha", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["upper-latin", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["lower-greek", "αβγδεζηθικλμνξοπρστυφχψω"],
    ["hiragana", "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをん"],
    ["katakana", "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲン"],
    [
      "hiragana-iroha",
      "いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせす",
    ],
    [
      "katakana-iroha",
      "イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス",
    ],
  ]
) predefined.set(name!, { system: "alphabetic", symbols: [...alphabet!] });
const romanWeights = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
for (const upper of [false, true]) {
  const symbols = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  predefined.set(upper ? "upper-roman" : "lower-roman", {
    system: "additive",
    additive: romanWeights.map((weight, index) => [weight, upper ? symbols[index]! : symbols[index]!.toLowerCase()]),
    range: [[1, 3999]],
  });
}
for (
  const [name, symbol] of [
    ["disc", "•"],
    ["circle", "◦"],
    ["square", "▪"],
    ["disclosure-open", "▾"],
    ["disclosure-closed", "▸"],
  ]
) predefined.set(name!, { system: "cyclic", symbols: [symbol!] });
predefined.set("cjk-earthly-branch", { system: "fixed", symbols: [..."子丑寅卯辰巳午未申酉戌亥"] });
predefined.set("cjk-heavenly-stem", { system: "fixed", symbols: [..."甲乙丙丁戊己庚辛壬癸"] });

// Legacy UA styles from pinned Chromium 154's registry. They are not normative
// predefined names, so the standard profile does not invent these extensions.
const chromiumPredefined = new Map<string, GeneratedCounterStyle>();
chromiumPredefined.set("urdu", { ...predefined.get("persian")! });
for (
  const [name, alphabet] of [
    [
      "ethiopic-halehame",
      "\u1200\u1208\u1210\u1218\u1220\u1228\u1230\u1240\u1260\u1270\u1280\u1290\u12a0\u12a8\u12c8\u12d0\u12d8\u12e8\u12f0\u1308\u1320\u1330\u1338\u1340\u1348\u1350",
    ],
    [
      "ethiopic-halehame-am",
      "\u1200\u1208\u1210\u1218\u1220\u1228\u1230\u1238\u1240\u1260\u1270\u1278\u1280\u1290\u1298\u12a0\u12a8\u12b8\u12c8\u12d0\u12d8\u12e0\u12e8\u12f0\u1300\u1308\u1320\u1328\u1330\u1338\u1340\u1348\u1350",
    ],
    [
      "ethiopic-halehame-ti-er",
      "\u1200\u1208\u1210\u1218\u1228\u1230\u1238\u1240\u1250\u1260\u1270\u1278\u1290\u1298\u12a0\u12a8\u12b8\u12c8\u12d0\u12d8\u12e0\u12e8\u12f0\u1300\u1308\u1320\u1328\u1330\u1338\u1348\u1350",
    ],
    [
      "ethiopic-halehame-ti-et",
      "\u1200\u1208\u1210\u1218\u1220\u1228\u1230\u1238\u1240\u1250\u1260\u1270\u1278\u1280\u1290\u1298\u12a0\u12a8\u12b8\u12c8\u12d0\u12d8\u12e0\u12e8\u12f0\u1300\u1308\u1320\u1328\u1330\u1338\u1340\u1348\u1350",
    ],
    ["hangul", "가나다라마바사아자차카타파하"],
    ["hangul-consonant", "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"],
  ]
) chromiumPredefined.set(name!, { system: "alphabetic", symbols: [...alphabet!] });

// Known but not yet implemented: never confuse a missing complex algorithm with
// an unknown authored name (which CSS really does render as decimal).
const complex = new Set([
  "armenian",
  "upper-armenian",
  "lower-armenian",
  "georgian",
  "hebrew",
  "japanese-informal",
  "japanese-formal",
  "korean-hangul-formal",
  "korean-hanja-informal",
  "korean-hanja-formal",
  "simp-chinese-informal",
  "simp-chinese-formal",
  "trad-chinese-informal",
  "trad-chinese-formal",
  "cjk-ideographic",
  "ethiopic-numeric",
]);

function checked(text: string): string {
  if (text.length > limit) throw new RangeError("Mermaid counter text exceeds its budget.");
  // deno-lint-ignore no-control-regex -- counter symbols must not inject terminal controls
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) {
    throw new TypeError("Mermaid counter text cannot contain terminal controls.");
  }
  return text;
}

/** Decode serialized CSS descriptor tokens only; URLs/functions are deliberately not evaluated. */
export function generatedCounterTokens(source: string): string[] {
  if (source.length > 16_384) throw new RangeError("Mermaid counter descriptor exceeds its source budget.");
  const result: string[] = [];
  let at = 0;
  while (at < source.length) {
    if (source.startsWith("/*", at)) {
      const end = source.indexOf("*/", at + 2);
      if (end < 0) throw new TypeError("Malformed counter descriptor comment.");
      at = end + 2;
      continue;
    }
    if (/\s/.test(source[at]!)) {
      at++;
      continue;
    }
    if (result.length >= 256) throw new RangeError("Mermaid counter descriptor exceeds its token budget.");
    const start = at, quote = source[at];
    if (quote === '"' || quote === "'") {
      at++;
      let closed = false;
      while (at < source.length) {
        const char = source[at++]!;
        if (char === "\\") at++;
        else if (char === quote) {
          closed = true;
          break;
        }
      }
      if (!closed) throw new TypeError("Malformed computed counter descriptor string.");
    } else if (source[at] === ",") at++;
    else {
      while (at < source.length && !/[\s,]/.test(source[at]!) && !source.startsWith("/*", at)) {
        if (source[at++] === "\\") {
          let hex = 0;
          while (hex < 6 && /[\da-f]/i.test(source[at] ?? "")) {
            hex++;
            at++;
          }
          if (hex && /\s/.test(source[at] ?? "")) at++;
          else if (!hex) at++;
        }
      }
    }
    result.push(source.slice(start, at));
  }
  return result;
}

const identifierEscape = String.raw`\\(?:[\da-fA-F]{1,6}(?:\r\n|[\t\n\r\f ])?|[^\n\r\f])`;
const identifierFirst = `(?:[_a-zA-Z\\u0080-\\uffff]|${identifierEscape})`;
const identifierRest = `(?:[-_a-zA-Z0-9\\u0080-\\uffff]|${identifierEscape})`;
const identifier = new RegExp(`^(?:--|-?${identifierFirst})${identifierRest}*$`);

function symbol(token: string): string | undefined {
  if (token.startsWith('"') || token.startsWith("'")) return generatedContentText(token);
  // Serialized CSS identifiers can escape punctuation or a leading digit.
  // Unescaped functions, punctuation and bare numbers are not identifiers.
  if (!identifier.test(token)) return;
  const decoded = generatedContentText(`"${token}"`);
  return decoded === undefined ? undefined : checked(decoded);
}

/** Decode one computed counter identifier, never a function, string or CSS-wide keyword. */
export function generatedCounterName(token: string): string | undefined {
  if (/^["']/.test(token)) return;
  const name = symbol(token);
  return name && !/^(?:none|inherit|initial|unset|revert|revert-layer)$/i.test(name) ? name : undefined;
}

function integer(token: string): number | undefined {
  if (!/^[+-]?\d+$/.test(token)) return;
  const number = Number(token);
  return Number.isSafeInteger(number) ? number : undefined;
}

/** Parse a browser-owned CSSCounterStyleRule's descriptor strings without resources or DOM writes. */
export function generatedCounterStyle(
  descriptors: Readonly<Record<string, string>>,
): GeneratedCounterStyle | undefined {
  let units = 0;
  for (const value of Object.values(descriptors)) {
    if (typeof value !== "string") throw new TypeError("Counter descriptors must be serialized strings.");
    if (value.length > 16_384 || (units += value.length) > 65_536) {
      throw new RangeError("Mermaid counter descriptors exceed their budget.");
    }
  }
  const system = generatedCounterTokens(descriptors.system || "symbolic"), kind = system[0] as System;
  if (!["cyclic", "fixed", "symbolic", "alphabetic", "numeric", "additive", "extends"].includes(kind)) return;
  const result: GeneratedCounterStyle = { system: kind };
  if (kind === "extends") {
    if (system.length !== 2 || descriptors.symbols || descriptors["additive-symbols"]) return;
    result.extends = symbol(system[1]!);
    if (!result.extends) return;
  } else if (kind === "fixed") {
    if (system.length > 2) return;
    result.first = system.length === 1 ? 1 : integer(system[1]!);
    if (result.first === undefined) return;
  } else if (system.length !== 1) return;
  if (kind === "additive") {
    const list = generatedCounterTokens(descriptors["additive-symbols"] || ""), entries: [number, string][] = [];
    for (let at = 0; at < list.length; at += 3) {
      const pair = list.slice(at, at + 2);
      let weight = integer(pair[0] ?? ""), text = symbol(pair[1] ?? "");
      if (weight === undefined) {
        weight = integer(pair[1] ?? "");
        text = symbol(pair[0] ?? "");
      }
      if (weight === undefined || weight < 0 || text === undefined || at + 2 < list.length && list[at + 2] !== ",") {
        return;
      }
      if (entries.length && entries.at(-1)![0] <= weight) return;
      entries.push([weight, text]);
    }
    if (!entries.length) return;
    result.additive = entries;
  } else if (kind !== "extends") {
    const list = generatedCounterTokens(descriptors.symbols || ""), entries = list.map(symbol);
    if (
      entries.some((value) => value === undefined) ||
      entries.length < (["numeric", "alphabetic"].includes(kind) ? 2 : 1)
    ) return;
    result.symbols = entries as string[];
  }
  if (descriptors.range) {
    const list = generatedCounterTokens(descriptors.range);
    if (list.length === 1 && list[0] === "auto") result.range = "auto";
    else {
      const ranges: [number, number][] = [];
      for (let at = 0; at < list.length; at += 3) {
        const lo = list[at] === "infinite" ? -Infinity : integer(list[at] ?? "");
        const hi = list[at + 1] === "infinite" ? Infinity : integer(list[at + 1] ?? "");
        if (lo === undefined || hi === undefined || lo > hi || at + 2 < list.length && list[at + 2] !== ",") return;
        ranges.push([lo, hi]);
      }
      if (!ranges.length) return;
      result.range = ranges;
    }
  }
  if (descriptors.negative) {
    const signs = generatedCounterTokens(descriptors.negative).map(symbol);
    if (!signs.length || signs.length > 2 || signs.some((value) => value === undefined)) return;
    result.negative = [signs[0]!, signs[1] ?? ""];
  }
  if (descriptors.pad) {
    const pair = generatedCounterTokens(descriptors.pad);
    let length = integer(pair[0] ?? ""), text = symbol(pair[1] ?? "");
    if (length === undefined) {
      length = integer(pair[1] ?? "");
      text = symbol(pair[0] ?? "");
    }
    if (pair.length !== 2 || length === undefined || length < 0 || text === undefined) return;
    result.pad = [length, text];
  }
  if (descriptors.fallback) {
    const list = generatedCounterTokens(descriptors.fallback);
    if (list.length !== 1 || !(result.fallback = symbol(list[0]!))) return;
  }
  return result;
}

/** Expand computed counter()/counters() with supplied original values and inert style descriptors. */
export function generatedCounterFunctionValue(
  name: string,
  argumentsText: string,
  values: (name: string) => readonly number[] | undefined,
  styles: ReadonlyMap<string, GeneratedCounterStyle> = new Map(),
  profile: "standard" | "chromium" = "standard",
): string | undefined {
  if (name !== "counter" && name !== "counters") return;
  const args = generatedCounterTokens(argumentsText), plural = name === "counters";
  if (![plural ? 3 : 1, plural ? 5 : 3].includes(args.length)) return;
  if (args[0]!.startsWith('"') || args[0]!.startsWith("'")) return;
  const counterName = generatedCounterName(args[0]!);
  if (!counterName) return;
  let separator = "", style = "decimal";
  if (plural) {
    if (args[1] !== "," || !/^["']/.test(args[2]!)) return;
    const decoded = generatedContentText(args[2]!);
    if (decoded === undefined) return;
    separator = decoded;
  }
  const styleAt = plural ? 4 : 2;
  if (args.length > styleAt) {
    if (args[styleAt - 1] !== "," || /^["']/.test(args[styleAt]!)) return;
    const decoded = symbol(args[styleAt]!);
    if (!decoded || /^(?:none|inherit|initial|unset|revert|revert-layer)$/i.test(decoded)) return;
    style = decoded;
  }
  const source = values(counterName) ?? [0];
  if (source.length > 128) throw new RangeError("Mermaid counter nesting exceeds its budget.");
  const selected = source.length ? plural ? source : [source.at(-1)!] : [0];
  let result = "";
  for (let index = 0; index < selected.length; index++) {
    const text = formatGeneratedCounter(selected[index]!, style, styles, profile);
    if (text === undefined) return;
    result = checked(result + (index ? separator : "") + text);
  }
  return result;
}

/** Format counter()/counters() text; known unsupported styles stay unsupported, never invented decimal. */
export function formatGeneratedCounter(
  value: number,
  name = "decimal",
  styles: ReadonlyMap<string, GeneratedCounterStyle> = new Map(),
  profile: "standard" | "chromium" = "standard",
): string | undefined {
  if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new RangeError("Mermaid counter value exceeds its signed integer budget.");
  }
  if (name.length > 4096 || styles.size > 1024) throw new RangeError("Mermaid counter styles exceed their budget.");
  const lookup = (name: string) => {
    const authored = styles.get(name);
    if (authored) return authored;
    const key = name.toLowerCase(),
      style = profile === "chromium" ? chromiumPredefined.get(key) ?? predefined.get(key) : predefined.get(key);
    // Source-pinned Chromium 154 ua_counter_style_map.cc differs from the
    // normative stylesheet in these defaults. Other hosts keep the standard.
    if (profile === "chromium" && key === "square") return { system: "cyclic" as const, symbols: ["■"] };
    if (profile === "chromium" && ["cjk-earthly-branch", "cjk-heavenly-stem"].includes(key)) {
      return { ...style!, fallback: "cjk-decimal" };
    }
    return style;
  };
  const resolve = (name: string): GeneratedCounterStyle | undefined => {
    const chain: { name: string; style: GeneratedCounterStyle }[] = [];
    let current = name;
    while (true) {
      if (chain.length >= 128) throw new RangeError("Mermaid counter extends chain exceeds its budget.");
      const style = lookup(current);
      if (style?.unsupported) return;
      if (!style) {
        if (complex.has(current.toLowerCase())) return;
        break;
      }
      if (style.system !== "extends") {
        chain.push({ name: current, style });
        break;
      }
      const cycle = chain.findIndex((entry) => entry.name === current);
      if (cycle !== -1) {
        // Every member of an extends cycle extends decimal, not another member's
        // overrides. Parents outside the cycle still inherit the entry member.
        chain.splice(cycle + 1);
        break;
      }
      chain.push({ name: current, style });
      current = style.extends ?? "decimal";
    }
    let resolved = decimal;
    for (const entry of chain.reverse()) {
      const { system, extends: _base, ...overrides } = entry.style;
      resolved = system === "extends" ? { ...resolved, ...overrides } : entry.style;
    }
    return resolved;
  };
  const used = new Set<string>();
  let current = name;
  while (true) {
    if (used.size >= 128) throw new RangeError("Mermaid counter fallback chain exceeds its budget.");
    if (used.has(current)) return String(value);
    used.add(current);
    const style = resolve(current);
    if (!style) return;
    const { system } = style, signs = style.negative ?? ["-", ""], pad = style.pad ?? [0, ""];
    const fallsBack = () => current = style.fallback ?? "decimal";
    const range = style.range === "auto" || style.range === undefined
      ? [[system === "alphabetic" || system === "symbolic" ? 1 : system === "additive" ? 0 : -Infinity, Infinity]]
      : style.range;
    if (!range.some(([lo, hi]) => lo <= value && value <= hi) || profile === "chromium" && pad[0] > 120) {
      fallsBack();
      continue;
    }
    const negative = value < 0 && ["numeric", "alphabetic", "symbolic", "additive"].includes(system);
    let number = negative ? -value : value, representation: string | undefined = "", additiveCopies = 0;
    const symbols = style.symbols ?? [], count = symbols.length;
    const repeat = (symbol: string, copies: number): string | undefined => {
      checked(symbol);
      if (!Number.isSafeInteger(copies) || copies < 0) throw new TypeError("Malformed counter repetition.");
      if (profile === "chromium" && copies > 120) return;
      if (symbol.length * copies > limit) throw new RangeError("Mermaid counter expansion exceeds its budget.");
      return symbol.repeat(copies);
    };
    if (system === "cyclic") representation = count ? symbols[((number - 1) % count + count) % count] : undefined;
    else if (system === "fixed") representation = symbols[number - (style.first ?? 1)];
    else if (system === "symbolic") {
      representation = count && number > 0
        ? repeat(symbols[(number - 1) % count]!, Math.ceil(number / count))
        : undefined;
    } else if (system === "numeric" || system === "alphabetic") {
      if (count < 2 || system === "alphabetic" && number < 1) representation = undefined;
      else if (number === 0) representation = symbols[0]!;
      else {while (number > 0) {
          if (system === "alphabetic") number--;
          representation = checked(symbols[number % count]! + representation);
          number = Math.floor(number / count);
        }}
    } else if (system === "additive") {
      const entries = style.additive ?? [];
      if (number === 0) representation = entries.find(([weight]) => weight === 0)?.[1];
      else {
        for (const [weight, symbol] of entries) {
          if (!Number.isSafeInteger(weight) || weight < 0) throw new TypeError("Malformed counter additive weight.");
          if (!weight || weight > number) continue;
          const copies = Math.floor(number / weight), text = repeat(symbol, copies);
          additiveCopies += copies;
          if (text === undefined || profile === "chromium" && additiveCopies > 120) {
            representation = undefined;
            break;
          }
          representation = checked(representation + text);
          number -= copies * weight;
          if (!number) break;
        }
        if (number) representation = undefined;
      }
    } else throw new TypeError("Unresolved counter algorithm.");
    // Blink bounds symbol *repetitions*, not UTF-16 length of multi-character
    // symbols. Keep our independent combined-text memory limit separate.
    if (representation === undefined) {
      fallsBack();
      continue;
    }
    checked(representation);
    const length = graphemeBoundaries(representation).length - 1 +
      (negative ? graphemeBoundaries(signs[0]).length + graphemeBoundaries(signs[1]).length - 2 : 0);
    const padding = repeat(pad[1], Math.max(0, pad[0] - length));
    if (padding === undefined) {
      fallsBack();
      continue;
    }
    return checked((negative ? signs[0] : "") + padding + representation + (negative ? signs[1] : ""));
  }
}
