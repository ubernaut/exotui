// Copyright 2023 Im-Beast. MIT license.
import { Component, type ComponentOptions } from "../component.ts";
import type { KeyPressEvent } from "../input_reader/types.ts";
import { Computed, Signal } from "../signals/mod.ts";
import { createAnsiStyle, type Style } from "../theme.ts";
import { signalify } from "../utils/signals.ts";
import {
  type MarkdownDocument,
  type MarkdownInlineMark,
  type MarkdownInteraction,
  type MarkdownParseOptions,
  type MarkdownRenderLine,
  type MarkdownRenderOptions,
  type MarkdownRenderRole,
  markdownRenderText,
  parseMarkdown,
  renderMarkdown,
} from "../content/markdown.ts";
import { drawTextRows } from "./text_children.ts";
import { textWidth } from "../utils/strings.ts";
import { type DocumentAccessibilityTarget, documentAccessibilityTargets } from "../content/document_accessibility.ts";
import {
  DocumentInteractionController,
  type DocumentInteractionTarget,
  documentInteractionTargets,
  documentRowCells,
  type DocumentTooltip,
  layoutDocumentTooltip,
  paintDocumentInteractions,
} from "../content/document_interactions.ts";

/** Semantic Markdown style keys accepted by the terminal component. */
export type MarkdownStyleKey = MarkdownRenderRole | MarkdownInlineMark;

/** Partial semantic style map for terminal Markdown rows. */
export type MarkdownStyles = Partial<Record<MarkdownStyleKey, Style>>;

/** Options for the renderer-neutral Markdown controller. */
export interface MarkdownControllerOptions {
  source?: string | Signal<string>;
  offset?: number | Signal<number>;
  parse?: MarkdownParseOptions;
  render?: Omit<MarkdownRenderOptions, "width">;
}

/** Serializable Markdown controller and viewport inspection. */
export interface MarkdownInspection {
  sourceLength: number;
  blocks: number;
  links: number;
  lines: number;
  offset: number;
  maxOffset: number;
  width: number;
  height: number;
}

/** Options for the interactive terminal Markdown component. */
export interface MarkdownOptions extends ComponentOptions {
  source?: string | Signal<string>;
  controller?: MarkdownController;
  parse?: MarkdownParseOptions;
  render?: Omit<MarkdownRenderOptions, "width">;
  styles?: MarkdownStyles;
  /** Called when a primary-button press activates a rendered link. */
  onLink?: (href: string) => void;
  /** Rich link/callback activation; when supplied, replaces legacy onLink dispatch. Never invokes named functions. */
  onActivate?: (interaction: MarkdownInteraction) => void;
  /** Current pointer metadata, or undefined on leaving/occlusion/disposal. */
  onHover?: (interaction: MarkdownInteraction | undefined) => void;
  /** Native bounded tooltip chrome; false permits custom host presentation via onHover. Defaults to true. */
  tooltips?: boolean;
  tooltipStyle?: Style;
  interactionFocusStyle?: Style;
}

/** Default trait-only styles that preserve the surrounding component palette. */
export const defaultMarkdownStyles: Readonly<MarkdownStyles> = Object.freeze({
  heading: createAnsiStyle({ bold: true }),
  strong: createAnsiStyle({ bold: true }),
  emphasis: createAnsiStyle({ italic: true }),
  code: createAnsiStyle({ inverse: true }),
  strikethrough: createAnsiStyle({ strikethrough: true }),
  link: createAnsiStyle({ underline: true }),
  image: createAnsiStyle({ underline: true }),
  quote: createAnsiStyle({ dim: true }),
  marker: createAnsiStyle({ dim: true }),
  "code-fence": createAnsiStyle({ dim: true }),
  "link-destination": createAnsiStyle({ dim: true, underline: true }),
  rule: createAnsiStyle({ dim: true }),
  "table-border": createAnsiStyle({ dim: true }),
  "table-header": createAnsiStyle({ bold: true }),
});

/** Applies semantic ANSI styles to one rendered Markdown row. */
export function formatMarkdownRenderLine(
  line: MarkdownRenderLine,
  styles: MarkdownStyles = defaultMarkdownStyles,
): string {
  return line.segments.map((segment) => {
    // Explicit native paint belongs inside semantic wrappers: link/role colors must not overwrite it.
    let value = segment.style ? createAnsiStyle(segment.style)(segment.text) : segment.text;
    for (const mark of segment.marks) {
      value = (styles[mark] ?? defaultMarkdownStyles[mark] ?? identityStyle)(value);
    }
    return (styles[segment.role] ?? defaultMarkdownStyles[segment.role] ?? identityStyle)(value);
  }).join("");
}

/** Reactive Markdown parser, terminal renderer, and vertical viewport owner. */
export class MarkdownController {
  readonly source: Signal<string>;
  readonly offset: Signal<number>;
  readonly document: Computed<MarkdownDocument>;
  /** Invalidation signal for prepared diagram viewport/theme adapters. */
  readonly revision: Signal<number> = new Signal(0);
  readonly #parse: MarkdownParseOptions;
  readonly #render: Omit<MarkdownRenderOptions, "width">;
  readonly #ownsSource: boolean;
  readonly #ownsOffset: boolean;
  #parsedSource?: string;
  #renderedDocument?: MarkdownDocument;
  #renderedWidth = -1;
  #renderedRevision = -1;
  #renderedLines: MarkdownRenderLine[] = [];
  #targetLines?: readonly MarkdownRenderLine[];
  #targets: readonly DocumentInteractionTarget[] = [];
  #disposed = false;

  constructor(options: MarkdownControllerOptions = {}) {
    this.#ownsSource = !(options.source instanceof Signal);
    this.#ownsOffset = !(options.offset instanceof Signal);
    this.source = signalify(options.source ?? "");
    this.offset = signalify(options.offset ?? 0);
    this.#parse = { ...options.parse };
    this.#render = { ...options.render };
    this.document = new Computed(() => {
      const source = this.source.value;
      const document = parseMarkdown(source, this.#parse);
      this.#parsedSource = source;
      return document;
    });
  }

  setSource(source: string): MarkdownDocument {
    this.source.value = source;
    this.offset.value = 0;
    this.#syncSource();
    return this.document.peek();
  }

  render(width: number): readonly MarkdownRenderLine[] {
    const safeWidth = Math.max(1, Math.floor(width));
    this.#syncSource();
    const document = this.document.value;
    const revision = this.revision.value;
    if (
      this.#renderedDocument !== document || this.#renderedWidth !== safeWidth || this.#renderedRevision !== revision
    ) {
      const lines = renderMarkdown(document, { ...this.#render, width: safeWidth });
      this.#renderedDocument = document;
      this.#renderedWidth = safeWidth;
      this.#renderedRevision = revision;
      this.#renderedLines = lines;
    }
    return this.#renderedLines;
  }

  #syncSource(): void {
    // A host may change a borrowed source before Computed attaches its
    // dependencies. Refresh only that missed change, not every settled frame.
    if (this.#parsedSource !== this.source.peek()) this.document.update(this.source);
  }

  /** Recompute prepared diagram cells after a host changes their viewport or theme. */
  invalidate(): void {
    this.revision.value++;
  }

  text(width: number): string {
    return markdownRenderText(this.render(width));
  }

  visible(width: number, height: number): MarkdownRenderLine[] {
    const lines = this.render(width);
    const safeHeight = Math.max(0, Math.floor(height));
    const offset = Math.min(normalizeOffset(this.offset.value), Math.max(0, lines.length - safeHeight));
    return lines.slice(offset, offset + safeHeight);
  }

  /** Link under a viewport-local terminal cell, including wrapped links. */
  linkAt(column: number, row: number, width: number, height: number): string | undefined {
    return this.interactionAt(column, row, width, height)?.href;
  }

  /** Full-document keyboard stops, using the same painted spans as pointer hits. */
  interactionTargets(width: number): readonly DocumentInteractionTarget[] {
    const lines = this.render(width);
    if (this.#targetLines !== lines) {
      this.#targets = documentInteractionTargets(lines);
      this.#targetLines = lines;
    }
    return this.#targets;
  }

  /** Diagram semantics from the painted model; optional height restricts them to intersecting viewport rows. */
  accessibilityTargets(width: number, height?: number): readonly DocumentAccessibilityTarget[] {
    if (this.#disposed) return [];
    const targets = documentAccessibilityTargets(this.render(width));
    if (height === undefined) return targets;
    if (!Number.isFinite(height) || height < 1) return [];
    const view = this.inspect(width, height);
    return targets.filter((target) =>
      target.row < view.offset + view.height && target.row + target.height > view.offset
    );
  }

  /** Rich hit metadata at a visible cell; scroll, wide glyphs and diagram pan share the painted geometry. */
  interactionAt(column: number, row: number, width: number, height: number): MarkdownInteraction | undefined {
    if (
      !Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= width || row < 0 || row >= height
    ) return undefined;
    const line = this.visible(width, height)[row];
    let left = 0;
    for (const span of line?.segments ?? []) {
      const right = left + textWidth(span.text);
      if (column >= left && column < right) {
        return span.interaction ?? (span.href || span.title ? { href: span.href, title: span.title } : undefined);
      }
      left = right;
    }
    return undefined;
  }

  scrollTo(offset: number, width: number, height: number): number {
    const maxOffset = this.maxOffset(width, height);
    const next = Math.min(normalizeOffset(offset), maxOffset);
    this.offset.value = next;
    return next;
  }

  scrollBy(rows: number, width: number, height: number): number {
    return this.scrollTo(this.offset.peek() + Math.trunc(rows), width, height);
  }

  maxOffset(width: number, height: number): number {
    return Math.max(0, this.render(width).length - Math.max(0, Math.floor(height)));
  }

  handleKeyPress(
    event: Pick<KeyPressEvent, "key" | "ctrl" | "meta" | "shift">,
    width: number,
    height: number,
  ): number | undefined {
    if (event.ctrl || event.meta) return undefined;
    const page = Math.max(1, Math.floor(height) - 1);
    if (event.key === "up") return this.scrollBy(-1, width, height);
    if (event.key === "down") return this.scrollBy(1, width, height);
    if (event.key === "pageup") return this.scrollBy(-page, width, height);
    if (event.key === "pagedown") return this.scrollBy(page, width, height);
    if (event.key === "home") return this.scrollTo(0, width, height);
    if (event.key === "end") return this.scrollTo(Number.MAX_SAFE_INTEGER, width, height);
    return undefined;
  }

  inspect(width: number, height: number): MarkdownInspection {
    const lines = this.render(width);
    const maxOffset = Math.max(0, lines.length - Math.max(0, Math.floor(height)));
    return {
      sourceLength: this.source.peek().length,
      blocks: this.document.peek().blocks.length,
      links: this.document.peek().links.length,
      lines: lines.length,
      offset: Math.min(normalizeOffset(this.offset.peek()), maxOffset),
      maxOffset,
      width: Math.max(1, Math.floor(width)),
      height: Math.max(0, Math.floor(height)),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#renderedDocument = undefined;
    this.#renderedLines = [];
    this.#targetLines = undefined;
    this.#targets = [];
    this.document.dispose();
    this.revision.dispose();
    if (this.#ownsSource) this.source.dispose();
    if (this.#ownsOffset) this.offset.dispose();
  }
}

/** Scrollable terminal component backed by the parser-neutral Markdown model. */
export class Markdown extends Component {
  readonly controller: MarkdownController;
  /** View-local action focus, independent of a borrowed controller's other mounts. */
  readonly interactions: DocumentInteractionController = new DocumentInteractionController();
  readonly #rows: Computed<string[]>;
  readonly #ownsController: boolean;
  #rowsAttached = false;
  #hover?: { x: number; y: number };
  #hoverInteraction?: MarkdownInteraction;
  #tooltip?: DocumentTooltip;
  #disposed = false;
  readonly #onLink?: MarkdownOptions["onLink"];
  readonly #onActivate?: MarkdownOptions["onActivate"];
  readonly #onHover?: MarkdownOptions["onHover"];

  constructor(options: MarkdownOptions) {
    super(options);
    this.#onLink = options.onLink;
    this.#onActivate = options.onActivate;
    this.#onHover = options.onHover;
    this.#ownsController = options.controller === undefined;
    this.controller = options.controller ?? new MarkdownController({
      source: options.source,
      parse: options.parse,
      render: options.render,
    });
    const styles = { ...defaultMarkdownStyles, ...options.styles };
    const updateHover = () => {
      const rect = this.rectangle.peek();
      const state = this.state.peek();
      const value = this.#hover && this.visible.peek() && (state === "focused" || state === "active")
        ? this.controller.interactionAt(this.#hover.x - rect.column, this.#hover.y - rect.row, rect.width, rect.height)
        : undefined;
      if (value !== this.#hoverInteraction) {
        this.#hoverInteraction = value;
        options.onHover?.(value);
        this.interactions.refresh();
      }
    };
    const hoverSignals = [
      this.rectangle,
      this.visible,
      this.state,
      this.controller.document,
      this.controller.revision,
      this.controller.offset,
    ];
    for (const signal of hoverSignals) signal.subscribe(updateHover);
    const clearFocus = () => this.interactions.reset();
    this.controller.source.subscribe(clearFocus);
    const clearInactive = () => {
      if (!this.visible.peek() || !["active", "focused"].includes(this.state.peek())) clearFocus();
    };
    this.visible.subscribe(clearInactive);
    this.state.subscribe(clearInactive);
    try {
      this.#rows = new Computed(() => {
        const rectangle = this.rectangle.value;
        const visible = this.visible.value;
        // Computed dependencies are captured on construction, so retain the
        // document and viewport dependencies even while this surface is hidden.
        this.controller.document.value;
        this.controller.revision.value;
        this.controller.offset.value;
        this.interactions.revision.value;
        this.state.value;
        if (!visible || rectangle.width <= 0 || rectangle.height <= 0) {
          this.#tooltip = undefined;
          return [];
        }
        const rows = this.controller.visible(rectangle.width, rectangle.height).map((line) =>
          formatMarkdownRenderLine(line, styles)
        );
        const offset = this.controller.inspect(rectangle.width, rectangle.height).offset;
        const selected = this.interactions.hasSelection
          ? this.interactions.selected(this.controller.interactionTargets(rectangle.width))
          : undefined;
        const range = selected?.ranges.find((range) => range.row >= offset && range.row < offset + rectangle.height);
        const selectedRows = !this.#hover && selected
          ? {
            first: Math.max(0, selected.ranges[0]!.row - offset),
            last: Math.min(rectangle.height - 1, selected.ranges.at(-1)!.row - offset),
          }
          : undefined;
        const anchor = this.#hover
          ? { column: this.#hover.x - rectangle.column, row: this.#hover.y - rectangle.row }
          : range
          ? { column: range.column, row: range.row - offset }
          : undefined;
        this.#tooltip = options.tooltips !== false && !this.interactions.tooltipDismissed && anchor
          ? layoutDocumentTooltip(
            this.#hoverInteraction?.title ?? selected?.interaction.title,
            anchor,
            rectangle.width,
            rectangle.height,
            selectedRows,
          )
          : undefined;
        if (!selected && !this.#tooltip) return rows;
        const cells = Array.from(
          { length: rectangle.height },
          (_, row) => documentRowCells(rows[row] ?? "", rectangle.width),
        );
        paintDocumentInteractions(
          cells,
          selected,
          offset,
          this.#tooltip,
          options.interactionFocusStyle ?? createAnsiStyle({ inverse: true, bold: true }),
          options.tooltipStyle ?? createAnsiStyle({ inverse: true }),
        );
        return cells.map((row) => row.join(""));
      });
    } catch (error) {
      for (const signal of hoverSignals) signal.unsubscribe(updateHover);
      this.controller.source.unsubscribe(clearFocus);
      this.visible.unsubscribe(clearInactive);
      this.state.unsubscribe(clearInactive);
      this.interactions.dispose();
      if (this.#ownsController) this.controller.dispose();
      super.destroy();
      throw error;
    }
    queueMicrotask(() => this.#rowsAttached = true);
    this.on("keyPress", (event) => {
      this.handleKeyPress(event);
    });
    this.on("mouseScroll", (event) => {
      const { width, height } = this.rectangle.peek();
      this.interactions.reset();
      this.controller.scrollBy(event.scroll * 3, width, height);
    });
    this.on("mousePress", (event) => {
      if (
        this.#disposed || !this.visible.peek() || !["focused", "active"].includes(this.state.peek()) || event.release ||
        event.drag || event.button !== 0
      ) return;
      const rect = this.rectangle.peek();
      if (this.#overTooltip(event.x - rect.column, event.y - rect.row)) return;
      this.interactions.pointer();
      const interaction = this.controller.interactionAt(
        event.x - rect.column,
        event.y - rect.row,
        rect.width,
        rect.height,
      );
      if (interaction?.href || interaction?.callbacks?.length) {
        this.#activate(interaction);
      }
    });
    this.on("mouseEvent", (event) => {
      const rect = this.rectangle.peek();
      if (this.#overTooltip(event.x - rect.column, event.y - rect.row)) return;
      this.interactions.pointer();
      this.#hover = { x: event.x, y: event.y };
      updateHover();
    });
    this.on("destroy", () => {
      this.#disposed = true;
      for (const signal of hoverSignals) signal.unsubscribe(updateHover);
      this.#hover = undefined;
      updateHover();
      this.controller.source.unsubscribe(clearFocus);
      this.visible.unsubscribe(clearInactive);
      this.state.unsubscribe(clearInactive);
      this.interactions.dispose();
      this.#rows.dispose();
      if (this.#ownsController) this.controller.dispose();
    });
  }

  #overTooltip(column: number, row: number): boolean {
    const rect = this.#tooltip?.rectangle;
    return !!rect && column >= rect.column && column < rect.column + rect.width && row >= rect.row &&
      row < rect.row + rect.height;
  }

  #activate(interaction: MarkdownInteraction): void {
    if (this.#onActivate) this.#onActivate(interaction);
    else if (interaction.href) this.#onLink?.(interaction.href);
  }

  /** Native component key path, also used by offscreen hosts; preserves global focus/window shortcuts. */
  handleKeyPress(event: KeyPressEvent): boolean {
    if (this.#disposed || !this.visible.peek() || !["focused", "active"].includes(this.state.peek())) return false;
    const { width, height } = this.rectangle.peek();
    if (width <= 0 || height <= 0) return false;
    const actionKey = ["left", "right", "return", "space", "escape"].includes(event.key);
    if (actionKey && !event.ctrl && !event.meta && !event.shift) {
      const hover = !!this.#hoverInteraction;
      this.#hover = undefined;
      this.#hoverInteraction = undefined;
      if (hover) this.#onHover?.(undefined);
      const result = this.interactions.key(
        event,
        this.controller.interactionTargets(width),
        this.controller.inspect(width, height).offset,
        height,
        (row) => this.controller.scrollTo(row, width, height),
        hover,
      );
      if (hover) this.interactions.refresh();
      if (result.activate) this.#activate(result.activate);
      if (result.handled) return true;
    }
    const scroll = this.controller.handleKeyPress(event, width, height);
    if (scroll !== undefined) this.interactions.reset();
    return scroll !== undefined;
  }

  override draw(): void {
    super.draw();
    // Hosts may supply the first real rectangle before initial dependency
    // subscriptions attach. Refresh only during that initial microtask gap;
    // settled frames retain normal incremental computed/canvas invalidation.
    if (!this.#rowsAttached) this.#rows.update(this.rectangle);
    drawTextRows(this, this.#rows, { keyPrefix: "markdown", multiCodePointSupport: true });
  }

  override interact(method: "keyboard" | "mouse"): void {
    this.state.value = "focused";
    super.interact(method);
  }
}

function identityStyle(value: string): string {
  return value;
}

function normalizeOffset(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
}
