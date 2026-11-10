// Copyright 2023 Im-Beast. MIT license.
import { MarkdownController, type MarkdownControllerOptions } from "../components/markdown.ts";
import type { KeyPressEvent } from "../input_reader/types.ts";
import { flexRects } from "../layout/flex_layout.ts";
import { Signal } from "../signals/mod.ts";
import { createAnsiStyle } from "../theme.ts";
import type { Rectangle } from "../types.ts";
import { cropToWidth, getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import { inspectViewportOverflow } from "../viewport.ts";
import { COMPACT_HEADING_FONTS } from "./heading_fonts.ts";
import { MarkdownSurface, type MarkdownSurfaceOptions, type MarkdownSurfacePalette } from "./markdown_surface.ts";
import type { MarkdownInteraction } from "./markdown.ts";
import type { DocumentAccessibilityTarget } from "./document_accessibility.ts";
import {
  DocumentInteractionController,
  type DocumentInteractionTarget,
  type DocumentTooltip,
  layoutDocumentTooltip,
  paintDocumentInteractions,
} from "./document_interactions.ts";

/** One Markdown-backed panel; links on the body still override the optional whole-card link. */
export interface FlexMarkdownPanel {
  id: string;
  /** Reactive sources are borrowed, never disposed by a panel or document. */
  source: string | Signal<string>;
  kind?: "plain" | "card" | "callout" | "diagram";
  href?: string;
}
/** A responsive flex row. Below minPanelWidth, panels stack in source order. */
export interface FlexMarkdownRow {
  panels: readonly FlexMarkdownPanel[];
  minPanelWidth?: number;
  /** Let an opening title/banner use the viewport width while the body remains centered at maxWidth. */
  fullWidth?: boolean;
}
/** A chapter in a continuously scrolling document, not a separate window/page. */
export interface FlexMarkdownSection {
  id: string;
  label: string;
  number?: string;
  rows: readonly FlexMarkdownRow[];
}
/** Solved panel and content geometry in document coordinates. */
export interface FlexMarkdownBox {
  panel: FlexMarkdownPanel;
  rect: Rectangle;
  contentRect: Rectangle;
}
/** Renderer-neutral document geometry, including chapter anchors. */
export interface FlexMarkdownLayout {
  width: number;
  height: number;
  panels: readonly FlexMarkdownBox[];
  sections: readonly { id: string; label: string; number?: string; row: number; end: number }[];
}
/** Options for the component-backed flex document surface. */
export interface FlexMarkdownSurfaceOptions {
  sections: readonly FlexMarkdownSection[];
  render?: MarkdownSurfaceOptions["render"];
  palette?: MarkdownSurfacePalette;
  onLink?: (href: string) => void;
  onActivate?: MarkdownSurfaceOptions["onActivate"];
  onHover?: MarkdownSurfaceOptions["onHover"];
  tooltips?: MarkdownSurfaceOptions["tooltips"];
  maxWidth?: number;
  /** False starts the opening panel at row zero instead of repeating its chapter label above the title. */
  showFirstSectionHeader?: boolean;
  /** Factory-created controllers belong to this document and are shared by measurement and painting. */
  createController?: (panel: FlexMarkdownPanel, options: MarkdownControllerOptions) => MarkdownController;
  /** Borrow a document controller; dispose it separately. Its sections and layout options take precedence. */
  controller?: FlexMarkdownController;
}

/**
 * Responsive document geometry using ExotUI's built-in flexbox solver on both
 * axes. Measurement comes from the existing Markdown controller, never HTML.
 */
export function layoutFlexMarkdown(
  sections: readonly FlexMarkdownSection[],
  width: number,
  measure: (panel: FlexMarkdownPanel, width: number) => number,
  maxWidth = 120,
  showFirstSectionHeader = true,
): FlexMarkdownLayout {
  if (!Number.isInteger(width) || width < 1 || width > 2000) {
    throw new RangeError("Document width must be 1–2000 cells.");
  }
  if (!Number.isInteger(maxWidth) || maxWidth < 1 || maxWidth > 2000) {
    throw new RangeError("Invalid document maxWidth.");
  }
  if (sections.length > 256) throw new RangeError("Flex documents support at most 256 sections.");
  const pageWidth = Math.min(width, maxWidth);
  const left = Math.floor((width - pageWidth) / 2);
  const panels: FlexMarkdownBox[] = [];
  const anchors: FlexMarkdownLayout["sections"][number][] = [];
  const ids = new Set<string>();
  let top = 0;
  for (const section of sections) {
    if (ids.has(section.id)) throw new TypeError(`Duplicate document id: ${section.id}`);
    ids.add(section.id);
    const anchor = { id: section.id, label: section.label, number: section.number, row: top, end: top };
    anchors.push(anchor);
    if (showFirstSectionHeader || anchors.length > 1) top += 2;
    for (const row of section.rows) {
      const rowWidth = row.fullWidth ? width : pageWidth;
      const rowLeft = row.fullWidth ? 0 : left;
      const minimum = row.minPanelWidth ?? 44;
      if (!Number.isInteger(minimum) || minimum < 1) throw new RangeError("Invalid minimum panel width.");
      const capacity = Math.max(1, Math.floor((rowWidth + 2) / (minimum + 2)));
      for (let start = 0; start < row.panels.length; start += capacity) {
        const group = row.panels.slice(start, start + capacity);
        const rects = flexRects(
          { column: rowLeft, row: top, width: rowWidth, height: 1 },
          "row",
          group.map((_, index) => ({ id: String(index), grow: 1, basis: 0 })),
          2,
        );
        const boxes = group.map((panel, index) => {
          if (ids.has(panel.id)) throw new TypeError(`Duplicate document id: ${panel.id}`);
          ids.add(panel.id);
          const rect = rects[String(index)]!;
          const border = panel.kind && panel.kind !== "plain" && rect.width >= 8 ? 1 : 0;
          const padding = border ? (rect.width >= 30 ? 2 : 1) : 0;
          const contentWidth = Math.max(1, rect.width - 2 * (border + padding));
          const contentHeight = measure(panel, contentWidth);
          if (!Number.isInteger(contentHeight) || contentHeight < 0 || contentHeight > 100_000) {
            throw new RangeError("Invalid Markdown panel height.");
          }
          return {
            panel,
            rect: { ...rect, height: Math.max(1, contentHeight) + border * 2 + (border ? 2 : 0) },
            contentRect: {
              column: rect.column + border + padding,
              row: top + border * 2,
              width: contentWidth,
              height: Math.max(1, contentHeight),
            },
          };
        });
        const height = Math.max(0, ...boxes.map((box) => box.rect.height));
        for (const box of boxes) {
          // Matching heights preserve the PDF's paired-card composition.
          box.rect.height = height;
          panels.push(box);
        }
        const vertical = flexRects({ column: rowLeft, row: top, width: rowWidth, height: height + 1 }, "column", [{
          id: "content",
          basis: height,
          grow: 0,
          shrink: 0,
        }, { id: "space", basis: 1, grow: 0, shrink: 0 }]);
        top = vertical.space!.row + vertical.space!.height;
      }
    }
    anchor.end = top;
    top += 3;
    if (top > 100_000 || panels.length > 1024) throw new RangeError("Flex document exceeds its resource budget.");
  }
  return { width, height: top, panels, sections: anchors };
}

/** One viewport authority for all chapters, with existing Markdown controllers measuring every panel. */
export class FlexMarkdownController {
  readonly offset: Signal<number> = new Signal(0);
  /** Coalesced notifications for source, prepared geometry and structural changes. */
  readonly revision: Signal<number> = new Signal(0);
  readonly maxWidth: number;
  readonly showFirstSectionHeader: boolean;
  #sections: readonly FlexMarkdownSection[] = [];
  readonly #measurements = new Map<string, MarkdownController>();
  readonly #subscriptions = new Map<string, () => void>();
  readonly #stamps = new Map<string, { source: string; revision: number }>();
  readonly #options: FlexMarkdownSurfaceOptions;
  #layout?: FlexMarkdownLayout;
  #targetLayout?: FlexMarkdownLayout;
  #targets: readonly DocumentInteractionTarget[] = [];
  #dirty = true;
  #notifying = false;
  #disposed = false;

  constructor(options: FlexMarkdownSurfaceOptions) {
    this.#options = { ...options, render: { ...options.render } };
    this.maxWidth = options.maxWidth ?? 120;
    this.showFirstSectionHeader = options.showFirstSectionHeader ?? true;
    this.setSections(options.sections);
  }

  /** Immutable structural snapshot; source signals remain live borrowed references. */
  get sections(): readonly FlexMarkdownSection[] {
    return this.#sections;
  }

  /** The same model measures and paints this panel. */
  panelController(id: string): MarkdownController | undefined {
    return this.#measurements.get(id);
  }

  /** Validate/snapshot first, then retain matching models and dispose removed/replaced panels. */
  setSections(sections: readonly FlexMarkdownSection[]): void {
    if (this.#disposed) throw new Error("Flex document disposed.");
    const snapshot = snapshotSections(sections);
    // Validate all IDs/layout options before allocating or altering a model.
    layoutFlexMarkdown(snapshot, 1, () => 0, this.maxWidth, this.showFirstSectionHeader);
    const oldPanels = this.#sections.flatMap((section) => section.rows.flatMap((row) => row.panels));
    const oldById = new Map(oldPanels.map((panel) => [panel.id, panel]));
    const models = new Map<string, MarkdownController>();
    const created = new Set<MarkdownController>();
    const existing = new Set(this.#measurements.values());
    const updates: { controller: MarkdownController; source: string }[] = [];
    try {
      for (const section of snapshot) {
        for (const row of section.rows) {
          for (const panel of row.panels) {
            const old = oldById.get(panel.id);
            const first = models.size === 0;
            const sameTitleRole = this.#options.render?.headingArt !== "title" ||
              (oldPanels[0]?.id === panel.id) === first;
            const sameSourceBinding = typeof panel.source === "string" && typeof old?.source === "string" ||
              old?.source === panel.source;
            let controller = this.#measurements.get(panel.id);
            if (!controller || !sameTitleRole || !sameSourceBinding) {
              const modelOptions = { source: panel.source, render: panelRenderOptions(this.#options, first) };
              controller = this.#options.createController?.(panel, modelOptions) ??
                new MarkdownController(modelOptions);
              if (existing.has(controller) || created.has(controller)) {
                throw new TypeError("A flex controller factory must return a fresh owned model for each panel.");
              }
              created.add(controller);
            } else if (typeof panel.source === "string" && old?.source !== panel.source) {
              updates.push({ controller, source: panel.source });
            }
            models.set(panel.id, controller);
          }
        }
      }
    } catch (error) {
      for (const controller of created) controller.dispose();
      throw error;
    }
    for (const [id, controller] of this.#measurements) {
      const subscription = this.#subscriptions.get(id)!;
      controller.source.unsubscribe(subscription);
      controller.document.unsubscribe(subscription);
      controller.revision.unsubscribe(subscription);
      if (models.get(id) !== controller) controller.dispose();
    }
    this.#measurements.clear();
    this.#subscriptions.clear();
    for (const [id, controller] of models) {
      const changed = () => this.#invalidate();
      controller.source.subscribe(changed);
      controller.document.subscribe(changed);
      controller.revision.subscribe(changed);
      this.#measurements.set(id, controller);
      this.#subscriptions.set(id, changed);
    }
    this.#sections = snapshot;
    for (const update of updates) update.controller.source.value = update.source;
    this.#invalidate();
  }

  #invalidate(): void {
    this.#dirty = true;
    if (this.#notifying || this.#disposed) return;
    this.#notifying = true;
    // Never enter measurement or mutate a host's render signal recursively
    // while an individual Markdown source/frame is propagating.
    queueMicrotask(() => {
      this.#notifying = false;
      if (!this.#disposed) this.revision.value++;
    });
  }

  layout(width: number): FlexMarkdownLayout {
    if (this.#disposed) throw new Error("Flex document disposed.");
    const changed = [...this.#measurements].some(([id, controller]) => {
      const stamp = this.#stamps.get(id);
      return stamp?.source !== controller.source.peek() || stamp.revision !== controller.revision.peek();
    });
    if (this.#dirty || changed || this.#layout?.width !== width) {
      const previous = this.#layout;
      const offset = this.offset.peek();
      const anchor = offset > 0 ? previous?.panels.find((box) => box.rect.row + box.rect.height > offset) : undefined;
      const layout = layoutFlexMarkdown(
        this.#sections,
        width,
        (panel, columns) => this.#measurements.get(panel.id)!.render(columns).length,
        this.maxWidth,
        this.showFirstSectionHeader,
      );
      this.#layout = layout;
      this.#dirty = false;
      this.#stamps.clear();
      for (const [id, controller] of this.#measurements) {
        this.#stamps.set(id, { source: controller.source.peek(), revision: controller.revision.peek() });
      }
      const moved = anchor && layout.panels.find((box) => box.panel.id === anchor.panel.id);
      if (moved) {
        const delta = Math.min(offset - anchor.rect.row, moved.rect.height - 1);
        this.offset.value = Math.max(0, moved.rect.row + delta);
      }
    }
    return this.#layout;
  }

  inspect(width: number, height: number): { lines: number; offset: number; maxOffset: number } {
    const layout = this.layout(width);
    const { rows } = inspectViewportOverflow({
      contentWidth: width,
      contentHeight: layout.height,
      viewportWidth: width,
      viewportHeight: height,
      offset: { columns: 0, rows: this.offset.peek() },
    });
    return { lines: layout.height, offset: rows.offset, maxOffset: rows.maxOffset };
  }

  scrollTo(offset: number, width: number, height: number): number {
    const finite = Number.isFinite(offset) ? Math.trunc(offset) : 0;
    const next = Math.max(0, Math.min(finite, this.inspect(width, height).maxOffset));
    this.offset.value = next;
    return next;
  }

  scrollBy(rows: number, width: number, height: number): number {
    this.layout(width);
    return this.scrollTo(this.offset.peek() + rows, width, height);
  }

  handleKeyPress(
    event: Pick<KeyPressEvent, "key" | "ctrl" | "meta" | "shift">,
    width: number,
    height: number,
  ): number | undefined {
    if (event.ctrl || event.meta) return undefined;
    const page = Math.max(1, height - 1);
    const delta = { up: -1, down: 1, pageup: -page, pagedown: page }[event.key as "up"];
    if (delta !== undefined) return this.scrollBy(delta, width, height);
    if (event.key === "home") return this.scrollTo(0, width, height);
    if (event.key === "end") return this.scrollTo(Number.MAX_SAFE_INTEGER, width, height);
    return undefined;
  }

  linkAt(column: number, row: number, width: number, height: number): string | undefined {
    return this.interactionAt(column, row, width, height)?.href;
  }

  /** Panel-scoped diagram semantics from the same solved model/width used for measuring and painting. */
  accessibilityTargets(width: number, height?: number): readonly DocumentAccessibilityTarget[] {
    if (this.#disposed) return [];
    const targets: DocumentAccessibilityTarget[] = [];
    for (const box of this.layout(width).panels) {
      for (const target of this.#measurements.get(box.panel.id)!.accessibilityTargets(box.contentRect.width)) {
        if (targets.length >= 4096) throw new RangeError("Flex accessibility target count exceeds its budget.");
        targets.push({
          ...target,
          key: JSON.stringify([box.panel.id, target.key]),
          scope: box.panel.id,
          row: target.row + box.contentRect.row,
        });
      }
    }
    if (height === undefined) return targets;
    const rows = Math.max(0, Math.floor(height));
    if (!Number.isFinite(rows) || !rows) return [];
    const view = this.inspect(width, rows);
    return targets.filter((target) => target.row < view.offset + rows && target.row + target.height > view.offset);
  }

  /** Reading-order action stops with panel-scoped identities and whole-card fallback precedence. */
  interactionTargets(width: number): readonly DocumentInteractionTarget[] {
    const layout = this.layout(width);
    if (this.#targetLayout === layout) return this.#targets;
    const targets: DocumentInteractionTarget[] = [];
    for (const box of layout.panels) {
      const c = box.contentRect, r = box.rect;
      const local = this.#measurements.get(box.panel.id)!.interactionTargets(c.width);
      const nested = local.map((target) => ({
        ...target,
        scope: box.panel.id,
        key: JSON.stringify([box.panel.id, target.key]),
        ranges: target.ranges.map((range) => ({ ...range, column: range.column + c.column, row: range.row + c.row })),
      }));
      targets.push(...nested);
      if (box.panel.href) {
        // Card focus paints only fallback cells. Rich inner links and even
        // tooltip-only diagram nodes retain their own mouse/key semantics.
        const byRow = new Map<number, { column: number; width: number }[]>();
        for (const target of nested) {
          for (const range of target.ranges) {
            const list = byRow.get(range.row) ?? [];
            list.push(range);
            byRow.set(range.row, list);
          }
        }
        const ranges: DocumentInteractionTarget["ranges"][number][] = [];
        for (let row = r.row; row < r.row + r.height; row++) {
          let column = r.column;
          for (const inner of (byRow.get(row) ?? []).sort((a, b) => a.column - b.column)) {
            if (inner.column > column) ranges.push({ row, column, width: inner.column - column });
            column = Math.max(column, inner.column + inner.width);
          }
          if (column < r.column + r.width) ranges.push({ row, column, width: r.column + r.width - column });
        }
        if (ranges.length) {
          targets.push({
            key: JSON.stringify([box.panel.id, "card", box.panel.href]),
            scope: box.panel.id,
            interaction: { href: box.panel.href },
            ranges,
          });
        }
      }
      if (targets.length > 16_384) throw new RangeError("Flex document exceeds its interaction target budget.");
    }
    targets.sort((a, b) => a.ranges[0]!.row - b.ranges[0]!.row || a.ranges[0]!.column - b.ranges[0]!.column);
    this.#targetLayout = layout;
    return this.#targets = targets;
  }

  /** Rich panel hit metadata; diagram actions/tooltips override whole-card links just as inline links do. */
  interactionAt(column: number, row: number, width: number, height: number): MarkdownInteraction | undefined {
    if (
      !Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= width || row < 0 || row >= height
    ) return;
    const y = row + this.inspect(width, height).offset;
    for (const box of this.layout(width).panels) {
      if (!inside(box.rect, column, y)) continue;
      const c = box.contentRect;
      const controller = this.#measurements.get(box.panel.id)!;
      // Use the normal Markdown link geometry at the document-local content row.
      const interaction = inside(c, column, y)
        ? controller.interactionAt(column - c.column, y - c.row, c.width, c.height)
        : undefined;
      return interaction ?? (box.panel.href ? { href: box.panel.href } : undefined);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const [id, controller] of this.#measurements) {
      const subscription = this.#subscriptions.get(id)!;
      controller.source.unsubscribe(subscription);
      controller.document.unsubscribe(subscription);
      controller.revision.unsubscribe(subscription);
    }
    for (const controller of this.#measurements.values()) controller.dispose();
    this.#measurements.clear();
    this.#subscriptions.clear();
    this.#stamps.clear();
    this.#layout = undefined;
    this.#targetLayout = undefined;
    this.#targets = [];
    this.#sections = [];
    this.offset.dispose();
    this.revision.dispose();
  }
}

/** Component-backed flex document: only visible Markdown panels paint a cell canvas. */
export class FlexMarkdownSurface {
  readonly controller: FlexMarkdownController;
  readonly interactions: DocumentInteractionController = new DocumentInteractionController();
  readonly palette: Signal<MarkdownSurfacePalette>;
  readonly ready: Promise<void>;
  readonly #surfaces = new Map<string, MarkdownSurface>();
  readonly #onLink?: (href: string) => void;
  readonly #onActivate?: MarkdownSurfaceOptions["onActivate"];
  readonly #onHover?: MarkdownSurfaceOptions["onHover"];
  #hover?: { column: number; row: number };
  #hoverInteraction?: MarkdownInteraction;
  #tooltip?: DocumentTooltip;
  #focusSource?: { id: string; controller: MarkdownController; source: string };
  readonly #tooltips: boolean;
  readonly #showFirstSectionHeader: boolean;
  readonly #maxWidth: number;
  readonly #ownsController: boolean;
  readonly #changed = () => this.#pruneSurfaces();
  readonly #hoverChanged = () => queueMicrotask(this.#updateHover);
  #disposed = false;
  #width = 1;
  #height = 1;

  constructor(options: FlexMarkdownSurfaceOptions) {
    this.#ownsController = options.controller === undefined;
    this.controller = options.controller ?? new FlexMarkdownController(options);
    this.#onLink = options.onLink;
    this.#onActivate = options.onActivate;
    this.#onHover = options.onHover;
    this.#tooltips = options.tooltips !== false;
    this.#showFirstSectionHeader = this.controller.showFirstSectionHeader;
    this.#maxWidth = this.controller.maxWidth;
    this.palette = new Signal(
      options.palette ??
        {
          text: [226, 232, 244],
          accent: [122, 219, 210],
          muted: [131, 148, 171],
          surface: [10, 12, 20],
          secondary: [229, 183, 99],
        },
    );
    this.controller.revision.subscribe(this.#changed);
    this.controller.revision.subscribe(this.#hoverChanged);
    this.controller.offset.subscribe(this.#hoverChanged);
    this.ready = new Promise((resolve) => queueMicrotask(() => queueMicrotask(resolve)));
  }

  /** Update a live document; removed/replaced views release their cell canvases immediately. */
  setSections(sections: readonly FlexMarkdownSection[]): void {
    this.controller.setSections(sections);
    this.#pruneSurfaces();
  }

  #pruneSurfaces(): void {
    for (const [id, surface] of this.#surfaces) {
      if (surface.component.controller !== this.controller.panelController(id)) {
        surface.dispose();
        this.#surfaces.delete(id);
      }
    }
  }

  /** Measure a host resize and drop stale-width views before their reactive rows can request the old width again. */
  layout(width: number): FlexMarkdownLayout {
    if (this.#disposed) throw new Error("Flex document surface disposed.");
    const layout = this.controller.layout(width);
    this.#width = width;
    const boxes = new Map(layout.panels.map((box) => [box.panel.id, box]));
    for (const [id, surface] of this.#surfaces) {
      const box = boxes.get(id);
      if (
        !box || surface.component.controller !== this.controller.panelController(id) ||
        surface.component.rectangle.peek().width !== box.contentRect.width
      ) {
        surface.dispose();
        this.#surfaces.delete(id);
      }
    }
    return layout;
  }

  render(width: number, height: number): string[] {
    if (this.#disposed) throw new Error("Flex document surface disposed.");
    if (!Number.isInteger(height) || height < 1 || height > 1000) {
      throw new RangeError("Document height must be 1–1000 rows.");
    }
    const layout = this.layout(width);
    this.#validateFocusSource();
    this.#height = height;
    const offset = this.controller.scrollTo(this.controller.offset.peek(), width, height);
    const palette = this.palette.peek();
    const cells = Array.from({ length: height }, () => new Array<string>(width).fill(" "));
    const put = (x: number, y: number, text: string, color = palette.muted) => {
      if (y < offset || y >= offset + height) return;
      const style = createAnsiStyle({ foreground: color, background: palette.surface });
      // Chrome respects the same grapheme/cell-width contract as Markdown.
      for (const char of getMultiCodePointCharacters(text)) {
        if (x >= 0 && x < width) cells[y - offset]![x] = style(char);
        for (let next = 1; next < textWidth(char); next++) if (x + next < width) cells[y - offset]![x + next] = "";
        x += textWidth(char);
      }
    };
    const pageWidth = Math.min(width, this.#maxWidth);
    const left = Math.floor((width - pageWidth) / 2);
    for (const [index, section] of layout.sections.entries()) {
      const label = cropToWidth(`${section.number ?? "00"} / ${section.label.toUpperCase()}`, pageWidth);
      if (this.#showFirstSectionHeader || index > 0) {
        put(left, section.row, label, palette.accent);
        put(left, section.row + 1, "─".repeat(pageWidth));
      }
      put(left, section.end, "─".repeat(pageWidth));
      const footer = cropToWidth(section.label, Math.max(1, pageWidth - 5));
      put(left, section.end + 1, footer);
      if (pageWidth >= 5) put(left + pageWidth - 2, section.end + 1, section.number ?? "00");
    }
    for (const box of layout.panels) {
      if (box.rect.row >= offset + height || box.rect.row + box.rect.height <= offset) continue;
      const r = box.rect, c = box.contentRect;
      if (r.width !== c.width) {
        const color = box.panel.kind === "callout" ? palette.secondary ?? palette.accent : palette.accent;
        put(r.column, r.row, `╭${"─".repeat(r.width - 2)}╮`, color);
        for (let y = Math.max(offset, r.row + 1); y < Math.min(offset + height, r.row + r.height - 1); y++) {
          put(r.column, y, "│", color);
          put(r.column + r.width - 1, y, "│", color);
        }
        put(r.column, r.row + r.height - 1, `╰${"─".repeat(r.width - 2)}╯`, color);
      }
      const start = Math.max(c.row, offset), end = Math.min(c.row + c.height, offset + height);
      if (end <= start) continue;
      let surface = this.#surfaces.get(box.panel.id);
      if (surface?.component.controller !== this.controller.panelController(box.panel.id)) {
        surface?.dispose();
        surface = undefined;
      }
      if (!surface) {
        surface = new MarkdownSurface({
          controller: this.controller.panelController(box.panel.id),
          palette,
          onLink: this.#onLink,
          initialSize: { columns: c.width, rows: end - start },
        });
        this.#surfaces.set(box.panel.id, surface);
      }
      if (surface.palette.peek() !== palette) surface.palette.value = palette;
      // Include the trailing rows so Markdown's own viewport clamp can retain
      // this exact local offset. Offscreen rows are never painted.
      const localOffset = start - c.row;
      const visible = end - start;
      surface.component.controller.scrollTo(localOffset, c.width, visible);
      const rows = surface.renderCells(c.width, visible);
      rows.forEach((row, y) =>
        row.forEach((cell, x) => {
          cells[start - offset + y]![c.column + x] = cell;
        })
      );
    }
    this.#updateHover();
    const selected = this.interactions.hasSelection
      ? this.interactions.selected(this.controller.interactionTargets(width))
      : undefined;
    const range = selected?.ranges.find((range) => range.row >= offset && range.row < offset + height);
    const selectedRows = !this.#hover && selected
      ? {
        first: Math.max(0, selected.ranges[0]!.row - offset),
        last: Math.min(height - 1, selected.ranges.at(-1)!.row - offset),
      }
      : undefined;
    const anchor = this.#hover ?? (range ? { column: range.column, row: range.row - offset } : undefined);
    this.#tooltip = this.#tooltips && !this.interactions.tooltipDismissed && anchor
      ? layoutDocumentTooltip(
        this.#hoverInteraction?.title ?? selected?.interaction.title,
        anchor,
        width,
        height,
        selectedRows,
      )
      : undefined;
    paintDocumentInteractions(
      cells,
      selected,
      offset,
      this.#tooltip,
      createAnsiStyle({ inverse: true, bold: true }),
      createAnsiStyle({ foreground: palette.text, background: palette.surface, inverse: true }),
    );
    return cells.map((row) => row.join(""));
  }

  key(event: KeyPressEvent): boolean {
    if (this.#disposed) return false;
    this.#validateFocusSource();
    if (
      ["left", "right", "return", "space", "escape"].includes(event.key) && !event.ctrl && !event.meta && !event.shift
    ) {
      const hover = !!this.#hoverInteraction;
      this.#hover = undefined;
      this.#updateHover();
      const result = this.interactions.key(
        event,
        this.controller.interactionTargets(this.#width),
        this.controller.inspect(this.#width, this.#height).offset,
        this.#height,
        (row) => this.controller.scrollTo(row, this.#width, this.#height),
        hover,
      );
      const selected = this.interactions.selected(this.controller.interactionTargets(this.#width));
      const model = selected?.scope ? this.controller.panelController(selected.scope) : undefined;
      this.#focusSource = model ? { id: selected!.scope!, controller: model, source: model.source.peek() } : undefined;
      if (result.activate) this.#activate(result.activate);
      if (result.handled) return true;
    }
    const scroll = this.controller.handleKeyPress(event, this.#width, this.#height);
    if (scroll !== undefined) this.interactions.reset();
    return scroll !== undefined;
  }
  scroll(direction: 1 | -1): void {
    if (this.#disposed) return;
    this.interactions.reset();
    this.controller.scrollBy(direction * 3, this.#width, this.#height);
  }
  press(column: number, row: number): void {
    if (this.#disposed) return;
    if (this.#overTooltip(column, row)) return;
    this.interactions.pointer();
    const interaction = this.controller.interactionAt(column, row, this.#width, this.#height);
    if (interaction?.href || interaction?.callbacks?.length) {
      this.#activate(interaction);
    }
  }
  /** Pointer hit metadata in the continuously scrolling flex viewport. */
  hover(column: number, row: number): void {
    if (this.#disposed) return;
    if (this.#overTooltip(column, row)) return;
    this.interactions.pointer();
    this.#hover = { column, row };
    this.#updateHover();
  }
  readonly #updateHover = () => {
    const value = !this.#disposed && this.#hover
      ? this.controller.interactionAt(this.#hover.column, this.#hover.row, this.#width, this.#height)
      : undefined;
    if (value !== this.#hoverInteraction) {
      this.#hoverInteraction = value;
      this.#onHover?.(value);
    }
  };
  #overTooltip(column: number, row: number): boolean {
    const r = this.#tooltip?.rectangle;
    return !!r && column >= r.column && column < r.column + r.width && row >= r.row && row < r.row + r.height;
  }
  #activate(interaction: MarkdownInteraction): void {
    if (this.#onActivate) this.#onActivate(interaction);
    else if (interaction.href) this.#onLink?.(interaction.href);
  }
  #validateFocusSource(): void {
    const previous = this.#focusSource;
    if (
      previous &&
      (this.controller.panelController(previous.id) !== previous.controller ||
        previous.controller.source.peek() !== previous.source)
    ) {
      this.interactions.reset();
      this.#focusSource = undefined;
    }
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.interactions.dispose();
    this.controller.revision.unsubscribe(this.#hoverChanged);
    this.controller.offset.unsubscribe(this.#hoverChanged);
    this.#updateHover();
    this.controller.revision.unsubscribe(this.#changed);
    for (const surface of this.#surfaces.values()) surface.dispose();
    this.#surfaces.clear();
    if (this.#ownsController) this.controller.dispose();
    this.palette.dispose();
  }
}

function snapshotSections(sections: readonly FlexMarkdownSection[]): readonly FlexMarkdownSection[] {
  if (sections.length > 256) throw new RangeError("Flex documents support at most 256 sections.");
  let panels = 0, rows = 0;
  return Object.freeze(sections.map((section) =>
    Object.freeze({
      ...section,
      rows: Object.freeze(section.rows.map((row) => {
        if (++rows > 4096) throw new RangeError("Flex documents support at most 4096 rows.");
        return Object.freeze({
          ...row,
          panels: Object.freeze(row.panels.map((panel) => {
            if (++panels > 1024) throw new RangeError("Flex documents support at most 1024 panels.");
            return Object.freeze({ ...panel });
          })),
        });
      })),
    })
  ));
}

function panelRenderOptions(
  options: FlexMarkdownSurfaceOptions,
  first: boolean,
): NonNullable<MarkdownSurfaceOptions["render"]> {
  const render: NonNullable<MarkdownSurfaceOptions["render"]> = {
    headingFonts: COMPACT_HEADING_FONTS,
    wrapHeadingArt: false,
    mermaid: true,
    mermaidStyle: "circuit",
    showLinkDestinations: false,
    ...options.render,
  };
  // Each panel mounts a Markdown document of its own. Title-only art belongs
  // to the first panel of the whole window, not the first heading of every card.
  if (render.headingArt === "title" && !first) {
    render.headingFonts = { 1: "plain", 2: "plain", 3: "plain", 4: "plain", 5: "plain", 6: "plain" };
  }
  return render;
}

function inside(rect: Rectangle, column: number, row: number): boolean {
  return column >= rect.column && column < rect.column + rect.width && row >= rect.row && row < rect.row + rect.height;
}
