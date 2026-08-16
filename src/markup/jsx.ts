// Copyright 2023 Im-Beast. MIT license.

// 036 K1 (evaluation): a Deno-native JSX layer over the live markup tree.
// The runtime is data-only — `jsx`/`jsxs` (the automatic react-jsx
// transform Deno ships) and the classic `h` factory both build frozen
// element records, no framework attached — and the reconciler maps an
// element tree onto a LiveMarkupTree with minimal mutations: keyed or
// positional matching, attribute/class/text diffs, subtree mount for new
// material, removal for departed nodes. React, Solid, Bun, and native
// runtimes are structurally unnecessary: TSX files opt in per file with
// `/** @jsxImportSource <this module's dir> */` or call `h` directly.

import type { LiveMarkupTree } from "./live_tree.ts";

/** One JSX element record (data only). */
export interface JsxElement {
  readonly tag: string;
  readonly key?: string;
  readonly props: Readonly<Record<string, string | number | boolean>>;
  readonly children: readonly (JsxElement | string)[];
}

/** Fragment sentinel: children splice into the parent. */
export const Fragment = "#fragment";

type JsxProps = Record<string, unknown> & { children?: unknown };

function toChildren(raw: unknown): (JsxElement | string)[] {
  if (raw === undefined || raw === null || raw === false) return [];
  const flat = Array.isArray(raw) ? raw.flat(Infinity) : [raw];
  const children: (JsxElement | string)[] = [];
  for (const child of flat) {
    if (child === undefined || child === null || child === false || child === true) continue;
    if (typeof child === "string" || typeof child === "number") children.push(String(child));
    else if (isJsxElement(child)) {
      if (child.tag === Fragment) children.push(...child.children);
      else children.push(child);
    }
  }
  return children;
}

function isJsxElement(value: unknown): value is JsxElement {
  return typeof value === "object" && value !== null && "tag" in value && "children" in value;
}

/** The automatic-runtime factory (Deno's `react-jsx` transform target). */
export function jsx(tag: string, props: JsxProps | null, key?: string): JsxElement {
  const { children: rawChildren, ...rest } = props ?? {};
  const attributes: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(rest)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === "string" || typeof value === "number" || value === true) attributes[name] = value;
  }
  return Object.freeze({
    tag,
    key,
    props: Object.freeze(attributes),
    children: Object.freeze(toChildren(rawChildren)),
  });
}

/** Multi-child variant; identical here. */
export const jsxs = jsx;

/** Classic factory for plain TypeScript call sites. */
export function h(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): JsxElement {
  const key = props?.key === undefined ? undefined : String(props.key);
  const { key: _key, ...rest } = props ?? {};
  return jsx(tag, { ...rest, children }, key);
}

interface ShadowNode {
  id: string;
  tag: string;
  key?: string;
  props: Readonly<Record<string, string | number | boolean>>;
  text?: string;
  children: ShadowNode[];
}

function textOf(element: JsxElement): string | undefined {
  if (element.children.length === 0) return undefined;
  if (element.children.every((child) => typeof child === "string")) return element.children.join("");
  return undefined;
}

function elementChildren(element: JsxElement): JsxElement[] {
  return element.children.filter((child): child is JsxElement => typeof child !== "string");
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function serialize(element: JsxElement): string {
  const attributes = Object.entries(element.props)
    .map(([name, value]) => value === true ? ` ${name}` : ` ${name}="${escapeAttribute(String(value))}"`)
    .join("");
  const text = textOf(element);
  const body = text !== undefined ? escapeAttribute(text) : elementChildren(element).map(serialize).join("");
  return `<${element.tag}${attributes}>${body}</${element.tag}>`;
}

/** Reconciles element trees onto one live-markup host node. */
export class JsxReconciler {
  readonly #tree: LiveMarkupTree;
  readonly #hostId: string;
  #shadow: ShadowNode[] = [];

  constructor(tree: LiveMarkupTree, hostId: string) {
    this.#tree = tree;
    this.#hostId = hostId;
  }

  /** Renders the next element tree with minimal live-tree mutations. */
  render(next: JsxElement | readonly JsxElement[]): void {
    const elements = Array.isArray(next) ? next : [next as JsxElement];
    this.#shadow = this.#reconcileChildren(this.#hostId, this.#shadow, elements);
  }

  /** The reconciler's current view of its subtree (for assertions). */
  shadow(): readonly ShadowNode[] {
    return this.#shadow;
  }

  #reconcileChildren(parentId: string, previous: ShadowNode[], next: readonly JsxElement[]): ShadowNode[] {
    const result: ShadowNode[] = [];
    const unmatched = [...previous];

    for (let index = 0; index < next.length; index += 1) {
      const element = next[index]!;
      const matchAt = unmatched.findIndex((candidate) =>
        candidate.tag === element.tag &&
        (element.key !== undefined ? candidate.key === element.key : true)
      );
      if (matchAt >= 0) {
        const shadow = unmatched.splice(matchAt, 1)[0]!;
        this.#update(shadow, element);
        this.#tree.move(shadow.id, parentId, index);
        result.push(shadow);
      } else {
        const mounted = this.#tree.mount(parentId, serialize(element), index);
        const node = mounted[0];
        if (!node) continue;
        result.push(this.#adopt(node.id, element));
      }
    }
    for (const departed of unmatched) this.#tree.remove(departed.id);
    return result;
  }

  #adopt(id: string, element: JsxElement): ShadowNode {
    const node = this.#tree.node(id)!;
    const children = elementChildren(element);
    return {
      id,
      tag: element.tag,
      key: element.key,
      props: element.props,
      text: textOf(element),
      children: children.map((child, index) => this.#adopt(node.children[index]!.id, child)),
    };
  }

  #update(shadow: ShadowNode, element: JsxElement): void {
    for (const [name, value] of Object.entries(element.props)) {
      if (shadow.props[name] !== value) this.#tree.setAttribute(shadow.id, name, String(value));
    }
    for (const name of Object.keys(shadow.props)) {
      if (!(name in element.props)) this.#tree.removeAttribute(shadow.id, name);
    }
    const text = textOf(element);
    if (text !== shadow.text) this.#tree.setText(shadow.id, text);
    shadow.props = element.props;
    shadow.text = text;
    shadow.key = element.key;
    shadow.children = this.#reconcileChildren(shadow.id, shadow.children, elementChildren(element));
  }
}

/** Creates a reconciler bound to one host node. */
export function createJsxReconciler(tree: LiveMarkupTree, hostId: string): JsxReconciler {
  return new JsxReconciler(tree, hostId);
}
