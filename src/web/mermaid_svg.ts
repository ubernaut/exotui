// Copyright 2026 the ExotUI authors. MIT license.
import { MarkdownController, type MarkdownControllerOptions } from "../components/markdown.ts";
import { FlexMarkdownSurface, type FlexMarkdownSurfaceOptions } from "../content/flex_markdown_surface.ts";
import type { MarkdownDiagramFrame, MarkdownRenderLine } from "../content/markdown.ts";
import type { MermaidStandardConfig, MermaidStandardRenderer } from "../content/mermaid_standard.ts";
import type { Rectangle } from "../types.ts";

/** Browser-only settings; the compiler is borrowed and source cannot enable trusted callbacks. */
export interface MermaidSvgSettings {
  /** Host configuration, snapshotted as JSON; strict upstream security remains mandatory. */
  readonly config?: MermaidStandardConfig;
  /** CSS pixels per terminal column used to reserve diagram height. Defaults to 9. */
  readonly cellWidth?: number;
  /** CSS pixels per terminal row used to reserve diagram height. Defaults to 18. */
  readonly cellHeight?: number;
}

/** One upstream SVG occupying an ordinary Markdown block's reserved terminal rows. */
export interface MermaidSvgTarget {
  /** Stable panel/block identity, independent of scroll position. */
  readonly key: string;
  /** Original fenced Mermaid source, retained for authoring/debugging. */
  readonly source: string;
  /** Strict upstream SVG, with executable attributes removed at the mounting boundary. */
  readonly svg: string;
  /** Reserved stage in document-cell coordinates. */
  readonly rect: Rectangle;
}

interface Entry {
  source: string;
  width: number;
  abort: AbortController;
  work: Promise<void>;
  rows: number;
  frame: MarkdownDiagramFrame;
  svg?: string;
  error?: string;
}

/** Reserve a stage with the existing Markdown controller; never approximate upstream SVG geometry. */
export class MermaidSvgMarkdownController extends MarkdownController {
  readonly #compiler: Pick<MermaidStandardRenderer, "compile">;
  readonly #entries = new Map<string, Entry>();
  readonly #previous = new Map<string, Entry>();
  #settings: MermaidSvgSettings;
  #identity = "";
  #closed = false;

  constructor(
    compiler: Pick<MermaidStandardRenderer, "compile">,
    options: MarkdownControllerOptions = {},
    settings: MermaidSvgSettings = {},
  ) {
    const bridge: { model?: MermaidSvgMarkdownController } = {};
    super({
      ...options,
      render: { ...options.render, mermaid: false, diagram: (s, w) => bridge.model!.#diagram(s, w) },
    });
    bridge.model = this;
    this.#compiler = compiler;
    this.#settings = snapshotSettings(settings);
  }

  /** A changed theme or cell aspect invalidates only this model's owned compilation generations. */
  configure(settings: MermaidSvgSettings): void {
    const next = snapshotSettings(settings);
    if (JSON.stringify(next) === JSON.stringify(this.#settings)) return;
    // Theme relayout retains accepted geometry until its replacement is ready.
    this.#previous.clear();
    for (const [source, entry] of this.#entries) if (entry.svg) this.#previous.set(source, entry);
    this.#settings = next;
    this.#clear();
    this.invalidate();
  }

  override render(width: number): readonly MarkdownRenderLine[] {
    const identity = JSON.stringify([this.source.peek(), Math.max(1, Math.floor(width)), this.#settings]);
    if (identity !== this.#identity) {
      const previous = this.#identity ? JSON.parse(this.#identity) : undefined;
      if (!previous || previous[0] !== this.source.peek() || previous[1] !== Math.max(1, Math.floor(width))) {
        this.#previous.clear();
      }
      this.#clear();
      this.#identity = identity;
      this.invalidate();
    }
    return super.render(width);
  }

  #diagram(source: string, width: number): MarkdownDiagramFrame {
    let entry = this.#entries.get(source);
    if (entry) return entry.frame;
    if (this.#closed) return blankFrame(width, 1, "Diagram view closed.");
    if (this.#entries.size >= 32) throw new RangeError("A Markdown panel supports at most 32 SVG diagrams.");
    const previous = this.#previous.get(source);
    entry = {
      source,
      width,
      abort: new AbortController(),
      work: Promise.resolve(),
      rows: previous?.width === width ? previous.rows : 2,
      frame: previous?.width === width ? previous.frame : blankFrame(width, 2, "Rendering Mermaid…"),
      svg: previous?.width === width ? previous.svg : undefined,
    };
    this.#entries.set(source, entry);
    const owned = entry;
    owned.work = this.#compiler.compile(source, {
      config: this.#settings.config,
      containerWidth: width * (this.#settings.cellWidth ?? 9),
      scene: false,
      trusted: false,
      signal: owned.abort.signal,
    }).then((diagram) => {
      if (owned.abort.signal.aborted || this.#closed || this.#entries.get(source) !== owned) return;
      const { svg, aspect, width: intrinsicWidth } = prepareSvg(diagram.svg, diagram.viewport);
      const rows = Math.max(
        2,
        Math.ceil(
          Math.min(width * (this.#settings.cellWidth ?? 9), intrinsicWidth) * aspect /
            (this.#settings.cellHeight ?? 18),
        ),
      );
      if (rows > 2048 || rows * width > 262_144) throw new RangeError("SVG diagram stage exceeds its cell budget.");
      owned.svg = svg;
      owned.rows = rows;
      owned.frame = blankFrame(width, rows);
      this.#previous.delete(source);
      this.invalidate();
    }).catch((error) => {
      if (owned.abort.signal.aborted || this.#closed || this.#entries.get(source) !== owned) return;
      owned.error = String(error).slice(0, 512);
      owned.svg = undefined;
      owned.frame = blankFrame(width, 2, "Mermaid error: " + owned.error);
      this.invalidate();
    });
    return owned.frame;
  }

  /** Wait for this width's current generation, not canceled work from an earlier resize. */
  async settled(width: number): Promise<void> {
    while (!this.#closed) {
      this.render(width);
      const current = [...this.#entries.values()];
      await Promise.all(current.map((entry) => entry.work));
      if (this.#closed || current.every((entry) => this.#entries.get(entry.source) === entry)) return;
    }
  }

  /** Positions come from the exact component rows used for measurement and paint. */
  svgTargets(width: number): readonly MermaidSvgTarget[] {
    const lines = this.render(width);
    const blocks = this.document.peek().blocks;
    const targets: MermaidSvgTarget[] = [];
    let previous = -1;
    for (let row = 0; row < lines.length; row++) {
      const index = lines[row]!.blockIndex;
      if (index === previous) continue;
      previous = index;
      const block = blocks[index];
      if (block?.kind !== "code" || block.language !== "mermaid") continue;
      const entry = this.#entries.get(block.code ?? "");
      if (!entry?.svg) continue;
      const quote = Math.min(width - entry.width, (block.quoteDepth ?? 0) * 2);
      targets.push({
        key: String(index),
        source: entry.source,
        svg: entry.svg,
        rect: { column: quote, row, width: entry.width, height: entry.rows },
      });
    }
    return targets;
  }

  #clear(): void {
    for (const entry of this.#entries.values()) entry.abort.abort();
    this.#entries.clear();
  }

  override dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#clear();
    this.#previous.clear();
    super.dispose();
  }
}

/** Actual ExotUI flex/Markdown components with browser SVG stages, not an HTML document renderer. */
export class MermaidSvgFlexSurface extends FlexMarkdownSurface {
  #settings: MermaidSvgSettings;

  constructor(
    compiler: Pick<MermaidStandardRenderer, "compile">,
    options: Omit<FlexMarkdownSurfaceOptions, "controller" | "createController">,
    settings: MermaidSvgSettings = {},
  ) {
    super({
      ...options,
      createController: (_, model) => new MermaidSvgMarkdownController(compiler, model, settings),
    });
    this.#settings = snapshotSettings(settings);
  }

  /** Apply host theme/metrics without changing Markdown authoring or document ownership. */
  configure(settings: MermaidSvgSettings): void {
    this.#settings = snapshotSettings(settings);
    for (const section of this.controller.sections) {
      for (const row of section.rows) {
        for (const panel of row.panels) {
          (this.controller.panelController(panel.id) as MermaidSvgMarkdownController).configure(this.#settings);
        }
      }
    }
  }

  /** Wait through async diagram-height reflow using the same panel models. */
  async settled(width: number): Promise<void> {
    while (true) {
      const before = this.controller.layout(width);
      const models = before.panels.map((box) =>
        this.controller.panelController(box.panel.id) as MermaidSvgMarkdownController
      );
      await Promise.all(models.map((model, index) => model.settled(before.panels[index]!.contentRect.width)));
      const after = this.controller.layout(width);
      if (
        after.panels.length === models.length &&
        after.panels.every((box, index) =>
          this.controller.panelController(box.panel.id) === models[index] &&
          box.contentRect.width === before.panels[index]!.contentRect.width
        )
      ) return;
    }
  }

  /** Diagram boxes in the scrolling document's coordinates. */
  svgTargets(width: number): readonly MermaidSvgTarget[] {
    const targets: MermaidSvgTarget[] = [];
    for (const box of this.controller.layout(width).panels) {
      const model = this.controller.panelController(box.panel.id) as MermaidSvgMarkdownController;
      model.configure(this.#settings);
      for (const target of model.svgTargets(box.contentRect.width)) {
        targets.push({
          ...target,
          key: box.panel.id + ":" + target.key,
          rect: {
            ...target.rect,
            column: target.rect.column + box.contentRect.column,
            row: target.rect.row + box.contentRect.row,
          },
        });
      }
    }
    return targets;
  }
}

/** Final desktop projection; ordered back-to-front, with chrome included in occlusion. */
export interface MermaidSvgWindow {
  /** Existing desktop window identity. */
  readonly id: string;
  /** Full chrome rectangle used to occlude lower diagrams. */
  readonly rect: Rectangle;
  /** Existing desktop client origin; this layer does not alter window geometry. */
  readonly clientRect: Rectangle;
}

/** Browser document viewport supplied by the host; it never replaces desktop window state. */
export interface MermaidSvgViewport {
  /** Borrowed component-backed document surface. */
  readonly surface: MermaidSvgFlexSurface;
  /** Document width in terminal columns. */
  readonly width: number;
  /** Document viewport height in terminal rows. */
  readonly height: number;
  /** Document inset from the client origin, in columns. Defaults to zero. */
  readonly column?: number;
  /** Document inset from the client origin, in rows. Defaults to zero. */
  readonly row?: number;
}

/** Clip upstream vector stages to actual desktop clients and higher windows. No executable SVG hooks are attached. */
export class MermaidSvgDesktopLayer {
  /** Owned browser enhancement root, removed on disposal. */
  readonly element: HTMLDivElement;
  readonly #root: HTMLElement;
  readonly #stages = new Map<string, { element: HTMLDivElement; shadow: ShadowRoot; svg: string }>();
  #closed = false;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.element = root.ownerDocument.createElement("div");
    this.element.dataset.exotuiMermaid = "svg";
    Object.assign(this.element.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
    if (getComputedStyle(root).position === "static") root.style.position = "relative";
    root.appendChild(this.element);
  }

  /** Call after desktop composition. Menus/modal/transition effects take precedence over vector stages. */
  present(options: {
    /** Final back-to-front desktop window projection, including auxiliary windows. */
    readonly windows: readonly MermaidSvgWindow[];
    /** Borrowed documents keyed by desktop window identity. */
    readonly documents: ReadonlyMap<string, MermaidSvgViewport>;
    /** Current desktop column count. */
    readonly columns: number;
    /** Current desktop row count. */
    readonly rows: number;
    /** Hide vector stages while menus, modals or transition effects own the screen. */
    readonly blocked?: boolean;
  }): void {
    if (this.#closed) return;
    this.element.hidden = !!options.blocked;
    if (options.blocked) return;
    const bounds = this.#root.getBoundingClientRect();
    const cw = bounds.width / options.columns, ch = bounds.height / options.rows;
    if (![cw, ch].every((value) => Number.isFinite(value) && value > 0)) return;
    const retained = new Set<string>();
    options.windows.forEach((window, index) => {
      const view = options.documents.get(window.id);
      if (!view) return;
      const column = window.clientRect.column + (view.column ?? 0);
      const row = window.clientRect.row + (view.row ?? 0);
      const viewport = { column, row, width: view.width, height: view.height };
      const screen = { column: 0, row: 0, width: options.columns, height: options.rows };
      const offset = view.surface.controller.offset.peek();
      for (const target of view.surface.svgTargets(view.width)) {
        const rect = { ...target.rect, column: column + target.rect.column, row: row + target.rect.row - offset };
        const visible = intersection(intersection(rect, viewport), screen);
        if (!visible.width || !visible.height) continue;
        let fragments = [visible];
        for (const upper of options.windows.slice(index + 1)) {
          fragments = fragments.flatMap((part) => subtract(part, upper.rect));
        }
        if (!fragments.length) continue;
        const key = window.id + ":" + target.key;
        retained.add(key);
        let stage = this.#stages.get(key);
        if (!stage) {
          const element = this.#root.ownerDocument.createElement("div");
          element.dataset.mermaidStage = key;
          element.dataset.exotuiSelectable = "text";
          Object.assign(element.style, {
            position: "absolute",
            pointerEvents: "auto",
            userSelect: "text",
            cursor: "text",
          });
          this.element.appendChild(element);
          this.#stages.set(key, stage = { element, shadow: element.attachShadow({ mode: "open" }), svg: "" });
        }
        if (stage.svg !== target.svg) {
          // Shadow isolation contains SVG IDs/styles without adding child
          // browsing contexts to the browser's Back/Forward history.
          stage.shadow.innerHTML = target.svg;
          const svg = stage.shadow.querySelector<SVGSVGElement>("svg")!;
          Object.assign(svg.style, {
            width: "100%",
            height: "100%",
            maxWidth: "none",
            display: "block",
            background: "transparent",
            userSelect: "text",
          });
          stage.svg = target.svg;
        }
        Object.assign(stage.element.style, {
          left: `${rect.column * cw}px`,
          top: `${rect.row * ch}px`,
          width: `${rect.width * cw}px`,
          height: `${rect.height * ch}px`,
          clipPath: `path("${
            fragments.map((part) => {
              const x = (part.column - rect.column) * cw, y = (part.row - rect.row) * ch;
              return `M${x},${y}h${part.width * cw}v${part.height * ch}h${-part.width * cw}Z`;
            }).join(" ")
          }")`,
        });
      }
    });
    for (const [key, stage] of this.#stages) {
      if (!retained.has(key)) {
        stage.element.remove();
        this.#stages.delete(key);
      }
    }
  }

  /** Remove only this layer's owned DOM, never the borrowed compiler/surfaces or desktop. */
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#stages.clear();
    this.element.remove();
  }
}

function snapshotSettings(settings: MermaidSvgSettings): MermaidSvgSettings {
  const cellWidth = settings.cellWidth ?? 9, cellHeight = settings.cellHeight ?? 18;
  if (![cellWidth, cellHeight].every((value) => Number.isFinite(value) && value > 0 && value <= 256)) {
    throw new RangeError("Invalid SVG cell aspect ratio.");
  }
  return { cellWidth, cellHeight, config: settings.config ? JSON.parse(JSON.stringify(settings.config)) : undefined };
}

function blankFrame(width: number, rows: number, message = ""): MarkdownDiagramFrame {
  const blank = Array.from({ length: width }, () => ({ char: " ", role: "diagram-grid" as const }));
  const cells = Array.from({ length: rows }, () => blank);
  if (message) {
    const safe = message.replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "?").slice(0, width).padEnd(width, " ");
    cells[0] = [...safe].map((char) => ({ char, role: "diagram-grid" as const }));
  }
  return { columns: width, cells };
}

function prepareSvg(
  source: string,
  viewport?: { width: number; height: number },
): { svg: string; aspect: number; width: number } {
  if (source.length > 4_194_304) throw new RangeError("Mermaid SVG exceeds its 4 MiB character limit.");
  // Upstream foreignObject labels are HTML, not necessarily well-formed XML
  // (for example class labels contain <br>). A template parses them exactly as
  // the browser does, while keeping styles, scripts and resources inert.
  const template = document.createElement("template");
  template.innerHTML = source;
  const svg = template.content.querySelector("svg");
  if (!svg) throw new SyntaxError("Invalid Mermaid SVG.");
  const nodes = svg.querySelectorAll("*");
  if (nodes.length > 65_536) throw new RangeError("Mermaid SVG exceeds its node limit.");
  // The upstream strict renderer sanitizes source. Defense in depth at the mounting boundary:
  // no scriptable containers, event attributes or network-bearing diagram resources.
  for (const element of [svg, ...nodes]) {
    if (["script", "iframe", "object", "embed", "link"].includes(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") || name === "srcdoc" ||
        (["srcset", "poster", "action", "formaction", "background"].includes(name)) ||
        (["href", "src"].includes(name) && value && !value.startsWith("#") &&
          !(["image", "img", "feImage"].includes(element.localName) &&
            /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);/i.test(value))) ||
        !localCssUrls(value)
      ) element.removeAttributeNode(attribute);
    }
    if (element.localName === "style") {
      const sheet = new CSSStyleSheet();
      const text = element.textContent ?? "";
      try {
        // Constructed sheets ignore @import without fetching it. Preserve
        // unrelated upstream rules when external resource rules are denied.
        sheet.replaceSync(text);
        element.textContent = [...sheet.cssRules].filter(safeCssRule).map((rule) => rule.cssText).join("\n");
      } catch {
        element.remove();
      }
    }
  }
  const box = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const width = box[2] ?? viewport?.width ?? Number.parseFloat(svg.getAttribute("width") ?? "");
  const height = box[3] ?? viewport?.height ?? Number.parseFloat(svg.getAttribute("height") ?? "");
  if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 1_000_000)) {
    throw new RangeError("Mermaid SVG has no bounded positive viewport: " + svg.outerHTML.slice(0, 400));
  }
  if (box.length !== 4) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return { svg: svg.outerHTML, aspect: height / width, width };
}

function localCssUrls(value: string): boolean {
  return [...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)].every((match) => {
    const url = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    return url.startsWith("#") ||
      /^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/[\w-]+|application\/font-woff);/i.test(url);
  });
}

function safeCssRule(rule: CSSRule): boolean {
  if (rule.type === CSSRule.IMPORT_RULE || !localCssUrls(rule.cssText)) return false;
  if ("cssRules" in rule) return [...(rule as CSSGroupingRule).cssRules].every(safeCssRule);
  return true;
}

function intersection(a: Rectangle, b: Rectangle): Rectangle {
  const column = Math.max(a.column, b.column), row = Math.max(a.row, b.row);
  return {
    column,
    row,
    width: Math.max(0, Math.min(a.column + a.width, b.column + b.width) - column),
    height: Math.max(0, Math.min(a.row + a.height, b.row + b.height) - row),
  };
}

function subtract(a: Rectangle, b: Rectangle): Rectangle[] {
  const cut = intersection(a, b);
  if (!cut.width || !cut.height) return [a];
  return [
    { column: a.column, row: a.row, width: a.width, height: cut.row - a.row },
    { column: a.column, row: cut.row + cut.height, width: a.width, height: a.row + a.height - cut.row - cut.height },
    { column: a.column, row: cut.row, width: cut.column - a.column, height: cut.height },
    {
      column: cut.column + cut.width,
      row: cut.row,
      width: a.column + a.width - cut.column - cut.width,
      height: cut.height,
    },
  ].filter((part) => part.width > 0 && part.height > 0);
}
