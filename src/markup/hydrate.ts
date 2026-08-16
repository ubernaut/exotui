// Copyright 2023 Im-Beast. MIT license.
import type { Rectangle } from "../types.ts";
import {
  inspectLayoutDeclarationCompatibility,
  LAYOUT_CSS_PROPERTY_FIELDS,
  type LayoutDiagnostic,
  type LayoutStyleField,
  mergeLayoutDiagnostics,
  resolvedLayoutDeclarationFields,
  resolveLayoutSolverCapabilities,
} from "../layout/capabilities.ts";
import { createLayoutEngine } from "../layout/engine.ts";
import { cloneLayoutNode, type LayoutSolver, type LayoutSolverResult, walkLayoutNodes } from "../layout/solver.ts";
import { type AppliedTuiCssDeclaration, applyCssCascade, type ApplyCssCascadeOptions } from "./cascade.ts";
import {
  parseCssStylesheet,
  type TuiCssDeclaration,
  type TuiCssMediaCondition,
  type TuiCssRule,
  type TuiCssStylesheet,
} from "./css.ts";
import { parseTuiMarkup, type TuiMarkupDocument, type TuiMarkupParseOptions } from "./html.ts";
import { hydrateMarkupWidgets, MarkupWidgetHydration, type MarkupWidgetHydrationOptions } from "./widgets.ts";

/** Options for the bounded markup/CSS parse cache. */
export interface MarkupLayoutCacheOptions {
  maxEntries?: number;
}

/** Options for creating a layout result from markup and CSS-like styles. */
export interface MarkupLayoutOptions {
  markup: string;
  /** One stylesheet, or several composed in order (later sources win ties). */
  css?: string | readonly string[];
  stylesheet?: TuiCssStylesheet;
  bounds: Rectangle;
  solver?: LayoutSolver;
  parse?: TuiMarkupParseOptions;
  cascade?: ApplyCssCascadeOptions;
  widgets?: MarkupWidgetHydrationOptions | false;
  cache?: MarkupLayoutCache | false;
}

/** Result of parsing, styling, and laying out markup. */
export interface MarkupLayoutResult {
  document: TuiMarkupDocument;
  styledRoot: TuiMarkupDocument["root"];
  layout: LayoutSolverResult;
  widgets: MarkupWidgetHydration;
  diagnostics: LayoutDiagnostic[];
}

/** Bounded cache for parsed markup documents and parsed CSS stylesheets. */
export class MarkupLayoutCache {
  readonly #maxEntries: number;
  readonly #documents = new Map<string, TuiMarkupDocument>();
  readonly #stylesheets = new Map<string, TuiCssStylesheet>();

  constructor(options: MarkupLayoutCacheOptions = {}) {
    this.#maxEntries = Math.max(0, Math.floor(options.maxEntries ?? 32));
  }

  document(markup: string, options?: TuiMarkupParseOptions): TuiMarkupDocument {
    const key = markupCacheKey(markup, options);
    const cached = this.#documents.get(key);
    if (cached) return cloneMarkupDocument(cached);
    const parsed = parseTuiMarkup(markup, options);
    this.#set(this.#documents, key, parsed);
    return cloneMarkupDocument(parsed);
  }

  stylesheet(css: string): TuiCssStylesheet {
    const cached = this.#stylesheets.get(css);
    if (cached) return cloneStylesheet(cached);
    const parsed = parseCssStylesheet(css);
    this.#set(this.#stylesheets, css, parsed);
    return cloneStylesheet(parsed);
  }

  clear(): void {
    this.#documents.clear();
    this.#stylesheets.clear();
  }

  inspect(): { documents: number; stylesheets: number; maxEntries: number } {
    return {
      documents: this.#documents.size,
      stylesheets: this.#stylesheets.size,
      maxEntries: this.#maxEntries,
    };
  }

  #set<T>(target: Map<string, T>, key: string, value: T): void {
    if (this.#maxEntries === 0) return;
    if (target.has(key)) target.delete(key);
    target.set(key, value);
    while (target.size > this.#maxEntries) {
      const oldest = target.keys().next().value;
      if (oldest === undefined) break;
      target.delete(oldest);
    }
  }
}

const defaultMarkupLayoutCache = new MarkupLayoutCache();

/** Parses markup, applies CSS-like styles, and computes layout boxes. */
export function createMarkupLayout(options: MarkupLayoutOptions): MarkupLayoutResult {
  const cache = options.cache === false ? undefined : options.cache ?? defaultMarkupLayoutCache;
  const document = cache
    ? cache.document(options.markup, options.parse)
    : parseTuiMarkup(options.markup, options.parse);
  const cssSource = Array.isArray(options.css) ? options.css.join("\n") : options.css as string | undefined;
  const stylesheet = options.stylesheet ??
    (cache ? cache.stylesheet(cssSource ?? "") : parseCssStylesheet(cssSource ?? ""));
  const engineDiagnostics: LayoutDiagnostic[] = [];
  const appliedDeclarations: AppliedTuiCssDeclaration[] = [];
  const engine = createLayoutEngine({
    solver: options.solver,
    onDiagnostic: (diagnostic) => engineDiagnostics.push(diagnostic),
  });
  const capabilities = resolveLayoutSolverCapabilities(engine.solver);
  const onDeclaration = options.cascade?.onDeclaration;
  const styledRoot = applyCssCascade(document.root, stylesheet, {
    ...(options.cascade ?? {}),
    viewport: options.cascade?.viewport ?? {
      width: options.bounds.width,
      height: options.bounds.height,
    },
    onDeclaration: (declaration) => {
      onDeclaration?.(declaration);
      appliedDeclarations.push(declaration);
    },
  });
  const declarationDiagnostics = inspectWinningDeclarations(appliedDeclarations, styledRoot, capabilities);
  const layout = engine.layout({
    root: styledRoot,
    bounds: options.bounds,
  });
  const widgets = options.widgets === false
    ? new MarkupWidgetHydration([])
    : hydrateMarkupWidgets(styledRoot, { layout, ...(options.widgets ?? {}) });
  const diagnostics = mergeLayoutDiagnostics(declarationDiagnostics, engineDiagnostics);
  return { document, styledRoot, layout, widgets, diagnostics };
}

function inspectWinningDeclarations(
  declarations: readonly AppliedTuiCssDeclaration[],
  styledRoot: TuiMarkupDocument["root"],
  capabilities: ReturnType<typeof resolveLayoutSolverCapabilities>,
): LayoutDiagnostic[] {
  const ownerByNodeAndField = new Map<string, number>();
  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index]!;
    const fields = resolvedLayoutDeclarationFields(declaration.property, declaration.value);
    if (!fields) continue;
    for (const field of fields) ownerByNodeAndField.set(`${declaration.nodeId}\u001f${field}`, index);
  }

  const fieldsByDeclaration = new Map<number, LayoutStyleField[]>();
  for (const [key, index] of ownerByNodeAndField) {
    const field = key.slice(key.lastIndexOf("\u001f") + 1) as LayoutStyleField;
    const fields = fieldsByDeclaration.get(index) ?? [];
    fields.push(field);
    fieldsByDeclaration.set(index, fields);
  }

  const stylesById = new Map<string, TuiMarkupDocument["root"]["style"]>();
  walkLayoutNodes(styledRoot, (node) => stylesById.set(node.id, node.style));

  const diagnostics: LayoutDiagnostic[] = [];
  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index]!;
    const property = declaration.property.trim().toLowerCase();
    const mapped = LAYOUT_CSS_PROPERTY_FIELDS[property as keyof typeof LAYOUT_CSS_PROPERTY_FIELDS];
    diagnostics.push(...inspectLayoutDeclarationCompatibility(capabilities, {
      ...declaration,
      fields: mapped ? fieldsByDeclaration.get(index) ?? [] : undefined,
      style: stylesById.get(declaration.nodeId),
    }));
  }
  return diagnostics;
}

function markupCacheKey(markup: string, options: TuiMarkupParseOptions | undefined): string {
  return `${options?.rootTag ?? ""}\u001f${options?.rootId ?? ""}\u001f${
    options?.preserveWhitespace ? "1" : "0"
  }\u001f${markup}`;
}

function cloneMarkupDocument(document: TuiMarkupDocument): TuiMarkupDocument {
  return {
    root: cloneLayoutNode(document.root),
    nodeCount: document.nodeCount,
  };
}

function cloneStylesheet(stylesheet: TuiCssStylesheet): TuiCssStylesheet {
  const rules = new Array<TuiCssRule>(stylesheet.rules.length);
  for (let index = 0; index < stylesheet.rules.length; index += 1) {
    rules[index] = cloneCssRule(stylesheet.rules[index]!);
  }
  return { rules };
}

function cloneCssRule(rule: TuiCssRule): TuiCssRule {
  return {
    selector: rule.selector,
    declarations: cloneCssDeclarations(rule.declarations),
    specificity: rule.specificity,
    order: rule.order,
    media: rule.media
      ? { source: rule.media.source, conditions: cloneMediaConditions(rule.media.conditions) }
      : undefined,
  };
}

function cloneCssDeclarations(declarations: readonly TuiCssDeclaration[]): TuiCssDeclaration[] {
  const clone = new Array<TuiCssDeclaration>(declarations.length);
  for (let index = 0; index < declarations.length; index += 1) {
    clone[index] = { ...declarations[index]! };
  }
  return clone;
}

function cloneMediaConditions(conditions: readonly TuiCssMediaCondition[]): TuiCssMediaCondition[] {
  const clone = new Array<TuiCssMediaCondition>(conditions.length);
  for (let index = 0; index < conditions.length; index += 1) {
    clone[index] = { ...conditions[index]! };
  }
  return clone;
}
