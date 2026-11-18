// Copyright 2023 Im-Beast. MIT license.
import type { MarkdownInteraction } from "./markdown.ts";

/** Inert label structure; no scripts, styles, resource elements or executable attributes. */
export type DiagramSemanticTag =
  | "#text"
  | "span"
  | "p"
  | "strong"
  | "em"
  | "code"
  | "del"
  | "br"
  | "ul"
  | "ol"
  | "li"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
  | "math"
  | "mrow"
  | "mi"
  | "mn"
  | "mo"
  | "mtext"
  | "ms"
  | "mfrac"
  | "msqrt"
  | "mroot"
  | "msub"
  | "msup"
  | "msubsup"
  | "munder"
  | "mover"
  | "munderover"
  | "mmultiscripts"
  | "mprescripts"
  | "none"
  | "mtable"
  | "mtr"
  | "mtd"
  | "mstyle"
  | "mspace"
  | "mpadded"
  | "mphantom"
  | "semantics"
  | "merror";

/** JSON-portable semantic content captured from the engine DOM, independent of painted glyphs. */
export interface DiagramSemanticNode {
  readonly tag: DiagramSemanticTag;
  /** Owned whitespace behavior, never arbitrary source CSS. */
  readonly whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line" | "break-spaces";
  /** Captured MathML casing must not be transformed again by the companion's default math-auto styling. */
  readonly textTransform?: "none";
  readonly text?: string;
  readonly role?: string;
  readonly label?: string;
  readonly description?: string;
  readonly roleDescription?: string;
  /** Only bounded mathematical presentation attributes are accepted, never arbitrary DOM attributes. */
  readonly attributes?: Readonly<Record<string, string>>;
  /** Declarative native action. A browser host must explicitly opt into dispatch; no href is installed. */
  readonly interaction?: MarkdownInteraction;
  readonly children?: readonly DiagramSemanticNode[];
}

const htmlTags = new Set<string>([
  "span",
  "p",
  "strong",
  "em",
  "code",
  "del",
  "br",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
const mathTags = new Set<string>([
  "math",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mtext",
  "ms",
  "mfrac",
  "msqrt",
  "mroot",
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mmultiscripts",
  "mprescripts",
  "none",
  "mtable",
  "mtr",
  "mtd",
  "mstyle",
  "mspace",
  "mpadded",
  "mphantom",
  "semantics",
  "merror",
]);
const mathAttributes = new Set([
  "display",
  "mathvariant",
  "mathsize",
  "displaystyle",
  "scriptlevel",
  "dir",
  "stretchy",
  "symmetric",
  "fence",
  "separator",
  "largeop",
  "movablelimits",
  "accent",
  "accentunder",
  "bevelled",
  "linethickness",
  "lspace",
  "rspace",
  "minsize",
  "maxsize",
  "columnalign",
  "rowalign",
  "columnspan",
  "rowspan",
  "columnspacing",
  "rowspacing",
  "width",
  "height",
  "depth",
  "lquote",
  "rquote",
  "voffset",
]);

/** The only element namespaces permitted in a native diagram's semantic companion. */
export function diagramSemanticNamespace(tag: string): "html" | "mathml" | undefined {
  return htmlTags.has(tag) ? "html" : mathTags.has(tag) ? "mathml" : undefined;
}

/** Mathematical attributes which cannot load resources, install CSS or execute actions. */
export function isDiagramMathAttribute(name: string): boolean {
  return mathAttributes.has(name);
}

/** Validate, deeply freeze and bound remote content before creating DOM or terminal announcements. */
export function snapshotDiagramSemanticContent(
  content: readonly DiagramSemanticNode[],
): readonly DiagramSemanticNode[] {
  let nodes = 0, units = 0;
  const ancestors = new Set<object>();
  function plain(value: unknown, limit = 4096): string {
    if (typeof value !== "string") throw new TypeError("Diagram semantic values must be plain text.");
    if (value.length > limit || (units += value.length) > 128_000) {
      throw new RangeError("Diagram semantic content exceeds its text budget.");
    }
    // deno-lint-ignore no-control-regex -- preserve ordinary whitespace, reject terminal controls
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value)) {
      throw new TypeError("Diagram semantic content cannot contain terminal controls.");
    }
    return value;
  }
  function interaction(value: MarkdownInteraction): MarkdownInteraction {
    if (!value || typeof value !== "object") throw new TypeError("Invalid diagram semantic action.");
    const result: MarkdownInteraction = {};
    for (const field of ["id", "href", "target", "title"] as const) {
      if (value[field] !== undefined) result[field] = plain(value[field]);
    }
    if (result.href) {
      // deno-lint-ignore no-control-regex -- URL whitespace must not conceal executable schemes
      if (/[\x00-\x1f\x7f-\x9f]/.test(result.href) || /^(?:javascript|vbscript|data):/i.test(result.href.trim())) {
        throw new TypeError("Unsafe diagram semantic link.");
      }
    }
    if (value.callbacks !== undefined) {
      if (!Array.isArray(value.callbacks) || value.callbacks.length > 1024) {
        throw new RangeError("Diagram semantic callbacks exceed their count budget.");
      }
      result.callbacks = Object.freeze(value.callbacks.map((callback) => {
        if (!callback || !Array.isArray(callback.args) || callback.args.length > 128) {
          throw new TypeError("Invalid diagram semantic callback arguments.");
        }
        return Object.freeze({
          name: plain(callback.name),
          args: Object.freeze(callback.args.map((arg: unknown) => plain(arg))),
        });
      }));
    }
    return Object.freeze(result);
  }
  function list(values: readonly DiagramSemanticNode[], depth: number): readonly DiagramSemanticNode[] {
    if (!Array.isArray(values)) throw new TypeError("Diagram semantic children must be arrays.");
    if (depth > 64 || values.length > 4096) throw new RangeError("Diagram semantic structure exceeds its budget.");
    return Object.freeze(values.map((value) => {
      if (!value || typeof value !== "object") throw new TypeError("Invalid diagram semantic node.");
      if (++nodes > 4096) throw new RangeError("Diagram semantic node count exceeds its budget.");
      if (ancestors.has(value)) throw new TypeError("Diagram semantic content cannot contain cycles.");
      if (value.tag === "#text") {
        if (Object.keys(value).some((key) => key !== "tag" && key !== "text")) {
          throw new TypeError("Diagram semantic text nodes cannot contain element metadata.");
        }
        return Object.freeze({ tag: "#text" as const, text: plain(value.text) });
      }
      const namespace = diagramSemanticNamespace(value.tag);
      if (!namespace) throw new TypeError("Unsupported diagram semantic element.");
      const result: { -readonly [K in keyof DiagramSemanticNode]: DiagramSemanticNode[K] } = { tag: value.tag };
      if (value.whiteSpace !== undefined) {
        if (!["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"].includes(value.whiteSpace)) {
          throw new TypeError("Unsafe diagram semantic whitespace mode.");
        }
        result.whiteSpace = value.whiteSpace;
      }
      if (value.textTransform !== undefined) {
        if (namespace !== "mathml" || value.textTransform !== "none") {
          throw new TypeError("Unsafe diagram semantic text transformation.");
        }
        result.textTransform = value.textTransform;
      }
      for (const field of ["text", "role", "label", "description", "roleDescription"] as const) {
        if (value[field] !== undefined) result[field] = plain(value[field], field === "description" ? 32768 : 4096);
      }
      if (value.attributes !== undefined) {
        if (!value.attributes || typeof value.attributes !== "object" || Array.isArray(value.attributes)) {
          throw new TypeError("Invalid diagram semantic attributes.");
        }
        const attributes: Record<string, string> = {};
        if (Object.keys(value.attributes).length > 40) throw new RangeError("Too many diagram semantic attributes.");
        for (const [name, attribute] of Object.entries(value.attributes)) {
          if (namespace !== "mathml" || !isDiagramMathAttribute(name)) {
            throw new TypeError("Unsafe diagram semantic attribute.");
          }
          attributes[name] = plain(attribute, 512);
        }
        result.attributes = Object.freeze(attributes);
      }
      if (value.interaction !== undefined) result.interaction = interaction(value.interaction);
      ancestors.add(value);
      if (value.children !== undefined) result.children = list(value.children, depth + 1);
      ancestors.delete(value);
      return Object.freeze(result);
    }));
  }
  return list(content, 0);
}
