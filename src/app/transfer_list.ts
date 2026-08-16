// Copyright 2023 Im-Beast. MIT license.

// WID-004: the two-pane transfer list as a controller. Items carry stable
// caller IDs that never change as they move; each pane virtualizes through
// a windowed view (offset + limit over the FILTERED sequence) with its own
// search filter; selection is bulk-capable (toggle, range, all-filtered);
// a move PREVIEW names exactly which items would move and where they would
// land before anything mutates; and moving filtered items preserves
// SOURCE order in the destination — the acceptance rule — regardless of
// selection order or active filters. Reordering inside a pane is explicit
// and only offered when that pane is unfiltered, so hidden items can never
// be silently reordered around.

/** One transfer item. */
export interface TransferItem {
  readonly id: string;
  readonly label: string;
}

/** Pane identifier. */
export type TransferSide = "source" | "target";

/** One pane's windowed view. */
export interface TransferView {
  readonly side: TransferSide;
  /** Total items in the pane (unfiltered). */
  readonly total: number;
  /** Items matching the pane's filter. */
  readonly matching: number;
  /** The visible window over the filtered sequence. */
  readonly window: readonly (TransferItem & { readonly selected: boolean })[];
  readonly offset: number;
}

/** A move preview: what would happen, before it happens. */
export interface TransferPreview {
  readonly from: TransferSide;
  readonly to: TransferSide;
  /** The items that would move, in source order. */
  readonly items: readonly TransferItem[];
  /** The destination index the block would land at (end of pane). */
  readonly insertAt: number;
}

/** Controller options. */
export interface TransferListOptions {
  readonly source: readonly TransferItem[];
  readonly target?: readonly TransferItem[];
  /** Visible window size per pane (default 20). */
  readonly windowSize?: number;
}

/** The transfer-list controller. */
export class TransferListController {
  readonly #panes: Record<TransferSide, TransferItem[]>;
  readonly #filters: Record<TransferSide, string> = { source: "", target: "" };
  readonly #offsets: Record<TransferSide, number> = { source: 0, target: 0 };
  readonly #selected = new Set<string>();
  readonly #windowSize: number;

  constructor(options: TransferListOptions) {
    this.#panes = { source: [...options.source], target: [...options.target ?? []] };
    this.#windowSize = Math.max(1, options.windowSize ?? 20);
    const ids = new Set<string>();
    for (const item of [...this.#panes.source, ...this.#panes.target]) {
      if (ids.has(item.id)) throw new TypeError(`duplicate transfer item id "${item.id}"`);
      ids.add(item.id);
    }
  }

  /** Sets one pane's search filter (case-insensitive substring). */
  search(side: TransferSide, query: string): void {
    this.#filters[side] = query;
    this.#offsets[side] = 0;
  }

  /** Scrolls one pane's window. */
  scrollTo(side: TransferSide, offset: number): void {
    const matching = this.#filtered(side).length;
    this.#offsets[side] = Math.max(0, Math.min(offset, Math.max(0, matching - this.#windowSize)));
  }

  /** The pane's windowed, filtered view. */
  view(side: TransferSide): TransferView {
    const filtered = this.#filtered(side);
    const offset = this.#offsets[side];
    return {
      side,
      total: this.#panes[side].length,
      matching: filtered.length,
      offset,
      window: filtered.slice(offset, offset + this.#windowSize).map((item) => ({
        ...item,
        selected: this.#selected.has(item.id),
      })),
    };
  }

  /** Toggles one item's selection. */
  toggle(id: string): boolean {
    if (!this.#find(id)) return false;
    if (this.#selected.has(id)) this.#selected.delete(id);
    else this.#selected.add(id);
    return true;
  }

  /** Selects a contiguous filtered range in one pane (shift-click). */
  selectRange(side: TransferSide, fromId: string, toId: string): number {
    const filtered = this.#filtered(side);
    const from = filtered.findIndex((item) => item.id === fromId);
    const to = filtered.findIndex((item) => item.id === toId);
    if (from === -1 || to === -1) return 0;
    const [start, end] = from <= to ? [from, to] : [to, from];
    for (let index = start; index <= end; index += 1) this.#selected.add(filtered[index]!.id);
    return end - start + 1;
  }

  /** Selects every item matching one pane's current filter. */
  selectAllFiltered(side: TransferSide): number {
    const filtered = this.#filtered(side);
    for (const item of filtered) this.#selected.add(item.id);
    return filtered.length;
  }

  clearSelection(): void {
    this.#selected.clear();
  }

  /** Previews moving the selected items out of one pane. */
  preview(from: TransferSide): TransferPreview {
    const to: TransferSide = from === "source" ? "target" : "source";
    // Source order, not selection order: the pane's own sequence decides.
    const items = this.#panes[from].filter((item) => this.#selected.has(item.id));
    return { from, to, items, insertAt: this.#panes[to].length };
  }

  /**
   * Moves the previewed items. IDs are untouched, the moved block lands in
   * source order, and unselected/hidden items keep their exact positions.
   */
  move(from: TransferSide): TransferPreview {
    const planned = this.preview(from);
    const moving = new Set(planned.items.map((item) => item.id));
    this.#panes[from] = this.#panes[from].filter((item) => !moving.has(item.id));
    this.#panes[planned.to].push(...planned.items);
    this.#selected.clear();
    return planned;
  }

  /**
   * Reorders one item inside its pane. Only offered while the pane is
   * unfiltered — reordering around hidden items would be blind.
   */
  reorder(side: TransferSide, id: string, to: number): boolean {
    if (this.#filters[side] !== "") return false;
    const pane = this.#panes[side];
    const from = pane.findIndex((item) => item.id === id);
    const target = Math.max(0, Math.min(pane.length - 1, to));
    if (from === -1 || from === target) return false;
    const [item] = pane.splice(from, 1);
    pane.splice(target, 0, item!);
    return true;
  }

  /** Both panes' full item sequences (for assertions and persistence). */
  items(side: TransferSide): readonly TransferItem[] {
    return [...this.#panes[side]];
  }

  #filtered(side: TransferSide): TransferItem[] {
    const query = this.#filters[side].toLowerCase();
    if (query === "") return this.#panes[side];
    return this.#panes[side].filter((item) => item.label.toLowerCase().includes(query));
  }

  #find(id: string): TransferItem | undefined {
    return this.#panes.source.find((item) => item.id === id) ??
      this.#panes.target.find((item) => item.id === id);
  }
}

/** Creates a transfer-list controller. */
export function createTransferListController(options: TransferListOptions): TransferListController {
  return new TransferListController(options);
}
