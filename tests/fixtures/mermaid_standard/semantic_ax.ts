// Copyright 2023 Im-Beast. MIT license.

/** Minimal actual-CDP shape; fixtures do not consult the native scene to derive expected semantics. */
export interface SemanticAXInput {
  nodeId: string;
  ignored: boolean;
  role?: { value?: unknown };
  name?: { value?: unknown };
  description?: { value?: unknown };
  childIds?: readonly string[];
}

/** Read actual root name/description separately; content normalization intentionally removes document wrappers. */
export function semanticAXMetadata(
  nodes: readonly SemanticAXInput[],
  label: string,
): { title: string; description?: string } {
  const wrapper = nodes.find((node) => !node.ignored && node.name?.value === label);
  if (!wrapper || nodes.length > 40_000) throw new Error("Missing or oversized metadata comparison");
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const pending = [...(wrapper.childIds ?? [])], visited = new Set<string>();
  for (let at = 0; at < pending.length; at++) {
    const id = pending[at]!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) throw new Error("Metadata oracle has a missing child");
    if (!node.ignored && node.role?.value === "graphics-document") {
      return {
        title: String(node.name?.value ?? ""),
        ...(node.description?.value !== undefined ? { description: String(node.description.value) } : {}),
      };
    }
    pending.push(...(node.childIds ?? []));
    if (pending.length > 40_000) throw new RangeError("Metadata oracle exceeds its work budget");
  }
  throw new Error("Missing graphics-document metadata root");
}

/** Significant browser semantics, with real parent-child relationships and unstripped text. */
export interface SemanticAXNode {
  role: string;
  name?: string;
  description?: string;
  children?: SemanticAXNode[];
}

/**
 * Current Chromium generated text has two measured AX discrepancies: MathML
 * uppercase exposes STRASSS for Straße, and preformatted pseudo spaces collapse.
 * Check these exact source/companion trees, never normalize arbitrary differences.
 */
export function semanticAXGeneratedTextQuirk(
  source: readonly SemanticAXNode[],
  companion: readonly SemanticAXNode[],
  fixture: string,
): boolean {
  if (
    fixture === "generated-html-preserved-space" ||
    fixture === "flowchart LR\nA[\"<div class='generated' style='white-space:pre'>inside</div>\"]"
  ) {
    return JSON.stringify(source) === JSON.stringify([{ role: "StaticText", name: " [inside] " }]) &&
      JSON.stringify(companion) === JSON.stringify([{ role: "StaticText", name: "  [inside]  " }]);
  }
  if (
    fixture !== "generated-math-casing" &&
    fixture !== "flowchart LR\nA[\"<math><ms class='generated' style='text-transform:uppercase'>inside</ms></math>\"]"
  ) return false;
  const tree = (name: string) => [{
    role: "MathMLMath",
    children: [{ role: "MathMLStringLiteral", children: [{ role: "StaticText", name }] }],
  }];
  return JSON.stringify(source) === JSON.stringify(tree("STRASSSINSIDEmixed")) &&
    JSON.stringify(companion) === JSON.stringify(tree("STRASSEINSIDEmixed"));
}

/** Remove only nonsemantic layout wrappers; retain text whitespace, names and MathML/mark nesting. */
export function semanticAXTree(nodes: readonly SemanticAXInput[], label: string): SemanticAXNode[] {
  const root = nodes.find((node) => !node.ignored && node.name?.value === label);
  if (!root) throw new Error(`Missing semantic comparison ${label}`);
  if (nodes.length > 40_000) throw new RangeError("Semantic AX oracle exceeds its node budget.");
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const active = new Set<string>();
  let visited = 0;
  function merge(values: SemanticAXNode[]): SemanticAXNode[] {
    const result: SemanticAXNode[] = [];
    for (const value of values) {
      const previous = result.at(-1);
      // Browser text-node fragmentation is not semantics. Preserve every
      // character while joining only adjacent text under the same parent.
      if (value.role === "StaticText" && previous?.role === "StaticText") previous.name += value.name ?? "";
      else result.push(value);
    }
    return result;
  }
  function visit(id: string, depth: number): SemanticAXNode[] {
    if (++visited > 40_000 || depth > 256) throw new RangeError("Semantic AX oracle exceeds its work budget.");
    if (active.has(id)) throw new TypeError("Semantic AX oracle contains a cycle.");
    const node = byId.get(id);
    if (!node) throw new Error("Semantic AX oracle has a missing child reference.");
    active.add(id);
    const children = merge((node.childIds ?? []).flatMap((child) => visit(child, depth + 1)));
    active.delete(id);
    const role = node.ignored ? "" : String(node.role?.value ?? "");
    const name = String(node.name?.value ?? "");
    const description = node.description?.value !== undefined ? String(node.description.value) : undefined;
    if (role === "StaticText") return [{ role, name }];
    if (role === "InlineTextBox") return [];
    const significant = role.startsWith("MathML") || ["strong", "emphasis", "LineBreak"].includes(role) ||
      ["group", "generic", "graphics-object", "graphics-symbol", "image"].includes(role) && (!!name || !!description);
    return significant
      ? [{
        role,
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(children.length ? { children } : {}),
      }]
      : children;
  }
  return merge((root.childIds ?? []).flatMap((child) => visit(child, 0)));
}
