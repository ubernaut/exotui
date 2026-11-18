import { GLYPH_TEXT_FONTS, type GlyphTextLayout, renderGlyphText } from "../../src/content/ascii_fonts.ts";
import { writeText } from "../../src/viz/mod.ts";
import type { DesktopDemo } from "./desktop_app.ts";

/** A portable FIGlet workbench: editable text, bundled fonts, layout and clipboard output. */
export function fontGeneratorDemo(copy: (text: string) => void | boolean | Promise<boolean>): DesktopDemo {
  let text = "Hello";
  let caret = text.length;
  let all = false;
  let fontIndex = 1; // Small, as on the linked TAAG example.
  let layoutIndex = 0;
  let scroll = 0;
  let status = "Small is the default. Graffiti is also available.";
  let output = "";
  let spans: { from: number; to: number; row: number; action: () => void }[] = [];
  const layouts: { label: string; id: GlyphTextLayout }[] = [
    { label: "Font default", id: "font" },
    { label: "Fitted", id: "fit" },
    { label: "Full", id: "full" },
  ];
  const rows = () => renderGlyphText(GLYPH_TEXT_FONTS[fontIndex]!, text, layouts[layoutIndex]!.id);
  const copyOutput = () => {
    output = rows().join("\n");
    if (!output.trim()) return;
    Promise.resolve(copy(output)).then((ok) => {
      status = ok === false ? "Copy was blocked by the host." : "ASCII output copied.";
    }).catch(() => status = "Copy was blocked by the host.");
  };
  return {
    id: "font-generator",
    title: "ASCII font generator",
    summary: "Small / Graffiti / Standard · editable FIGlet text and layout.",
    window: { width: 90, height: 23, minWidth: 26, minHeight: 12, widthRatio: .8 },
    render(width, height, _now, theme) {
      const frame = Array.from(
        { length: height },
        () => Array.from({ length: width }, () => ({ char: " ", foreground: theme?.text, background: theme?.surface })),
      );
      const ink = { foreground: theme?.text, background: theme?.surface };
      const accent = { ...ink, foreground: theme?.accent };
      const fieldWidth = Math.max(1, width - 8);
      const left = Math.max(0, caret - fieldWidth + 1);
      writeText(frame, 1, 0, "Text: " + text.slice(left, left + fieldWidth), ink);
      if (frame[0]?.[7 + caret - left]) frame[0]![7 + caret - left] = { char: "▏", ...accent };
      if (all) {
        for (let x = 7; x < width - 1; x++) {
          const cell = frame[0]![x]!;
          frame[0]![x] = { ...cell, foreground: theme?.surface, background: theme?.accent };
        }
      }
      writeText(frame, 1, 1, "Type to edit · Ctrl+A replace · Ctrl+C copy output", {
        ...ink,
        foreground: theme?.muted,
      });
      spans = [];
      let row = 3, column = 1;
      const button = (label: string, selected: boolean, action: () => void) => {
        const value = `[${selected ? "● " : ""}${label}]`;
        if (column + value.length >= width && column > 1) {
          row++;
          column = 1;
        }
        writeText(frame, column, row, value, selected ? accent : ink);
        spans.push({ from: column, to: Math.min(width, column + value.length), row, action });
        column += value.length + 1;
      };
      GLYPH_TEXT_FONTS.forEach((font, index) =>
        button(font.label, index === fontIndex, () => {
          fontIndex = index;
          scroll = 0;
        })
      );
      row += 2;
      column = 1;
      layouts.forEach((layout, index) =>
        button(layout.label, index === layoutIndex, () => {
          layoutIndex = index;
          scroll = 0;
        })
      );
      row += 2;
      column = 1;
      button("Copy ASCII", false, copyOutput);
      row += 2;
      const preview = rows();
      output = preview.join("\n");
      const maxWidth = preview[0]?.length ?? 0;
      scroll = Math.max(0, Math.min(scroll, Math.max(0, maxWidth - width + 2)));
      for (let y = 0; y < preview.length && row + y < height - 2; y++) {
        writeText(frame, 1, row + y, preview[y]!.slice(scroll, scroll + Math.max(1, width - 2)), accent);
      }
      writeText(
        frame,
        1,
        height - 2,
        maxWidth > width - 2 ? "Preview wider than window · Alt+←/→ pans · copy keeps all columns" : status,
        { ...ink, foreground: theme?.muted },
      );
      writeText(
        frame,
        1,
        height - 1,
        `${GLYPH_TEXT_FONTS[fontIndex]!.label} · ${maxWidth} columns · ${preview.length} rows`,
        ink,
      );
      return frame;
    },
    onPointerDown(column, row) {
      const hit = spans.find((span) => span.row === row && column >= span.from && column < span.to);
      if (hit) hit.action();
      else if (row === 0) {
        caret = text.length;
        all = false;
      }
    },
    onKey(event) {
      if (event.meta && (event.key === "left" || event.key === "right")) {
        scroll = Math.max(0, scroll + (event.key === "left" ? -4 : 4));
        return true;
      }
      if (event.ctrl || event.meta) {
        if (event.key === "a") {
          all = true;
          return true;
        }
        if (event.key === "c") {
          copyOutput();
          return true;
        }
        return false;
      }
      if (event.key === "tab" || event.key === "escape") return false;
      if (event.key === "left") caret = Math.max(0, caret - 1);
      else if (event.key === "right") caret = Math.min(text.length, caret + 1);
      else if (event.key === "home") caret = 0;
      else if (event.key === "end") caret = text.length;
      else if (event.key === "backspace" || event.key === "delete") {
        if (all) {
          text = "";
          caret = 0;
        } else if (event.key === "backspace" && caret > 0) {
          text = text.slice(0, caret - 1) + text.slice(caret);
          caret--;
        } else if (event.key === "delete") text = text.slice(0, caret) + text.slice(caret + 1);
      } else {
        const input = new TextDecoder().decode(event.buffer);
        if (!input || !/^[\x20-\x7e]+$/.test(input)) return false;
        if (text.length - (all ? text.length : 0) + input.length > 512) {
          status = "Text is limited to 512 characters.";
          return true;
        }
        if (all) {
          text = "";
          caret = 0;
        }
        text = text.slice(0, caret) + input + text.slice(caret);
        caret += input.length;
      }
      all = false;
      return true;
    },
  };
}
