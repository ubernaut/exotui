// Copyright 2023 Im-Beast. MIT license.
import { themeTokenNames, type ThemeTokens } from "../theme.ts";
import { parseAnsiCell } from "./cell_canvas_sink.ts";

/** CSS style object used by lightweight DOM render nodes. */
export type DomNodeStyle = Record<string, string | number | undefined>;

/** Serializable DOM node description for browser-hosted widgets and tests. */
export interface DomRenderNode {
  tag?: keyof HTMLElementTagNameMap;
  /** Explicit MathML namespace; existing HTML tag descriptors retain their original API. */
  mathTag?: keyof MathMLElementTagNameMap;
  text?: string;
  role?: string;
  ariaLabel?: string;
  className?: string;
  style?: DomNodeStyle;
  attributes?: Record<string, string | number | boolean | undefined>;
  on?: Partial<Record<"click" | "input" | "keydown" | "focus" | "blur", EventListener>>;
  /** Strings create inert text nodes in source order, without an extra element wrapper. */
  children?: readonly (DomRenderNode | string)[];
}

/** Snapshot of mounted DOM target state. */
export interface DomRenderTargetInspection {
  mounted: boolean;
  nodeCount: number;
}

/** Minimal DOM renderer that replaces a mounted node tree from render descriptors. */
export class DomRenderTarget {
  readonly #document: Document;
  #root?: HTMLElement;
  #current?: HTMLElement | MathMLElement;
  #nodeCount = 0;

  constructor(documentRef: Document = document) {
    this.#document = documentRef;
  }

  mount(root: HTMLElement, node: DomRenderNode): void {
    this.unmount();
    this.#root = root;
    this.#current = this.#create(node);
    root.appendChild(this.#current);
  }

  update(node: DomRenderNode): void {
    if (!this.#root) {
      throw new Error("DomRenderTarget must be mounted before update().");
    }
    const next = this.#create(node);
    if (this.#current) this.#root.replaceChild(next, this.#current);
    else this.#root.appendChild(next);
    this.#current = next;
  }

  unmount(): void {
    if (this.#current?.parentNode) {
      this.#current.parentNode.removeChild(this.#current);
    }
    this.#root = undefined;
    this.#current = undefined;
    this.#nodeCount = 0;
  }

  inspectTarget(): DomRenderTargetInspection {
    return { mounted: Boolean(this.#root && this.#current), nodeCount: this.#nodeCount };
  }

  #create(node: DomRenderNode): HTMLElement | MathMLElement {
    this.#nodeCount += 1;
    const element = node.mathTag
      ? this.#document.createElementNS("http://www.w3.org/1998/Math/MathML", node.mathTag)
      : this.#document.createElement(node.tag ?? "div");
    if (node.text !== undefined) element.textContent = node.text;
    if (node.role) element.setAttribute("role", node.role);
    if (node.ariaLabel) element.setAttribute("aria-label", node.ariaLabel);
    if (node.className) element.setAttribute("class", node.className);
    if (node.style) applyDomStyle(element, node.style);
    if (node.attributes) {
      for (const [name, value] of Object.entries(node.attributes)) {
        if (value === undefined || value === false) continue;
        element.setAttribute(name, value === true ? "" : String(value));
      }
    }
    if (node.on) {
      for (const [type, listener] of Object.entries(node.on)) {
        if (listener) element.addEventListener(type, listener);
      }
    }
    for (const child of node.children ?? []) {
      if (typeof child === "string") {
        this.#nodeCount += 1;
        element.appendChild(this.#document.createTextNode(child));
      } else element.appendChild(this.#create(child));
    }
    return element;
  }
}

/** Renders a DOM node descriptor to an escaped HTML string. */
export function renderDomNodeToHtml(node: DomRenderNode): string {
  const tag = node.mathTag ?? node.tag ?? "div";
  const attributes = domAttributes(node);
  const text = node.text === undefined ? "" : escapeHtml(node.text);
  let children = "";
  for (const child of node.children ?? []) {
    children += typeof child === "string" ? escapeHtml(child) : renderDomNodeToHtml(child);
  }
  return `<${tag}${attributes}>${text}${children}</${tag}>`;
}

/** Converts terminal theme token functions into CSS custom properties. */
export function themeTokensToCssVariables(
  tokens: ThemeTokens | { tokens: ThemeTokens },
  sample = "M",
): Record<string, string> {
  const themeTokens = "tokens" in tokens ? tokens.tokens : tokens;
  const variables: Record<string, string> = {};
  for (const token of themeTokenNames) {
    const parsed = parseAnsiCell(themeTokens[token](sample));
    if (parsed.foreground) variables[`--deno-tui-${token}-fg`] = parsed.foreground;
    if (parsed.background) variables[`--deno-tui-${token}-bg`] = parsed.background;
  }
  return variables;
}

/** Applies CSS custom properties to a DOM element. */
export function applyCssVariables(element: HTMLElement, variables: Record<string, string>): void {
  for (const [name, value] of Object.entries(variables)) {
    element.style.setProperty(name, value);
  }
}

function applyDomStyle(element: HTMLElement | MathMLElement, style: DomNodeStyle): void {
  for (const [name, value] of Object.entries(style)) {
    if (value === undefined) continue;
    element.style.setProperty(kebabCase(name), String(value));
  }
}

function domAttributes(node: DomRenderNode): string {
  const attributes: Record<string, string | number | boolean | undefined> = {
    role: node.role,
    "aria-label": node.ariaLabel,
    class: node.className,
    style: node.style ? styleToString(node.style) : undefined,
    ...node.attributes,
  };
  let output = "";
  for (const name in attributes) {
    const value = attributes[name];
    if (value === undefined || value === false) continue;
    output += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }
  return output;
}

function styleToString(style: DomNodeStyle): string {
  let output = "";
  for (const name in style) {
    const value = style[name];
    if (value === undefined) continue;
    if (output) output += ";";
    output += `${kebabCase(name)}:${String(value)}`;
  }
  return output;
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
