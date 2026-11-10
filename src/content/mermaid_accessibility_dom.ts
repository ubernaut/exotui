// Copyright 2023 Im-Beast. MIT license.
import type { MarkdownDiagramAccessibility, MarkdownInteraction } from "./markdown.ts";
import { snapshotDiagramAccessibility } from "./document_accessibility.ts";
import { mermaidSemanticContent } from "./mermaid_semantics_dom.ts";
import { renderedTextResolver } from "./mermaid_text_transform_dom.ts";
import { generatedContentAlternative, withMermaidGeneratedContent } from "./mermaid_generated_content_dom.ts";

let nextMetadataId = 0;

/** Work around measured 12.1.0 gaps in the documented common accessibility preamble only.
 * All diagram body syntax, front matter, configuration, layout and supported-family
 * accessibility statements remain owned by upstream. This is not a second grammar.
 */
export function mermaidAccessibilityPreamble(source: string): {
  source: string;
  accessibility?: MarkdownDiagramAccessibility;
} {
  const lines = source.split(/\r?\n/);
  let header = 0;
  function skipLeadingComments() {
    while (header < lines.length && (!lines[header]!.trim() || lines[header]!.trim().startsWith("%%"))) {
      if (lines[header]!.trim().startsWith("%%{")) {
        while (header < lines.length && !lines[header]!.includes("}%%")) header++;
      }
      header++;
    }
  }
  skipLeadingComments();
  if (lines[header]?.trim() === "---") {
    header++;
    while (header < lines.length && lines[header]!.trim() !== "---") header++;
    header++;
    skipLeadingComments();
  }
  // These nine built-ins and the ZenUML extension reject or ignore the common
  // preamble in the pinned engines.
  // Do not bypass upstream's sanitization or statement ordering for working families.
  if (
    !/^(?:mindmap|timeline|sankey(?:-beta)?|block(?:-beta)?|kanban|eventmodeling|venn(?:-beta)?|ishikawa(?:-beta)?|info|zenuml)\b/
      .test(
        lines[header]?.trim() ?? "",
      )
  ) return { source };
  let title: string | undefined, description: string | undefined;
  const removed = new Set<number>();
  for (let index = header + 1; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (!line) {
      removed.add(index);
      continue;
    }
    if (line.startsWith("%%") && !line.startsWith("%%{")) continue;
    const single = /^(accTitle|accDescr)\s*:\s*(.*)$/.exec(line);
    if (single) {
      if (single[1] === "accTitle") title = single[2]!.trim();
      else description = single[2]!.trim();
      removed.add(index);
      continue;
    }
    const multiple = /^accDescr\s*\{(.*)$/.exec(line);
    if (!multiple) break;
    const start = index;
    let value = multiple[1]!;
    while (!value.includes("}") && index + 1 < lines.length) value += `\n${lines[++index]}`;
    const end = value.indexOf("}");
    if (end < 0 || value.slice(end + 1).trim()) throw new SyntaxError("Invalid Mermaid accessibility description.");
    description = value.slice(0, end).replace(/\n\s+/g, "\n").trim();
    for (let line = start; line <= index; line++) removed.add(line);
  }
  if (title === undefined && description === undefined) return { source };
  return {
    // Indentation-based upstream grammars cannot tolerate placeholder blank
    // lines here. The result still retains the author's unmodified source.
    source: lines.filter((_, index) => !removed.has(index)).join("\n"),
    accessibility: snapshotDiagramAccessibility({ title, description }),
  };
}

/** Add missing metadata as inert owned SVG nodes; never parse metadata as HTML. */
export function applyMermaidAccessibilityPreamble(
  svg: SVGSVGElement,
  accessibility: MarkdownDiagramAccessibility | undefined,
): void {
  if (!accessibility) return;
  for (
    const [tag, attribute, value] of [
      ["title", "aria-labelledby", accessibility.title],
      ["desc", "aria-describedby", accessibility.description],
    ] as const
  ) {
    if (!value || svg.hasAttribute(attribute) || [...svg.children].some((child) => child.localName === tag)) continue;
    const element = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
    // Owned IDs must not collide with any authored/renderer-local reference.
    let id: string;
    let collisions = 0;
    do {
      if (++collisions > 64) throw new RangeError("Mermaid accessibility ID collision budget exceeded.");
      id = `exotui-mermaid-accessibility-${++nextMetadataId}-${tag}`;
    } while (svg.ownerDocument.getElementById(id));
    element.id = id;
    element.textContent = value;
    svg.prepend(element);
    svg.setAttribute(attribute, id);
  }
}

/** Resolve root-local references, not nested marker/icon titles or unrelated host DOM IDs. */
export function mermaidSVGAccessibility(
  svg: SVGSVGElement,
  action?: (element: Element) => MarkdownInteraction | undefined,
  diagnostics?: Set<string>,
): MarkdownDiagramAccessibility {
  const messages = diagnostics ?? new Set<string>();
  return withMermaidGeneratedContent(svg, messages, () => captureMermaidSVGAccessibility(svg, action, messages));
}

function captureMermaidSVGAccessibility(
  svg: SVGSVGElement,
  action: ((element: Element) => MarkdownInteraction | undefined) | undefined,
  diagnostics: Set<string>,
): MarkdownDiagramAccessibility {
  const rendered = renderedTextResolver(svg.ownerDocument);
  const view = svg.ownerDocument.defaultView;
  const names = new WeakMap<Element, string>();
  let referenceNodes = 0;
  let referenceUnits = 0;
  const ids = new Map<string, Element>();
  for (const element of svg.querySelectorAll("[id]")) {
    if (ids.size >= 20_000) throw new RangeError("Mermaid accessibility local ID count exceeds its budget.");
    if (!ids.has(element.id)) ids.set(element.id, element);
  }
  function referenced(element: Element, attribute: string): string | undefined {
    const raw = element.getAttribute(attribute);
    if (raw === null) return;
    if (raw.length > 4096) throw new RangeError("Mermaid accessibility references exceed their budget.");
    const references = raw.trim().split(/\s+/).filter(Boolean);
    if (references.length > 64) throw new RangeError("Mermaid accessibility reference count exceeds its budget.");
    const values = references.map((id) => ids.get(id)).filter((value): value is Element => !!value).map((root) => {
      const cached = names.get(root);
      if (cached !== undefined) return cached;
      let hidden = false;
      let hiddenReference = false;
      for (let at: Element | null = root; at; at = at.parentElement) {
        const css = view?.getComputedStyle(at);
        if (css?.display === "none") hidden = true;
        if (
          at.getAttribute("aria-hidden") === "true" || css?.display === "none" ||
          css?.visibility === "hidden" || css?.visibility === "collapse"
        ) hiddenReference = true;
      }
      // Direct display-hidden names are literal, while visibility-hidden references still receive CSS casing.
      const text = (node: Node, depth: number): string => {
        if (++referenceNodes > 20_000 || depth > 64) {
          throw new RangeError("Mermaid accessibility name capture exceeds its work budget.");
        }
        if (node.nodeType === 3) {
          const value = hidden ? (node as Text).data : rendered(node as Text);
          if ((referenceUnits += value.length) > 128_000) {
            throw new RangeError("Mermaid accessibility names exceed their text budget.");
          }
          return value;
        }
        if (node.nodeType !== 1) return "";
        const element = node as Element;
        const css = view?.getComputedStyle(element);
        if (
          !hiddenReference && element !== root && (
            element.getAttribute("aria-hidden") === "true" || css?.display === "none" ||
            css?.visibility === "hidden" || css?.visibility === "collapse"
          )
        ) return "";
        const alternative = generatedContentAlternative(element);
        if (alternative !== undefined) {
          if ((referenceUnits += alternative.length) > 128_000) {
            throw new RangeError("Mermaid accessibility names exceed their text budget.");
          }
          // AccName separates a generated alternate from neighboring content,
          // unlike the concatenated StaticText subtree. Keep that boundary here.
          return alternative ? ` ${alternative} ` : "";
        }
        const literal = element.getAttribute("aria-label") ?? direct(element, "title");
        if (literal !== undefined && literal !== null && (referenceUnits += literal.length) > 128_000) {
          throw new RangeError("Mermaid accessibility names exceed their text budget.");
        }
        const value = literal ?? [...element.childNodes].map((child) => text(child, depth + 1)).join("");
        return !hidden && css?.display === "none" ? ` ${value} ` : value;
      };
      const raw = text(root, 0);
      // Declarative title/description nodes preserve authored multiline metadata, independently of AX flattening.
      const value = ["title", "desc"].includes(root.localName) ? raw : raw.replace(/[\t\n\r ]+/g, " ").trim();
      names.set(root, value);
      return value;
    });
    return values.length ? values.join(" ") : undefined;
  }
  function direct(element: Element, tag: string): string | undefined {
    return [...element.children].find((child) => child.localName === tag)?.textContent ?? undefined;
  }
  function metadata(element: Element): MarkdownDiagramAccessibility {
    return {
      title: referenced(element, "aria-labelledby") ?? element.getAttribute("aria-label") ?? direct(element, "title"),
      description: referenced(element, "aria-describedby") ?? element.getAttribute("aria-description") ??
        direct(element, "desc"),
      role: element.getAttribute("role") ?? undefined,
      roleDescription: element.getAttribute("aria-roledescription") ?? undefined,
    };
  }
  const content = mermaidSemanticContent(svg, metadata, action, diagnostics, rendered);
  const style = svg.ownerDocument.defaultView?.getComputedStyle(svg);
  return snapshotDiagramAccessibility({
    ...metadata(svg),
    hidden: svg.getAttribute("aria-hidden") === "true" || style?.display === "none" || style?.visibility === "hidden"
      ? true
      : undefined,
    ...(content.length ? { content } : {}),
  });
}
