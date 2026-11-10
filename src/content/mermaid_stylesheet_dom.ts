// Copyright 2023 Im-Beast. MIT license.

/**
 * Retain only the engine-owned root stylesheet's text across HTML-to-SVG serialization.
 * An HTML style under SVG is serialized as raw text, but reinsertion creates an SVG
 * style whose markup/entities must be escaped. Never restore sanitized or changed output.
 */
export function captureMermaidStylesheetText(container: HTMLElement, id: string): {
  finish(svg: string): string;
  dispose(): void;
} {
  const document = container.ownerDocument, view = document.defaultView!;
  const styles = new Set<HTMLStyleElement>(), visited = new WeakSet<Node>();
  let work = 0, error: Error | undefined;
  const collect = (records: readonly MutationRecord[]) => {
    if (error) return;
    try {
      const visit = (node: Node, depth: number) => {
        if (visited.has(node)) return;
        visited.add(node);
        if (++work > 20_000 || depth > 128) {
          throw new RangeError("Mermaid stylesheet observation exceeds its node/depth budget.");
        }
        if (node.nodeType !== 1) return;
        const element = node as Element;
        if (
          element.namespaceURI === "http://www.w3.org/1999/xhtml" && element.localName === "style" &&
          element.parentElement?.namespaceURI === "http://www.w3.org/2000/svg" &&
          element.parentElement.localName === "svg" && element.parentElement.id === id
        ) {
          styles.add(element as HTMLStyleElement);
          if (styles.size > 64) throw new RangeError("Mermaid stylesheet observation exceeds its stylesheet budget.");
        }
        for (const child of element.children) visit(child, depth + 1);
      };
      for (const record of records) for (const node of record.addedNodes) visit(node, 0);
    } catch (value) {
      error = value instanceof Error ? value : new Error(String(value));
    }
  };
  const observer = new view.MutationObserver(collect);
  observer.observe(container, { childList: true, subtree: true });
  return {
    finish(svg) {
      collect(observer.takeRecords());
      observer.disconnect();
      if (error) throw error;
      let units = 0;
      for (const style of styles) {
        const text = style.textContent ?? "";
        if ((units += text.length) > 1_048_576) {
          throw new RangeError("Mermaid captured styles exceed their text budget.");
        }
        if (!text.includes("<") && !text.includes("&")) continue;
        const original = style.outerHTML;
        const at = svg.indexOf(original);
        // Strict upstream sanitization may have changed this style. Do not bypass it.
        if (at < 0) continue;
        if (svg.indexOf(original, at + original.length) >= 0) {
          throw new TypeError("Mermaid returned ambiguous root stylesheet serialization.");
        }
        const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
        const copy = style.cloneNode(false) as HTMLStyleElement;
        copy.textContent = escaped;
        const replacement = copy.outerHTML;
        svg = svg.slice(0, at) + replacement + svg.slice(at + original.length);
      }
      return svg;
    },
    dispose() {
      observer.disconnect();
      styles.clear();
    },
  };
}
