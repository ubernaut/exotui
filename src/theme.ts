// Copyright 2023 Im-Beast. MIT license.
import { Computed, Signal } from "./signals/mod.ts";
import type { AsyncStore } from "./runtime/storage.ts";
import { componentCatalog, type ComponentCatalogEntry } from "./components/catalog.ts";
import { orderedSubset, uniqueSortedStrings } from "./utils/collections.ts";
import { escapeMarkdownCell } from "./utils/formatting.ts";
/** Function that's supposed to return styled text given string as parameter */
export type Style = (text: string) => string;

/** Public type alias for an ansi Color Name. */
export type AnsiColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "brightBlack"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite";

/** Public type alias for an ansi Rgb Color. */
export type AnsiRgbColor = readonly [red: number, green: number, blue: number];

/** Public type alias for an ansi Color. */
export type AnsiColor = AnsiColorName | AnsiRgbColor | number;

/** Public type alias for an ansi Style Spec. */
export type AnsiStyleSpec = {
  foreground?: AnsiColor;
  background?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
};

const ANSI_COLOR_NAMES: readonly AnsiColorName[] = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];

function emptyStyleInternal(text: string): string {
  return text;
}

/** Used as placeholder style when one is not supplied, returns the input */
export const emptyStyle: Style = emptyStyleInternal;

function replaceEmptyStyleInternal(style: Style, replacement: Style): Style {
  return style === emptyStyleInternal ? replacement : style;
}

/** Returns {replacement} if {style} is an {emptyStyle} otherwise returns {style} back */
export function replaceEmptyStyle(style: Style, replacement: Style): Style {
  return replaceEmptyStyleInternal(style, replacement);
}

const FOCUS_CUE_OPEN = "\x1b[7m";
const FOCUS_CUE_CLOSE = "\x1b[27m";

/**
 * Wraps a style with reverse video, the conventional terminal focus cue. Used as
 * the default focused/active look for a component whose theme does not otherwise
 * distinguish focus, so which control is focused is always visible. Reverse
 * video is additive — it keeps the base colors and just swaps them — and reads
 * clearly whether or not the base sets a background.
 */
export function withFocusCue(base: Style): Style {
  return (value) => `${FOCUS_CUE_OPEN}${base(value)}${FOCUS_CUE_CLOSE}`;
}

function createAnsiStyleInternal(spec: AnsiStyleSpec): Style {
  const codes = ansiStyleCodes(spec);
  if (codes.length === 0) return emptyStyleInternal;
  const open = `\x1b[${codes.join(";")}m`;
  return (value) => `${open}${value}\x1b[0m`;
}

/** Creates an ansi Style. */
export function createAnsiStyle(spec: AnsiStyleSpec): Style {
  return createAnsiStyleInternal(spec);
}

function createAnsiStyleMap<TokenName extends string>(
  specs: Partial<Record<TokenName, AnsiStyleSpec>>,
): Partial<Record<TokenName, Style>> {
  const styles: Partial<Record<TokenName, Style>> = {};
  for (const [name, spec] of Object.entries(specs) as [TokenName, AnsiStyleSpec][]) {
    styles[name] = createAnsiStyleInternal(spec);
  }
  return styles;
}

function ansiStyleCodes(spec: AnsiStyleSpec): number[] {
  const codes: number[] = [];
  if (spec.bold) codes.push(1);
  if (spec.dim) codes.push(2);
  if (spec.italic) codes.push(3);
  if (spec.underline) codes.push(4);
  if (spec.inverse) codes.push(7);
  if (spec.strikethrough) codes.push(9);
  if (spec.foreground !== undefined) codes.push(...ansiColorCodes(spec.foreground, false));
  if (spec.background !== undefined) codes.push(...ansiColorCodes(spec.background, true));
  return codes;
}

function ansiColorCodes(color: AnsiColor, background: boolean): number[] {
  if (typeof color === "number") {
    return [background ? 48 : 38, 5, clampAnsiByte(color)];
  }
  if (typeof color !== "string") {
    const [red, green, blue] = color;
    return [background ? 48 : 38, 2, clampAnsiByte(red), clampAnsiByte(green), clampAnsiByte(blue)];
  }
  return [ansiNamedColorCode(color, background)];
}

function ansiNamedColorCode(color: AnsiColorName, background: boolean): number {
  const index = ANSI_COLOR_NAMES.indexOf(color);
  const base = background ? 40 : 30;
  return index < 8 ? base + index : base + 60 + index - 8;
}

function clampAnsiByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Public type alias for an ansi Theme Token Specs. */
export type AnsiThemeTokenSpecs = Partial<Record<ThemeTokenName, AnsiStyleSpec>>;

/** Creates an ansi Theme Tokens. */
export function createAnsiThemeTokens(specs: AnsiThemeTokenSpecs): Partial<ThemeTokens> {
  return createAnsiStyleMap(specs) as Partial<ThemeTokens>;
}

function hierarchizeThemeCore(input: Partial<Theme> = {}): Theme {
  input.base ??= emptyStyleInternal;
  input.disabled ??= input.base;
  // With no focused look of its own, a control defaults to a reverse-video focus
  // cue over its base so which control has focus is always visible. Passing
  // `focused` explicitly — even equal to `base` — opts out of the cue.
  input.focused ??= withFocusCue(input.base);
  input.active ??= input.focused;

  const output = input as Theme & Record<string, Theme>;
  for (const key in output) {
    if (key === "base" || key === "focused" || key === "active" || key === "disabled" || output === output[key]) {
      continue;
    }
    output[key] = hierarchizeThemeCore(output[key]);
  }

  return output;
}

/** Applies default values to properties (lower one hierarchy or `emptyStyle`) that aren't set */
export function hierarchizeTheme(input: Partial<Theme> = {}): Theme {
  return hierarchizeThemeCore(input);
}

/** Base theme used to style components, can be expanded upon */
export interface Theme {
  /** Default style */
  base: Style;
  /** Style when component is focused */
  focused: Style;
  /** Style when component is active */
  active: Style;
  /** Style when component is disabled */
  disabled: Style;
}

/** Public interface describing a theme Tokens. */
export interface ThemeTokens {
  foreground: Style;
  muted: Style;
  accent: Style;
  success: Style;
  warning: Style;
  danger: Style;
  surface: Style;
}

/** Public type alias for a theme Token Name. */
export type ThemeTokenName = keyof ThemeTokens;
/** Public constant for a theme Token Names. */
export const themeTokenNames: readonly [
  "foreground",
  "muted",
  "accent",
  "success",
  "warning",
  "danger",
  "surface",
] = [
  "foreground",
  "muted",
  "accent",
  "success",
  "warning",
  "danger",
  "surface",
] as const satisfies readonly ThemeTokenName[];
/** Public type alias for a theme Style Reference. */
export type ThemeStyleReference = Style | ThemeTokenName | readonly ThemeStyleReference[];
/** Public type alias for a theme State Definition. */
export type ThemeStateDefinition = Partial<Record<ThemeState, ThemeStyleReference>>;

/** Public type alias for a theme Manifest Style Reference. */
export type ThemeManifestStyleReference =
  | string
  | AnsiStyleSpec
  | readonly ThemeManifestStyleReference[];
/** Public type alias for a theme Manifest State Definition. */
export type ThemeManifestStateDefinition = Partial<Record<ThemeState, ThemeManifestStyleReference>>;

/** Public interface describing a theme Manifest Component Definition. */
export interface ThemeManifestComponentDefinition {
  extends?: string | readonly string[];
  base?: ThemeManifestStateDefinition;
  variants?: Record<string, ThemeManifestStateDefinition>;
}

/** Options for configuring theme Manifest. */
export interface ThemeManifestOptions {
  tokens?: Partial<Record<ThemeTokenName, AnsiStyleSpec>>;
  components?: Record<string, ThemeManifestComponentDefinition>;
}

/** Creates an theme. */
export function createTheme(tokens: Partial<ThemeTokens> = {}): Theme & { tokens: ThemeTokens } {
  return createThemeCore(tokens);
}

function createThemeCore(tokens: Partial<ThemeTokens> = {}): Theme & { tokens: ThemeTokens } {
  const fallback = tokens.foreground ?? emptyStyleInternal;
  return {
    base: fallback,
    focused: tokens.accent ?? fallback,
    active: tokens.success ?? tokens.accent ?? fallback,
    disabled: tokens.muted ?? fallback,
    tokens: {
      foreground: fallback,
      muted: tokens.muted ?? fallback,
      accent: tokens.accent ?? fallback,
      success: tokens.success ?? fallback,
      warning: tokens.warning ?? fallback,
      danger: tokens.danger ?? fallback,
      surface: tokens.surface ?? emptyStyleInternal,
    },
  };
}

/** Public type alias for a theme State. */
export type ThemeState = keyof Theme;
/** Public constant for a theme States. */
export const themeStates: readonly ["base", "focused", "active", "disabled"] = [
  "base",
  "focused",
  "active",
  "disabled",
];

/** Public interface describing a component Theme Definition. */
export interface ComponentThemeDefinition {
  extends?: string | readonly string[];
  base?: ThemeStateDefinition;
  variants?: Record<string, ThemeStateDefinition>;
}

/** Options for configuring theme Engine. */
export interface ThemeEngineOptions {
  tokens?: Partial<ThemeTokens>;
  components?: Record<string, ComponentThemeDefinition>;
}

/** Public interface describing a theme Layer. */
export interface ThemeLayer {
  id: string;
  label?: string;
  enabled?: boolean;
  options: ThemeEngineOptions;
}

/** Serializable inspection snapshot for theme Layer. */
export interface ThemeLayerInspection {
  id: string;
  label: string;
  enabled: boolean;
  components: ThemeComponentInspection[];
}

/** Serializable inspection snapshot for theme Component. */
export interface ThemeComponentInspection {
  name: string;
  variants: string[];
}

/** Serializable inspection snapshot for theme. */
export interface ThemeInspection {
  tokens: Array<keyof ThemeTokens>;
  components: ThemeComponentInspection[];
}

/** Serializable inspection snapshot for theme Variant Coverage. */
export interface ThemeVariantCoverageInspection {
  name: string;
  states: ThemeState[];
  missingStates: ThemeState[];
  complete: boolean;
}

/** Serializable inspection snapshot for theme Component Coverage. */
export interface ThemeComponentCoverageInspection {
  name: string;
  extends: string[];
  variants: ThemeVariantCoverageInspection[];
  stateCount: number;
  coveredStateCount: number;
  missingStateCount: number;
  complete: boolean;
}

/** Serializable inspection snapshot for theme Coverage. */
export interface ThemeCoverageInspection {
  componentCount: number;
  variantCount: number;
  stateCount: number;
  coveredStateCount: number;
  missingStateCount: number;
  complete: boolean;
  components: ThemeComponentCoverageInspection[];
}

/** Options for configuring theme Coverage. */
export interface ThemeCoverageOptions {
  components?: Iterable<string>;
  variants?: (component: string, definition: ComponentThemeDefinition) => Iterable<string>;
}

/** Options for creating the library-standard component theme definitions. */
export interface StandardComponentThemeOptions {
  components?: Iterable<string>;
}

/** Serializable audit result for standard component theme coverage. */
export interface ThemeStandardizationInspection {
  expectedComponents: string[];
  themedComponents: string[];
  missingComponents: string[];
  extraComponents: string[];
  coverage: ThemeCoverageInspection;
  complete: boolean;
}

/** Identifier union for theme Validation Issue variants. */
export type ThemeValidationIssueKind =
  | "unknown-token"
  | "unknown-component"
  | "inheritance-cycle";

/** Public interface describing a theme Validation Issue. */
export interface ThemeValidationIssue {
  kind: ThemeValidationIssueKind;
  path: string;
  message: string;
  component?: string;
  variant?: string;
  state?: ThemeState;
  reference?: string;
}

/** Public interface describing a theme Style Preview. */
export interface ThemeStylePreview {
  raw: string;
  styled: string;
}

/** Public interface describing a theme Token Diff. */
export interface ThemeTokenDiff {
  token: ThemeTokenName;
  before: ThemeStylePreview;
  after: ThemeStylePreview;
}

/** Public interface describing a theme Component State Diff. */
export interface ThemeComponentStateDiff {
  component: string;
  variant: string;
  state: ThemeState;
  before: ThemeStylePreview;
  after: ThemeStylePreview;
}

/** Public interface describing a theme Engine Diff. */
export interface ThemeEngineDiff {
  sample: string;
  tokens: ThemeTokenDiff[];
  components: ThemeComponentStateDiff[];
}

/** Options for configuring theme Engine Diff. */
export interface ThemeEngineDiffOptions {
  sample?: string;
  components?: Iterable<string>;
  variants?: (component: string, engines: readonly [ThemeEngine, ThemeEngine]) => Iterable<string>;
  includeUnchanged?: boolean;
}

/** Serializable inspection snapshot for theme Manifest Variant. */
export interface ThemeManifestVariantInspection {
  name: string;
  states: ThemeState[];
}

/** Serializable inspection snapshot for theme Manifest Component. */
export interface ThemeManifestComponentInspection {
  name: string;
  extends: string[];
  states: ThemeState[];
  variants: ThemeManifestVariantInspection[];
}

/** Serializable inspection snapshot for theme Manifest. */
export interface ThemeManifestInspection {
  id: string;
  label: string;
  palette: ThemePaletteName;
  tokens: ThemeTokenName[];
  components: ThemeManifestComponentInspection[];
  issues: ThemeValidationIssue[];
}

/** Public interface describing a theme Manifest Token Preview. */
export interface ThemeManifestTokenPreview {
  token: ThemeTokenName;
  preview: ThemeStylePreview;
}

/** Public interface describing a theme Manifest Component State Preview. */
export interface ThemeManifestComponentStatePreview {
  component: string;
  variant: string;
  state: ThemeState;
  preview: ThemeStylePreview;
}

/** Public interface describing a theme Manifest Preview. */
export interface ThemeManifestPreview {
  sample: string;
  manifest: ThemeManifestInspection;
  tokens: ThemeManifestTokenPreview[];
  components: ThemeManifestComponentStatePreview[];
}

/** Options for configuring theme Manifest Preview. */
export interface ThemeManifestPreviewOptions {
  sample?: string;
  components?: Iterable<string>;
  variants?: (component: string, engine: ThemeEngine) => Iterable<string>;
  states?: Iterable<ThemeState>;
  tokens?: Iterable<ThemeTokenName>;
}

/** Public interface describing a theme Provider Token Preview. */
export interface ThemeProviderTokenPreview {
  token: ThemeTokenName;
  preview: ThemeStylePreview;
}

/** Public interface describing a theme Provider Component State Preview. */
export interface ThemeProviderComponentStatePreview {
  component: string;
  variant: string;
  state: ThemeState;
  preview: ThemeStylePreview;
}

/** Public interface describing a theme Provider Preview. */
export interface ThemeProviderPreview {
  sample: string;
  activeId: string;
  activeLayers: string[];
  catalog: ThemeCatalog;
  tokens: ThemeProviderTokenPreview[];
  components: ThemeProviderComponentStatePreview[];
}

/** Options for configuring theme Provider Preview. */
export interface ThemeProviderPreviewOptions {
  sample?: string;
  components?: Iterable<string>;
  variants?: (component: string, engine: ThemeEngine) => Iterable<string>;
  states?: Iterable<ThemeState>;
  tokens?: Iterable<ThemeTokenName>;
}

/** Source bucket for a validation issue surfaced by a theme provider report. */
export type ThemeProviderReportIssueSource = "theme" | "layer";

/** Validation issue annotated with the provider source that produced it. */
export interface ThemeProviderReportIssue extends ThemeValidationIssue {
  source: ThemeProviderReportIssueSource;
  sourceId: string;
}

/** Aggregate provider report counts for settings screens, docs, and CI summaries. */
export interface ThemeProviderReportSummary {
  themeCount: number;
  layerCount: number;
  activeLayerCount: number;
  componentCount: number;
  variantCount: number;
  issueCount: number;
  missingStateCount: number;
  completeCoverage: boolean;
}

/** Combined theme provider catalog, preview, coverage, and diagnostics snapshot. */
export interface ThemeProviderReport {
  title: string;
  activeId: string;
  activeLayers: string[];
  catalog: ThemeCatalog;
  preview?: ThemeProviderPreview;
  coverage?: ThemeCoverageInspection;
  issues: ThemeProviderReportIssue[];
  summary: ThemeProviderReportSummary;
}

/** Options for creating or formatting a theme provider report. */
export interface ThemeProviderReportOptions {
  title?: string;
  preview?: ThemeProviderPreviewOptions | false;
  coverage?: ThemeCoverageOptions | false;
}

/** Public type alias for a theme Palette Name. */
export type ThemePaletteName = "plain" | "neon" | "terminal";
/** Built-in palette id or custom palette definition accepted by theme engines. */
export type ThemePaletteReference = ThemePaletteName | ThemePalette;

/** Named semantic token set used to seed a theme engine. */
export interface ThemePalette {
  id: string;
  label?: string;
  tokens: Partial<ThemeTokens>;
}

/** Serializable palette metadata for inspectors and settings UIs. */
export interface ThemePaletteInspection {
  id: string;
  label: string;
  tokens: ThemeTokenName[];
}

const themePalettesInternal: Record<ThemePaletteName, Partial<ThemeTokens>> = {
  plain: {
    foreground: emptyStyleInternal,
    muted: emptyStyleInternal,
    accent: emptyStyleInternal,
    success: emptyStyleInternal,
    warning: emptyStyleInternal,
    danger: emptyStyleInternal,
    surface: emptyStyleInternal,
  },
  neon: {
    ...createAnsiStyleMap<ThemeTokenName>({
      foreground: { foreground: [230, 255, 246] },
      muted: { foreground: [104, 124, 132] },
      accent: { foreground: [31, 231, 210] },
      success: { foreground: [156, 255, 58] },
      warning: { foreground: [255, 196, 87] },
      danger: { foreground: [255, 79, 216] },
      surface: { background: [7, 16, 23] },
    }),
  },
  terminal: {
    ...createAnsiStyleMap<ThemeTokenName>({
      foreground: { foreground: "white" },
      muted: { foreground: "brightBlack" },
      accent: { foreground: "cyan" },
      success: { foreground: "green" },
      warning: { foreground: "yellow" },
      danger: { foreground: "red" },
    }),
    surface: emptyStyleInternal,
  },
};

/** Public constant for a theme Palettes. */
export const themePalettes: Record<ThemePaletteName, Partial<ThemeTokens>> = themePalettesInternal;

/** Registry for built-in and custom semantic token palettes. */
export class ThemePaletteRegistry {
  readonly #palettes = new Map<string, ThemePalette>();
  #ids: string[] | undefined;

  /** Creates a registry and optionally registers initial palettes. */
  constructor(palettes: Iterable<ThemePalette | ThemePaletteName> = defaultThemePaletteDefinitions()) {
    for (const palette of palettes) {
      this.register(palette);
    }
  }

  /** Registers or replaces a palette by id. */
  register(palette: ThemePalette | ThemePaletteName): this {
    const normalized = normalizeThemePaletteInternal(palette);
    this.#palettes.set(normalized.id, normalized);
    this.#ids = undefined;
    return this;
  }

  /** Removes a palette by id. */
  unregister(id: string): boolean {
    const deleted = this.#palettes.delete(id);
    if (deleted) this.#ids = undefined;
    return deleted;
  }

  /** Returns whether a palette id is registered. */
  has(id: string): boolean {
    return this.#palettes.has(id);
  }

  /** Looks up a palette by id and returns a defensive copy. */
  get(id: string): ThemePalette | undefined {
    const palette = this.#palettes.get(id);
    return palette
      ? {
        ...palette,
        tokens: { ...palette.tokens },
      }
      : undefined;
  }

  /** Returns registered palette ids in stable order. */
  ids(): string[] {
    return [...this.#sortedIds()];
  }

  /** Returns palette tokens or throws when the id is unknown. */
  tokens(id: string): Partial<ThemeTokens> {
    const palette = this.get(id);
    if (!palette) {
      throw new ThemePaletteNotFoundError(id);
    }
    return palette.tokens;
  }

  /** Builds a theme engine from a registered palette and optional overrides. */
  engine(id: string, options: ThemeEngineOptions = {}): ThemeEngine {
    return createThemeEngineFromPalette(this.tokens(id), options);
  }

  /** Returns serializable palette metadata. */
  inspect(): ThemePaletteInspection[] {
    const ids = this.#sortedIds();
    const inspections = new Array<ThemePaletteInspection>(ids.length);
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]!;
      const palette = this.#palettes.get(id)!;
      inspections[index] = {
        id,
        label: palette.label ?? id,
        tokens: orderedSubset(Object.keys(palette.tokens), themeTokenNames),
      };
    }
    return inspections;
  }

  #sortedIds(): readonly string[] {
    if (!this.#ids) {
      this.#ids = [...this.#palettes.keys()].sort();
    }
    return this.#ids;
  }
}

/** Error thrown when a palette registry lookup targets an unknown id. */
export class ThemePaletteNotFoundError extends Error {
  constructor(id: string) {
    super(`Theme palette "${id}" is not registered`);
    this.name = "ThemePaletteNotFoundError";
  }
}

function defaultThemePaletteDefinitionsInternal(): ThemePalette[] {
  return (Object.entries(themePalettesInternal) as [ThemePaletteName, Partial<ThemeTokens>][]).map(([id, tokens]) => ({
    id,
    label: titleCaseThemePaletteId(id),
    tokens,
  }));
}

function normalizeThemePaletteInternal(palette: ThemePalette | ThemePaletteName): ThemePalette {
  if (typeof palette === "string") {
    return {
      id: palette,
      label: titleCaseThemePaletteId(palette),
      tokens: { ...themePalettesInternal[palette] },
    };
  }
  return {
    ...palette,
    tokens: { ...palette.tokens },
  };
}

function resolveThemePaletteTokensInternal(palette: ThemePaletteReference): Partial<ThemeTokens> {
  return typeof palette === "string" ? themePalettesInternal[palette] : palette.tokens;
}

function themePaletteIdInternal(palette: ThemePaletteReference): string {
  return typeof palette === "string" ? palette : palette.id;
}

function titleCaseThemePaletteId(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function mergeComponentThemeDefinitionCore(
  base: ComponentThemeDefinition = {},
  extension: ComponentThemeDefinition = {},
): ComponentThemeDefinition {
  const variants = { ...(base.variants ?? {}) };
  for (const [name, variant] of Object.entries(extension.variants ?? {})) {
    variants[name] = {
      ...(variants[name] ?? {}),
      ...variant,
    };
  }

  return {
    extends: mergeThemeExtends(base.extends, extension.extends),
    base: {
      ...(base.base ?? {}),
      ...(extension.base ?? {}),
    },
    variants,
  };
}

function composeStylesCore(...styles: Style[]): Style {
  let first: Style | undefined;
  let active: Style[] | undefined;
  for (const style of styles) {
    if (style === emptyStyleInternal) continue;
    if (!first) {
      first = style;
    } else {
      active ??= [first];
      active.push(style);
    }
  }
  if (!first) return emptyStyleInternal;
  if (!active) return first;
  return (value) => {
    let output = value;
    for (let index = 0; index < active.length; index += 1) {
      output = active[index]!(output);
    }
    return output;
  };
}

function resolveThemeStyleReferenceCore(reference: ThemeStyleReference, tokens: ThemeTokens): Style {
  if (isThemeStyleReferencePipeline(reference)) {
    return composeStylesCore(...reference.map((part) => resolveThemeStyleReferenceCore(part, tokens)));
  }
  return typeof reference === "string" ? tokens[reference] : reference;
}

function resolveThemeStateDefinitionCore(
  definition: ThemeStateDefinition = {},
  tokens: ThemeTokens,
): Partial<Theme> {
  const resolved: Partial<Theme> = {};
  for (const [state, reference] of Object.entries(definition) as [ThemeState, ThemeStyleReference][]) {
    if (reference === undefined) continue;
    resolved[state] = resolveThemeStyleReferenceCore(reference, tokens);
  }
  return resolved;
}

function composeThemeOptionsCore(...options: ThemeEngineOptions[]): ThemeEngineOptions {
  const tokens: Partial<ThemeTokens> = {};
  const components: Record<string, ComponentThemeDefinition> = {};

  for (const option of options) {
    Object.assign(tokens, option.tokens ?? {});
    for (const [name, definition] of Object.entries(option.components ?? {})) {
      components[name] = mergeComponentThemeDefinitionCore(components[name], definition);
    }
  }

  return { tokens, components };
}

function mergeThemeExtends(
  base: string | readonly string[] | undefined,
  extension: string | readonly string[] | undefined,
): string | readonly string[] | undefined {
  const names = [...normalizeThemeExtends(base), ...normalizeThemeExtends(extension)];
  return names.length === 0 ? undefined : [...new Set(names)];
}

function normalizeThemeExtends(value: string | readonly string[] | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : [...value];
}

function isThemeStyleReferencePipeline(
  reference: ThemeStyleReference,
): reference is readonly ThemeStyleReference[] {
  return Array.isArray(reference);
}

/** Public helper for merge Component Theme Definition. */
export function mergeComponentThemeDefinition(
  base: ComponentThemeDefinition = {},
  extension: ComponentThemeDefinition = {},
): ComponentThemeDefinition {
  return mergeComponentThemeDefinitionCore(base, extension);
}

/** Public helper for compose Styles. */
export function composeStyles(...styles: Style[]): Style {
  return composeStylesCore(...styles);
}

/** Resolves theme Style Reference from the provided inputs. */
export function resolveThemeStyleReference(reference: ThemeStyleReference, tokens: ThemeTokens): Style {
  return resolveThemeStyleReferenceCore(reference, tokens);
}

/** Resolves theme State Definition from the provided inputs. */
export function resolveThemeStateDefinition(
  definition: ThemeStateDefinition = {},
  tokens: ThemeTokens,
): Partial<Theme> {
  return resolveThemeStateDefinitionCore(definition, tokens);
}

/** Public helper for compose Theme Options. */
export function composeThemeOptions(...options: ThemeEngineOptions[]): ThemeEngineOptions {
  return composeThemeOptionsCore(...options);
}

const standardComponentEntries = [...componentCatalog].sort((a, b) => a.name.localeCompare(b.name));
const standardComponentNames = standardComponentEntries.map((entry) => entry.name);
const standardComponentKeySet = new Set(
  standardComponentEntries.flatMap((
    entry,
  ) => [normalizeThemeComponentName(entry.id), normalizeThemeComponentName(entry.name)]),
);

/** Returns the canonical component names covered by the standard theme preset. */
export function standardThemeComponentNames(): string[] {
  return Array.from(standardComponentNames);
}

/** Creates component theme definitions for the built-in widget catalog. */
export function createStandardComponentThemeDefinitions(
  options: StandardComponentThemeOptions = {},
): Record<string, ComponentThemeDefinition> {
  const requested = options.components ? new Set([...options.components].map(normalizeThemeComponentName)) : undefined;
  const definitions: Record<string, ComponentThemeDefinition> = {};

  for (const entry of standardComponentEntries) {
    if (
      requested && !requested.has(normalizeThemeComponentName(entry.id)) &&
      !requested.has(normalizeThemeComponentName(entry.name))
    ) {
      continue;
    }
    definitions[entry.name] = standardComponentDefinition(entry);
  }

  if (requested) {
    for (const name of options.components ?? []) {
      if (!standardComponentKeySet.has(normalizeThemeComponentName(name))) {
        definitions[name] = standardGenericComponentDefinition();
      }
    }
  }

  return definitions;
}

/** Composes user options on top of the standard component theme definitions. */
export function composeStandardThemeOptions(options: ThemeEngineOptions = {}): ThemeEngineOptions {
  return composeThemeOptions({ components: createStandardComponentThemeDefinitions() }, options);
}

/** Audits whether a theme option set covers the standard widget component surface. */
export function inspectThemeStandardization(
  options: ThemeEngineOptions,
  coverageOptions: ThemeCoverageOptions = {},
): ThemeStandardizationInspection {
  const expectedComponents = [...(coverageOptions.components ?? standardThemeComponentNames())].sort((a, b) =>
    a.localeCompare(b)
  );
  const expected = new Set(expectedComponents);
  const themedComponents = Object.keys(composeThemeOptions(options).components ?? {}).sort((a, b) =>
    a.localeCompare(b)
  );
  const coverage = inspectThemeCoverage(options, { ...coverageOptions, components: expectedComponents });

  return {
    expectedComponents,
    themedComponents,
    missingComponents: expectedComponents.filter((name) => !themedComponents.includes(name)),
    extraComponents: themedComponents.filter((name) => !expected.has(name)),
    coverage,
    complete: coverage.complete && expectedComponents.every((name) => themedComponents.includes(name)),
  };
}

function standardComponentDefinition(entry: ComponentCatalogEntry): ComponentThemeDefinition {
  if (entry.name === "Button") return standardInteractiveComponentDefinition();
  if (entry.name === "Frame" || entry.name === "Box" || entry.name === "WindowManager") {
    return standardSurfaceComponentDefinition();
  }
  if (entry.category === "data") return standardDataComponentDefinition();
  if (entry.category === "input" || entry.capabilities.includes("selection")) {
    return standardInteractiveComponentDefinition();
  }
  if (entry.category === "overlay") return standardOverlayComponentDefinition();
  if (entry.category === "feedback" || entry.category === "visualization") return standardFeedbackComponentDefinition();
  if (entry.category === "navigation" || entry.category === "layout") return standardSurfaceComponentDefinition();
  return standardGenericComponentDefinition();
}

function standardGenericComponentDefinition(): ComponentThemeDefinition {
  return {
    base: {
      base: "foreground",
      focused: "accent",
      active: "success",
      disabled: "muted",
    },
    variants: {
      muted: { base: "muted" },
      danger: { base: "danger" },
      warning: { base: "warning" },
      success: { base: "success" },
    },
  };
}

function standardSurfaceComponentDefinition(): ComponentThemeDefinition {
  return {
    base: {
      base: ["surface", "foreground"],
      focused: ["surface", "accent"],
      active: ["surface", "success"],
      disabled: ["surface", "muted"],
    },
    variants: {
      chrome: { base: ["surface", "accent"], active: ["surface", "success"] },
      quiet: { base: "muted", focused: "accent" },
      danger: { base: ["surface", "danger"], focused: ["surface", "warning"] },
    },
  };
}

function standardInteractiveComponentDefinition(): ComponentThemeDefinition {
  return {
    base: {
      base: ["surface", "foreground"],
      focused: ["surface", "accent"],
      active: ["surface", "success"],
      disabled: ["surface", "muted"],
    },
    variants: {
      primary: { base: ["surface", "accent"], active: ["surface", "success"] },
      quiet: { base: "muted", focused: "accent" },
      danger: { base: "danger", focused: "warning", active: "danger" },
      warning: { base: "warning", focused: "accent", active: "warning" },
      success: { base: "success", focused: "accent", active: "success" },
    },
  };
}

function standardDataComponentDefinition(): ComponentThemeDefinition {
  return {
    base: {
      base: "foreground",
      focused: "accent",
      active: ["surface", "foreground"],
      disabled: "muted",
    },
    variants: {
      header: { base: ["surface", "accent"], active: ["surface", "success"] },
      selected: { base: ["surface", "foreground"], focused: ["surface", "accent"], active: ["surface", "success"] },
      stale: { base: "warning", focused: "accent" },
      danger: { base: "danger", focused: "warning" },
    },
  };
}

function standardOverlayComponentDefinition(): ComponentThemeDefinition {
  return {
    base: {
      base: ["surface", "foreground"],
      focused: ["surface", "accent"],
      active: ["surface", "success"],
      disabled: ["surface", "muted"],
    },
    variants: {
      palette: { base: ["surface", "foreground"], focused: ["surface", "accent"], active: ["surface", "success"] },
      warning: { base: ["surface", "warning"], focused: ["surface", "accent"] },
      danger: { base: ["surface", "danger"], focused: ["surface", "warning"] },
    },
  };
}

function standardFeedbackComponentDefinition(): ComponentThemeDefinition {
  return {
    base: {
      base: "foreground",
      focused: "accent",
      active: "success",
      disabled: "muted",
    },
    variants: {
      info: { base: "accent", active: "accent" },
      success: { base: "success", active: "success" },
      warning: { base: "warning", active: "warning" },
      danger: { base: "danger", active: "danger" },
    },
  };
}

function normalizeThemeComponentName(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/** Public helper for compile Theme Manifest Style Reference. */
export function compileThemeManifestStyleReference(
  reference: ThemeManifestStyleReference,
): ThemeStyleReference {
  return compileThemeManifestStyleReferenceInternal(reference);
}

/** Public helper for compile Theme Manifest State Definition. */
export function compileThemeManifestStateDefinition(
  definition: ThemeManifestStateDefinition = {},
): ThemeStateDefinition {
  return compileThemeManifestStateDefinitionInternal<ThemeState>(definition) as ThemeStateDefinition;
}

function compileThemeManifestStyleReferenceInternal(
  reference: ThemeManifestStyleReference,
): ThemeStyleReference {
  if (isThemeManifestStyleReferencePipeline(reference)) {
    return reference.map((part) => compileThemeManifestStyleReferenceInternal(part));
  }
  return typeof reference === "string" ? reference as ThemeTokenName : createAnsiStyleInternal(reference);
}

function compileThemeManifestStateDefinitionInternal<State extends string>(
  definition: Partial<Record<State, ThemeManifestStyleReference>> = {},
): Partial<Record<State, ThemeStyleReference>> {
  const output: Partial<Record<State, ThemeStyleReference>> = {};
  for (const [state, reference] of Object.entries(definition) as [State, ThemeManifestStyleReference][]) {
    if (reference === undefined) continue;
    output[state] = compileThemeManifestStyleReferenceInternal(reference);
  }
  return output;
}

function isThemeManifestStyleReferencePipeline(
  reference: ThemeManifestStyleReference,
): reference is readonly ThemeManifestStyleReference[] {
  return Array.isArray(reference);
}

/** Public helper for compile Theme Manifest Options. */
export function compileThemeManifestOptions(manifest: ThemeManifestOptions = {}): ThemeEngineOptions {
  const components: Record<string, ComponentThemeDefinition> = {};

  for (const [name, definition] of Object.entries(manifest.components ?? {})) {
    const variants: Record<string, ThemeStateDefinition> = {};
    for (const [variant, states] of Object.entries(definition.variants ?? {})) {
      variants[variant] = compileThemeManifestStateDefinition(states);
    }

    components[name] = {
      extends: definition.extends,
      base: compileThemeManifestStateDefinition(definition.base),
      variants,
    };
  }

  return composeThemeOptions({
    tokens: manifest.tokens ? createAnsiThemeTokens(manifest.tokens) : undefined,
    components,
  });
}

/** Public helper for theme Pack From Manifest. */
export function themePackFromManifest(manifest: ThemePackManifest): ThemePack {
  return {
    id: manifest.id,
    label: manifest.label,
    palette: manifest.palette,
    options: compileThemeManifestOptions(manifest.options),
  };
}

/** Creates an theme Engine From Manifest. */
export function createThemeEngineFromManifest(
  manifest: Pick<ThemePackManifest, "palette" | "options">,
  overrides: ThemeEngineOptions = {},
): ThemeEngine {
  return createThemeEngine(
    manifest.palette ?? "plain",
    composeThemeOptions(compileThemeManifestOptions(manifest.options), overrides),
  );
}

/** Creates an theme Registry From Manifests. */
export function createThemeRegistryFromManifests(manifests: Iterable<ThemePackManifest>): ThemeRegistry {
  return createThemeRegistry([...manifests].map(themePackFromManifest));
}

/** Creates a serializable inspection snapshot for theme Manifest. */
export function inspectThemeManifest(manifest: ThemePackManifest): ThemeManifestInspection {
  const options = compileThemeManifestOptions(manifest.options);
  const components = manifest.options?.components ?? {};
  return {
    id: manifest.id,
    label: manifest.label ?? manifest.id,
    palette: manifest.palette ?? "plain",
    tokens: orderedSubset(Object.keys(manifest.options?.tokens ?? {}), themeTokenNames),
    components: Object.entries(components)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, definition]) => ({
        name,
        extends: normalizeThemeExtends(definition.extends),
        states: orderedSubset(Object.keys(definition.base ?? {}), themeStates),
        variants: Object.entries(definition.variants ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([variant, states]) => ({
            name: variant,
            states: orderedSubset(Object.keys(states), themeStates),
          })),
      })),
    issues: validateThemeOptions(options),
  };
}

/** Public helper for preview Theme Manifest. */
export function previewThemeManifest(
  manifest: ThemePackManifest,
  options: ThemeManifestPreviewOptions = {},
): ThemeManifestPreview {
  const sample = options.sample ?? "Aa";
  const engine = createThemeEngineFromManifest(manifest);
  const tokenNames = options.tokens ? orderedSubset(options.tokens, themeTokenNames) : [...themeTokenNames];
  const componentNames = options.components ? [...options.components] : engine.componentNames();
  const stateNames = options.states ? orderedSubset(options.states, themeStates) : [...themeStates];

  return {
    sample,
    manifest: inspectThemeManifest(manifest),
    tokens: tokenNames.map((token) => ({
      token,
      preview: previewStyle(engine.theme.tokens[token], sample),
    })),
    components: componentNames.flatMap((component) => {
      const variants = options.variants
        ? [...options.variants(component, engine)]
        : ["default", ...engine.variants(component)];
      return variants.flatMap((variant) => {
        const theme = engine.component(component, variant);
        return stateNames.map((state) => ({
          component,
          variant,
          state,
          preview: previewStyle(theme[state], sample),
        }));
      });
    }),
  };
}

/** Public helper for validate Theme Options. */
export function validateThemeOptions(options: ThemeEngineOptions): ThemeValidationIssue[] {
  const normalized = composeThemeOptions(options);
  const components = normalized.components ?? {};
  return validateThemeComponents(components);
}

function validateThemeComponents(components: Record<string, ComponentThemeDefinition>): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];

  for (const [component, definition] of Object.entries(components)) {
    for (const parent of normalizeThemeExtends(definition.extends)) {
      if (!components[parent]) {
        issues.push({
          kind: "unknown-component",
          path: `components.${component}.extends`,
          component,
          reference: parent,
          message: `Theme component "${component}" extends unknown component "${parent}"`,
        });
      }
    }

    validateThemeStateDefinitionReferences(issues, definition.base, {
      component,
      path: `components.${component}.base`,
    });

    for (const [variant, states] of Object.entries(definition.variants ?? {})) {
      validateThemeStateDefinitionReferences(issues, states, {
        component,
        variant,
        path: `components.${component}.variants.${variant}`,
      });
    }
  }

  for (const cycle of findThemeInheritanceCycles(components)) {
    issues.push({
      kind: "inheritance-cycle",
      path: `components.${cycle[0]}.extends`,
      component: cycle[0],
      message: `Theme component inheritance cycle detected: ${cycle.join(" -> ")}`,
    });
  }

  return issues;
}

function validateThemeStateDefinitionReferences(
  issues: ThemeValidationIssue[],
  definition: ThemeStateDefinition | undefined,
  context: { component: string; variant?: string; path: string },
): void {
  for (const [state, reference] of Object.entries(definition ?? {}) as [ThemeState, ThemeStyleReference][]) {
    validateThemeStyleReference(issues, reference, {
      ...context,
      state,
      path: `${context.path}.${state}`,
    });
  }
}

function validateThemeStyleReference(
  issues: ThemeValidationIssue[],
  reference: ThemeStyleReference,
  context: { component: string; variant?: string; state: ThemeState; path: string },
): void {
  if (Array.isArray(reference)) {
    reference.forEach((part, index) =>
      validateThemeStyleReference(issues, part, {
        ...context,
        path: `${context.path}[${index}]`,
      })
    );
    return;
  }

  if (typeof reference !== "string" || themeTokenNames.includes(reference as ThemeTokenName)) return;

  issues.push({
    kind: "unknown-token",
    path: context.path,
    component: context.component,
    variant: context.variant,
    state: context.state,
    reference,
    message: `Theme state "${context.component}.${
      context.variant ? `${context.variant}.` : ""
    }${context.state}" references unknown token "${reference}"`,
  });
}

function findThemeInheritanceCycles(components: Record<string, ComponentThemeDefinition>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (component: string, path: string[]): void => {
    if (visiting.has(component)) {
      cycles.push(path.slice(path.indexOf(component)));
      return;
    }
    if (visited.has(component)) return;

    visiting.add(component);
    for (const parent of normalizeThemeExtends(components[component]?.extends)) {
      if (components[parent]) visit(parent, [...path, parent]);
    }
    visiting.delete(component);
    visited.add(component);
  };

  for (const component of Object.keys(components).sort()) {
    visit(component, [component]);
  }

  return cycles;
}

/** Public helper for assert Theme Options. */
export function assertThemeOptions(options: ThemeEngineOptions): void {
  const issues = validateThemeOptions(options);
  if (issues.length > 0) {
    throw new ThemeValidationError(issues);
  }
}

/** Public helper for diff Theme Engines. */
export function diffThemeEngines(
  before: ThemeEngine,
  after: ThemeEngine,
  options: ThemeEngineDiffOptions = {},
): ThemeEngineDiff {
  const sample = options.sample ?? "Aa";
  const includeUnchanged = options.includeUnchanged ?? false;
  const tokens: ThemeTokenDiff[] = [];
  const components: ThemeComponentStateDiff[] = [];

  for (const token of themeTokenNames) {
    const beforePreview = previewStyle(before.theme.tokens[token], sample);
    const afterPreview = previewStyle(after.theme.tokens[token], sample);
    if (includeUnchanged || beforePreview.styled !== afterPreview.styled) {
      tokens.push({ token, before: beforePreview, after: afterPreview });
    }
  }

  const componentNames = options.components
    ? [...options.components]
    : [...new Set([...before.componentNames(), ...after.componentNames()])].sort();

  for (const component of componentNames) {
    const variants = options.variants
      ? [...options.variants(component, [before, after])]
      : themeDiffVariants(component, before, after);
    for (const variant of variants) {
      const beforeTheme = before.component(component, variant);
      const afterTheme = after.component(component, variant);
      for (const state of themeStates) {
        const beforePreview = previewStyle(beforeTheme[state], sample);
        const afterPreview = previewStyle(afterTheme[state], sample);
        if (includeUnchanged || beforePreview.styled !== afterPreview.styled) {
          components.push({ component, variant, state, before: beforePreview, after: afterPreview });
        }
      }
    }
  }

  return { sample, tokens, components };
}

/** Creates a serializable inspection snapshot for theme Coverage. */
export function inspectThemeCoverage(
  options: ThemeEngineOptions,
  coverageOptions: ThemeCoverageOptions = {},
): ThemeCoverageInspection {
  const components = composeThemeOptions(options).components ?? {};
  return inspectThemeCoverageComponents(components, coverageOptions);
}

function inspectThemeCoverageComponents(
  components: Record<string, ComponentThemeDefinition>,
  options: ThemeCoverageOptions,
): ThemeCoverageInspection {
  const componentNames = options.components ? uniqueSortedStrings(options.components) : Object.keys(components).sort();
  const componentCoverage = new Array<ThemeComponentCoverageInspection>(componentNames.length);
  let variantCount = 0;
  let coveredStateCount = 0;
  let missingStateCount = 0;
  let complete = true;

  for (let index = 0; index < componentNames.length; index += 1) {
    const coverage = inspectThemeComponentCoverage(componentNames[index]!, components, options);
    componentCoverage[index] = coverage;
    variantCount += coverage.variants.length;
    coveredStateCount += coverage.coveredStateCount;
    missingStateCount += coverage.missingStateCount;
    complete &&= coverage.complete;
  }

  return {
    componentCount: componentCoverage.length,
    variantCount,
    stateCount: variantCount * themeStates.length,
    coveredStateCount,
    missingStateCount,
    complete,
    components: componentCoverage,
  };
}

function inspectThemeComponentCoverage(
  name: string,
  components: Record<string, ComponentThemeDefinition>,
  options: ThemeCoverageOptions,
): ThemeComponentCoverageInspection {
  const resolved = resolveThemeCoverageDefinition(name, components);
  const variantNames = themeCoverageVariantNames(name, resolved, options);
  const variants = new Array<ThemeVariantCoverageInspection>(variantNames.length);
  let coveredStateCount = 0;
  let missingStateCount = 0;
  let complete = true;

  for (let index = 0; index < variantNames.length; index += 1) {
    const variant = variantNames[index]!;
    const states = coveredThemeStates(resolved, variant);
    const missingStates = missingThemeStates(states);
    const variantCoverage = {
      name: variant,
      states,
      missingStates,
      complete: missingStates.length === 0,
    };
    variants[index] = variantCoverage;
    coveredStateCount += states.length;
    missingStateCount += missingStates.length;
    complete &&= variantCoverage.complete;
  }

  return {
    name,
    extends: normalizeThemeExtends(components[name]?.extends),
    variants,
    stateCount: variants.length * themeStates.length,
    coveredStateCount,
    missingStateCount,
    complete,
  };
}

function resolveThemeCoverageDefinition(
  componentName: string,
  components: Record<string, ComponentThemeDefinition>,
  seen = new Set<string>(),
): ComponentThemeDefinition {
  const definition = components[componentName];
  if (!definition) return {};
  if (seen.has(componentName)) {
    throw new ThemeInheritanceError([...seen, componentName]);
  }
  seen.add(componentName);

  let resolved: ComponentThemeDefinition = {};
  for (const parent of normalizeThemeExtends(definition.extends)) {
    resolved = mergeComponentThemeDefinitionCore(
      resolved,
      resolveThemeCoverageDefinition(parent, components, new Set(seen)),
    );
  }

  return mergeComponentThemeDefinitionCore(resolved, {
    base: definition.base,
    variants: definition.variants,
  });
}

function themeCoverageVariantNames(
  component: string,
  definition: ComponentThemeDefinition,
  options: ThemeCoverageOptions,
): string[] {
  const variants = options.variants
    ? [...options.variants(component, definition)]
    : Object.keys(definition.variants ?? {});
  return [...new Set(["default", ...variants])].sort((a, b) => {
    if (a === "default") return -1;
    if (b === "default") return 1;
    return a.localeCompare(b);
  });
}

function coveredThemeStates(definition: ComponentThemeDefinition, variant: string): ThemeState[] {
  const covered = new Set<string>(Object.keys(definition.base ?? {}));
  if (variant !== "default") {
    for (const state of Object.keys(definition.variants?.[variant] ?? {})) {
      covered.add(state);
    }
  }
  return themeStates.filter((state) => covered.has(state));
}

function missingThemeStates(covered: readonly ThemeState[]): ThemeState[] {
  const coveredSet = new Set(covered);
  return themeStates.filter((state) => !coveredSet.has(state));
}

/** Creates an theme Engine. */
export function createThemeEngine(
  palette: ThemePaletteReference = "plain",
  options: Omit<ThemeEngineOptions, "tokens"> & { tokens?: Partial<ThemeTokens> } = {},
): ThemeEngine {
  return createThemeEngineFromPalette(resolveThemePaletteTokensInternal(palette), options);
}

/** Builds a theme engine from concrete palette tokens plus optional overrides. */
export function createThemeEngineFromPalette(
  palette: Partial<ThemeTokens>,
  options: Omit<ThemeEngineOptions, "tokens"> & { tokens?: Partial<ThemeTokens> } = {},
): ThemeEngine {
  return new ThemeEngine({
    ...options,
    tokens: {
      ...palette,
      ...(options.tokens ?? {}),
    },
  });
}

/** Public interface describing a theme Pack. */
export interface ThemePack {
  id: string;
  label?: string;
  description?: string;
  palette?: ThemePaletteReference;
  options?: ThemeEngineOptions;
}

/** Public interface describing a theme Pack Manifest. */
export interface ThemePackManifest {
  id: string;
  label?: string;
  description?: string;
  palette?: ThemePaletteName;
  options?: ThemeManifestOptions;
}

/** Serializable inspection snapshot for theme Pack. */
export interface ThemePackInspection {
  id: string;
  label: string;
  palette: string;
  components: ThemeComponentInspection[];
}

/** Serializable inspection snapshot for theme Provider. */
export interface ThemeProviderInspection {
  activeId: string;
  themes: ThemePackInspection[];
  layers: ThemeLayerInspection[];
  engine: ThemeInspection;
}

/** Public interface describing a theme Catalog Theme. */
export interface ThemeCatalogTheme extends ThemePackInspection {
  active: boolean;
}

/** Public interface describing a theme Catalog Layer. */
export interface ThemeCatalogLayer extends ThemeLayerInspection {
  active: boolean;
}

/** Public interface describing a theme Catalog Component. */
export interface ThemeCatalogComponent extends ThemeComponentInspection {
  variants: string[];
}

/** Public interface describing a theme Catalog. */
export interface ThemeCatalog {
  activeId: string;
  tokens: ThemeTokenName[];
  states: ThemeState[];
  themes: ThemeCatalogTheme[];
  layers: ThemeCatalogLayer[];
  components: ThemeCatalogComponent[];
}

/** Public class implementing a theme Layer Stack. */
export class ThemeLayerStack {
  readonly options: Computed<ThemeEngineOptions>;
  readonly #layers = new Map<string, ThemeLayer>();
  readonly #enabled = new Set<string>();
  readonly #revision = new Signal(0);
  #ids?: string[];
  #activeIds?: string[];
  #activeOptions?: ThemeEngineOptions[];

  constructor(layers: Iterable<ThemeLayer> = []) {
    for (const layer of layers) {
      this.register(layer);
    }
    this.options = new Computed(() => {
      this.#revision.value;
      return composeThemeOptionsCore(...this.#activeLayerOptions());
    });
  }

  register(layer: ThemeLayer): this {
    const enabled = layer.enabled ?? (this.#enabled.has(layer.id) || !this.#layers.has(layer.id));
    this.#layers.set(layer.id, {
      ...layer,
      enabled,
      options: composeThemeOptionsCore(layer.options),
    });
    if (enabled) {
      this.#enabled.add(layer.id);
    } else {
      this.#enabled.delete(layer.id);
    }
    this.#touch();
    return this;
  }

  unregister(id: string): boolean {
    const removed = this.#layers.delete(id);
    const disabled = this.#enabled.delete(id);
    if (removed || disabled) this.#touch();
    return removed;
  }

  has(id: string): boolean {
    return this.#layers.has(id);
  }

  get(id: string): ThemeLayer | undefined {
    const layer = this.#layers.get(id);
    return layer ? this.#cloneLayer(layer, this.#enabled.has(id)) : undefined;
  }

  ids(): string[] {
    if (!this.#ids) {
      this.#ids = [...this.#layers.keys()];
    }
    return [...this.#ids];
  }

  activeIds(): string[] {
    if (!this.#activeIds) {
      const ids: string[] = [];
      for (const id of this.#layers.keys()) {
        if (this.#enabled.has(id)) ids.push(id);
      }
      this.#activeIds = ids;
    }
    return [...this.#activeIds];
  }

  activeLayers(): ThemeLayer[] {
    const layers: ThemeLayer[] = [];
    for (const [id, layer] of this.#layers) {
      if (!this.#enabled.has(id)) continue;
      layers.push(this.#cloneLayer(layer, true));
    }
    return layers;
  }

  setActiveIds(ids: Iterable<string>): string[] {
    const next = new Set(ids);
    let changed = false;

    for (const id of this.ids()) {
      const enabled = next.has(id);
      if (enabled && !this.#enabled.has(id)) {
        this.#enabled.add(id);
        changed = true;
      } else if (!enabled && this.#enabled.has(id)) {
        this.#enabled.delete(id);
        changed = true;
      }
    }

    if (changed) this.#touch();
    return this.activeIds();
  }

  setEnabled(id: string, enabled: boolean): boolean {
    if (!this.#layers.has(id)) return false;
    const changed = enabled ? !this.#enabled.has(id) : this.#enabled.has(id);
    if (!changed) return true;
    if (enabled) {
      this.#enabled.add(id);
    } else {
      this.#enabled.delete(id);
    }
    this.#touch();
    return true;
  }

  enable(id: string): boolean {
    return this.setEnabled(id, true);
  }

  disable(id: string): boolean {
    return this.setEnabled(id, false);
  }

  toggle(id: string): boolean {
    if (!this.#layers.has(id)) return false;
    return this.setEnabled(id, !this.#enabled.has(id));
  }

  compose(overrides: ThemeEngineOptions = {}): ThemeEngineOptions {
    return composeThemeOptionsCore(overrides, ...this.#activeLayerOptions());
  }

  inspect(): ThemeLayerInspection[] {
    const inspections: ThemeLayerInspection[] = [];
    for (const [id, layer] of this.#layers) {
      inspections.push({
        id,
        label: layer.label ?? id,
        enabled: this.#enabled.has(id),
        components: new ThemeEngine(layer.options).inspect().components,
      });
    }
    return inspections;
  }

  dispose(): void {
    this.options.dispose();
    this.#revision.dispose();
  }

  #touch(): void {
    this.#ids = undefined;
    this.#activeIds = undefined;
    this.#activeOptions = undefined;
    this.#revision.value++;
  }

  #activeLayerOptions(): ThemeEngineOptions[] {
    if (!this.#activeOptions) {
      const options: ThemeEngineOptions[] = [];
      for (const [id, layer] of this.#layers) {
        if (this.#enabled.has(id)) options.push(layer.options);
      }
      this.#activeOptions = options;
    }
    return [...this.#activeOptions];
  }

  #cloneLayer(layer: ThemeLayer, enabled: boolean): ThemeLayer {
    return {
      ...layer,
      enabled,
      options: composeThemeOptionsCore(layer.options),
    };
  }
}

/** Registry for storing and querying theme definitions. */
export class ThemeRegistry {
  readonly #packs = new Map<string, ThemePack>();
  #ids?: string[];

  constructor(packs: Iterable<ThemePack> = []) {
    for (const pack of packs) {
      this.register(pack);
    }
  }

  register(pack: ThemePack): this {
    this.#packs.set(pack.id, {
      ...pack,
      options: pack.options ? composeThemeOptionsCore(pack.options) : undefined,
    });
    this.#ids = undefined;
    return this;
  }

  has(id: string): boolean {
    return this.#packs.has(id);
  }

  get(id: string): ThemePack | undefined {
    const pack = this.#packs.get(id);
    return pack
      ? {
        ...pack,
        options: pack.options ? composeThemeOptionsCore(pack.options) : undefined,
      }
      : undefined;
  }

  ids(): string[] {
    return [...this.#sortedIds()];
  }

  engine(id: string, overrides: ThemeEngineOptions = {}): ThemeEngine {
    const pack = this.#packs.get(id);
    if (!pack) {
      throw new ThemePackNotFoundError(id);
    }
    return createThemeEngine(
      pack.palette ?? "plain",
      composeThemeOptionsCore(pack.options ?? {}, overrides),
    );
  }

  inspect(): ThemePackInspection[] {
    const ids = this.#sortedIds();
    const inspections = new Array<ThemePackInspection>(ids.length);
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]!;
      const pack = this.#packs.get(id)!;
      inspections[index] = {
        id,
        label: pack.label ?? id,
        palette: themePaletteIdInternal(pack.palette ?? "plain"),
        components: this.engine(id).inspect().components,
      };
    }
    return inspections;
  }

  #sortedIds(): readonly string[] {
    if (!this.#ids) {
      this.#ids = [...this.#packs.keys()].sort();
    }
    return this.#ids;
  }
}

/** Error thrown for invalid theme Pack Not Found operations. */
export class ThemePackNotFoundError extends Error {
  constructor(id: string) {
    super(`Theme pack "${id}" is not registered`);
    this.name = "ThemePackNotFoundError";
  }
}

/** Options for configuring theme Provider. */
export interface ThemeProviderOptions {
  registry?: ThemeRegistry;
  activeId?: string | Signal<string>;
  overrides?: ThemeEngineOptions;
  layers?: ThemeLayerStack | Iterable<ThemeLayer>;
  store?: AsyncStore<string>;
  storageKey?: string;
  onError?: (error: unknown) => void;
}

/** Public class implementing a theme Provider. */
export class ThemeProvider {
  readonly registry: ThemeRegistry;
  readonly activeId: Signal<string>;
  readonly engine: Computed<ThemeEngine>;
  readonly layers: ThemeLayerStack;
  readonly ready: Promise<string>;
  readonly #overrides: ThemeEngineOptions;
  readonly #store?: AsyncStore<string>;
  readonly #storageKey: string;
  readonly #onError?: (error: unknown) => void;
  #loaded = false;
  #dirtyBeforeLoad = false;
  #suspendWrites = false;
  #pendingWrite: Promise<void> = Promise.resolve();

  constructor(options: ThemeProviderOptions = {}) {
    this.registry = options.registry ?? createThemeRegistry(defaultThemePacks);
    this.activeId = options.activeId instanceof Signal
      ? options.activeId
      : new Signal(options.activeId ?? this.registry.ids()[0] ?? "plain");
    this.#overrides = composeThemeOptions(options.overrides ?? {});
    this.layers = options.layers instanceof ThemeLayerStack
      ? options.layers
      : createThemeLayerStack(options.layers ?? []);
    this.#store = options.store;
    this.#storageKey = options.storageKey ?? "theme.active";
    this.#onError = options.onError;
    this.engine = new Computed(() => this.engineFor(this.activeId.value));
    this.activeId.subscribe((id) => this.#persistTheme(id));
    this.ready = this.#loadTheme();
  }

  catalog(): ThemeCatalog {
    return createThemeCatalog(this);
  }

  setTheme(id: string): boolean {
    if (!this.registry.has(id)) return false;
    this.activeId.value = id;
    return true;
  }

  themeIds(): string[] {
    return this.registry.ids();
  }

  cycleTheme(direction = 1): string {
    const ids = this.themeIds();
    if (ids.length === 0) return this.activeId.peek();

    const currentIndex = Math.max(0, ids.indexOf(this.activeId.peek()));
    const nextIndex = positiveModulo(currentIndex + direction, ids.length);
    this.setTheme(ids[nextIndex]!);
    return this.activeId.peek();
  }

  nextTheme(): string {
    return this.cycleTheme(1);
  }

  previousTheme(): string {
    return this.cycleTheme(-1);
  }

  engineFor(id: string): ThemeEngine {
    return this.registry.engine(
      id,
      composeThemeOptions(this.#overrides, this.layers.options.value),
    );
  }

  async flush(): Promise<void> {
    await this.ready;
    await this.#pendingWrite;
  }

  async resetTheme(id: string = this.themeIds()[0] ?? this.activeId.peek()): Promise<boolean> {
    if (!this.registry.has(id)) return false;
    await this.ready;
    this.#suspendWrites = true;
    this.activeId.value = id;
    this.#suspendWrites = false;
    this.#pendingWrite = this.#pendingWrite
      .catch(() => undefined)
      .then(() => this.#store?.delete(this.#storageKey))
      .catch((error) => this.#onError?.(error));
    await this.#pendingWrite;
    return true;
  }

  component(componentName: string, variant = "default"): Computed<Theme> {
    return new Computed(() => this.engine.value.component(componentName, variant));
  }

  resolve(componentName: string, state: ThemeState, variant = "default"): Computed<Style> {
    return new Computed(() => this.engine.value.resolve(componentName, state, variant));
  }

  inspect(): ThemeProviderInspection {
    return {
      activeId: this.activeId.peek(),
      themes: this.registry.inspect(),
      layers: this.layers.inspect(),
      engine: this.engine.peek().inspect(),
    };
  }

  async #loadTheme(): Promise<string> {
    if (!this.#store) {
      this.#loaded = true;
      return this.activeId.peek();
    }

    try {
      const storedId = await this.#store.get(this.#storageKey);
      this.#loaded = true;
      if (storedId && this.registry.has(storedId) && !this.#dirtyBeforeLoad) {
        this.#suspendWrites = true;
        this.activeId.value = storedId;
        this.#suspendWrites = false;
      } else if (this.#dirtyBeforeLoad) {
        this.#writeTheme(this.activeId.peek());
      }
      return this.activeId.peek();
    } catch (error) {
      this.#loaded = true;
      this.#onError?.(error);
      return this.activeId.peek();
    }
  }

  #persistTheme(id: string): void {
    if (this.#suspendWrites || !this.#store) return;
    if (!this.#loaded) {
      this.#dirtyBeforeLoad = true;
      return;
    }
    this.#writeTheme(id);
  }

  #writeTheme(id: string): void {
    this.#pendingWrite = this.#pendingWrite
      .catch(() => undefined)
      .then(() => this.#store?.set(this.#storageKey, id))
      .catch((error) => this.#onError?.(error));
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Public constant for a default Theme Packs. */
export const defaultThemePacks: ThemePack[] = [
  { id: "plain", label: "Plain", palette: "plain", options: composeStandardThemeOptions() },
  { id: "neon", label: "Neon", palette: "neon", options: composeStandardThemeOptions() },
  { id: "terminal", label: "Terminal", palette: "terminal", options: composeStandardThemeOptions() },
];

/** Returns the built-in palette definitions as registerable palette objects. */
export function defaultThemePaletteDefinitions(): ThemePalette[] {
  return defaultThemePaletteDefinitionsInternal();
}

/** Creates a palette registry with built-in palettes by default. */
export function createThemePaletteRegistry(
  palettes: Iterable<ThemePalette | ThemePaletteName> = defaultThemePaletteDefinitions(),
): ThemePaletteRegistry {
  return new ThemePaletteRegistry(palettes);
}

/** Creates an theme Registry. */
export function createThemeRegistry(packs: Iterable<ThemePack> = defaultThemePacks): ThemeRegistry {
  return new ThemeRegistry(packs);
}

/** Creates an theme Layer Stack. */
export function createThemeLayerStack(layers: Iterable<ThemeLayer> = []): ThemeLayerStack {
  return new ThemeLayerStack(layers);
}

/** Creates an theme Provider. */
export function createThemeProvider(options: ThemeProviderOptions = {}): ThemeProvider {
  return new ThemeProvider(options);
}

/** Creates an theme Catalog. */
export function createThemeCatalog(provider: ThemeProvider): ThemeCatalog {
  return themeCatalogFromInspection(provider.inspect());
}

/** Public helper for preview Theme Provider. */
export function previewThemeProvider(
  provider: ThemeProvider,
  options: ThemeProviderPreviewOptions = {},
): ThemeProviderPreview {
  const sample = options.sample ?? "Aa";
  const engine = provider.engine.peek();
  const catalog = provider.catalog();
  const requestedTokens = options.tokens ? orderedSubset(options.tokens, themeTokenNames) : Array.from(themeTokenNames);
  const componentNames = options.components
    ? Array.from(options.components)
    : catalog.components.map((component) => component.name);
  const stateNames = options.states ? orderedSubset(options.states, themeStates) : Array.from(themeStates);

  return {
    sample,
    activeId: provider.activeId.peek(),
    activeLayers: provider.layers.activeIds(),
    catalog,
    tokens: previewThemeProviderTokens(engine.theme.tokens, requestedTokens, sample),
    components: previewThemeProviderComponents(
      engine,
      componentNames,
      stateNames,
      sample,
      options.variants,
    ),
  };
}

/** Creates an audit-ready report for a provider's theme catalog, active composition, preview, and diagnostics. */
export function createThemeProviderReport(
  provider: ThemeProvider,
  options: ThemeProviderReportOptions = {},
): ThemeProviderReport {
  const catalog = provider.catalog();
  const activeLayers = provider.layers.activeIds();
  const coverageOptions = options.coverage === false ? undefined : options.coverage ?? {};
  const componentNames = new Array<string>(catalog.components.length);
  let variantCount = 0;
  for (let index = 0; index < catalog.components.length; index += 1) {
    const component = catalog.components[index]!;
    componentNames[index] = component.name;
    variantCount += component.variants.length;
  }
  const coverage = coverageOptions
    ? inspectThemeCoverage(themeProviderActiveOptions(provider), {
      components: componentNames,
      ...coverageOptions,
    })
    : undefined;
  const preview = options.preview === false ? undefined : previewThemeProvider(provider, options.preview ?? {});
  const issues = inspectThemeProviderIssues(provider, validateThemeOptions);

  return {
    title: options.title ?? "Theme Provider Report",
    activeId: catalog.activeId,
    activeLayers,
    catalog,
    preview,
    coverage,
    issues,
    summary: {
      themeCount: catalog.themes.length,
      layerCount: catalog.layers.length,
      activeLayerCount: activeLayers.length,
      componentCount: catalog.components.length,
      variantCount,
      issueCount: issues.length,
      missingStateCount: coverage?.missingStateCount ?? 0,
      completeCoverage: coverage?.complete ?? true,
    },
  };
}

/** Formats a theme provider report as Markdown for demos, docs, and CI summaries. */
export function formatThemeProviderReportMarkdown(
  provider: ThemeProvider,
  options: ThemeProviderReportOptions = {},
): string {
  return formatThemeProviderReportMarkdownFromReport(createThemeProviderReport(provider, options));
}

function themeCatalogFromInspection(inspection: ThemeProviderInspection): ThemeCatalog {
  const themes = new Array<ThemeCatalog["themes"][number]>(inspection.themes.length);
  for (let index = 0; index < inspection.themes.length; index += 1) {
    const theme = inspection.themes[index]!;
    themes[index] = {
      ...theme,
      active: theme.id === inspection.activeId,
    };
  }
  const layers = new Array<ThemeCatalog["layers"][number]>(inspection.layers.length);
  for (let index = 0; index < inspection.layers.length; index += 1) {
    const layer = inspection.layers[index]!;
    layers[index] = {
      ...layer,
      active: layer.enabled,
    };
  }
  const componentSources = new Array<ThemeCatalog["components"]>(
    inspection.themes.length + inspection.layers.length + 1,
  );
  componentSources[0] = inspection.engine.components;
  let sourceIndex = 1;
  for (const theme of inspection.themes) {
    componentSources[sourceIndex] = theme.components;
    sourceIndex += 1;
  }
  for (const layer of inspection.layers) {
    componentSources[sourceIndex] = layer.components;
    sourceIndex += 1;
  }
  return {
    activeId: inspection.activeId,
    tokens: Array.from(themeTokenNames),
    states: Array.from(themeStates),
    themes,
    layers,
    components: mergeThemeCatalogComponents(...componentSources),
  };
}

function mergeThemeCatalogComponents(
  ...groups: readonly ThemeComponentInspection[][]
): ThemeCatalogComponent[] {
  const components = new Map<string, Set<string>>();

  for (const group of groups) {
    for (const component of group) {
      const variants = components.get(component.name) ?? new Set<string>(["default"]);
      variants.add("default");
      for (const variant of component.variants) variants.add(variant);
      components.set(component.name, variants);
    }
  }

  const entries = [...components.entries()].sort(([a], [b]) => a.localeCompare(b));
  const merged = new Array<ThemeCatalogComponent>(entries.length);
  for (let index = 0; index < entries.length; index += 1) {
    const [name, variants] = entries[index]!;
    merged[index] = {
      name,
      variants: [...variants].sort(compareThemeCatalogVariants),
    };
  }
  return merged;
}

function compareThemeCatalogVariants(a: string, b: string): number {
  if (a === "default") return -1;
  if (b === "default") return 1;
  return a.localeCompare(b);
}

function previewThemeProviderTokens(
  tokens: Record<ThemeTokenName, Style>,
  tokenNames: readonly ThemeTokenName[],
  sample: string,
): ThemeProviderPreview["tokens"] {
  const previews = new Array<ThemeProviderPreview["tokens"][number]>(tokenNames.length);
  for (let index = 0; index < tokenNames.length; index += 1) {
    const token = tokenNames[index]!;
    previews[index] = {
      token,
      preview: previewStyle(tokens[token], sample),
    };
  }
  return previews;
}

function previewThemeProviderComponents(
  engine: ThemeEngine,
  componentNames: readonly string[],
  stateNames: readonly ThemeState[],
  sample: string,
  variantsOption: ThemeProviderPreviewOptions["variants"],
): ThemeProviderPreview["components"] {
  const previews: ThemeProviderPreview["components"] = [];
  for (const component of componentNames) {
    const variants = variantsOption
      ? Array.from(variantsOption(component, engine))
      : ["default", ...engine.variants(component)];
    for (const variant of variants) {
      const theme = engine.component(component, variant);
      for (const state of stateNames) {
        previews.push({
          component,
          variant,
          state,
          preview: previewStyle(theme[state], sample),
        });
      }
    }
  }
  return previews;
}

function formatThemeProviderReportMarkdownFromReport(report: ThemeProviderReport): string {
  const lines = [`# ${report.title}`, ""];
  lines.push(
    `Active theme: ${report.activeId}. Active layers: ${report.activeLayers.join(", ") || "none"}.`,
    "",
  );
  lines.push(
    `${report.summary.themeCount} themes, ${report.summary.layerCount} layers, ${report.summary.componentCount} components, ${report.summary.variantCount} variants, ${report.summary.issueCount} issues.`,
    "",
  );

  lines.push("| Theme | Label | Palette | Active | Components |");
  lines.push("| --- | --- | --- | --- | ---: |");
  for (const theme of report.catalog.themes) {
    lines.push(
      `| ${escapeMarkdownCell(theme.id)} | ${escapeMarkdownCell(theme.label)} | ${
        escapeMarkdownCell(theme.palette)
      } | ${theme.active ? "yes" : "no"} | ${theme.components.length} |`,
    );
  }

  if (report.catalog.layers.length > 0) {
    lines.push("", "| Layer | Label | Active | Components |");
    lines.push("| --- | --- | --- | ---: |");
    for (const layer of report.catalog.layers) {
      lines.push(
        `| ${escapeMarkdownCell(layer.id)} | ${escapeMarkdownCell(layer.label)} | ${
          layer.active ? "yes" : "no"
        } | ${layer.components.length} |`,
      );
    }
  }

  if (report.issues.length > 0) {
    lines.push("", "| Issue | Source | Path | Message |");
    lines.push("| --- | --- | --- | --- |");
    for (const issue of report.issues) {
      lines.push(
        `| ${issue.kind} | ${issue.source}:${escapeMarkdownCell(issue.sourceId)} | ${
          escapeMarkdownCell(issue.path)
        } | ${escapeMarkdownCell(issue.message)} |`,
      );
    }
  }

  if (report.coverage) {
    lines.push("", "| Component | Variant | Complete | Missing States |");
    lines.push("| --- | --- | --- | --- |");
    for (const component of report.coverage.components) {
      for (const variant of component.variants) {
        lines.push(
          `| ${escapeMarkdownCell(component.name)} | ${escapeMarkdownCell(variant.name)} | ${
            variant.complete ? "yes" : "no"
          } | ${variant.missingStates.join(", ") || "-"} |`,
        );
      }
    }
  }

  return lines.join("\n");
}

/** Public class implementing a theme Engine. */
export class ThemeEngine {
  readonly theme: Theme & { tokens: ThemeTokens };
  protected readonly components: Record<string, ComponentThemeDefinition>;
  #componentNames?: string[];
  #variants = new Map<string, string[]>();

  constructor(options: ThemeEngineOptions = {}) {
    this.theme = createThemeCore(options.tokens);
    this.components = composeThemeOptionsCore({ components: options.components }).components ?? {};
  }

  component(componentName: string, variant = "default"): Theme {
    const definition = this.resolveComponentDefinition(componentName);
    return hierarchizeThemeCore({
      base: this.theme.base,
      focused: this.theme.focused,
      active: this.theme.active,
      disabled: this.theme.disabled,
      ...resolveThemeStateDefinitionCore(definition?.base, this.theme.tokens),
      ...(variant === "default"
        ? {}
        : resolveThemeStateDefinitionCore(definition?.variants?.[variant], this.theme.tokens)),
    });
  }

  resolve(componentName: string, state: ThemeState, variant = "default"): Theme[ThemeState] {
    return this.component(componentName, variant)[state];
  }

  extend(options: ThemeEngineOptions): ThemeEngine {
    return new ThemeEngine(composeThemeOptions({
      tokens: this.theme.tokens,
      components: this.components,
    }, options));
  }

  componentNames(): string[] {
    if (!this.#componentNames) {
      const names = Object.keys(this.components);
      names.sort();
      this.#componentNames = names;
    }
    return Array.from(this.#componentNames);
  }

  variants(componentName: string): string[] {
    const cached = this.#variants.get(componentName);
    if (cached) return Array.from(cached);
    const variants = Object.keys(this.resolveComponentDefinition(componentName).variants ?? {});
    variants.sort();
    this.#variants.set(componentName, variants);
    return Array.from(variants);
  }

  inspect(): ThemeInspection {
    return {
      tokens: Array.from(themeTokenNames),
      components: this.componentNames().map((name) => ({
        name,
        variants: this.variants(name),
      })),
    };
  }

  private resolveComponentDefinition(
    componentName: string,
    seen = new Set<string>(),
  ): ComponentThemeDefinition {
    const definition = this.components[componentName];
    if (!definition) return {};
    if (seen.has(componentName)) {
      throw new ThemeInheritanceError([...seen, componentName]);
    }
    seen.add(componentName);

    let resolved: ComponentThemeDefinition = {};
    for (const parent of normalizeThemeExtends(definition.extends)) {
      resolved = mergeComponentThemeDefinitionCore(
        resolved,
        this.resolveComponentDefinition(parent, new Set(seen)),
      );
    }

    return mergeComponentThemeDefinitionCore(resolved, {
      base: definition.base,
      variants: definition.variants,
    });
  }
}

/** Error thrown for invalid theme Inheritance operations. */
export class ThemeInheritanceError extends Error {
  constructor(chain: string[]) {
    super(`Theme component inheritance cycle detected: ${chain.join(" -> ")}`);
    this.name = "ThemeInheritanceError";
  }
}

/** Error thrown for invalid theme Validation operations. */
export class ThemeValidationError extends Error {
  readonly issues: ThemeValidationIssue[];

  constructor(issues: ThemeValidationIssue[]) {
    super(`Theme options are invalid: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "ThemeValidationError";
    this.issues = issues;
  }
}

function themeProviderActiveOptions(provider: ThemeProvider): ThemeEngineOptions {
  const activePack = provider.registry.get(provider.activeId.peek());
  const activeLayers = provider.layers.activeLayers();
  const options = new Array<ThemeEngineOptions>(activeLayers.length + 1);
  options[0] = activePack?.options ?? {};
  for (let index = 0; index < activeLayers.length; index += 1) {
    options[index + 1] = activeLayers[index]!.options;
  }
  return composeThemeOptionsCore(...options);
}

function themeRegistryOptions(provider: ThemeProvider): ThemeEngineOptions[] {
  const options: ThemeEngineOptions[] = [];
  for (const id of provider.registry.ids()) {
    const packOptions = provider.registry.get(id)?.options;
    if (packOptions !== undefined) options.push(packOptions);
  }
  return options;
}

function inspectThemeProviderIssues(
  provider: ThemeProvider,
  validateOptions: (options: ThemeEngineOptions) => ThemeValidationIssue[],
): ThemeProviderReportIssue[] {
  const issues: ThemeProviderReportIssue[] = [];
  for (const id of provider.registry.ids()) {
    const pack = provider.registry.get(id);
    if (!pack?.options) continue;
    const packIssues = validateOptions(pack.options);
    for (const issue of packIssues) {
      issues.push({
        ...issue,
        source: "theme",
        sourceId: id,
      });
    }
  }

  const registryOptions = themeRegistryOptions(provider);
  for (const id of provider.layers.ids()) {
    const layer = provider.layers.get(id);
    if (!layer) continue;
    const layerComponents = new Set(Object.keys(layer.options.components ?? {}));
    const layerIssues = validateOptions(composeThemeOptionsCore(...registryOptions, layer.options));
    for (const issue of layerIssues) {
      if (issue.component && !layerComponents.has(issue.component)) continue;
      issues.push({
        ...issue,
        source: "layer",
        sourceId: id,
      });
    }
  }
  return issues;
}

function previewStyle(style: Style, sample: string): ThemeStylePreview {
  return { raw: sample, styled: style(sample) };
}

function themeDiffVariants(component: string, before: ThemeEngine, after: ThemeEngine): string[] {
  return [...new Set(["default", ...before.variants(component), ...after.variants(component)])].sort((a, b) => {
    if (a === "default") return -1;
    if (b === "default") return 1;
    return a.localeCompare(b);
  });
}
