// Copyright 2023 Im-Beast. MIT license.

// 037 WID-007: the lazy structured inspector. Documents parse OFF the
// UI thread through the same port seam as the syntax service — a parse
// host answers open requests with a NODE TABLE (id-keyed, children by
// id), so the client never holds the raw object graph and cycles are
// structurally impossible to re-stringify: a repeated object becomes a
// reference-cycle marker node pointing at the first occurrence's id.
// The controller folds lazily (children materialize only when a node
// expands), copies canonical paths, and searches type-aware (matches
// can be constrained to strings, numbers, booleans, or keys).

/** One flattened inspector node. */
export interface InspectorNode {
  readonly id: string;
  readonly parentId?: string;
  /** The key or index under the parent. */
  readonly key: string;
  readonly kind: "object" | "array" | "string" | "number" | "boolean" | "null" | "cycle";
  /** Scalar preview, or the target node id for cycle markers. */
  readonly preview: string;
  readonly childIds: readonly string[];
}

/** The parsed node table a parse host returns. */
export interface InspectorDocument {
  readonly rootId: string;
  readonly nodes: Readonly<Record<string, InspectorNode>>;
}

/**
 * Parses a value into a node table, marking repeated objects as cycle
 * nodes instead of re-walking them. This is the parse-host worker body;
 * hosts run it off-thread behind a SyntaxPort-style message pair.
 */
export function parseToNodeTable(value: unknown): InspectorDocument {
  const nodes: Record<string, InspectorNode> = {};
  const seen = new Map<object, string>();
  let counter = 0;
  const walk = (current: unknown, key: string, parentId?: string): string => {
    const id = `n${counter}`;
    counter += 1;
    if (current !== null && typeof current === "object") {
      const existing = seen.get(current as object);
      if (existing !== undefined) {
        nodes[id] = {
          id,
          ...(parentId !== undefined ? { parentId } : {}),
          key,
          kind: "cycle",
          preview: existing,
          childIds: [],
        };
        return id;
      }
      seen.set(current as object, id);
      const isArray = Array.isArray(current);
      const entries = isArray
        ? (current as unknown[]).map((item, index) => [String(index), item] as const)
        : Object.entries(current as Record<string, unknown>);
      const childIds: string[] = [];
      nodes[id] = {
        id,
        ...(parentId !== undefined ? { parentId } : {}),
        key,
        kind: isArray ? "array" : "object",
        preview: isArray ? `[${entries.length}]` : `{${entries.length}}`,
        childIds,
      };
      for (const [childKey, childValue] of entries) childIds.push(walk(childValue, childKey, id));
      return id;
    }
    const kind = current === null
      ? "null"
      : typeof current === "string"
      ? "string"
      : typeof current === "number"
      ? "number"
      : "boolean";
    nodes[id] = {
      id,
      ...(parentId !== undefined ? { parentId } : {}),
      key,
      kind: kind as InspectorNode["kind"],
      preview: current === null ? "null" : typeof current === "string" ? JSON.stringify(current) : String(current),
      childIds: [],
    };
    return id;
  };
  const rootId = walk(value, "$");
  return { rootId, nodes };
}

/** The searchable value kinds. */
export type InspectorSearchKind = "string" | "number" | "boolean" | "key" | "any";

/** The inspector controller over a parsed node table. */
export class StructureInspectorController {
  readonly #document: InspectorDocument;
  readonly #expanded = new Set<string>();

  constructor(document: InspectorDocument) {
    this.#document = document;
  }

  expand(id: string): boolean {
    const node = this.#document.nodes[id];
    if (!node || node.childIds.length === 0) return false;
    this.#expanded.add(id);
    return true;
  }

  collapse(id: string): void {
    this.#expanded.delete(id);
  }

  /** The canonical path for a node, for path copy. */
  path(id: string): string {
    const parts: string[] = [];
    let current = this.#document.nodes[id];
    while (current) {
      const parent = current.parentId !== undefined ? this.#document.nodes[current.parentId] : undefined;
      if (!parent) {
        parts.unshift("$");
        break;
      }
      parts.unshift(parent.kind === "array" ? `[${current.key}]` : `.${current.key}`);
      current = parent;
    }
    return parts.join("");
  }

  /** Lazy flattening: only expanded nodes contribute children. */
  visibleNodes(offset = 0, limit = 200): readonly (InspectorNode & { readonly depth: number })[] {
    const rows: (InspectorNode & { readonly depth: number })[] = [];
    const visit = (id: string, depth: number): void => {
      const node = this.#document.nodes[id]!;
      rows.push({ ...node, depth });
      if (this.#expanded.has(id)) { for (const childId of node.childIds) visit(childId, depth + 1); }
    };
    visit(this.#document.rootId, 0);
    return rows.slice(offset, offset + limit);
  }

  /** Type-aware search over the WHOLE table (not just expanded rows). */
  search(query: string, kind: InspectorSearchKind = "any"): readonly { readonly id: string; readonly path: string }[] {
    const results: { id: string; path: string }[] = [];
    for (const node of Object.values(this.#document.nodes)) {
      const keyMatch = node.key.includes(query);
      const valueMatch = node.preview.includes(query);
      const matches = kind === "key"
        ? keyMatch
        : kind === "any"
        ? keyMatch || valueMatch
        : node.kind === kind && valueMatch;
      if (matches) results.push({ id: node.id, path: this.path(node.id) });
    }
    return results;
  }

  /** Cycle markers never restringify: they point at the original id. */
  cycleTarget(id: string): string | undefined {
    const node = this.#document.nodes[id];
    return node?.kind === "cycle" ? node.preview : undefined;
  }
}
