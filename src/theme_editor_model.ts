// Copyright 2023 Im-Beast. MIT license.

// Plan 042 slice B. Everything an editor needs to know about a theme, as pure
// functions over a ThemeDocument. No signals, no rendering, no storage: the
// document is the only state, and groups, swatches and contrast verdicts are
// all derived from it. That is what keeps the editor from growing a second
// copy of a colour that can disagree with the first.

import type { Rgb } from "./theme_expressions.ts";
import type { ThemeDocument } from "./theme_interchange.ts";
import { THEME_INTERCHANGE_VERSION } from "./theme_interchange.ts";
import { contrastRatio } from "./theme_contrast.ts";
import {
  CONTROL_TOKENS,
  controlToken,
  controlTokenChain,
  type ControlTokenGroupId,
  controlTokenGroups,
  type ControlTokenSpec,
  resolveControlToken,
} from "./theme_controls.ts";
import { themeTokenNames } from "./theme.ts";

/** WCAG AA for normal text; the line between readable and merely visible. */
export const THEME_CONTRAST_AA = 4.5;
/** WCAG AA for large text and for UI lines that carry no words. */
export const THEME_CONTRAST_AA_LARGE = 3;

/** One control token as the editor sees it. */
export interface ThemeEditorEntry {
  readonly token: ControlTokenSpec;
  /** The colour this token paints with right now. */
  readonly color: Rgb;
  /**
   * Where that colour came from: this token when the document sets it, or the
   * ancestor it inherited from. The editor shows inherited values differently,
   * because "not set" and "set to the same colour" are different edits.
   */
  readonly source: string;
  readonly inherited: boolean;
}

/** One editor group with its resolved entries. */
export interface ThemeEditorGroup {
  readonly id: ControlTokenGroupId;
  readonly label: string;
  readonly entries: readonly ThemeEditorEntry[];
}

/** A colour already used by this theme, and what uses it. */
export interface ThemeSwatch {
  readonly color: Rgb;
  readonly hex: string;
  /** Token names that resolve to this colour, most significant first. */
  readonly tokens: readonly string[];
  readonly uses: number;
}

/** The readability verdict for one foreground against its background. */
export interface ThemeContrastVerdict {
  readonly token: string;
  readonly against: string;
  readonly foreground: Rgb;
  readonly background: Rgb;
  readonly ratio: number;
  /** The ratio this pair is held to: text is 4.5, a line is 3. */
  readonly required: number;
  readonly passes: boolean;
}

/** `#rrggbb`, lowercase — the form the editor shows and accepts. */
export function formatHexColor(color: Rgb): string {
  return `#${color.map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Parses `#rgb`, `#rrggbb` or the same without the hash. Undefined for
 * anything else, so a half-typed value in an input never becomes a colour.
 */
export function parseHexColor(value: string): Rgb | undefined {
  const text = value.trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(text)) return undefined;
  if (text.length === 3) {
    const [r, g, b] = [...text].map((char) => Number.parseInt(char + char, 16));
    return [r!, g!, b!];
  }
  if (text.length !== 6) return undefined;
  return [
    Number.parseInt(text.slice(0, 2), 16),
    Number.parseInt(text.slice(2, 4), 16),
    Number.parseInt(text.slice(4, 6), 16),
  ];
}

/** An empty theme carrying only the seven core colours. */
export function createThemeDocument(name: string, core: Readonly<Record<string, Rgb>>): ThemeDocument {
  const tokens: Record<string, Rgb> = {};
  for (const token of themeTokenNames) {
    const color = core[token];
    if (color) tokens[token] = normalizeColor(color);
  }
  return Object.freeze({ version: THEME_INTERCHANGE_VERSION, name, tokens: Object.freeze(tokens) });
}

/** The document's colours, resolved for one token. */
export function themeEntry(document: ThemeDocument, name: string): ThemeEditorEntry | undefined {
  const token = controlToken(name);
  if (!token) return undefined;
  const chain = controlTokenChain(name);
  for (const candidate of chain) {
    const color = document.tokens[candidate];
    if (!color) continue;
    return { token, color, source: candidate, inherited: candidate !== name };
  }
  return undefined;
}

/** Every group with its entries; tokens the document cannot resolve are omitted. */
export function themeEditorGroups(document: ThemeDocument): readonly ThemeEditorGroup[] {
  return controlTokenGroups().map((group) => ({
    id: group.id,
    label: group.label,
    entries: group.tokens
      .map((token) => themeEntry(document, token.name))
      .filter((entry): entry is ThemeEditorEntry => entry !== undefined),
  }));
}

/**
 * Every distinct colour the theme resolves to, most used first, with the
 * tokens that use it. This is the editor's swatch strip: picking a colour you
 * have already chosen should be one keystroke, not a second trip through a
 * colour picker that lands two shades off.
 */
export function themeSwatches(document: ThemeDocument): readonly ThemeSwatch[] {
  const byHex = new Map<string, { color: Rgb; tokens: string[] }>();
  const record = (name: string, color: Rgb) => {
    const hex = formatHexColor(color);
    const entry = byHex.get(hex) ?? { color, tokens: [] };
    if (!entry.tokens.includes(name)) entry.tokens.push(name);
    byHex.set(hex, entry);
  };
  // Core tokens first so a tie orders by how fundamental the colour is.
  for (const name of themeTokenNames) {
    const color = document.tokens[name];
    if (color) record(name, color);
  }
  for (const token of CONTROL_TOKENS) {
    const color = resolveControlToken(token.name, document.tokens);
    if (color) record(token.name, color);
  }
  return [...byHex.entries()]
    .map(([hex, entry]) => ({ color: entry.color, hex, tokens: entry.tokens, uses: entry.tokens.length }))
    .sort((left, right) => right.uses - left.uses || left.hex.localeCompare(right.hex));
}

/**
 * The readability of every foreground against the background it is drawn on.
 * A theme editor that cannot tell you a pair is unreadable is a theme editor
 * that lets you ship one.
 */
export function themeContrastReport(document: ThemeDocument): readonly ThemeContrastVerdict[] {
  const verdicts: ThemeContrastVerdict[] = [];
  for (const token of CONTROL_TOKENS) {
    if (!token.against) continue;
    const foreground = resolveControlToken(token.name, document.tokens);
    const background = resolveControlToken(token.against, document.tokens);
    if (!foreground || !background) continue;
    const ratio = contrastRatio(foreground, background);
    const required = token.role === "line" ? THEME_CONTRAST_AA_LARGE : THEME_CONTRAST_AA;
    verdicts.push({
      token: token.name,
      against: token.against,
      foreground,
      background,
      ratio,
      required,
      passes: ratio + 1e-9 >= required,
    });
  }
  return verdicts;
}

/** The verdicts that failed, worst first — the editor's warning list. */
export function themeContrastFailures(document: ThemeDocument): readonly ThemeContrastVerdict[] {
  return themeContrastReport(document)
    .filter((verdict) => !verdict.passes)
    .sort((left, right) => left.ratio - right.ratio);
}

/** Sets one token, returning a new document. */
export function setThemeToken(document: ThemeDocument, name: string, color: Rgb): ThemeDocument {
  return withTokens(document, { ...document.tokens, [name]: normalizeColor(color) });
}

/**
 * Clears one token so it inherits again. A core token cannot be cleared —
 * something has to be at the end of every chain — so clearing one is a no-op
 * rather than a way to make a theme that resolves to nothing.
 */
export function clearThemeToken(document: ThemeDocument, name: string): ThemeDocument {
  if ((themeTokenNames as readonly string[]).includes(name)) return document;
  if (!(name in document.tokens)) return document;
  const tokens = { ...document.tokens };
  delete tokens[name];
  return withTokens(document, tokens);
}

/** Renames a document. */
export function renameThemeDocument(document: ThemeDocument, name: string): ThemeDocument {
  return Object.freeze({ ...document, name });
}

/** Copies a document under a new name, overrides and all. */
export function duplicateThemeDocument(document: ThemeDocument, name: string): ThemeDocument {
  return Object.freeze({ ...document, name, tokens: Object.freeze({ ...document.tokens }) });
}

/** Tokens this document sets itself, in vocabulary order: what the user changed. */
export function themeOverrides(document: ThemeDocument): readonly string[] {
  const order = [...themeTokenNames, ...CONTROL_TOKENS.map((token) => token.name)];
  const own = new Set(Object.keys(document.tokens));
  const ordered = order.filter((name) => own.has(name));
  // Anything the vocabulary does not know still belongs to the document.
  return [...ordered, ...[...own].filter((name) => !order.includes(name)).sort()];
}

/**
 * Whether the document can paint: every core token present, so every chain
 * terminates. The editor blocks a save that would produce a theme which
 * resolves to nothing.
 */
export function themeDocumentIsComplete(document: ThemeDocument): boolean {
  return themeTokenNames.every((name) => document.tokens[name] !== undefined);
}

/** The core tokens a document is missing, if any. */
export function missingCoreTokens(document: ThemeDocument): readonly string[] {
  return themeTokenNames.filter((name) => document.tokens[name] === undefined);
}

function withTokens(document: ThemeDocument, tokens: Record<string, Rgb>): ThemeDocument {
  return Object.freeze({ ...document, tokens: Object.freeze(tokens) });
}

function normalizeColor(color: Rgb): Rgb {
  return Object.freeze([clampChannel(color[0]), clampChannel(color[1]), clampChannel(color[2])]) as unknown as Rgb;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}
