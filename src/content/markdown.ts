// Copyright 2023 Im-Beast. MIT license.
// markdown-it 15 exports the callable constructor as the default value and the
// instance type as a named type export, so the two are imported separately.
import MarkdownIt, { type MarkdownIt as MarkdownItParser, type Token } from "markdown-it";
import type { AnsiStyleSpec } from "../theme.ts";
import { cropToWidth, getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";
import { type MarkdownHeadingFonts, renderAsciiHeading } from "./heading_fonts.ts";
import { layoutMermaid, parseMermaid, renderMermaidCells, renderMermaidFrame } from "./mermaid.ts";
import { snapshotDiagramAccessibility } from "./document_accessibility.ts";
import type { DiagramSemanticNode } from "./document_semantics.ts";

/** Block kinds emitted by the renderer-neutral Markdown parser. */
export type MarkdownBlockKind = "heading" | "paragraph" | "list-item" | "code" | "rule" | "table-row";

/** Semantic marks carried by parsed inline Markdown spans. */
export type MarkdownInlineMark = "strong" | "emphasis" | "code" | "strikethrough" | "link" | "image";

/** One text span with semantic marks and optional link metadata. */
export interface MarkdownInlineSpan {
  text: string;
  marks: readonly MarkdownInlineMark[];
  href?: string;
  title?: string;
  /** Portable diagram/link metadata; actions are dispatched only by an explicit host hook. */
  interaction?: MarkdownInteraction;
}

/** Declarative callback arguments, never executable source or a global-function lookup. */
export interface MarkdownCallback {
  name: string;
  args: readonly string[];
}

/** JSON-portable hit metadata shared by native diagrams, Markdown and cell-window hosts. */
export interface MarkdownInteraction {
  id?: string;
  href?: string;
  target?: string;
  title?: string;
  callbacks?: readonly MarkdownCallback[];
}

/** One parsed Markdown table cell. */
export interface MarkdownTableCell {
  header: boolean;
  align?: "left" | "center" | "right";
  inlines: readonly MarkdownInlineSpan[];
}

/** Renderer-neutral Markdown block with kind-specific metadata. */
export interface MarkdownBlock {
  kind: MarkdownBlockKind;
  inlines?: readonly MarkdownInlineSpan[];
  level?: number;
  quoteDepth?: number;
  listDepth?: number;
  listGroup?: number;
  ordered?: boolean;
  index?: number;
  checked?: boolean;
  language?: string;
  code?: string;
  header?: boolean;
  cells?: readonly MarkdownTableCell[];
}

/** Parsed Markdown document and discovered links. */
export interface MarkdownDocument {
  source: string;
  blocks: readonly MarkdownBlock[];
  links: readonly { text: string; href: string; title?: string }[];
}

/** Safe Markdown parser options supported by the content surface. */
export interface MarkdownParseOptions {
  linkify?: boolean;
  typographer?: boolean;
  breaks?: boolean;
}

/** Terminal-oriented Markdown render options. */
export interface MarkdownRenderOptions {
  width: number;
  showLinkDestinations?: boolean;
  codeLineNumbers?: boolean;
  bullet?: string;
  rule?: string;
  /** Opt-in ASCII font per heading level; omitted levels retain their default rendering. */
  headingFonts?: MarkdownHeadingFonts;
  /** "title" allows art only for an unquoted H1 at the start of the document; later headings stay plain. */
  headingArt?: "all" | "title";
  /** False falls back to plain text instead of wrapping large heading art across rows. */
  wrapHeadingArt?: boolean;
  /** Render fenced Mermaid flowcharts as circuit-routed cells rather than source code. */
  mermaid?: boolean;
  /** Opt-in compact, theme-aware circuit-board diagram presentation. */
  mermaidStyle?: "plain" | "circuit";
  /** Host-precompiled Mermaid cells; no diagram engine enters the document/core import graph. */
  diagram?: (source: string, width: number) => MarkdownDiagramFrame | undefined;
  /**
   * "wrap" keeps every table cell complete: cells wrap onto extra rows with their inline marks and links, and a
   * table too narrow for its columns becomes labelled records. The default truncates each cell to a single row.
   */
  tableCells?: "truncate" | "wrap";
}

/** Portable diagram cell, with native styling rather than embedded ANSI/HTML. */
export interface MarkdownDiagramCell {
  char: string;
  style?: AnsiStyleSpec;
  href?: string;
  interaction?: MarkdownInteraction;
}

/** A prepared diagram and its horizontal viewport; empty cells continue wide glyphs. */
export interface MarkdownDiagramFrame {
  columns: number;
  cells: readonly (readonly MarkdownDiagramCell[])[];
  offset?: number;
  /** Inert diagram semantics survive native preparation, pan, scrolling and remote JSON transport. */
  accessibility?: MarkdownDiagramAccessibility;
}

/** Root diagram semantics, independent of browser DOM and terminal paint. */
export interface MarkdownDiagramAccessibility {
  readonly title?: string;
  readonly description?: string;
  /** Upstream ARIA role tokens, including ordered fallbacks. */
  readonly role?: string;
  readonly roleDescription?: string;
  readonly hidden?: boolean;
  /** Meaningful engine label/MathML structure, not source SVG or flattened cell text. */
  readonly content?: readonly DiagramSemanticNode[];
}

/** Semantic role assigned to one rendered Markdown segment. */
export type MarkdownRenderRole =
  | "text"
  | "heading"
  | "marker"
  | "quote"
  | "code"
  | "code-fence"
  | "link-destination"
  | "rule"
  | "table-border"
  | "table-header"
  | "diagram-node"
  | "diagram-trace"
  | "diagram-integration"
  | "diagram-label"
  | "diagram-grid";

/** One renderable terminal segment retaining Markdown semantics. */
export interface MarkdownRenderSegment extends MarkdownInlineSpan {
  role: MarkdownRenderRole;
  /** Explicit native diagram styling, applied inside the host's semantic style. */
  style?: AnsiStyleSpec;
}

/** One cell-width-bounded terminal row projected from a Markdown block. */
export interface MarkdownRenderLine {
  blockIndex: number;
  text: string;
  segments: readonly MarkdownRenderSegment[];
  /** Repeated on each row so partially visible diagrams retain their semantic identity. */
  accessibility?: MarkdownDiagramAccessibility;
}

interface ListState {
  root: number;
  ordered: boolean;
  next: number;
}

interface ListItemState {
  group: number;
  ordered: boolean;
  index: number;
  depth: number;
  emitted: boolean;
}

const parserCache = new Map<string, MarkdownItParser>();
const emptyMarks: readonly MarkdownInlineMark[] = [];

/** Parses CommonMark plus tables and strikethrough into a renderer-neutral document. */
export function parseMarkdown(source: string, options: MarkdownParseOptions = {}): MarkdownDocument {
  const normalizedSource = String(source).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const tokens = markdownParser(options).parse(normalizedSource, {});
  const blocks: MarkdownBlock[] = [];
  const lists: ListState[] = [];
  const items: ListItemState[] = [];
  let quoteDepth = 0;
  let listSequence = 0;
  let headingLevel: number | undefined;
  let row: MarkdownTableCell[] | undefined;
  let cell: MarkdownTableCell | undefined;

  for (const token of tokens) {
    switch (token.type) {
      case "blockquote_open":
        quoteDepth += 1;
        break;
      case "blockquote_close":
        quoteDepth = Math.max(0, quoteDepth - 1);
        break;
      case "bullet_list_open":
        lists.push(nextListState(lists, listSequence++, false, 1));
        break;
      case "ordered_list_open":
        lists.push(nextListState(lists, listSequence++, true, integerAttribute(token, "start", 1)));
        break;
      case "bullet_list_close":
      case "ordered_list_close":
        lists.pop();
        break;
      case "list_item_open": {
        const list = lists.at(-1) ?? nextListState(lists, listSequence++, false, 1);
        items.push({
          group: list.root,
          ordered: list.ordered,
          index: list.next++,
          depth: lists.length,
          emitted: false,
        });
        break;
      }
      case "list_item_close":
        items.pop();
        break;
      case "heading_open":
        headingLevel = Math.max(1, Math.min(6, Number.parseInt(token.tag.slice(1), 10) || 1));
        break;
      case "heading_close":
        headingLevel = undefined;
        break;
      case "tr_open":
        row = [];
        break;
      case "th_open":
      case "td_open":
        cell = {
          header: token.type === "th_open",
          align: tableAlignment(token),
          inlines: [],
        };
        break;
      case "th_close":
      case "td_close":
        if (row && cell) row.push(cell);
        cell = undefined;
        break;
      case "tr_close":
        if (row) {
          blocks.push({
            kind: "table-row",
            quoteDepth,
            header: row.some((entry) => entry.header),
            cells: row,
          });
        }
        row = undefined;
        break;
      case "inline": {
        const inlines = parseInlineTokens(token.children ?? []);
        if (cell) {
          cell.inlines = inlines;
          break;
        }
        const item = items.at(-1);
        if (headingLevel !== undefined) {
          blocks.push({ kind: "heading", level: headingLevel, quoteDepth, inlines });
        } else if (item && !item.emitted) {
          const task = taskListState(inlines);
          item.emitted = true;
          blocks.push({
            kind: "list-item",
            quoteDepth,
            listDepth: item.depth,
            listGroup: item.group,
            ordered: item.ordered,
            index: item.index,
            checked: task.checked,
            inlines: task.inlines,
          });
        } else {
          blocks.push({
            kind: "paragraph",
            quoteDepth,
            listDepth: item?.depth,
            listGroup: item?.group,
            inlines,
          });
        }
        break;
      }
      case "fence":
      case "code_block":
        blocks.push({
          kind: "code",
          quoteDepth,
          language: token.info.trim().split(/\s+/, 1)[0] || undefined,
          code: token.content.replace(/\n$/, ""),
        });
        break;
      case "hr":
        blocks.push({ kind: "rule", quoteDepth });
        break;
    }
  }

  return {
    source: normalizedSource,
    blocks,
    links: markdownLinks(blocks),
  };
}

/** Projects a parsed Markdown document into semantic, cell-width-bounded terminal rows. */
export function renderMarkdown(
  document: MarkdownDocument,
  options: MarkdownRenderOptions,
): MarkdownRenderLine[] {
  const width = Math.max(1, Math.floor(options.width));
  const lines: MarkdownRenderLine[] = [];

  for (let blockIndex = 0; blockIndex < document.blocks.length; blockIndex += 1) {
    const block = document.blocks[blockIndex]!;
    if (block.kind === "table-row") {
      const tableBlocks: MarkdownBlock[] = [];
      let tableIndex = blockIndex;
      while (document.blocks[tableIndex]?.kind === "table-row") {
        tableBlocks.push(document.blocks[tableIndex]!);
        tableIndex += 1;
      }
      renderTable(lines, tableBlocks, blockIndex, width, options);
      blockIndex = tableIndex - 1;
    } else {
      renderBlock(lines, block, blockIndex, width, options);
    }

    const next = document.blocks[blockIndex + 1];
    if (
      next &&
      !(block.kind === "list-item" && next.kind === "list-item" && block.listGroup === next.listGroup)
    ) {
      appendLine(lines, blockIndex, []);
    }
  }

  while (lines.at(-1)?.text === "") lines.pop();
  return lines;
}

/** Joins rendered Markdown rows into normalized plain terminal text. */
export function markdownRenderText(lines: readonly MarkdownRenderLine[]): string {
  return lines.map((line) => line.text).join("\n");
}

function markdownParser(options: MarkdownParseOptions): MarkdownItParser {
  const normalized = {
    linkify: options.linkify ?? true,
    typographer: options.typographer ?? false,
    breaks: options.breaks ?? false,
  };
  const key = JSON.stringify(normalized);
  let parser = parserCache.get(key);
  if (!parser) {
    parser = new MarkdownIt({ html: false, ...normalized });
    parserCache.set(key, parser);
  }
  return parser;
}

function parseInlineTokens(tokens: readonly Token[]): MarkdownInlineSpan[] {
  const spans: MarkdownInlineSpan[] = [];
  const marks: MarkdownInlineMark[] = [];
  const links: Array<{ href: string; title?: string }> = [];

  for (const token of tokens) {
    switch (token.type) {
      case "strong_open":
        marks.push("strong");
        break;
      case "strong_close":
        removeLast(marks, "strong");
        break;
      case "em_open":
        marks.push("emphasis");
        break;
      case "em_close":
        removeLast(marks, "emphasis");
        break;
      case "s_open":
        marks.push("strikethrough");
        break;
      case "s_close":
        removeLast(marks, "strikethrough");
        break;
      case "link_open":
        marks.push("link");
        links.push({ href: attributeText(token, "href") ?? "", title: attributeText(token, "title") });
        break;
      case "link_close":
        removeLast(marks, "link");
        links.pop();
        break;
      case "code_inline":
        appendInline(spans, token.content, [...marks, "code"], links.at(-1));
        break;
      case "image": {
        const href = attributeText(token, "src") ?? "";
        appendInline(spans, token.content || attributeText(token, "alt") || "image", [...marks, "image"], { href });
        break;
      }
      case "hardbreak":
        appendInline(spans, "\n", marks, links.at(-1));
        break;
      case "softbreak":
        appendInline(spans, " ", marks, links.at(-1));
        break;
      case "text":
      case "html_inline":
        appendInline(spans, token.content, marks, links.at(-1));
        break;
    }
  }
  return spans;
}

function appendInline(
  spans: MarkdownInlineSpan[],
  text: string,
  marks: readonly MarkdownInlineMark[],
  link?: { href: string; title?: string },
): void {
  if (!text) return;
  const previous = spans.at(-1);
  if (
    previous && previous.interaction === link && previous.href === link?.href && previous.title === link?.title &&
    equalMarks(previous.marks, marks)
  ) {
    spans[spans.length - 1] = { ...previous, text: previous.text + text };
    return;
  }
  spans.push({
    text,
    marks: [...new Set(marks)],
    href: link?.href || undefined,
    title: link?.title,
    interaction: link?.href ? link : undefined,
  });
}

function taskListState(inlines: readonly MarkdownInlineSpan[]): {
  checked?: boolean;
  inlines: readonly MarkdownInlineSpan[];
} {
  const first = inlines[0];
  const match = first?.text.match(/^\[([ xX])\]\s+/);
  if (!first || !match) return { inlines };
  const next = inlines.slice();
  const text = first.text.slice(match[0].length);
  if (text) next[0] = { ...first, text };
  else next.shift();
  return { checked: match[1]?.toLowerCase() === "x", inlines: next };
}

function markdownLinks(blocks: readonly MarkdownBlock[]): MarkdownDocument["links"] {
  const links: Array<{ text: string; href: string; title?: string }> = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const groups = block.cells?.map((cell) => cell.inlines) ?? [block.inlines ?? []];
    for (const spans of groups) {
      for (let index = 0; index < spans.length;) {
        const href = spans[index]?.href;
        if (!href) {
          index += 1;
          continue;
        }
        const title = spans[index]?.title;
        let text = "";
        while (index < spans.length && spans[index]?.href === href) text += spans[index++]!.text;
        const key = `${href}\0${text}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({ text, href, title });
        }
      }
    }
  }
  return links;
}

function renderBlock(
  lines: MarkdownRenderLine[],
  block: MarkdownBlock,
  blockIndex: number,
  width: number,
  options: MarkdownRenderOptions,
): void {
  const quote = quotePrefix(block.quoteDepth);
  if (block.kind === "rule") {
    const marker = fitText(options.rule ?? "─".repeat(width), Math.max(1, width - textWidth(quote)));
    appendLine(lines, blockIndex, [segment(quote, "quote"), segment(marker, "rule")]);
    return;
  }
  if (block.kind === "code") {
    if (options.diagram && block.language === "mermaid") {
      const frame = options.diagram(block.code ?? "", Math.max(1, width - textWidth(quote)));
      if (frame) {
        renderDiagram(lines, frame, blockIndex, width, quote);
        return;
      }
    }
    if (options.mermaid && block.language === "mermaid") {
      const graph = parseMermaid(block.code ?? "");
      const available = width - textWidth(quote);
      if (available >= 12) {
        const layout = layoutMermaid(graph, { maxColumns: Math.min(2000, available), style: options.mermaidStyle });
        if (options.mermaidStyle === "circuit") {
          for (const row of renderMermaidFrame(layout)) {
            const spans: MarkdownRenderSegment[] = [
              segment(quote, "quote"),
              segment(" ".repeat(Math.floor((available - layout.width) / 2)), "diagram-grid"),
            ];
            for (const cell of row) {
              const last = spans.at(-1);
              if (last?.role === cell.role) last.text += cell.char;
              else spans.push(segment(cell.char, cell.role));
            }
            appendLine(lines, blockIndex, spans);
          }
        } else {
          for (const row of renderMermaidCells(layout)) {
            appendLine(lines, blockIndex, [segment(quote, "quote"), segment(row, "code-fence")]);
          }
        }
      } else {
        // A tiny terminal cannot fit a node box: keep its labeled relationships readable.
        const text = graph.edges.length
          ? graph.edges.map((edge) => `${edge.from} → ${edge.to}${edge.label ? `: ${edge.label}` : ""}`).join("\n")
          : graph.nodes.map((node) => node.label).join("\n");
        wrapInlines(lines, blockIndex, [{ text, marks: [] }], width, quote, quote, "text");
      }
      return;
    }
    renderCode(lines, block, blockIndex, width, options);
    return;
  }

  const headingFont = block.kind === "heading" && options.headingFonts
    ? options.headingArt === "title" && (blockIndex !== 0 || block.level !== 1 || block.quoteDepth)
      ? "plain"
      : options.headingFonts[(block.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6]
    : undefined;
  if (headingFont && width > textWidth(quote)) {
    let art = renderAsciiHeading(
      inlinePlainText(block.inlines ?? [], false),
      headingFont,
      width - textWidth(quote),
    );
    const fontHeight = headingFont === "standard" ? 6 : headingFont === "small" ? 5 : headingFont === "micro" ? 3 : 1;
    if (options.wrapHeadingArt === false && art.length > fontHeight) {
      art = renderAsciiHeading(inlinePlainText(block.inlines ?? [], false), "plain", width - textWidth(quote));
    }
    for (const row of art) {
      appendLine(lines, blockIndex, [segment(quote, "quote"), segment(row, "heading")]);
    }
    return;
  }

  let marker = quote;
  let continuation = quote;
  let role: MarkdownRenderRole = "text";
  if (block.kind === "heading") {
    const headingMarker = `${"#".repeat(block.level ?? 1)} `;
    marker += headingMarker;
    continuation += " ".repeat(headingMarker.length);
    role = "heading";
  } else if (block.kind === "list-item") {
    const indent = "  ".repeat(Math.max(0, (block.listDepth ?? 1) - 1));
    const listMarker = block.checked !== undefined
      ? `[${block.checked ? "x" : " "}] `
      : block.ordered
      ? `${block.index ?? 1}. `
      : `${options.bullet ?? "•"} `;
    marker += indent + listMarker;
    continuation += " ".repeat(textWidth(indent + listMarker));
  } else if (block.listDepth) {
    const indent = "  ".repeat(block.listDepth);
    marker += indent;
    continuation += indent;
  }

  wrapInlines(
    lines,
    blockIndex,
    withLinkDestinations(block.inlines ?? [], options.showLinkDestinations ?? true),
    width,
    marker,
    continuation,
    role,
  );
}

function renderDiagram(
  lines: MarkdownRenderLine[],
  frame: MarkdownDiagramFrame,
  blockIndex: number,
  width: number,
  quote: string,
): void {
  const available = Math.max(0, width - textWidth(quote));
  if (!available) return;
  if (
    !Number.isSafeInteger(frame.columns) || frame.columns < 1 || frame.cells.length < 1 ||
    frame.columns * frame.cells.length > 1_000_000
  ) {
    throw new RangeError("Invalid prepared Markdown diagram dimensions.");
  }
  const offset = Math.max(0, Math.min(Math.floor(frame.offset ?? 0), Math.max(0, frame.columns - available)));
  if (!Number.isFinite(offset)) throw new RangeError("Invalid prepared Markdown diagram offset.");
  const margin = Math.max(0, Math.floor((available - frame.columns) / 2));
  const accessibility = frame.accessibility ? snapshotDiagramAccessibility(frame.accessibility) : undefined;
  const firstLine = lines.length;
  for (const row of frame.cells) {
    if (row.length !== frame.columns) throw new RangeError("Prepared Markdown diagram has an inconsistent row width.");
    const spans: MarkdownRenderSegment[] = [segment(quote, "quote"), segment(" ".repeat(margin), "diagram-grid")];
    for (let column = offset; column < Math.min(frame.columns, offset + available); column++) {
      const cell = row[column]!;
      const cellWidth = textWidth(cell.char);
      // deno-lint-ignore no-control-regex -- prepared cells cannot contain terminal escape payloads
      if (/[\x00-\x1f\x7f-\x9f]/.test(cell.char) || cellWidth > 2) {
        throw new TypeError("Prepared diagram cells must contain display glyphs, not terminal control sequences.");
      }
      if (!cell.char && column !== offset) continue;
      const clipped = !cell.char || column - offset + cellWidth > available;
      const char = clipped ? " " : cell.char;
      spans.push({
        text: char,
        role: "diagram-label",
        marks: !clipped && cell.href ? ["link"] : [],
        href: clipped ? undefined : cell.href,
        interaction: clipped ? undefined : cell.interaction,
        style: cell.style,
      });
    }
    appendLine(lines, blockIndex, spans);
  }
  if (frame.columns > available) {
    appendLine(lines, blockIndex, [
      segment(quote, "quote"),
      segment(
        fitText(
          `[diagram ${offset + 1}–${Math.min(offset + available, frame.columns)}/${frame.columns} columns]`,
          available,
        ),
        "marker",
      ),
    ]);
  }
  if (accessibility) {
    for (let index = firstLine; index < lines.length; index++) lines[index]!.accessibility = accessibility;
  }
}

function renderCode(
  lines: MarkdownRenderLine[],
  block: MarkdownBlock,
  blockIndex: number,
  width: number,
  options: MarkdownRenderOptions,
): void {
  const quote = quotePrefix(block.quoteDepth);
  const fence = `\`\`\`${block.language ?? ""}`;
  appendLine(lines, blockIndex, [
    segment(quote, "quote"),
    segment(fitText(fence, width - textWidth(quote)), "code-fence"),
  ]);
  const codeLines = (block.code ?? "").split("\n");
  const digits = options.codeLineNumbers ? String(Math.max(1, codeLines.length)).length : 0;
  for (let index = 0; index < codeLines.length; index += 1) {
    const lineNumber = options.codeLineNumbers ? `${String(index + 1).padStart(digits, " ")} ` : "";
    const prefix = `${quote}│ ${lineNumber}`;
    appendLine(lines, blockIndex, [
      segment(prefix, "marker"),
      segment(fitText(codeLines[index]!.replaceAll("\t", "  "), width - textWidth(prefix)), "code"),
    ]);
  }
  appendLine(lines, blockIndex, [
    segment(quote, "quote"),
    segment(fitText("```", width - textWidth(quote)), "code-fence"),
  ]);
}

function renderTable(
  lines: MarkdownRenderLine[],
  blocks: readonly MarkdownBlock[],
  blockIndex: number,
  width: number,
  options: MarkdownRenderOptions,
): void {
  const columns = Math.max(0, ...blocks.map((block) => block.cells?.length ?? 0));
  if (columns === 0) return;
  if (options.tableCells === "wrap") {
    renderWrappedTable(lines, blocks, blockIndex, width, columns, options);
    return;
  }
  const quote = quotePrefix(blocks[0]?.quoteDepth);
  const tableWidth = Math.max(1, width - textWidth(quote));
  if (tableWidth < columns * 4 + 1) {
    for (const block of blocks) {
      for (let index = 0; index < (block.cells?.length ?? 0); index += 1) {
        const label = `${quote}[${index + 1}] `;
        const value = inlinePlainText(block.cells![index]!.inlines, options.showLinkDestinations ?? true);
        appendLine(lines, blockIndex, [
          segment(label, "marker"),
          segment(fitText(value, width - textWidth(label)), block.header ? "table-header" : "text"),
        ]);
      }
    }
    return;
  }

  const natural = new Array<number>(columns).fill(1);
  for (const block of blocks) {
    for (let index = 0; index < columns; index += 1) {
      natural[index] = Math.max(
        natural[index]!,
        textWidth(inlinePlainText(block.cells?.[index]?.inlines ?? [], options.showLinkDestinations ?? true)),
      );
    }
  }
  const widths = fitTableWidths(natural, tableWidth - (columns * 3 + 1));
  let wroteHeaderRule = false;
  for (const block of blocks) {
    const segments: MarkdownRenderSegment[] = [segment(quote, "quote"), segment("|", "table-border")];
    for (let index = 0; index < columns; index += 1) {
      const cell = block.cells?.[index];
      const value = fitCell(
        inlinePlainText(cell?.inlines ?? [], options.showLinkDestinations ?? true),
        widths[index]!,
        cell?.align,
      );
      segments.push(segment(" ", "table-border"));
      segments.push(segment(value, block.header ? "table-header" : "text"));
      segments.push(segment(" |", "table-border"));
    }
    appendLine(lines, blockIndex, segments);
    if (block.header && !wroteHeaderRule) {
      const ruleSegments: MarkdownRenderSegment[] = [segment(quote, "quote"), segment("|", "table-border")];
      for (const cellWidth of widths) ruleSegments.push(segment(`${"-".repeat(cellWidth + 2)}|`, "table-border"));
      appendLine(lines, blockIndex, ruleSegments);
      wroteHeaderRule = true;
    }
  }
}

/** Complete-cell table: a wrapped grid while every column stays readable, labelled records below that. */
function renderWrappedTable(
  lines: MarkdownRenderLine[],
  blocks: readonly MarkdownBlock[],
  blockIndex: number,
  width: number,
  columns: number,
  options: MarkdownRenderOptions,
): void {
  const quote = quotePrefix(blocks[0]?.quoteDepth);
  const tableWidth = Math.max(1, width - textWidth(quote));
  const linkDestinations = options.showLinkDestinations ?? true;
  const inlines = (block: MarkdownBlock, index: number) =>
    withLinkDestinations(block.cells?.[index]?.inlines ?? [], linkDestinations);
  const natural = new Array<number>(columns).fill(1);
  const longest = new Array<number>(columns).fill(1);
  for (const block of blocks) {
    for (let index = 0; index < columns; index += 1) {
      const text = inlines(block, index).map((inline) => inline.text).join("");
      for (const row of text.split("\n")) natural[index] = Math.max(natural[index]!, textWidth(row.trim()));
      for (const word of text.split(/\s+/u)) longest[index] = Math.max(longest[index]!, textWidth(word));
    }
  }
  const widths = wrapTableWidths(natural, longest, tableWidth - (columns * 3 + 1));
  if (!widths) {
    renderTableRecords(lines, blocks, blockIndex, width, columns, quote, inlines);
    return;
  }
  const wrapCell = (block: MarkdownBlock, index: number): MarkdownRenderSegment[][] => {
    const cell: MarkdownRenderLine[] = [];
    wrapInlines(
      cell,
      blockIndex,
      inlines(block, index),
      widths[index]!,
      "",
      "",
      block.header ? "table-header" : "text",
    );
    return cell.map((line) => [...line.segments]);
  };
  const rows = blocks.map((block) => widths.map((_, index) => wrapCell(block, index)));
  const rule = (): void => {
    const segments: MarkdownRenderSegment[] = [segment(quote, "quote"), segment("|", "table-border")];
    for (const cellWidth of widths) segments.push(segment(`${"-".repeat(cellWidth + 2)}|`, "table-border"));
    appendLine(lines, blockIndex, segments);
  };
  // Rules between body rows keep multi-row records apart; a table of single rows stays compact.
  const separated = rows.some((row, index) => !blocks[index]!.header && row.some((cell) => cell.length > 1));
  let wroteHeaderRule = false;
  rows.forEach((row, rowIndex) => {
    const block = blocks[rowIndex]!;
    const height = Math.max(1, ...row.map((cell) => cell.length));
    for (let line = 0; line < height; line += 1) {
      const segments: MarkdownRenderSegment[] = [segment(quote, "quote"), segment("|", "table-border")];
      row.forEach((cell, index) => {
        const content = cell[line] ?? [];
        const padding = Math.max(0, widths[index]! - content.reduce((sum, part) => sum + textWidth(part.text), 0));
        const align = block.cells?.[index]?.align;
        const left = align === "right" ? padding : align === "center" ? Math.floor(padding / 2) : 0;
        segments.push(segment(" " + " ".repeat(left), "table-border"), ...content);
        segments.push(segment(" ".repeat(padding - left) + " |", "table-border"));
      });
      appendLine(lines, blockIndex, segments);
    }
    if (block.header && !wroteHeaderRule) {
      rule();
      wroteHeaderRule = true;
    } else if (separated && rowIndex < rows.length - 1) rule();
  });
}

/**
 * Column widths for a wrapped table, or undefined when a readable grid does not fit. Every column first gets
 * room for its longest word (capped), then spare cells go to the narrowest columns still short of their content.
 */
function wrapTableWidths(
  natural: readonly number[],
  longest: readonly number[],
  available: number,
): number[] | undefined {
  const widths = natural.map((value, index) => Math.min(value, Math.max(1, Math.min(longest[index]!, 24))));
  let spare = Math.floor(available) - widths.reduce((sum, value) => sum + value, 0);
  if (spare < 0) return undefined;
  while (spare > 0) {
    const open = widths.map((_, index) => index).filter((index) => widths[index]! < natural[index]!);
    if (!open.length) break;
    const lowest = Math.min(...open.map((index) => widths[index]!));
    for (const index of open) {
      if (spare > 0 && widths[index] === lowest) {
        widths[index]! += 1;
        spare -= 1;
      }
    }
  }
  // A column squeezed below eight cells while it still wraps is no longer a readable grid.
  return widths.some((value, index) => value < Math.min(natural[index]!, 8)) ? undefined : widths;
}

/** Narrow fallback: each body row is a record titled by its first cell, with later cells under their headers. */
function renderTableRecords(
  lines: MarkdownRenderLine[],
  blocks: readonly MarkdownBlock[],
  blockIndex: number,
  width: number,
  columns: number,
  quote: string,
  inlines: (block: MarkdownBlock, index: number) => MarkdownInlineSpan[],
): void {
  const header = blocks.find((block) => block.header);
  const body = blocks.filter((block) => block !== header);
  const records = body.length ? body : blocks;
  records.forEach((block, record) => {
    if (record > 0) appendLine(lines, blockIndex, [segment(quote, "quote")]);
    for (let index = 0; index < columns; index += 1) {
      const content = inlines(block, index);
      if (!content.some((inline) => inline.text.trim())) continue;
      if (index === 0) {
        wrapInlines(lines, blockIndex, content, width, quote, quote, "table-header");
        continue;
      }
      const label = header && block !== header
        ? inlines(header, index).map((inline) => inline.text).join("").trim()
        : "";
      const labelled: MarkdownInlineSpan[] = label
        ? [{ text: `${label}: `, marks: ["emphasis"] }, ...content]
        : content;
      wrapInlines(lines, blockIndex, labelled, width, `${quote}  `, `${quote}  `, "text");
    }
  });
}

function wrapInlines(
  lines: MarkdownRenderLine[],
  blockIndex: number,
  inlines: readonly MarkdownInlineSpan[],
  width: number,
  firstPrefix: string,
  continuationPrefix: string,
  role: MarkdownRenderRole,
): void {
  const tokens = inlineWrapTokens(inlines);
  firstPrefix = fitText(firstPrefix, Math.max(0, width - 1));
  continuationPrefix = fitText(continuationPrefix, Math.max(0, width - 1));
  let segments = prefixSegments(firstPrefix);
  let used = textWidth(firstPrefix);
  let content = false;
  let pendingSpace = false;

  const flush = () => {
    appendLine(lines, blockIndex, segments);
    segments = prefixSegments(continuationPrefix);
    used = textWidth(continuationPrefix);
    content = false;
    pendingSpace = false;
  };

  for (const token of tokens) {
    if (token.kind === "break") {
      flush();
      continue;
    }
    if (token.kind === "space") {
      if (content) pendingSpace = true;
      continue;
    }
    const wordWidth = token.parts.reduce((total, part) => total + textWidth(part.text), 0);
    const spaceWidth = pendingSpace && content ? 1 : 0;
    if (content && used + spaceWidth + wordWidth > width) flush();
    if (pendingSpace && content && used < width) {
      appendSegment(segments, segment(" ", role));
      used += 1;
    }
    pendingSpace = false;

    for (const part of token.parts) {
      for (const char of getMultiCodePointCharacters(part.text)) {
        const charWidth = textWidth(char);
        if (content && used + charWidth > width) flush();
        if (used + charWidth > width) continue;
        appendSegment(segments, { ...part, text: char, role });
        used += charWidth;
        content = true;
      }
    }
  }
  if (content || segments.length > 0) appendLine(lines, blockIndex, segments);
}

function inlineWrapTokens(inlines: readonly MarkdownInlineSpan[]): Array<{
  kind: "word" | "space" | "break";
  parts: MarkdownInlineSpan[];
}> {
  const tokens: Array<{ kind: "word" | "space" | "break"; parts: MarkdownInlineSpan[] }> = [];
  for (const inline of inlines) {
    for (const match of inline.text.matchAll(/\n|[^\S\n]+|[^\s]+/gu)) {
      const text = match[0];
      const kind = text === "\n" ? "break" : /^\s+$/u.test(text) ? "space" : "word";
      const part = { ...inline, text };
      const previous = tokens.at(-1);
      if (kind === "word" && previous?.kind === "word") previous.parts.push(part);
      else tokens.push({ kind, parts: [part] });
    }
  }
  return tokens;
}

function withLinkDestinations(
  inlines: readonly MarkdownInlineSpan[],
  enabled: boolean,
): MarkdownInlineSpan[] {
  if (!enabled) return inlines.slice();
  const output: MarkdownInlineSpan[] = [];
  for (let index = 0; index < inlines.length;) {
    const href = inlines[index]?.href;
    if (!href) {
      output.push(inlines[index++]!);
      continue;
    }
    let label = "";
    const interaction = inlines[index]?.interaction;
    while (index < inlines.length && inlines[index]?.href === href && inlines[index]?.interaction === interaction) {
      const inline = inlines[index++]!;
      label += inline.text;
      output.push(inline);
    }
    if (label !== href) output.push({ text: ` <${href}>`, marks: ["link"], href, interaction });
  }
  return output;
}

function inlinePlainText(inlines: readonly MarkdownInlineSpan[], linkDestinations: boolean): string {
  return withLinkDestinations(inlines, linkDestinations).map((inline) => inline.text).join("");
}

function prefixSegments(prefix: string): MarkdownRenderSegment[] {
  if (!prefix) return [];
  return [segment(prefix, prefix.includes(">") ? "quote" : "marker")];
}

function segment(
  text: string,
  role: MarkdownRenderRole,
  marks: readonly MarkdownInlineMark[] = emptyMarks,
): MarkdownRenderSegment {
  return { text, role, marks };
}

function appendSegment(segments: MarkdownRenderSegment[], next: MarkdownRenderSegment): void {
  if (!next.text) return;
  const previous = segments.at(-1);
  if (
    previous && previous.role === next.role && previous.href === next.href && previous.title === next.title &&
    previous.interaction === next.interaction && previous.style === next.style &&
    equalMarks(previous.marks, next.marks)
  ) {
    segments[segments.length - 1] = { ...previous, text: previous.text + next.text };
  } else {
    segments.push(next);
  }
}

function appendLine(lines: MarkdownRenderLine[], blockIndex: number, segments: readonly MarkdownRenderSegment[]): void {
  lines.push({ blockIndex, segments, text: segments.map((entry) => entry.text).join("") });
}

function quotePrefix(depth = 0): string {
  return "> ".repeat(Math.max(0, Math.floor(depth)));
}

function fitText(value: string, width: number): string {
  const safeWidth = Math.max(0, Math.floor(width));
  if (textWidth(value) <= safeWidth) return value;
  if (safeWidth <= 0) return "";
  if (safeWidth === 1) return "…";
  return `${cropToWidth(value, safeWidth - 1)}…`;
}

function fitCell(value: string, width: number, align: MarkdownTableCell["align"]): string {
  const fitted = fitText(value, width);
  const padding = Math.max(0, width - textWidth(fitted));
  if (align === "right") return " ".repeat(padding) + fitted;
  if (align === "center") {
    const left = Math.floor(padding / 2);
    return " ".repeat(left) + fitted + " ".repeat(padding - left);
  }
  return fitted + " ".repeat(padding);
}

function fitTableWidths(natural: readonly number[], availableWidth: number): number[] {
  const available = Math.max(natural.length, Math.floor(availableWidth));
  const normalized = natural.map((value) => Math.max(1, Math.floor(value)));
  if (normalized.reduce((sum, value) => sum + value, 0) <= available) return normalized;

  let low = 1;
  let high = Math.max(...normalized);
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    const total = normalized.reduce((sum, value) => sum + Math.min(value, candidate), 0);
    if (total <= available) low = candidate;
    else high = candidate - 1;
  }

  const widths = normalized.map((value) => Math.min(value, low));
  let remaining = available - widths.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < widths.length && remaining > 0; index += 1) {
    if (widths[index]! >= normalized[index]!) continue;
    widths[index]! += 1;
    remaining -= 1;
  }
  return widths;
}

/** markdown-it 15 types attribute values as `string | number`; render as text. */
function attributeText(token: Token, name: string): string | undefined {
  const value = token.attrGet(name);
  return value == null ? undefined : String(value);
}

function tableAlignment(token: Token): MarkdownTableCell["align"] {
  const style = attributeText(token, "style") ?? "";
  if (style.includes("center")) return "center";
  if (style.includes("right")) return "right";
  if (style.includes("left")) return "left";
  return undefined;
}

function integerAttribute(token: Token, name: string, fallback: number): number {
  const value = Number.parseInt(attributeText(token, name) ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function nextListState(
  lists: readonly ListState[],
  id: number,
  ordered: boolean,
  next: number,
): ListState {
  return { root: lists[0]?.root ?? id, ordered, next };
}

function removeLast<T>(values: T[], value: T): void {
  const index = values.lastIndexOf(value);
  if (index >= 0) values.splice(index, 1);
}

function equalMarks(left: readonly MarkdownInlineMark[], right: readonly MarkdownInlineMark[]): boolean {
  return left.length === right.length && left.every((mark, index) => mark === right[index]);
}
