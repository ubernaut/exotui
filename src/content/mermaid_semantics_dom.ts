// Copyright 2023 Im-Beast. MIT license.
import {
  diagramSemanticNamespace,
  type DiagramSemanticNode,
  type DiagramSemanticTag,
  isDiagramMathAttribute,
  snapshotDiagramSemanticContent,
} from "./document_semantics.ts";
import type { MarkdownDiagramAccessibility, MarkdownInteraction } from "./markdown.ts";
import { expandUse, type MermaidUseBudget } from "./mermaid_use_dom.ts";
import { renderedTextResolver } from "./mermaid_text_transform_dom.ts";
import { generatedContentAlternative } from "./mermaid_generated_content_dom.ts";

/** Capture meaningful engine DOM content, never geometric paths, CSS or raw executable markup. */
export function mermaidSemanticContent(
  svg: SVGSVGElement,
  metadata: (element: Element) => MarkdownDiagramAccessibility,
  action?: (element: Element) => MarkdownInteraction | undefined,
  diagnostics: Set<string> = new Set(),
  rendered: (node: Text) => string = renderedTextResolver(svg.ownerDocument),
): readonly DiagramSemanticNode[] {
  const view = svg.ownerDocument.defaultView;
  let visited = 0;
  let units = 0;
  const useBudget: MermaidUseBudget = {
    nodes: 0,
    instances: 0,
    styleBytes: 0,
    originals: new WeakMap(),
    references: new Set(),
  };
  const charge = (text: string) => {
    if ((units += text.length) > 128_000) throw new RangeError("Mermaid semantic DOM exceeds its text budget.");
  };
  const excluded = new Set([
    "title",
    "desc",
    "style",
    "script",
    "metadata",
    "annotation",
    "annotation-xml",
    "iframe",
    "object",
    "embed",
    "audio",
    "video",
    "canvas",
  ]);
  function visit(element: Element, depth: number): DiagramSemanticNode[] {
    if (++visited > 20_000 || depth > 64) throw new RangeError("Mermaid semantic DOM exceeds its work budget.");
    const name = element.localName.toLowerCase();
    if (excluded.has(name) || element.getAttribute("aria-hidden") === "true") return [];
    const style = view?.getComputedStyle(element);
    if (style?.display === "none") return [];
    const visible = style?.visibility !== "hidden" && style?.visibility !== "collapse";
    const alternative = generatedContentAlternative(element);
    if (alternative !== undefined) {
      charge(alternative);
      // CSS slash alternatives replace only the generated box's spoken content.
      // They are literal metadata, unaffected by visual casing or whitespace collapse.
      return visible && alternative ? [{ tag: "span", text: alternative, whiteSpace: "pre" }] : [];
    }
    const whiteSpace = (style?.whiteSpace || "normal") as DiagramSemanticNode["whiteSpace"];
    const math = element.namespaceURI === "http://www.w3.org/1998/Math/MathML";
    const inMath = math || element.closest("math")?.namespaceURI === "http://www.w3.org/1998/Math/MathML";
    const textContext = math || element.namespaceURI === "http://www.w3.org/1999/xhtml" ||
      element.closest("text,tspan,textPath") !== null;
    const preserveSpaces = ["pre", "pre-wrap", "break-spaces"].includes(whiteSpace ?? "normal");
    let tag: DiagramSemanticTag | undefined;
    if (math && diagramSemanticNamespace(name) === "mathml") tag = name as DiagramSemanticTag;
    else if (!math && diagramSemanticNamespace(name) === "html") tag = name as DiagramSemanticTag;
    else if (["b", "i", "s", "strike"].includes(name)) tag = name === "b" ? "strong" : name === "i" ? "em" : "del";
    else if (name === "text") tag = "p";
    else if (name === "tspan") tag = "span";
    else if (name === "div") tag = "span";

    const declared = metadata(element);
    // Uninstanced symbols expose descendant text, not their own title/description node, in the compiler's AX tree.
    const info = name === "symbol" && !declared.role
      ? { ...declared, title: undefined, description: undefined, roleDescription: undefined }
      : declared;
    for (const field of [info.title, info.description, info.role, info.roleDescription]) {
      if (field !== undefined) charge(field);
    }
    const ownAction = action?.(element);
    // Only roots of an action get semantics. Child paint elements inherit the
    // same action object and must not become dozens of duplicate buttons.
    const parent = element.parentElement as Element | null;
    const parentAction = parent && parent !== svg ? action?.(parent) : undefined;
    let interaction = ownAction && ownAction !== parentAction ? ownAction : undefined;
    const role = info.role?.trim();
    const effectiveRole = role?.split(/\s+/).find((token) =>
      ["graphics-document", "graphics-object", "graphics-symbol", "document", "img", "group", "none", "presentation"]
        .includes(token)
    );
    const presentation = effectiveRole === "none" || effectiveRole === "presentation";
    const atomic = !presentation &&
      (effectiveRole === "img" || name === "img");
    const children: DiagramSemanticNode[] = [];
    let text = "";
    // Keep mixed MathML text at its actual position. Wrapping it in HTML spans
    // would change MathML token shaping and automatic identifier styling.
    const mixedMath = math && element.children.length > 0;
    // Phantom/annotation content must not become an audible duplicate of a
    // formula. Keep a phantom placeholder so script/fraction operand order survives.
    if (!atomic && name !== "mphantom") {
      if (name === "use") {
        const instance = expandUse(svg, element as SVGUseElement, diagnostics, useBudget);
        if (instance) {
          try {
            children.push(...visit(instance.scope, depth + 1));
          } finally {
            instance.dispose();
          }
        }
      }
      for (const child of element.childNodes) {
        if (child.nodeType === 1) children.push(...visit(child as Element, depth + 1));
        else if (child.nodeType === 3 && visible && textContext) {
          const value = rendered(child as Text);
          charge(value);
          if (math) {
            if (mixedMath) children.push({ tag: "#text", text: value });
            else text += value;
            continue;
          }
          if (/^[\t\n\r ]*$/.test(value)) {
            if (value && (children.length || preserveSpaces || inMath)) {
              children.push({
                tag: "span",
                text: value,
                whiteSpace,
              });
            }
            continue;
          }
          children.push({ tag: "span", text: value, whiteSpace });
        }
      }
    }
    if (!visible) return children;
    // SVG anchors may wrap an upstream node carrying the more specific native
    // ID/callback metadata. Keep that inner action, not a nested duplicate link.
    const nestedAction = (values: readonly DiagramSemanticNode[]): boolean =>
      values.some((child) =>
        child.interaction?.href === interaction?.href && !!child.interaction?.href || nestedAction(child.children ?? [])
      );
    if (interaction?.href && nestedAction(children)) interaction = undefined;
    const label = info.title ?? (name === "img" ? element.getAttribute("alt") ?? undefined : undefined);
    const meaningful = tag || label !== undefined || info.description !== undefined || role && !presentation ||
      interaction;
    if (!meaningful || presentation) return children;
    if (!tag) tag = "span";
    if (
      !children.length && !text && label === undefined && info.description === undefined && !interaction &&
      !math && tag !== "br"
    ) return [];
    const attributes: Record<string, string> = {};
    if (math) {
      for (const attribute of element.attributes) {
        if (isDiagramMathAttribute(attribute.name)) attributes[attribute.name] = attribute.value;
      }
    }
    return [{
      tag,
      ...(text ? { text } : {}),
      ...(math && style?.textTransform !== "math-auto" ? { textTransform: "none" as const } : {}),
      ...(!math && tag ? { whiteSpace } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(info.description !== undefined ? { description: info.description } : {}),
      ...(info.roleDescription !== undefined ? { roleDescription: info.roleDescription } : {}),
      ...(role && !presentation
        ? { role }
        : atomic
        ? { role: "img" }
        : label !== undefined || info.description !== undefined
        ? {
          role: name === "use" ? "graphics-object" : element.namespaceURI === "http://www.w3.org/2000/svg" &&
              ["text", "tspan", "textpath", "defs", "marker", "pattern"].includes(name)
            ? "generic"
            : "group",
        }
        : {}),
      ...(interaction ? { interaction } : {}),
      ...(Object.keys(attributes).length ? { attributes } : {}),
      ...(children.length ? { children } : {}),
    }];
  }
  const rootRole = svg.getAttribute("role")?.trim().split(/\s+/).find((role) =>
    ["graphics-document", "graphics-object", "graphics-symbol", "document", "img", "group", "none", "presentation"]
      .includes(role)
  );
  if (rootRole === "img") return [];
  const content = [...svg.children].flatMap((element) => visit(element, 0));
  const actionName = (node: DiagramSemanticNode): string =>
    node.label ?? [node.text ?? "", ...(node.children ?? []).map(actionName)].join("").trim();
  const named = new Set<string>();
  const actionKey = (node: DiagramSemanticNode): string =>
    JSON.stringify([
      node.interaction?.id,
      node.interaction?.href,
      node.interaction?.callbacks?.map((callback) => [callback.name, callback.args]),
    ]);
  const collect = (values: readonly DiagramSemanticNode[]) => {
    for (const node of values) {
      if (node.interaction && actionName(node)) named.add(actionKey(node));
      collect(node.children ?? []);
    }
  };
  collect(content);
  const labelActions = (values: readonly DiagramSemanticNode[]): DiagramSemanticNode[] =>
    values.map((node) => {
      const children = node.children ? labelActions(node.children) : undefined;
      if (!node.interaction || actionName(node)) return { ...node, ...(children ? { children } : {}) };
      // Gantt's task bar and separate text share a native ID. The readable text is
      // the semantic action; do not add a second unnamed button for its geometry.
      if (named.has(actionKey(node))) {
        const { interaction: _action, ...rest } = node;
        return { ...rest, ...(children ? { children } : {}) };
      }
      return {
        ...node,
        label: node.interaction.title ?? node.interaction.id ?? node.interaction.href ??
          node.interaction.callbacks?.[0]?.name,
        ...(children ? { children } : {}),
      };
    });
  return snapshotDiagramSemanticContent(labelActions(content));
}
