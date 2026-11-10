// Copyright 2023 Im-Beast. MIT license.
// Development-only generator. The runtime uses a compact static CLDR table,
// not npm, the network, ICU bindings or the browser's private accessibility API.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const version = "48.2.0";
const url = `https://registry.npmjs.org/cldr-misc-full/-/cldr-misc-full-${version}.tgz`;
const integrity = "dSc2Tr53dQcUGwsTinamEeoP2YXOhQrIZ+SyeuUrv4MzJOSjT/Q0qkSmX11ZwfcTbYSkIqbrgALQLhAm1yf5fA==";
const output = new URL("../src/content/mermaid_quotes_data.ts", import.meta.url);
const cap = 32 * 1024 * 1024;
const response = await fetch(url);
if (!response.ok) throw new Error(`CLDR quote data download failed: ${response.status}`);
const reader = response.body!.getReader(), chunks: Uint8Array[] = [];
let bytes = 0;
try {
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((bytes += value.length) > cap) throw new RangeError("CLDR archive exceeds generator budget");
    chunks.push(value);
  }
} finally {
  await reader.cancel();
  reader.releaseLock();
}
const compressed = new Uint8Array(bytes);
let offset = 0;
for (const chunk of chunks) {
  compressed.set(chunk, offset);
  offset += chunk.length;
}
if (createHash("sha512").update(compressed).digest("base64") !== integrity) {
  throw new Error("CLDR quote archive integrity differs from reviewed 48.2.0 release");
}
const tar = gunzipSync(compressed, { maxOutputLength: cap }), decoder = new TextDecoder();
const text = (start: number, length: number) =>
  decoder.decode(tar.subarray(start, start + length)).replace(/\0.*$/s, "");
const groups = new Map<string, string[]>();
let license = "", entries = 0, locales = 0;
for (let at = 0; at + 512 <= tar.length;) {
  const name = text(at, 100);
  if (!name) break;
  const size = Number.parseInt(text(at + 124, 12).trim(), 8);
  if (!Number.isSafeInteger(size) || size < 0 || at + 512 + size > tar.length || ++entries > 10_000) {
    throw new RangeError("Malformed or excessive pinned CLDR archive");
  }
  const data = () => text(at + 512, size);
  if (/^package\/(?:LICENSE|LICENSE\.txt)$/.test(name)) license = data();
  const match = /^package\/main\/([^/]+)\/delimiters\.json$/.exec(name);
  if (match) {
    const locale = match[1]!.toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(locale)) throw new TypeError("Unexpected CLDR locale identifier");
    const parsed = JSON.parse(data());
    const delimiters = Object.values(parsed.main)[0] as { delimiters: Record<string, string> };
    const values = ["quotationStart", "quotationEnd", "alternateQuotationStart", "alternateQuotationEnd"]
      .map((key) => delimiters.delimiters[key]!);
    // Chromium's ICU quote path requires one UTF-16 unit per delimiter. The
    // source release currently meets that condition; fail rather than truncate.
    if (values.some((value) => typeof value !== "string" || value.length !== 1)) {
      throw new TypeError(`CLDR delimiter needs reviewed host behavior: ${locale}`);
    }
    const key = values.join("");
    const group = groups.get(key) ?? [];
    group.push(locale);
    groups.set(key, group);
    locales++;
  }
  at += 512 + Math.ceil(size / 512) * 512;
}
if (!license || locales < 500) throw new Error("Pinned CLDR archive lacks license or expected locale coverage");
const rows = [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([quotes, languages]) => `  [${JSON.stringify(quotes)}, ${JSON.stringify(languages.sort().join(" "))}],`);
// Browser CSS quoting is not Intl locale matching: Chromium excludes legacy
// aliases and strips delimiters from non-UI base locales. Generate that profile
// from its actual pinned ICU sources, not exceptions inferred from our oracle.
const icuRevision = "6ebb40c594776cc2c21ea14df85a2a89a328b364";
const icuArchiveURL =
  `https://chromium.googlesource.com/chromium/deps/icu/+archive/${icuRevision}/source/data/locales.tar.gz`;
// Gitiles changes gzip/tar metadata between requests. Pin the sorted filename
// and per-file SHA-512 manifest instead; every source payload still must match.
const icuArchiveHash =
  "227c53253cc32afdeac82f2a8b905ab72d39b434b5090092871d8cf1cc799f2a75d4603db393013efb23626c809a0f71c8b30e2f467e3603d28eb5aaed784cc3";
const filterURL =
  `https://chromium.googlesource.com/chromium/deps/icu/+/${icuRevision}/filters/common.json?format=TEXT`;
const filterHash =
  "32b9b0cd9a19ad0013c2dacfa86b92634c00670b6ddf03cdc7e972a9ee765613096afff23f0d40d7f4409b243b88520ab34f99122fc80be092a2f1f521e97843";
const buildURL =
  `https://chromium.googlesource.com/chromium/deps/icu/+/${icuRevision}/scripts/make_data_all.sh?format=TEXT`;
const buildHash =
  "e6d179cf4dc387832dba5b37e00cb8bc2388fba1b9a83bd8e0e8a19460ca35a78deab52431ca345885ceac388e401339722cc135807d397839437da2b859a5e6";
async function download(inputURL: string): Promise<Uint8Array> {
  const response = await fetch(inputURL);
  if (!response.ok || !response.body) throw new Error(`Pinned ICU input unavailable: ${response.status}`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((total += value.length) > cap) throw new RangeError("Pinned ICU input exceeds generator budget");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}
const [icuCompressed, filterEncoded, buildEncoded] = await Promise.all([
  download(icuArchiveURL),
  download(filterURL),
  download(buildURL),
]);
const filterText = atob(new TextDecoder().decode(filterEncoded));
const buildText = atob(new TextDecoder().decode(buildEncoded));
const observedFilterHash = createHash("sha512").update(filterText).digest("hex");
if (observedFilterHash !== filterHash) {
  throw new Error(`Pinned Chromium ICU filter differs: ${observedFilterHash}`);
}
if (
  createHash("sha512").update(buildText).digest("hex") !== buildHash ||
  !buildText.includes("-name 'en_XA*' -or -name 'ar_XB*'")
) {
  throw new Error("Pinned Chromium ICU build transformations differ");
}
const uncomment = (value: string) => value.replace(/^\s*\/\/.*$/gm, "");
const filter = JSON.parse(uncomment(filterText));
const accepted = new Set<string>(filter.localeFilter.includelist);
const stripped = new Set<string>(filter.resourceFilters.flatMap(
  (entry: { categories: string[]; files?: { includelist: string[] }; rules: string[] }) =>
    entry.categories.includes("locales_tree") && entry.rules.includes("-/*") ? entry.files!.includelist : [],
));
const icuTar = gunzipSync(icuCompressed, { maxOutputLength: cap });
const icuText = (at: number, length: number) => decoder.decode(icuTar.subarray(at, at + length)).replace(/\0.*$/s, "");
const records = new Map<string, { values: Record<string, string>; alias?: string }>();
let dependencies: { parents: Record<string, string>; aliases: Record<string, string> } | undefined;
let icuEntries = 0;
const icuManifest: [string, string][] = [];
for (let at = 0; at + 512 <= icuTar.length;) {
  const name = icuText(at, 100);
  if (!name) break;
  const size = Number.parseInt(icuText(at + 124, 12).trim(), 8);
  if (!Number.isSafeInteger(size) || size < 0 || at + 512 + size > icuTar.length || ++icuEntries > 10_000) {
    throw new RangeError("Malformed or excessive pinned ICU archive");
  }
  const type = icuText(at + 156, 1);
  if (["x", "g"].includes(type)) {
    // PAX timestamps/ownership do not change file payloads or this bounded
    // short-name archive. Never apply PAX paths or extract filesystem entries.
    at += 512 + Math.ceil(size / 512) * 512;
    continue;
  }
  if (type !== "0" && type !== "") throw new TypeError("Unexpected ICU archive entry type");
  const source = icuText(at + 512, size);
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(name)) throw new TypeError("Unexpected ICU archive path");
  icuManifest.push([name, createHash("sha512").update(icuTar.subarray(at + 512, at + 512 + size)).digest("hex")]);
  if (name === "LOCALE_DEPS.json") dependencies = JSON.parse(uncomment(source));
  const match = /^([a-zA-Z0-9_]{1,64})\.txt$/.exec(name);
  if (match) {
    const values: Record<string, string> = {};
    const block = /\bdelimiters\s*\{((?:\s*\w+\s*\{\s*"(?:\\.|[^"\\])*"\s*\})+\s*)\}/.exec(source);
    for (const value of (block?.[1] ?? "").matchAll(/(\w+)\s*\{\s*("(?:\\.|[^"\\])*")\s*\}/g)) {
      values[value[1]!] = JSON.parse(value[2]!);
    }
    records.set(match[1]!, { values, alias: /%%ALIAS\s*\{\s*"([^"]+)"/.exec(source)?.[1] });
  }
  at += 512 + Math.ceil(size / 512) * 512;
}
const observedArchiveHash = createHash("sha512").update(
  icuManifest.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, hash]) => name + "\0" + hash).join("\n"),
).digest("hex");
if (observedArchiveHash !== icuArchiveHash) {
  throw new Error(`Pinned ICU source manifest differs: ${observedArchiveHash}`);
}
if (!dependencies || records.size < 500 || stripped.size < 50) throw new Error("Pinned ICU source coverage differs");
const available = new Set([...records.keys()].filter((locale) =>
  accepted.has(locale.split("_")[0]!) &&
  !["en_XA", "ar_XB"].includes(locale) &&
  !records.get(locale)!.alias && !dependencies!.aliases[locale]
));
const browserGroups = new Map<string, string[]>();
const resolveDelimiter = (locale: string, key: string, seen = new Set<string>()): string => {
  if (seen.has(locale) || seen.size > 32) throw new RangeError("Pinned ICU quote inheritance is cyclic/excessive");
  seen.add(locale);
  const record = records.get(locale);
  if (!record) throw new Error(`Missing ICU parent: ${locale}`);
  if (record.alias) return resolveDelimiter(record.alias, key, seen);
  const value = stripped.has(locale) ? undefined : record.values[key];
  if (value !== undefined) {
    return value;
  }
  if (locale === "root") throw new Error(`Missing ICU root delimiter: ${key}`);
  return resolveDelimiter(
    dependencies!.parents[locale] ?? (locale.includes("_") ? locale.slice(0, locale.lastIndexOf("_")) : "root"),
    key,
    seen,
  );
};
for (const locale of available) {
  const values = ["quotationStart", "quotationEnd", "alternateQuotationStart", "alternateQuotationEnd"]
    .map((key) => resolveDelimiter(locale, key));
  // Blink rejects a locale with any non-single-UTF16 delimiter, then retries
  // without its last subtag. ICU's synthetic en_XA is such a real source case.
  if (values.some((value) => value.length !== 1)) continue;
  const key = values.join("");
  const group = browserGroups.get(key) ?? [];
  group.push(locale.toLowerCase().replaceAll("_", "-"));
  browserGroups.set(key, group);
}
const browserRows = [...browserGroups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .map(([quotes, locales]) => `  [${JSON.stringify(quotes)}, ${JSON.stringify(locales.sort().join(" "))}],`);
await Deno.writeTextFile(
  output,
  `// Generated from cldr-misc-full ${version}, SHA-512 ${integrity}\n` +
    `// Compact delimiter-only transformation; regenerate with scripts/update_mermaid_quotes.ts.\n` +
    `// ${locales} locale records, ${groups.size} quote sets; no runtime network/dependency.\n` +
    `/*\n${license.replaceAll("*/", "* /").trim()}\n*/\n` +
    `export const MERMAID_AUTO_QUOTE_DATA: readonly (readonly [string, string])[] = [\n${rows.join("\n")}\n];\n` +
    `// Chromium common ICU 78.2 at ${icuRevision}; Unicode delimiter data, filtered as shipped.\n` +
    `// Sources: ${icuArchiveURL}\n// Filter: ${filterURL}\n` +
    `// Build: ${buildURL}; SHA-512 ${buildHash}.\n` +
    `// SHA-512 source manifest ${icuArchiveHash}; filter ${filterHash}.\n` +
    `export const MERMAID_CHROMIUM_QUOTE_DATA: readonly (readonly [string, string])[] = [\n${
      browserRows.join("\n")
    }\n];\n`,
);
console.log(`Generated CLDR ${version} quotes: ${locales} locales / ${groups.size} sets.`);
console.log(
  `Generated Chromium ICU quotes: ${
    [...browserGroups.values()].reduce((n, values) => n + values.length, 0)
  } usable locales / ${browserGroups.size} sets (${available.size} available resources).`,
);
