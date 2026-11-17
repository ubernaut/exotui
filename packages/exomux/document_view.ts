// Copyright 2026 ubernaut. MIT license.

import type { MarkdownRenderSegment } from "@ubernaut/exotui/app";
import type { ExomuxThemeSpec } from "./model.ts";

/** Maps the shared Markdown layout's semantic spans to desktop cell colours. */
export function exomuxDocumentSegmentStyle(segment: MarkdownRenderSegment, theme: ExomuxThemeSpec) {
  const { role, marks } = segment;
  const code = role === "code" || marks.includes("code");
  const accent = role === "heading" || marks.includes("link") || marks.includes("image");
  const muted = role === "quote" || role === "marker" || role === "code-fence" || role === "link-destination" ||
    role === "table-border" || role === "rule";
  return {
    foreground: code
      ? theme.text
      : accent
      ? theme.accent
      : muted
      ? theme.muted
      : marks.includes("emphasis")
      ? theme.warning
      : theme.text,
    background: code ? theme.surfaceStrong : undefined,
    bold: role === "heading" || role === "table-header" || marks.includes("strong"),
  };
}
