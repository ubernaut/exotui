// Copyright 2023 Im-Beast. MIT license.

// GlyphForge terminal studio (vertical slice): a mouse-and-keyboard cell
// editor over the renderer-neutral controller — canvas with differential
// styled-cell painting, tool row, palette bar, layer and frame readouts,
// and atomic stroke undo. Dockable multi-document windows, codecs, and
// the glyph browser (GLYPH-002/008/012) arrive in later slices.

import { crayon } from "crayon";
import { Computed, createTerminalApp, Frame, StatusBar, type TerminalApp, Text } from "../../../mod.app.ts";
import { KeyHelp, KeymapRegistry, type TextRectangle } from "../../../mod.ts";
import { type GlyphCell, glyphHexToRgb, type GlyphTool } from "./model.ts";
import type { GlyphForgeController } from "./controller.ts";
import { renderGlyphText } from "./text_font.ts";

/** Actions dispatched by the GlyphForge keymap. */
export type GlyphForgeAction =
  | { type: "tool"; tool: GlyphTool }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "fg"; direction: 1 | -1 }
  | { type: "bg"; direction: 1 | -1 }
  | { type: "layer.cycle" }
  | { type: "layer.visible" }
  | { type: "layer.lock" }
  | { type: "frame.cycle" }
  | { type: "frame.duplicate" }
  | { type: "font.cycle"; direction: 1 | -1 }
  | { type: "font.browse" }
  | { type: "app.quit" };

/** The mounted runtime returned to the launcher. */
export interface GlyphForgeRuntime {
  readonly app: TerminalApp<GlyphForgeAction>;
  start(): void;
  destroy(): Promise<void>;
}

const CANVAS_LEFT = 2;
const CANVAS_TOP = 4;
const SIDE_WIDTH = 30;

/** Creates and mounts the GlyphForge terminal studio. */
export function createGlyphForgeTerminalApp(options: {
  readonly controller: GlyphForgeController;
}): GlyphForgeRuntime {
  const controller = options.controller;
  let persistTimer: ReturnType<typeof setInterval> | undefined;
  let browserOpeningKey = false;

  const app = createTerminalApp<GlyphForgeAction>({
    id: "glyph-forge",
    label: "GlyphForge",
    tuiOptions: { style: crayon.bgBlack, refreshRate: 1000 / 30 },
    commands: [
      { id: "tool.pencil", label: "Pencil", binding: { key: "p" }, action: { type: "tool", tool: "pencil" } },
      { id: "tool.eraser", label: "Eraser", binding: { key: "e" }, action: { type: "tool", tool: "eraser" } },
      { id: "tool.fill", label: "Fill", binding: { key: "f" }, action: { type: "tool", tool: "fill" } },
      { id: "tool.line", label: "Line", binding: { key: "l" }, action: { type: "tool", tool: "line" } },
      { id: "tool.rect", label: "Rect", binding: { key: "r" }, action: { type: "tool", tool: "rect" } },
      {
        id: "tool.eyedropper",
        label: "Eyedropper",
        binding: { key: "i" },
        action: { type: "tool", tool: "eyedropper" },
      },
      { id: "tool.text", label: "Text", binding: { key: "t" }, action: { type: "tool", tool: "text" } },
      { id: "font.next", label: "Next font", binding: { key: "g" }, action: { type: "font.cycle", direction: 1 } },
      {
        id: "font.previous",
        label: "Previous font",
        binding: { key: "G" },
        action: { type: "font.cycle", direction: -1 },
      },
      { id: "font.browse", label: "Font browser", binding: { key: "b" }, action: { type: "font.browse" } },
      { id: "history.undo", label: "Undo", binding: { key: "u" }, action: { type: "undo" } },
      { id: "history.redo", label: "Redo", binding: { key: "y" }, action: { type: "redo" } },
      { id: "color.fgNext", label: "Next color", binding: { key: "]" }, action: { type: "fg", direction: 1 } },
      {
        id: "color.fgPrevious",
        label: "Previous color",
        binding: { key: "[" },
        action: { type: "fg", direction: -1 },
      },
      { id: "color.bgNext", label: "Next background", binding: { key: "}" }, action: { type: "bg", direction: 1 } },
      {
        id: "color.bgPrevious",
        label: "Previous background",
        binding: { key: "{" },
        action: { type: "bg", direction: -1 },
      },
      { id: "layer.cycle", label: "Next layer", binding: { key: "tab" }, action: { type: "layer.cycle" } },
      { id: "layer.visible", label: "Layer visibility", binding: { key: "v" }, action: { type: "layer.visible" } },
      { id: "layer.lock", label: "Layer lock", binding: { key: "k" }, action: { type: "layer.lock" } },
      { id: "frame.cycle", label: "Next frame", binding: { key: "n" }, action: { type: "frame.cycle" } },
      {
        id: "frame.duplicate",
        label: "Duplicate frame",
        binding: { key: "d" },
        action: { type: "frame.duplicate" },
      },
      { id: "app.quit", label: "Quit", binding: { key: "q" }, action: { type: "app.quit" } },
    ],
    onAction(action) {
      // While the text tool is typing or the font browser is open, every
      // key belongs to that mode: no bindings fire.
      if (controller.textEntry() || controller.fontBrowser()) return;
      switch (action.type) {
        case "tool":
          controller.setTool(action.tool);
          break;
        case "undo":
          controller.undo();
          break;
        case "redo":
          controller.redo();
          break;
        case "fg":
          controller.cycleForeground(action.direction);
          break;
        case "bg":
          controller.cycleBackground(action.direction);
          break;
        case "layer.cycle":
          controller.cycleLayer(1);
          break;
        case "layer.visible":
          controller.toggleLayerVisible();
          break;
        case "layer.lock":
          controller.toggleLayerLocked();
          break;
        case "frame.cycle":
          controller.cycleFrame(1);
          break;
        case "frame.duplicate":
          controller.duplicateFrame();
          break;
        case "font.cycle":
          controller.cycleFont(action.direction);
          break;
        case "font.browse":
          controller.fontBrowserOpen();
          browserOpeningKey = true;
          break;
        case "app.quit":
          void runtime.destroy().then(() => Deno.exit(0));
          break;
      }
    },
    setup(app) {
      const tui = app.tui;
      const revision = controller.revision;
      const project = () => controller.project();

      new StatusBar({
        parent: tui,
        theme: { base: crayon.bgMagenta.white },
        zIndex: 2,
        left: new Computed(() => {
          revision.value;
          const state = controller.state();
          const history = controller.historyDepth();
          return ` GLYPHFORGE  ${project().name}  frame ${state.frameIndex + 1}/${project().frames.length}` +
            `  undo ${history.undo}`;
        }),
        right: new Computed(() => {
          revision.value;
          return `${controller.note.value || "ready"} `;
        }),
        rectangle: new Computed(() => ({ column: 0, row: 0, width: tui.rectangle.value.width, height: 1 })),
      });

      // ── tool row ───────────────────────────────────────────────────
      new Text({
        parent: tui,
        theme: { base: crayon.bgBlack.white },
        zIndex: 1,
        text: new Computed(() => {
          revision.value;
          const state = controller.state();
          const tools: readonly [GlyphTool, string][] = [
            ["pencil", "P"],
            ["eraser", "E"],
            ["fill", "F"],
            ["line", "L"],
            ["rect", "R"],
            ["eyedropper", "I"],
            ["text", "T"],
          ];
          const toolText = tools
            .map(([tool, key]) => state.tool === tool ? `[${key} ${tool}]` : ` ${key} ${tool} `)
            .join(" ");
          const entry = controller.textEntry();
          const typing = entry ? `   typing: ${entry.text}▏` : "";
          const position = controller.fontPosition();
          return ` ${toolText}   brush ${state.brushChar}` +
            `  font ${controller.font().label} (${position.index}/${position.total})${typing}`;
        }),
        overwriteWidth: true,
        rectangle: new Computed<TextRectangle>(() => ({
          column: 1,
          row: 2,
          width: Math.max(20, tui.rectangle.value.width - 2),
        })),
      });

      // ── canvas ─────────────────────────────────────────────────────
      const canvasRect = new Computed(() => ({
        column: CANVAS_LEFT,
        row: CANVAS_TOP,
        width: project().columns,
        height: project().rows,
      }));
      new Frame({
        parent: tui,
        theme: { base: crayon.magenta },
        zIndex: 1,
        charMap: "rounded",
        rectangle: canvasRect,
      });
      const surfaceRevision = new Computed(() => String(controller.revision.value));
      const styleCache = new Map<string, (text: string) => string>();
      const styledCell = (cell: GlyphCell | null, checker: boolean): string => {
        if (!cell) {
          // Transparent cells show a subtle checker so erased areas read.
          return checker ? crayon.bgBlack.rgb(45, 45, 45)("·") : crayon.bgBlack.rgb(28, 28, 28)("·");
        }
        const key = `${cell.fg}/${cell.bg}`;
        let paint = styleCache.get(key);
        if (!paint) {
          const fg = glyphHexToRgb(project().palette[cell.fg] ?? "#ffffff");
          const bg = glyphHexToRgb(project().palette[cell.bg] ?? "#000000");
          paint = crayon.rgb(fg[0], fg[1], fg[2]).bgRgb(bg[0], bg[1], bg[2]);
          styleCache.set(key, paint);
        }
        return paint(cell.char);
      };
      mountGlyphCanvasSurface({
        tui,
        canvasRect,
        surfaceRevision,
        render: () => {
          const composite = controller.compositeWithPreview();
          return composite.map((row, rowIndex) =>
            row.map((cell, columnIndex) => styledCell(cell, (rowIndex + columnIndex) % 2 === 0))
          );
        },
      });

      // ── side panel: colors, layers, frames ─────────────────────────
      const sideLines = new Computed(() => {
        revision.value;
        const state = controller.state();
        const frame = project().frames[state.frameIndex]!;
        const lines: string[] = [];
        lines.push("PALETTE  [/] fg  {/} bg");
        lines.push("");
        lines.push(`fg ${state.foreground}  bg ${state.background}`);
        lines.push("");
        lines.push("LAYERS  tab  v show  k lock");
        for (let index = frame.layers.length - 1; index >= 0; index -= 1) {
          const layer = frame.layers[index]!;
          const marker = index === state.layerIndex ? "▸" : " ";
          const flags = `${layer.visible ? "●" : "○"}${layer.locked ? "⛌" : " "}`;
          lines.push(`${marker} ${flags} ${layer.name}`);
        }
        lines.push("");
        lines.push("FRAMES  n next  d duplicate");
        lines.push(
          project().frames
            .map((entry, index) => index === state.frameIndex ? `[${index + 1}]` : ` ${index + 1} `)
            .join(""),
        );
        return lines;
      });
      const SIDE_ROWS = 16;
      for (let index = 0; index < SIDE_ROWS; index += 1) {
        const rowIndex = index;
        new Text({
          parent: tui,
          theme: { base: crayon.bgBlack.white },
          zIndex: 1,
          text: new Computed(() => sideLines.value[rowIndex] ?? ""),
          overwriteWidth: true,
          rectangle: new Computed<TextRectangle>(() => ({
            column: CANVAS_LEFT + project().columns + 4,
            row: CANVAS_TOP + rowIndex,
            width: SIDE_WIDTH,
          })),
        });
      }
      // Palette swatches painted as styled cells on their own surface row.
      mountGlyphPaletteRow({ tui, controller, surfaceRevision });

      const keymap = new KeymapRegistry();
      keymap.register({ key: "mouse", description: "paint" });
      keymap.register({ key: "p/e/f/l/r/i", description: "tools" });
      keymap.register({ key: "u/y", description: "undo/redo" });
      keymap.register({ key: "b", description: "fonts" });
      keymap.register({ key: "tab", description: "layer" });
      keymap.register({ key: "n/d", description: "frames" });
      keymap.register({ key: "q", description: "quit" });
      new KeyHelp({
        parent: tui,
        theme: { base: crayon.bgBlack.white },
        zIndex: 1,
        bindings: keymap,
        rectangle: new Computed(() => ({
          column: 0,
          row: Math.max(0, tui.rectangle.value.height - 1),
          width: tui.rectangle.value.width,
          height: 1,
        })),
      });

      // ── font browser overlay (GLYPH-008) ───────────────────────────
      const BROWSER_LEFT = CANVAS_LEFT + 2;
      const BROWSER_TOP = CANVAS_TOP + 1;
      const BROWSER_WIDTH = 46;
      const BROWSER_LIST_ROWS = 9;
      const BROWSER_PREVIEW_ROWS = 6;
      const browserOpen = new Computed(() => {
        revision.value;
        return controller.fontBrowser() !== undefined;
      });
      const browserLines = new Computed(() => {
        revision.value;
        const browser = controller.fontBrowser();
        if (!browser) return [] as string[];
        const matches = controller.fontBrowserMatches();
        const lines: string[] = [];
        lines.push(` FONT BROWSER  ${matches.length}/${controller.fonts().length} fonts`);
        lines.push(` search: ${browser.query}▏`);
        lines.push("");
        const highlight = Math.min(browser.index, Math.max(0, matches.length - 1));
        const start = Math.max(
          0,
          Math.min(highlight - Math.floor(BROWSER_LIST_ROWS / 2), matches.length - BROWSER_LIST_ROWS),
        );
        for (let row = 0; row < BROWSER_LIST_ROWS; row += 1) {
          const font = matches[start + row];
          if (!font) {
            lines.push(matches.length === 0 && row === 0 ? "   no fonts match" : "");
            continue;
          }
          lines.push(`${start + row === highlight ? " ▸ " : "   "}${font.label}`);
        }
        lines.push("");
        const preview = matches[highlight] ? renderGlyphText(matches[highlight]!, "Abc", "kern") : [];
        for (let row = 0; row < BROWSER_PREVIEW_ROWS; row += 1) {
          lines.push(` ${(preview[row] ?? "").slice(0, BROWSER_WIDTH - 2)}`);
        }
        lines.push("");
        lines.push(" ↑/↓ move · type search · enter pick · esc");
        return lines.map((line) => line.slice(0, BROWSER_WIDTH).padEnd(BROWSER_WIDTH));
      });
      const BROWSER_ROWS = BROWSER_LIST_ROWS + BROWSER_PREVIEW_ROWS + 5;
      new Frame({
        parent: tui,
        theme: { base: crayon.bgBlack.lightMagenta },
        zIndex: 4,
        charMap: "rounded",
        visible: browserOpen,
        rectangle: { column: BROWSER_LEFT, row: BROWSER_TOP, width: BROWSER_WIDTH, height: BROWSER_ROWS },
      });
      for (let index = 0; index < BROWSER_ROWS; index += 1) {
        const rowIndex = index;
        new Text({
          parent: tui,
          theme: { base: rowIndex <= 1 ? crayon.bgBlack.lightMagenta.bold : crayon.bgBlack.white },
          zIndex: 5,
          visible: browserOpen,
          text: new Computed(() => browserLines.value[rowIndex] ?? "".padEnd(BROWSER_WIDTH)),
          overwriteWidth: true,
          rectangle: { column: BROWSER_LEFT, row: BROWSER_TOP + rowIndex, width: BROWSER_WIDTH },
        });
      }
      tui.on("keyPress", (event) => {
        if (!controller.fontBrowser() || event.ctrl || event.meta) return;
        // The keystroke that opened the browser is not a search character.
        if (browserOpeningKey) {
          browserOpeningKey = false;
          return;
        }
        if (event.key === "escape") controller.fontBrowserClose();
        else if (event.key === "return") controller.fontBrowserAccept();
        else if (event.key === "backspace") controller.fontBrowserBackspace();
        else if (event.key === "up") controller.fontBrowserMove(-1);
        else if (event.key === "down") controller.fontBrowserMove(1);
        else if (event.key === "space") controller.fontBrowserInput(" ");
        else if (event.key.length === 1 && event.key >= " " && event.key <= "~") {
          controller.fontBrowserInput(event.key);
        }
      });

      // ── text-tool typing ───────────────────────────────────────────
      tui.on("keyPress", (event) => {
        if (!controller.textEntry()) return;
        if (event.ctrl || event.meta) return;
        if (event.key === "escape") {
          controller.textEntryCancel();
          return;
        }
        if (event.key === "return") {
          controller.textEntryCommit();
          return;
        }
        if (event.key === "backspace") {
          controller.textEntryBackspace();
          return;
        }
        if (event.key === "space") {
          controller.textEntryAppend(" ");
          return;
        }
        if (event.key.length === 1 && event.key >= " " && event.key <= "~") {
          controller.textEntryAppend(event.key);
        }
      });

      // ── mouse painting ─────────────────────────────────────────────
      tui.on("mousePress", (event) => {
        // The font browser owns the screen while it is open.
        if (controller.fontBrowser()) return;
        const rect = canvasRect.peek();
        const column = event.x - rect.column;
        const row = event.y - rect.row;
        const inside = column >= 0 && column < project().columns && row >= 0 && row < project().rows;
        if (event.release) {
          controller.pointerUp();
          return;
        }
        if (!inside) return;
        if (event.drag) controller.pointerDrag(column, row);
        else controller.pointerDown(column, row);
      });

      persistTimer = setInterval(() => controller.persist(), 2_000);
      return () => {
        if (persistTimer !== undefined) clearInterval(persistTimer);
      };
    },
  });

  const runtime: GlyphForgeRuntime = {
    app,
    start: () => app.start(),
    destroy: async () => {
      if (persistTimer !== undefined) clearInterval(persistTimer);
      app.destroy();
      await controller.dispose();
    },
  };
  return runtime;
}

import { GlyphCellSurface } from "./cell_surface.ts";
import type { Tui } from "../../../mod.ts";

/** Mounts the editing canvas surface inside the frame. */
function mountGlyphCanvasSurface(options: {
  tui: Tui;
  canvasRect: Computed<{ column: number; row: number; width: number; height: number }>;
  surfaceRevision: Computed<string>;
  render: () => string[][];
}) {
  return new GlyphCellSurface({
    parent: options.tui,
    theme: {},
    zIndex: 2,
    rectangle: new Computed(() => ({
      column: options.canvasRect.value.column,
      row: options.canvasRect.value.row,
      width: options.canvasRect.value.width,
      height: options.canvasRect.value.height,
    })),
    revision: options.surfaceRevision,
    render: options.render,
  });
}

/** Paints the clickable palette swatch row under the side panel. */
function mountGlyphPaletteRow(options: {
  tui: Tui;
  controller: GlyphForgeController;
  surfaceRevision: Computed<string>;
}) {
  const { tui, controller } = options;
  const paletteRect = new Computed(() => ({
    column: CANVAS_LEFT + controller.project().columns + 4,
    row: CANVAS_TOP + 3,
    width: Math.min(SIDE_WIDTH, controller.project().palette.length * 2),
    height: 1,
  }));
  const surface = new GlyphCellSurface({
    parent: tui,
    theme: {},
    zIndex: 2,
    rectangle: paletteRect,
    revision: options.surfaceRevision,
    render: () => {
      const state = controller.state();
      const cells: string[] = [];
      controller.project().palette.forEach((hex, index) => {
        const rgb = glyphHexToRgb(hex);
        const paint = crayon.bgRgb(rgb[0], rgb[1], rgb[2]);
        const marker = index === state.foreground ? "F" : index === state.background ? "B" : " ";
        const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
        const fg = luma > 128 ? crayon.rgb(0, 0, 0) : crayon.rgb(255, 255, 255);
        cells.push(paint(fg(marker)), paint(" "));
      });
      return [cells];
    },
  });
  // Click selects the foreground color; a drag with the same press sets it too.
  tui.on("mousePress", (event) => {
    if (event.release || event.drag || controller.fontBrowser()) return;
    const rect = paletteRect.peek();
    if (event.y !== rect.row) return;
    const offset = event.x - rect.column;
    if (offset < 0 || offset >= rect.width) return;
    controller.setForeground(Math.floor(offset / 2));
  });
  return surface;
}
