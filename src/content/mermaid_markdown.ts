// Copyright 2023 Im-Beast. MIT license.
import type { AnsiRgbColor, AnsiStyleSpec } from "../theme.ts";
import {
  type MarkdownDiagramCell,
  type MarkdownDiagramFrame,
  type MarkdownDocument,
  type MarkdownRenderOptions,
  parseMarkdown,
} from "./markdown.ts";
import { type MermaidNativeFrame, type MermaidNativeOptions, renderMermaidNativeFrame } from "./mermaid_cells.ts";
import type { MermaidStandardDiagram, MermaidStandardOptions, MermaidStandardRenderer } from "./mermaid_standard.ts";
import { overPaint, parsePaintColor } from "./mermaid_paint.ts";

/** Options for async full-standard preparation before mounting an ordinary native Markdown component. */
export interface MermaidMarkdownOptions {
  compile?: MermaidStandardOptions;
  native?: MermaidNativeOptions;
  render?: Omit<MarkdownRenderOptions, "width" | "diagram">;
  /** Host-controlled horizontal position. Invalidate the Markdown controller when it changes. */
  offset?: (source: string, width: number) => number;
  /** Borrowed local-time reader. The host invalidates its Markdown model when this clock changes. */
  time?: () => number;
}

/** A compiled Markdown diagram keeps upstream evidence and the portable native frame. */
export interface MermaidMarkdownDiagram {
  source: string;
  diagram: MermaidStandardDiagram;
  native: MermaidNativeFrame;
}

/** Prepared document usable unchanged by Markdown, MarkdownSurface and flex document panels. */
export interface MermaidMarkdownDocument {
  source: string;
  document: MarkdownDocument;
  diagrams: readonly MermaidMarkdownDiagram[];
  render: Omit<MarkdownRenderOptions, "width">;
  diagnostics: readonly string[];
}

/** Compile full Mermaid fences asynchronously once; subsequent component layout/scrolling stays synchronous. */
export async function prepareMermaidMarkdown(
  source: string,
  renderer: Pick<MermaidStandardRenderer, "compile">,
  options: MermaidMarkdownOptions = {},
): Promise<MermaidMarkdownDocument> {
  options.compile?.signal?.throwIfAborted();
  if (source.length > 1_000_000) throw new RangeError("Mermaid Markdown is limited to 1,000,000 characters.");
  const document = parseMarkdown(source);
  const diagrams: MermaidMarkdownDiagram[] = [];
  const frames = new Map<string, MarkdownDiagramFrame>();
  const animated = new Map<string, { diagram: MermaidStandardDiagram; time: number }>();
  const diagnostics = new Set<string>();
  const styles = new Map<string, AnsiStyleSpec>();
  let totalCells = 0;
  for (const block of document.blocks) {
    if (block.kind !== "code" || block.language !== "mermaid") continue;
    options.compile?.signal?.throwIfAborted();
    const code = (block.code ?? "").trim();
    if (frames.has(code)) continue;
    if (frames.size >= 64) throw new RangeError("Markdown documents support at most 64 unique full Mermaid diagrams.");
    const diagram = await renderer.compile(code, { ...options.compile, scene: true });
    options.compile?.signal?.throwIfAborted();
    if (!diagram.scene) throw new Error("The full Mermaid compiler must supply a measured native scene.");
    const time = options.time?.() ?? options.native?.timeMs ?? 0;
    const native = renderMermaidNativeFrame(diagram.scene, { ...options.native, timeMs: time });
    totalCells += native.columns * native.rows;
    if (totalCells > 1_000_000) throw new RangeError("Prepared Mermaid document exceeds its native cell budget.");
    for (const message of native.diagnostics) diagnostics.add(`${diagram.diagramType}: ${message}`);
    frames.set(code, frame(native));
    if (options.time && diagram.scene.animations?.length) animated.set(code, { diagram, time });
    diagrams.push({ source: code, diagram, native });
  }
  function frame(native: MermaidNativeFrame): MarkdownDiagramFrame {
    // A frame-local palette prevents an unbounded number of styles accumulating across clock ticks.
    styles.clear();
    const cells: MarkdownDiagramCell[][] = native.cells.map((row) =>
      row.map((cell) => {
        const key = JSON.stringify([
          cell.foreground,
          cell.background,
          cell.bold,
          cell.italic,
          cell.underline,
          cell.underlineColor,
          cell.underlineStyle,
          cell.overline,
          cell.strikethrough,
        ]);
        let style = styles.get(key);
        if (!style) {
          style = {
            foreground: cssColor(cell.foreground, diagnostics),
            background: cssColor(cell.background, diagnostics),
            bold: cell.bold,
            italic: cell.italic,
            underline: cell.underline,
            underlineColor: cssColor(cell.underlineColor, diagnostics),
            underlineStyle: cell.underlineStyle,
            overline: cell.overline,
            strikethrough: cell.strikethrough,
          };
          styles.set(key, style);
        }
        return { char: cell.char, href: cell.href, interaction: cell.interaction, style };
      })
    );
    return { columns: native.columns, cells, accessibility: native.accessibility };
  }
  return {
    source,
    document,
    diagrams,
    diagnostics: [...diagnostics],
    render: {
      ...options.render,
      diagram: (code, width) => {
        const key = code.trim();
        const entry = animated.get(key);
        if (entry) {
          const time = options.time!();
          if (time !== entry.time) {
            const updated = renderMermaidNativeFrame(entry.diagram.scene!, { ...options.native, timeMs: time });
            frames.set(key, frame(updated));
            entry.time = time;
          }
        }
        const result = frames.get(key);
        if (!result) throw new Error("Markdown source changed: prepare its full Mermaid diagrams before rendering.");
        return { ...result, offset: options.offset?.(key, width) ?? 0 };
      },
    },
  };
}

function cssColor(color: string | undefined, diagnostics: Set<string>): AnsiRgbColor | undefined {
  if (!color || color === "none" || color === "transparent") return;
  const parsed = parsePaintColor(color);
  if (parsed) {
    if (parsed.alpha === 0) return;
    if (parsed.alpha !== 1) {
      diagnostics.add(
        "Native transparent paint flattened against default black; set native.background to match the host.",
      );
    }
    return overPaint(parsed, { rgb: [0, 0, 0], alpha: 1 }).rgb.map(Math.round) as unknown as AnsiRgbColor;
  }
  diagnostics.add(`Native CSS paint needs color normalization: ${color}`);
}
