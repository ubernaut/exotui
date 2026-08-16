// Copyright 2023 Im-Beast. MIT license.

// WID-006: the tree-grid keys EVERYTHING by row ID. Hierarchy comes from
// parent ids; the hierarchy column is pinned first and cannot be
// unpinned by column operations; sorting orders SIBLINGS within their
// parent (hierarchy survives any sort), resizing is per column, and the
// visible window flattens only expanded branches. Expansion, focus, and
// selection all live in id-keyed sets, so a data refresh — new array,
// new objects, new order — preserves them for every id that still
// exists and drops exactly the ids that vanished.

/** One tree-grid node. */
export interface TreeGridNode {
  readonly id: string;
  readonly parentId?: string;
  readonly cells: Readonly<Record<string, string | number>>;
}

/** One column. */
export interface TreeGridColumn {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly sortable?: boolean;
}

/** One visible row. */
export interface TreeGridRow {
  readonly id: string;
  readonly depth: number;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  readonly focused: boolean;
  readonly selected: boolean;
  readonly cells: Readonly<Record<string, string | number>>;
}

/** The tree-grid controller. */
export class TreeGridController {
  #nodes = new Map<string, TreeGridNode>();
  #childrenOf = new Map<string, string[]>();
  #columns: TreeGridColumn[];
  readonly #hierarchyColumnId: string;
  readonly #expanded = new Set<string>();
  readonly #selected = new Set<string>();
  #focusedId?: string;
  #sort?: { columnId: string; direction: "asc" | "desc" };

  constructor(options: {
    readonly columns: readonly TreeGridColumn[];
    readonly hierarchyColumnId: string;
    readonly nodes?: readonly TreeGridNode[];
  }) {
    if (!options.columns.some((column) => column.id === options.hierarchyColumnId)) {
      throw new TypeError(`hierarchy column "${options.hierarchyColumnId}" is not declared`);
    }
    this.#hierarchyColumnId = options.hierarchyColumnId;
    this.#columns = [...options.columns];
    this.#ingest(options.nodes ?? []);
  }

  /** Columns with the hierarchy column PINNED first, always. */
  columns(): readonly TreeGridColumn[] {
    const hierarchy = this.#columns.find((column) => column.id === this.#hierarchyColumnId)!;
    return [hierarchy, ...this.#columns.filter((column) => column.id !== this.#hierarchyColumnId)];
  }

  resizeColumn(columnId: string, width: number): boolean {
    const index = this.#columns.findIndex((column) => column.id === columnId);
    if (index < 0) return false;
    this.#columns[index] = { ...this.#columns[index]!, width: Math.max(1, Math.floor(width)) };
    return true;
  }

  /** Sorts siblings within each parent; hierarchy always survives. */
  sortBy(columnId: string, direction: "asc" | "desc"): boolean {
    const column = this.#columns.find((candidate) => candidate.id === columnId);
    if (!column || column.sortable === false) return false;
    this.#sort = { columnId, direction };
    return true;
  }

  expand(id: string): void {
    if (this.#childrenOf.has(id)) this.#expanded.add(id);
  }

  collapse(id: string): void {
    this.#expanded.delete(id);
  }

  focusRow(id: string): boolean {
    if (!this.#nodes.has(id)) return false;
    this.#focusedId = id;
    return true;
  }

  toggleSelect(id: string): boolean {
    if (!this.#nodes.has(id)) return false;
    if (this.#selected.has(id)) this.#selected.delete(id);
    else this.#selected.add(id);
    return true;
  }

  /** The virtualized window over the flattened expanded tree. */
  visibleRows(offset = 0, limit = 100): readonly TreeGridRow[] {
    const rows: TreeGridRow[] = [];
    const visit = (ids: readonly string[], depth: number): void => {
      for (const id of this.#sortedSiblings(ids)) {
        const node = this.#nodes.get(id)!;
        const hasChildren = (this.#childrenOf.get(id)?.length ?? 0) > 0;
        const expanded = this.#expanded.has(id);
        rows.push({
          id,
          depth,
          expanded,
          hasChildren,
          focused: this.#focusedId === id,
          selected: this.#selected.has(id),
          cells: node.cells,
        });
        if (hasChildren && expanded) visit(this.#childrenOf.get(id)!, depth + 1);
      }
    };
    visit(this.#childrenOf.get("") ?? [], 0);
    return rows.slice(offset, offset + limit);
  }

  /**
   * Refreshes the data. Expansion, focus, and selection survive for
   * every id that still exists; vanished ids are dropped exactly.
   */
  refresh(nodes: readonly TreeGridNode[]): void {
    this.#ingest(nodes);
    for (const id of [...this.#expanded]) if (!this.#nodes.has(id)) this.#expanded.delete(id);
    for (const id of [...this.#selected]) if (!this.#nodes.has(id)) this.#selected.delete(id);
    if (this.#focusedId !== undefined && !this.#nodes.has(this.#focusedId)) this.#focusedId = undefined;
  }

  inspect(): { expanded: readonly string[]; selected: readonly string[]; focused?: string } {
    return {
      expanded: [...this.#expanded].sort(),
      selected: [...this.#selected].sort(),
      ...(this.#focusedId !== undefined ? { focused: this.#focusedId } : {}),
    };
  }

  #ingest(nodes: readonly TreeGridNode[]): void {
    this.#nodes = new Map(nodes.map((node) => [node.id, node]));
    this.#childrenOf = new Map();
    for (const node of nodes) {
      const parent = node.parentId ?? "";
      const siblings = this.#childrenOf.get(parent) ?? [];
      siblings.push(node.id);
      this.#childrenOf.set(parent, siblings);
    }
  }

  #sortedSiblings(ids: readonly string[]): readonly string[] {
    if (!this.#sort) return ids;
    const { columnId, direction } = this.#sort;
    const factor = direction === "asc" ? 1 : -1;
    return [...ids].sort((a, b) => {
      const left = this.#nodes.get(a)!.cells[columnId] ?? "";
      const right = this.#nodes.get(b)!.cells[columnId] ?? "";
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right)) * factor;
    });
  }
}

/** Creates a tree-grid controller. */
export function createTreeGridController(options: {
  readonly columns: readonly TreeGridColumn[];
  readonly hierarchyColumnId: string;
  readonly nodes?: readonly TreeGridNode[];
}): TreeGridController {
  return new TreeGridController(options);
}
