// Copyright 2023 Im-Beast. MIT license.
import {
  applyLayoutDeclaration,
  cloneComputedLayoutStyle,
  type ComputedLayoutStyle,
  defaultComputedLayoutStyle,
} from "../layout/style.ts";
import { LAYOUT_CSS_PROPERTY_FIELDS } from "../layout/capabilities.ts";
import { cloneLayoutNode, type LayoutNode } from "../layout/solver.ts";
import {
  parseCssDeclarations,
  parseCssStylesheet,
  selectorParts,
  type TuiCssDeclaration,
  type TuiCssMediaQuery,
  type TuiCssRule,
  type TuiCssStylesheet,
} from "./css.ts";

/** Runtime state names supported by CSS-like pseudo selectors. */
export type TuiCssNodeState = "focus" | "active" | "disabled" | "hover";

/** Renderer-environment facts CSS-like pseudo classes can match against. */
export interface TuiCssEnvironment {
  /** Drives `:light` and `:dark`. */
  colorScheme?: "light" | "dark";
  /** Drives `:screen-alternate`, `:screen-buffered`, and `:screen-inline`. */
  rendererMode?: "alternate" | "buffered" | "inline";
}

/** Options for applying a CSS-like cascade to a layout tree. */
export interface ApplyCssCascadeOptions extends TuiCssEnvironment {
  variables?: Record<string, string>;
  states?: Record<string, readonly TuiCssNodeState[]>;
  baseStyle?: ComputedLayoutStyle;
  viewport?: TuiCssViewport;
  /**
   * Textual-style scoped widget defaults: per-tag CSS applied below every
   * user rule regardless of specificity, with each entry's selectors scoped
   * to its tag's subtree (the sheet is wrapped as `tag { ... }`, so `&` and
   * bare descendants compose the same way nested rules do).
   */
  scopedDefaults?: Readonly<Record<string, string>>;
  onDeclaration?: (declaration: AppliedTuiCssDeclaration) => void;
}

/** One resolved declaration applied to a concrete node by the CSS-like cascade. */
export interface AppliedTuiCssDeclaration {
  nodeId: string;
  property: string;
  value: string;
  source: "stylesheet" | "inline";
  selector?: string;
}

/** Terminal-cell viewport dimensions used by CSS-like media rules. */
export interface TuiCssViewport {
  width: number;
  height: number;
}

interface MatchedRule {
  declarations: TuiCssDeclaration[];
  specificity: number;
  order: number;
  selector?: string;
  source: "stylesheet" | "inline";
}
/** Applies CSS-like rules and inline styles to a cloned layout tree. */
export function applyCssCascade(
  root: LayoutNode,
  stylesheet: TuiCssStylesheet,
  options: ApplyCssCascadeOptions = {},
): LayoutNode {
  const normalizedVariables = normalizeVariables(options.variables ?? {});
  const baseStyle = options.baseStyle ? cloneComputedLayoutStyle(options.baseStyle) : defaultComputedLayoutStyle();
  baseStyle.variables = { ...baseStyle.variables, ...normalizedVariables };
  return applyNode(root, [], baseStyle, stylesheet, buildScopedDefaultRules(options.scopedDefaults), options);
}

/**
 * Applies the cascade to one subtree in an existing styled context: the
 * ancestor chain drives selector matching and the parent's computed style is
 * the inheritance source. This is the incremental-restyle entry point — the
 * result equals what a full cascade would compute for the same subtree.
 */
export function applyCssCascadeSubtree(
  node: LayoutNode,
  ancestors: readonly LayoutNode[],
  inherited: ComputedLayoutStyle,
  stylesheet: TuiCssStylesheet,
  options: ApplyCssCascadeOptions = {},
): LayoutNode {
  return applyNode(
    node,
    ancestors,
    cloneComputedLayoutStyle(inherited),
    stylesheet,
    buildScopedDefaultRules(options.scopedDefaults),
    options,
  );
}

/** Parses per-tag default CSS into rules scoped beneath that tag. */
function buildScopedDefaultRules(defaults: Readonly<Record<string, string>> | undefined): TuiCssRule[] {
  if (!defaults) return [];
  const rules: TuiCssRule[] = [];
  for (const tag of Object.keys(defaults).sort()) {
    if (!/^[A-Za-z][\w-]*$/.test(tag)) continue;
    for (const rule of parseCssStylesheet(`${tag} { ${defaults[tag]} }`).rules) {
      rules.push({ ...rule, order: rules.length });
    }
  }
  return rules;
}

/** Returns true when a CSS-like selector matches a layout node path. */
export function matchesCssSelector(
  selector: string,
  node: LayoutNode,
  ancestors: readonly LayoutNode[] = [],
  states: Record<string, readonly TuiCssNodeState[]> = {},
  environment: TuiCssEnvironment = {},
): boolean {
  const parts = selectorParts(selector);
  if (parts.length === 0) return false;
  const chainLength = ancestors.length + 1;
  return matchPart(parts.length - 1, chainLength - 1);

  function matchPart(partIndex: number, nodeIndex: number): boolean {
    if (nodeIndex < 0) return false;
    const part = parts[partIndex]!;
    const current = chainNodeAt(ancestors, node, nodeIndex);
    const parent = nodeIndex > 0 ? chainNodeAt(ancestors, node, nodeIndex - 1) : undefined;
    if (!matchesSimpleSelector(part.simple, current, parent, nodeIndex === 0, states, environment)) {
      return false;
    }
    if (partIndex === 0) return true;

    const relation = part.combinator ?? "descendant";
    if (relation === "child") return matchPart(partIndex - 1, nodeIndex - 1);
    for (let ancestorIndex = nodeIndex - 1; ancestorIndex >= 0; ancestorIndex -= 1) {
      if (matchPart(partIndex - 1, ancestorIndex)) return true;
    }
    return false;
  }
}

function chainNodeAt(ancestors: readonly LayoutNode[], node: LayoutNode, index: number): LayoutNode {
  return index === ancestors.length ? node : ancestors[index]!;
}

/** Resolves CSS variable functions in a declaration value. */
export function resolveCssVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_match, name: string, fallback: string) => {
    return variables[name] ?? fallback?.trim() ?? "";
  });
}

function applyNode(
  node: LayoutNode,
  ancestors: readonly LayoutNode[],
  inherited: ComputedLayoutStyle,
  stylesheet: TuiCssStylesheet,
  defaultsRules: readonly TuiCssRule[],
  options: ApplyCssCascadeOptions,
): LayoutNode {
  const next = cloneLayoutNode(node);
  const style = defaultComputedLayoutStyle();
  style.color = inherited.color;
  style.visibility = inherited.visibility;
  style.variables = { ...inherited.variables };

  const defaultMatches: MatchedRule[] = [];
  for (const rule of defaultsRules) {
    if (matchesCssSelector(rule.selector, node, ancestors, options.states ?? {}, options)) {
      defaultMatches.push({
        declarations: rule.declarations,
        specificity: rule.specificity,
        order: rule.order,
        selector: rule.selector,
        source: "stylesheet",
      });
    }
  }
  defaultMatches.sort((left, right) => left.specificity - right.specificity || left.order - right.order);

  const matches: MatchedRule[] = [];
  for (const rule of stylesheet.rules) {
    if (
      matchesCssMedia(rule.media, options.viewport) &&
      matchesCssSelector(rule.selector, node, ancestors, options.states ?? {}, options)
    ) {
      matches.push({
        declarations: rule.declarations,
        specificity: rule.specificity,
        order: rule.order,
        selector: rule.selector,
        source: "stylesheet",
      });
    }
  }
  matches.sort((left, right) => left.specificity - right.specificity || left.order - right.order);

  const inline = node.attributes.style ? parseCssDeclarations(node.attributes.style) : [];
  if (inline.length > 0) {
    matches.push({
      declarations: inline,
      specificity: 1_000,
      order: 1_000_000,
      source: "inline",
    });
  }
  const defaulted = defaultMatches.length > 0
    ? applyMatchedRules(style, defaultMatches, node.id, inherited, options.onDeclaration)
    : style;
  next.style = applyMatchedRules(defaulted, matches, node.id, inherited, options.onDeclaration);

  const childAncestors = appendAncestor(ancestors, node);
  next.children = new Array<LayoutNode>(node.children.length);
  for (let index = 0; index < node.children.length; index += 1) {
    next.children[index] = applyNode(
      node.children[index]!,
      childAncestors,
      next.style,
      stylesheet,
      defaultsRules,
      options,
    );
  }
  return next;
}

/** Returns true when a CSS-like media query applies to a terminal-cell viewport. */
export function matchesCssMedia(
  media: TuiCssMediaQuery | undefined,
  viewport: TuiCssViewport | undefined,
): boolean {
  if (!media) return true;
  if (!viewport) return false;
  return media.conditions.every((condition) => {
    if (condition.feature === "min-width") return viewport.width >= condition.value;
    if (condition.feature === "max-width") return viewport.width <= condition.value;
    if (condition.feature === "min-height") return viewport.height >= condition.value;
    return viewport.height <= condition.value;
  });
}

function applyMatchedRules(
  style: ComputedLayoutStyle,
  matches: readonly MatchedRule[],
  nodeId: string,
  inherited: ComputedLayoutStyle,
  onDeclaration: ApplyCssCascadeOptions["onDeclaration"],
): ComputedLayoutStyle {
  let next = style;
  // `!important` declarations apply after every normal one, preserving their
  // own specificity/source order among themselves — so an important
  // stylesheet rule beats a normal inline style, and an important inline
  // style beats both.
  const importantQueue: Array<{ declaration: TuiCssDeclaration; match: MatchedRule }> = [];
  const applyOne = (declaration: TuiCssDeclaration, match: MatchedRule): void => {
    const value = resolveCssVariables(declaration.value, next.variables);
    onDeclaration?.({
      nodeId,
      property: declaration.property,
      value,
      source: match.source,
      selector: match.selector,
    });
    const keyword = value.trim().toLowerCase();
    next = keyword === "initial"
      ? applyCssInitial(next, declaration.property)
      : keyword === "inherit"
      ? applyCssFieldCopy(next, declaration.property, inherited)
      : keyword === "unset"
      ? applyCssUnset(next, declaration.property, inherited)
      : applyLayoutDeclaration(next, declaration.property, value);
  };
  for (const match of matches) {
    for (const declaration of match.declarations) {
      if (declaration.important) importantQueue.push({ declaration, match });
      else applyOne(declaration, match);
    }
  }
  for (const entry of importantQueue) applyOne(entry.declaration, entry.match);
  return next;
}

/**
 * Resets every normalized field a property owns back to its default —
 * Textual-style `initial`. Unknown properties reset nothing.
 */
function applyCssInitial(style: ComputedLayoutStyle, property: string): ComputedLayoutStyle {
  return applyCssFieldCopy(style, property, defaultComputedLayoutStyle());
}

/** Fields the cascade propagates parent-to-child; `unset` re-inherits these. */
const INHERITED_LAYOUT_FIELDS: ReadonlySet<string> = new Set(["color", "visibility"]);

/** Browser-style `unset` (repo extension): inherit for inherited fields, initial otherwise. */
function applyCssUnset(
  style: ComputedLayoutStyle,
  property: string,
  inherited: ComputedLayoutStyle,
): ComputedLayoutStyle {
  const fields = LAYOUT_CSS_PROPERTY_FIELDS[property];
  if (!fields || fields.length === 0) return style;
  const inheritedOnly = fields.every((field) => INHERITED_LAYOUT_FIELDS.has(field));
  return inheritedOnly ? applyCssFieldCopy(style, property, inherited) : applyCssInitial(style, property);
}

/** Copies every normalized field a property owns from a source style. */
function applyCssFieldCopy(
  style: ComputedLayoutStyle,
  property: string,
  from: ComputedLayoutStyle,
): ComputedLayoutStyle {
  const fields = LAYOUT_CSS_PROPERTY_FIELDS[property];
  if (!fields || fields.length === 0) return style;
  const next = cloneComputedLayoutStyle(style);
  const target = next as unknown as Record<string, unknown>;
  const source = from as unknown as Record<string, unknown>;
  for (const field of fields) {
    const value = source[field];
    target[field] = value !== null && typeof value === "object" ? structuredClone(value) : value;
  }
  // Authored percentage/auto spacing metadata rides a sidecar; a reset
  // property must drop its entry or the stale authored value would win.
  const sidecar = (next as StyleWithAuthoredLengths).__layoutLengths;
  if (sidecar) {
    if (fields.includes("margin")) sidecar.margin = undefined;
    if (fields.includes("padding")) sidecar.padding = undefined;
    if (fields.includes("rowGap")) sidecar.rowGap = undefined;
    if (fields.includes("columnGap")) sidecar.columnGap = undefined;
  }
  return next;
}

interface StyleWithAuthoredLengths {
  __layoutLengths?: {
    margin?: unknown;
    padding?: unknown;
    rowGap?: unknown;
    columnGap?: unknown;
  };
}

function matchesSimpleSelector(
  selector: string,
  node: LayoutNode,
  parent: LayoutNode | undefined,
  isRoot: boolean,
  states: Record<string, readonly TuiCssNodeState[]>,
  environment: TuiCssEnvironment = {},
): boolean {
  if (selector === "*") return true;
  const tag = /^(#text|[A-Za-z][\w-]*|\*)/.exec(selector)?.[1];
  if (tag && tag !== "*" && tag.toLowerCase() !== node.tag) return false;

  for (const id of selector.matchAll(/#([A-Za-z_][\w-]*)/g)) {
    if (node.id !== id[1]) return false;
  }
  for (const className of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    if (!node.classes.includes(className[1]!)) return false;
  }
  for (const attribute of selector.matchAll(/\[\s*([A-Za-z_][\w-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\]\s]+))?\s*\]/g)) {
    const name = attribute[1]!;
    const expected = normalizeAttributeSelectorValue(attribute[2]);
    if (!(name in node.attributes)) return false;
    if (expected !== undefined && node.attributes[name] !== expected) return false;
  }
  if (!selector.includes(":")) return true;
  for (const pseudo of selector.matchAll(/:([A-Za-z_][\w-]*)(?:\(([^)]*)\))?/g)) {
    const state = pseudo[1];
    if (state === "root") {
      if (!isRoot) return false;
      continue;
    }
    if (isStructuralPseudo(state)) {
      if (!matchesStructuralPseudo(state, pseudo[2], node, parent)) return false;
      continue;
    }
    if (state === "empty") {
      if (node.text || node.children.length > 0) return false;
      continue;
    }
    if (state === "enabled") {
      if (states[node.id]?.includes("disabled")) return false;
      continue;
    }
    if (state === "focus-within") {
      if (!hasFocusWithin(node, states)) return false;
      continue;
    }
    if (state === "light" || state === "dark") {
      if (environment.colorScheme !== state) return false;
      continue;
    }
    if (state === "screen-alternate" || state === "screen-buffered" || state === "screen-inline") {
      if (environment.rendererMode !== state.slice("screen-".length)) return false;
      continue;
    }
    if (!states[node.id]?.includes(state as TuiCssNodeState)) {
      return false;
    }
  }
  return true;
}

/** True when the node or any descendant currently holds focus. */
function hasFocusWithin(node: LayoutNode, states: Record<string, readonly TuiCssNodeState[]>): boolean {
  if (states[node.id]?.includes("focus")) return true;
  for (const child of node.children) {
    if (hasFocusWithin(child, states)) return true;
  }
  return false;
}

function isStructuralPseudo(pseudo: string | undefined): boolean {
  return pseudo === "first-child" || pseudo === "last-child" || pseudo === "only-child" || pseudo === "nth-child" ||
    pseudo === "first-of-type" || pseudo === "last-of-type" || pseudo === "odd" || pseudo === "even";
}

function matchesStructuralPseudo(
  pseudo: string | undefined,
  argument: string | undefined,
  node: LayoutNode,
  parent: LayoutNode | undefined,
): boolean {
  if (!parent) return false;
  const index = childIndex(parent, node);
  if (index < 0) return false;
  const position = index + 1;
  const count = parent.children.length;
  if (pseudo === "first-child") return position === 1;
  if (pseudo === "last-child") return position === count;
  if (pseudo === "only-child") return count === 1;
  // Textual-style shorthands for alternating rows.
  if (pseudo === "odd") return position % 2 === 1;
  if (pseudo === "even") return position % 2 === 0;
  if (pseudo === "first-of-type" || pseudo === "last-of-type") {
    const siblings = parent.children.filter((child) => child.tag === node.tag);
    const at = siblings.findIndex((child) => child === node || child.id === node.id);
    if (at < 0) return false;
    return pseudo === "first-of-type" ? at === 0 : at === siblings.length - 1;
  }
  return matchesNthChild(argument, position);
}

function matchesNthChild(argument: string | undefined, position: number): boolean {
  const normalized = argument?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "odd") return position % 2 === 1;
  if (normalized === "even") return position % 2 === 0;
  if (!/^\d+$/.test(normalized)) return false;
  return position === Number.parseInt(normalized, 10);
}

function childIndex(parent: LayoutNode, node: LayoutNode): number {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (!child) continue;
    if (child === node || child.id === node.id) return index;
  }
  return -1;
}

function normalizeAttributeSelectorValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeVariables(variables: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const name in variables) {
    const value = variables[name]!;
    normalized[name.startsWith("--") ? name : `--${name}`] = value;
  }
  return normalized;
}

function appendAncestor(ancestors: readonly LayoutNode[], node: LayoutNode): LayoutNode[] {
  const next = new Array<LayoutNode>(ancestors.length + 1);
  for (let index = 0; index < ancestors.length; index += 1) {
    next[index] = ancestors[index]!;
  }
  next[ancestors.length] = node;
  return next;
}
