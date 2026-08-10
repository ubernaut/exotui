// Copyright 2023 Im-Beast. MIT license.
// markdown-it 15 exports the callable constructor as the default value and the
// instance type as a named type export, so the two are imported separately.
import MarkdownIt, { type MarkdownIt as MarkdownItParser, type Token } from "markdown-it";
import { cropToWidth, getMultiCodePointCharacters, textWidth } from "../utils/strings.ts";

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
  | "table-header";

/** One renderable terminal segment retaining Markdown semantics. */
export interface MarkdownRenderSegment extends MarkdownInlineSpan {
  role: MarkdownRenderRole;
}

/** One cell-width-bounded terminal row projected from a Markdown block. */
export interface MarkdownRenderLine {
  blockIndex: number;
  text: string;
  segments: readonly MarkdownRenderSegment[];
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
  if (previous && previous.href === link?.href && previous.title === link?.title && equalMarks(previous.marks, marks)) {
    spans[spans.length - 1] = { ...previous, text: previous.text + text };
    return;
  }
  spans.push({ text, marks: [...new Set(marks)], href: link?.href || undefined, title: link?.title });
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
    renderCode(lines, block, blockIndex, width, options);
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
    while (index < inlines.length && inlines[index]?.href === href) {
      const inline = inlines[index++]!;
      label += inline.text;
      output.push(inline);
    }
    if (label !== href) output.push({ text: ` <${href}>`, marks: ["link"], href });
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
