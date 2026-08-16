// Copyright 2023 Im-Beast. MIT license.

// WID-009: the kanban board moves cards OPTIMISTICALLY with an exact way
// back. Cards live in (column, swimlane) cells with stable orders; a
// move checks the target column's WIP limit up front (refusal before any
// optimism), applies immediately, and returns a handle whose reject()
// restores the card to its EXACT previous position — same column, lane,
// and index — while the focused card stays focused through apply,
// commit, and reject alike. Keyboard movement drives the same path as
// pointer drops, and each cell windows its cards for virtualization.

/** One board card. */
export interface KanbanCard {
  readonly id: string;
  readonly title: string;
}

/** One column declaration. */
export interface KanbanColumn {
  readonly id: string;
  readonly title: string;
  readonly wipLimit?: number;
}

/** A card's position. */
export interface CardPosition {
  readonly columnId: string;
  readonly laneId: string;
  readonly index: number;
}

/** An optimistic move handle. */
export interface MoveHandle {
  readonly card: KanbanCard;
  readonly from: CardPosition;
  readonly to: CardPosition;
  /** Confirms the optimistic move. */
  commit(): void;
  /** Rejects it: the card returns to its exact previous position. */
  reject(): void;
}

/** A move outcome. */
export type MoveResult =
  | { readonly ok: true; readonly handle: MoveHandle }
  | { readonly ok: false; readonly reason: string };

interface Cell {
  cards: KanbanCard[];
}

/** The kanban controller. */
export class KanbanController {
  readonly #columns: readonly KanbanColumn[];
  readonly #lanes: readonly string[];
  readonly #cells = new Map<string, Cell>();
  #focusedCardId?: string;

  constructor(options: { readonly columns: readonly KanbanColumn[]; readonly lanes?: readonly string[] }) {
    this.#columns = options.columns;
    this.#lanes = options.lanes ?? ["default"];
    for (const column of this.#columns) {
      for (const lane of this.#lanes) {
        this.#cells.set(`${column.id}/${lane}`, { cards: [] });
      }
    }
  }

  /** Adds a card (WIP limits apply to MOVES, not initial seeding). */
  addCard(card: KanbanCard, columnId: string, laneId = "default"): boolean {
    const cell = this.#cells.get(`${columnId}/${laneId}`);
    if (!cell) return false;
    cell.cards.push(card);
    return true;
  }

  focusCard(cardId: string): boolean {
    if (!this.positionOf(cardId)) return false;
    this.#focusedCardId = cardId;
    return true;
  }

  focusedCard(): string | undefined {
    return this.#focusedCardId;
  }

  positionOf(cardId: string): CardPosition | undefined {
    for (const [key, cell] of this.#cells) {
      const index = cell.cards.findIndex((card) => card.id === cardId);
      if (index >= 0) {
        const [columnId, laneId] = key.split("/") as [string, string];
        return { columnId, laneId, index };
      }
    }
    return undefined;
  }

  /** Cards in one (column, lane) cell, windowed for virtualization. */
  window(columnId: string, laneId: string, offset = 0, limit = 50): readonly KanbanCard[] {
    const cell = this.#cells.get(`${columnId}/${laneId}`);
    return cell ? cell.cards.slice(offset, offset + limit) : [];
  }

  /** Total cards in a column across lanes (the WIP measure). */
  columnLoad(columnId: string): number {
    let total = 0;
    for (const lane of this.#lanes) total += this.#cells.get(`${columnId}/${lane}`)?.cards.length ?? 0;
    return total;
  }

  /**
   * Moves a card optimistically. WIP limits refuse before any mutation;
   * the returned handle's reject() restores the exact previous position.
   */
  moveCard(cardId: string, to: { columnId: string; laneId?: string; index?: number }): MoveResult {
    const from = this.positionOf(cardId);
    if (!from) return { ok: false, reason: `card "${cardId}" is not on the board` };
    const laneId = to.laneId ?? from.laneId;
    const targetCell = this.#cells.get(`${to.columnId}/${laneId}`);
    if (!targetCell) return { ok: false, reason: `cell ${to.columnId}/${laneId} does not exist` };

    const column = this.#columns.find((candidate) => candidate.id === to.columnId);
    if (
      column?.wipLimit !== undefined && to.columnId !== from.columnId &&
      this.columnLoad(to.columnId) >= column.wipLimit
    ) {
      return { ok: false, reason: `column "${to.columnId}" is at its WIP limit of ${column.wipLimit}` };
    }

    // Optimistic apply.
    const sourceCell = this.#cells.get(`${from.columnId}/${from.laneId}`)!;
    const [card] = sourceCell.cards.splice(from.index, 1);
    const targetIndex = Math.max(0, Math.min(targetCell.cards.length, to.index ?? targetCell.cards.length));
    targetCell.cards.splice(targetIndex, 0, card!);
    const applied: CardPosition = { columnId: to.columnId, laneId, index: targetIndex };

    let settled = false;
    const controller = this;
    return {
      ok: true,
      handle: {
        card: card!,
        from,
        to: applied,
        commit() {
          settled = true;
        },
        reject() {
          if (settled) return;
          settled = true;
          // Exact restoration: remove from the applied cell, reinsert at
          // the ORIGINAL index of the original cell.
          const currentCell = controller.#cells.get(`${applied.columnId}/${applied.laneId}`)!;
          const at = currentCell.cards.findIndex((candidate) => candidate.id === card!.id);
          if (at >= 0) currentCell.cards.splice(at, 1);
          const homeCell = controller.#cells.get(`${from.columnId}/${from.laneId}`)!;
          homeCell.cards.splice(Math.min(from.index, homeCell.cards.length), 0, card!);
          // Focus never moves off the card through a rejection.
        },
      },
    };
  }

  /** Keyboard movement: moves the FOCUSED card one column left/right. */
  moveFocusedCard(direction: "left" | "right"): MoveResult {
    if (!this.#focusedCardId) return { ok: false, reason: "no card is focused" };
    const from = this.positionOf(this.#focusedCardId)!;
    const columnIndex = this.#columns.findIndex((column) => column.id === from.columnId);
    const target = this.#columns[columnIndex + (direction === "right" ? 1 : -1)];
    if (!target) return { ok: false, reason: `no column to the ${direction}` };
    return this.moveCard(this.#focusedCardId, { columnId: target.id });
  }
}

/** Creates a kanban controller. */
export function createKanbanController(
  options: { readonly columns: readonly KanbanColumn[]; readonly lanes?: readonly string[] },
): KanbanController {
  return new KanbanController(options);
}
