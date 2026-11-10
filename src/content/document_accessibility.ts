// Copyright 2023 Im-Beast. MIT license.
import type { AccessibilityNode, AccessibilityRole } from "../app/accessibility_tree.ts";
import type { MarkdownDiagramAccessibility, MarkdownRenderLine } from "./markdown.ts";
import { type DiagramSemanticNode, snapshotDiagramSemanticContent } from "./document_semantics.ts";

/** A semantic diagram in document reading order, with full-document row coordinates. */
export interface DocumentAccessibilityTarget {
  readonly key: string;
  readonly blockIndex: number;
  readonly scope?: string;
  readonly row: number;
  readonly height: number;
  readonly node: AccessibilityNode;
  readonly content?: readonly DiagramSemanticNode[];
}

/** Validate and snapshot declarative metadata; terminal control payloads never reach announcements. */
export function snapshotDiagramAccessibility(value: MarkdownDiagramAccessibility): MarkdownDiagramAccessibility {
  const result: { -readonly [K in keyof MarkdownDiagramAccessibility]: MarkdownDiagramAccessibility[K] } = {};
  for (
    const [field, limit] of [["title", 4096], ["description", 32768], ["role", 256], ["roleDescription", 512]] as const
  ) {
    const text = value[field];
    if (text === undefined) continue;
    if (typeof text !== "string") throw new TypeError("Diagram accessibility metadata must be plain text.");
    if (text.length > limit) throw new RangeError("Diagram accessibility metadata exceeds its text budget.");
    // deno-lint-ignore no-control-regex -- only ordinary line breaks/tabs belong in descriptions
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) {
      throw new TypeError("Diagram accessibility metadata cannot contain terminal controls.");
    }
    result[field] = text;
  }
  if (value.hidden !== undefined) {
    if (typeof value.hidden !== "boolean") throw new TypeError("Diagram accessibility hidden state must be boolean.");
    result.hidden = value.hidden;
  }
  if (value.content !== undefined) result.content = snapshotDiagramSemanticContent(value.content);
  return Object.freeze(result);
}

/** Project only supported graphics roles, retaining the upstream fallback-token order. */
export function diagramAccessibilityNode(value: MarkdownDiagramAccessibility): AccessibilityNode {
  const metadata = snapshotDiagramAccessibility(value);
  const roles = (metadata.role ?? "graphics-document document").trim().split(/\s+/).filter((
    role,
  ): role is AccessibilityRole =>
    ["graphics-document", "graphics-object", "graphics-symbol", "document", "img", "group", "none", "presentation"]
      .includes(role)
  );
  if (roles[0] === "none" || roles[0] === "presentation") {
    // Do not turn direct SVG title/description text into new global ARIA
    // properties that would override the source's presentational root.
    return Object.freeze({ role: roles[0] });
  }
  return Object.freeze({
    role: roles[0] ?? "graphics-document",
    ...(roles.length > 1 ? { fallbackRoles: Object.freeze(roles.slice(1)) } : {}),
    ...(metadata.title !== undefined ? { label: metadata.title } : {}),
    ...(metadata.description !== undefined ? { description: metadata.description } : {}),
    ...(metadata.roleDescription !== undefined ? { roleDescription: metadata.roleDescription } : {}),
  });
}

/** Group rendered diagram rows, so a partially scrolled diagram retains a single semantic identity. */
export function documentAccessibilityTargets(
  lines: readonly MarkdownRenderLine[],
): readonly DocumentAccessibilityTarget[] {
  const targets = new Map<number, DocumentAccessibilityTarget>();
  for (const [row, line] of lines.entries()) {
    if (!line.accessibility || line.accessibility.hidden) continue;
    const previous = targets.get(line.blockIndex);
    if (previous) {
      targets.set(line.blockIndex, { ...previous, height: row - previous.row + 1 });
    } else {
      if (targets.size >= 4096) throw new RangeError("Document accessibility target count exceeds its budget.");
      targets.set(line.blockIndex, {
        key: JSON.stringify(["diagram", line.blockIndex]),
        blockIndex: line.blockIndex,
        row,
        height: 1,
        node: diagramAccessibilityNode(line.accessibility),
        ...(line.accessibility.content !== undefined ? { content: line.accessibility.content } : {}),
      });
    }
  }
  return [...targets.values()];
}
