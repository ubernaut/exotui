// Copyright 2023 Im-Beast. MIT license.
import type { KeyPressEvent } from "../input_reader/types.ts";
import { Signal } from "../signals/mod.ts";
import type { Style } from "../theme.ts";
import type { Rectangle } from "../types.ts";
import { cropToWidth, getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import type { MarkdownInteraction, MarkdownRenderLine } from "./markdown.ts";

/** Painted horizontal cells belonging to an action, in document coordinates. */
export interface DocumentInteractionRange {
  column: number;
  row: number;
  width: number;
}

/** One navigation stop, independent of wrapping, scrolling and individual painted cells. */
export interface DocumentInteractionTarget {
  key: string;
  /** Optional containing panel ID; native node IDs remain scoped to each fence. */
  scope?: string;
  interaction: MarkdownInteraction;
  ranges: readonly DocumentInteractionRange[];
}

/** Pure native tooltip geometry; rows include padding and terminal box chrome. */
export interface DocumentTooltip {
  rectangle: Rectangle;
  rows: readonly string[];
}

/** Collect semantic navigation stops without turning every diagram cell into a separate action. */
export function documentInteractionTargets(lines: readonly MarkdownRenderLine[]): DocumentInteractionTarget[] {
  const targets = new Map<
    string,
    { key: string; interaction: MarkdownInteraction; ranges: DocumentInteractionRange[] }
  >();
  const identities = new Map<number, Map<MarkdownInteraction, number>>();
  for (const [row, line] of lines.entries()) {
    let column = 0;
    for (const span of line.segments) {
      const width = textWidth(span.text);
      const interaction = span.interaction ??
        (span.href || span.title ? { href: span.href, title: span.title } : undefined);
      if (width > 0 && interaction && (interaction.href || interaction.title || interaction.callbacks?.length)) {
        let objects = identities.get(line.blockIndex);
        if (!objects) identities.set(line.blockIndex, objects = new Map());
        let ordinal = objects.get(interaction);
        if (ordinal === undefined) objects.set(interaction, ordinal = objects.size);
        // Mermaid node IDs are semantic and scoped to a fence. Ordinary links
        // keep their parser-owned identity, so repeated equal URLs stay distinct.
        const identity = span.role === "diagram-label" && interaction.id ? ["node", interaction.id] : ["span", ordinal];
        const key = JSON.stringify([line.blockIndex, identity, interaction]);
        let target = targets.get(key);
        if (!target) {
          if (targets.size >= 16_384) throw new RangeError("Document exceeds its interaction target budget.");
          targets.set(key, target = { key, interaction, ranges: [] });
        }
        const previous = target.ranges.at(-1);
        if (previous?.row === row && previous.column + previous.width === column) previous.width += width;
        else target.ranges.push({ column, row, width });
      }
      column += width;
    }
  }
  return [...targets.values()];
}

/** View-owned keyboard state: borrowed document models never share a keyboard cursor. */
export class DocumentInteractionController {
  readonly revision: Signal<number> = new Signal(0);
  #key?: string;
  #dismissed = false;
  #disposed = false;

  get tooltipDismissed(): boolean {
    return this.#dismissed;
  }

  get hasSelection(): boolean {
    return this.#key !== undefined && !this.#disposed;
  }

  /** Invalidate native presentation after pointer metadata changes. */
  refresh(): void {
    if (!this.#disposed) this.revision.value++;
  }

  selected(targets: readonly DocumentInteractionTarget[]): DocumentInteractionTarget | undefined {
    return this.#disposed ? undefined : targets.find((target) => target.key === this.#key);
  }

  /** Pointer motion resumes hover presentation and releases the keyboard action cursor. */
  pointer(): void {
    if (this.#disposed || !this.#key && !this.#dismissed) return;
    this.#key = undefined;
    this.#dismissed = false;
    this.revision.value++;
  }

  reset(): void {
    if (this.#disposed || !this.#key && !this.#dismissed) return;
    this.#key = undefined;
    this.#dismissed = false;
    this.revision.value++;
  }

  /** Leaves Tab/window modifiers to the host; activation returns data, never executable source. */
  key(
    event: Pick<KeyPressEvent, "key" | "ctrl" | "meta" | "shift">,
    targets: readonly DocumentInteractionTarget[],
    offset: number,
    height: number,
    scrollTo: (row: number) => void,
    hover = false,
  ): { handled: boolean; activate?: MarkdownInteraction } {
    if (this.#disposed || event.ctrl || event.meta || event.shift || height < 1) return { handled: false };
    const current = this.selected(targets);
    if (event.key === "escape") {
      if (!this.#key && !hover) return { handled: false };
      this.#key = undefined;
      this.#dismissed = true;
      this.revision.value++;
      return { handled: true };
    }
    if (event.key === "return" || event.key === "space") {
      const visible = current?.ranges.some((range) => range.row >= offset && range.row < offset + height);
      return visible && (current!.interaction.href || current!.interaction.callbacks?.length)
        ? { handled: true, activate: current!.interaction }
        : { handled: false };
    }
    if (event.key !== "left" && event.key !== "right" || !targets.length) return { handled: false };
    const direction = event.key === "right" ? 1 : -1;
    let index = current ? targets.indexOf(current) + direction : -1;
    if (!current) {
      index = direction === 1
        ? targets.findIndex((target) => target.ranges.some((range) => range.row >= offset))
        : targets.findLastIndex((target) => target.ranges.some((range) => range.row < offset + height));
      if (index < 0) index = direction === 1 ? 0 : targets.length - 1;
    }
    const next = targets[(index + targets.length) % targets.length]!;
    this.#key = next.key;
    this.#dismissed = false;
    // Prefer already-visible paint for tall nodes; never jump just because a
    // selected node's top border is above the viewport.
    if (!next.ranges.some((range) => range.row >= offset && range.row < offset + height)) {
      const row = next.ranges[0]!.row;
      scrollTo(row < offset ? row : row - height + 1);
    }
    this.revision.value++;
    return { handled: true };
  }

  dispose(): void {
    this.#disposed = true;
    this.#key = undefined;
    this.revision.dispose();
  }
}

/** Layout an inert, bounded plain-text tooltip entirely inside its owner viewport. */
export function layoutDocumentTooltip(
  title: string | undefined,
  anchor: { column: number; row: number },
  width: number,
  height: number,
  /** Prefer chrome outside the keyboard-selected node when the viewport has room. */
  selectedRows?: { first: number; last: number },
): DocumentTooltip | undefined {
  if (
    !title || width < 6 || height < 3 || anchor.column < 0 || anchor.column >= width || anchor.row < 0 ||
    anchor.row >= height
  ) return;
  // deno-lint-ignore no-control-regex -- tooltip input must not inject terminal escape sequences
  const safe = title.slice(0, 4096).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "�").replaceAll("\t", "  ");
  const available = Math.min(48, width - 4);
  const first = Math.max(0, selectedRows?.first ?? anchor.row);
  const last = Math.min(height - 1, selectedRows?.last ?? anchor.row);
  const outside = selectedRows && Math.max(first, height - last - 1) >= 3;
  const top = outside ? first : anchor.row;
  const bottom = outside ? last : anchor.row;
  // Never cover the trigger cell: it must remain clickable, and stationary
  // motion cannot turn a popup into its own hover target.
  const room = Math.max(top, height - bottom - 1);
  if (room < 3) return;
  const maxRows = Math.min(6, room - 2);
  const content: string[] = [];
  let truncated = title.length > 4096;
  const paragraphs = safe.split("\n");
  for (const [index, paragraph] of paragraphs.entries()) {
    if (content.length >= maxRows) {
      truncated = true;
      break;
    }
    let line = "";
    for (const char of getMultiCodePointCharacters(paragraph)) {
      if (textWidth(line) + textWidth(char) > available) {
        content.push(line);
        line = "";
        if (content.length >= maxRows) {
          truncated = true;
          break;
        }
      }
      line += char;
    }
    if (content.length >= maxRows) break;
    content.push(line);
    if (content.length >= maxRows && index < paragraphs.length - 1) truncated = true;
  }
  if (content.length > maxRows) {
    content.length = maxRows;
    truncated = true;
  }
  if (truncated) content[content.length - 1] = cropToWidth(content.at(-1) ?? "", available - 1) + "…";
  const innerWidth = Math.max(1, ...content.map((line) => textWidth(line)));
  const columns = innerWidth + 4;
  const rows = [
    `╭${"─".repeat(columns - 2)}╮`,
    ...content.map((line) => `│ ${line}${" ".repeat(innerWidth - textWidth(line))} │`),
    `╰${"─".repeat(columns - 2)}╯`,
  ];
  const below = bottom + 1;
  const row = below + rows.length <= height ? below : Math.max(0, top - rows.length);
  return {
    rectangle: { column: Math.min(anchor.column, width - columns), row, width: columns, height: rows.length },
    rows,
  };
}

/** Convert styled native text to terminal cells, retaining wide continuation slots. */
export function documentRowCells(row: string, width: number): string[] {
  const cells = new Array<string>(width).fill(" ");
  let column = 0;
  for (const glyph of getMultiCodePointCharacters(row)) {
    const size = textWidth(glyph);
    if (size < 1) continue;
    if (column + size > width) break;
    cells[column] = glyph;
    for (let i = 1; i < size; i++) cells[column + i] = "";
    column += size;
  }
  return cells;
}

/** Paint focus and tooltip through the same native Text/cell path as the document, never an HTML overlay. */
export function paintDocumentInteractions(
  cells: string[][],
  selected: DocumentInteractionTarget | undefined,
  offset: number,
  tooltip: DocumentTooltip | undefined,
  focusStyle: Style,
  tooltipStyle: Style,
): void {
  for (const range of selected?.ranges ?? []) {
    const row = cells[range.row - offset];
    if (!row) continue;
    for (let column = range.column; column < Math.min(row.length, range.column + range.width); column++) {
      if (row[column]) row[column] = focusStyle(row[column]!);
    }
  }
  if (!tooltip) return;
  const rect = tooltip.rectangle;
  tooltip.rows.forEach((text, index) => {
    const row = cells[rect.row + index];
    if (!row) return;
    // Either covered half erases the whole old wide glyph, including the half
    // just outside popup chrome. Otherwise that dangling half corrupts scroll.
    if (row[rect.column] === "" && rect.column > 0) row[rect.column - 1] = " ";
    const end = rect.column + rect.width;
    if (row[end] === "") row[end] = " ";
    documentRowCells(text, rect.width).forEach((cell, column) =>
      row[rect.column + column] = cell ? tooltipStyle(cell) : ""
    );
  });
}
