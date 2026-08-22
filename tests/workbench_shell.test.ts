// The desktop shell's painters, tested against a recording surface.
//
// Two applications adopt these painters in the same change that adds them, so
// the tests pin the behaviours both relied on: grounds sampled per cell, the
// title truncated to the room left of the first control, the switcher's exact
// span arithmetic, tab rects that match what was painted.

import { assert, assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import {
  borderBoxOnGround,
  fillOnGround,
  paintShellMenuPanel,
  paintShellSwitcher,
  paintShellTabStrip,
  paintShellWindowChrome,
  shellFitSpan,
  shellFitText,
  type ShellStyle,
  type ShellSurface,
  solidGround,
  writeOnGround,
} from "../src/app/workbench_shell.ts";
import type {
  WorkbenchWindowChromeProjection,
  WorkbenchWindowSwitcherProjection,
} from "../src/app/workbench_window_host.ts";

interface Painted {
  char: string;
  style: ShellStyle;
}

/** A surface that remembers every cell, so tests read pixels back. */
function recordingSurface(): { surface: ShellSurface; cells: Map<string, Painted> } {
  const cells = new Map<string, Painted>();
  const put = (column: number, row: number, char: string, style: ShellStyle) =>
    cells.set(`${column},${row}`, { char, style });
  const surface: ShellSurface = {
    cell: put,
    write(column, row, text, style) {
      const glyphs = [...text];
      for (let index = 0; index < glyphs.length; index += 1) put(column + index, row, glyphs[index]!, style);
    },
    fill(rect, char, style) {
      for (let row = rect.row; row < rect.row + rect.height; row += 1) {
        for (let column = rect.column; column < rect.column + rect.width; column += 1) put(column, row, char, style);
      }
    },
  };
  return { surface, cells };
}

const GLYPHS = {
  topLeft: "┌",
  top: "─",
  topRight: "┐",
  left: "│",
  right: "│",
  bottomLeft: "└",
  bottom: "─",
  bottomRight: "┘",
};

Deno.test("fit helpers keep exomux's exact arithmetic", () => {
  assertEquals(shellFitSpan(140, 20, 48, 8), 48);
  assertEquals(shellFitSpan(30, 20, 48, 8), 22);
  assertEquals(shellFitSpan(5, 20, 48, 8), 1);
  assertEquals(shellFitText("abcdef", 6), "abcdef");
  assertEquals(shellFitText("abcdefgh", 6), "abc...");
  assertEquals(shellFitText("abcdefgh", 3), "abc");
  assertEquals(shellFitText("abc", 0), "");
});

Deno.test("grounds are sampled per cell, not once", () => {
  const { surface, cells } = recordingSurface();
  const ground = (column: number, row: number) => [column, row, 0] as const;
  fillOnGround(surface, { column: 2, row: 1, width: 2, height: 1 }, [9, 9, 9], ground);
  assertEquals(cells.get("2,1")!.style.background, [2, 1, 0]);
  assertEquals(cells.get("3,1")!.style.background, [3, 1, 0]);
  writeOnGround(surface, 5, 2, "ab", { foreground: [1, 1, 1] }, ground);
  assertEquals(cells.get("6,2")!.style.background, [6, 2, 0]);
  borderBoxOnGround(surface, { column: 0, row: 0, width: 3, height: 3 }, GLYPHS, [7, 7, 7], ground, true);
  assertEquals(cells.get("0,0")!.char, "┌");
  assertEquals(cells.get("2,2")!.style.background, [2, 2, 0]);
  assert(cells.get("1,0")!.style.bold);
});

function chromeWindow(): WorkbenchWindowChromeProjection {
  return {
    id: "w",
    title: "ignored — options.titleText wins",
    placement: "floating",
    state: "normal",
    rect: { column: 0, row: 0, width: 20, height: 5 },
    titleBarRect: { column: 0, row: 0, width: 20, height: 1 },
    clientRect: { column: 1, row: 1, width: 18, height: 3 },
    active: true,
    alwaysOnTop: false,
    zIndex: 1,
    controls: [
      {
        kind: "close",
        text: "[x]",
        rect: { column: 16, row: 0, width: 3, height: 1 },
        hitRect: { column: 15, row: 0, width: 4, height: 1 },
        tone: "danger",
        semantic: { id: "w:close", role: "button", label: "close" },
      },
    ],
    titleAdornments: [],
    semantic: { id: "w", role: "window", label: "w" },
  } as unknown as WorkbenchWindowChromeProjection;
}

Deno.test("window chrome truncates the title short of the first control", () => {
  const { surface, cells } = recordingSurface();
  paintShellWindowChrome(surface, chromeWindow(), {
    surfaceFill: { foreground: [1, 1, 1], background: [2, 2, 2] },
    borderGlyphs: GLYPHS,
    borderForeground: [3, 3, 3],
    chromeGround: solidGround([4, 4, 4]),
    titleBarGround: solidGround([5, 5, 5]),
    titleBarFillForeground: [1, 1, 1],
    titleText: "a very long window title that cannot fit",
    titleForeground: [6, 6, 6],
    titleBold: true,
    controlBold: (control) => control.tone === "danger",
    controlForeground: [6, 6, 6],
  });
  // Title starts one column in and must end with "..." before column 16.
  let title = "";
  for (let column = 1; column < 16; column += 1) title += cells.get(`${column},0`)?.char ?? "";
  assert(title.startsWith("a very long"));
  assert(title.includes("..."));
  // The control paints over the title bar ground, bold for its danger tone.
  assertEquals(cells.get("16,0")!.char, "[");
  assert(cells.get("16,0")!.style.bold);
  assertEquals(cells.get("16,0")!.style.background, [5, 5, 5]);
  // Side borders survive below the title bar.
  assertEquals(cells.get("0,2")!.char, "│");
});

Deno.test("the switcher centers, frames, and marks the selection", () => {
  const { surface, cells } = recordingSurface();
  const switcher = {
    selectedIndex: 1,
    items: [
      { id: "a", title: "alpha", selected: false, state: "normal", semantic: { id: "a", role: "option", label: "a" } },
      { id: "b", title: "beta", selected: true, state: "normal", semantic: { id: "b", role: "option", label: "b" } },
    ],
    semantic: { id: "s", role: "listbox", label: "windows" },
  } as unknown as WorkbenchWindowSwitcherProjection;
  const item: ShellStyle = { foreground: [1, 1, 1], background: [0, 0, 0] };
  const selected: ShellStyle = { foreground: [9, 9, 9], background: [8, 8, 8], bold: true };
  const rect = paintShellSwitcher(surface, switcher, { column: 0, row: 0, width: 60, height: 20 }, {
    colors: {
      panelFill: { foreground: [1, 1, 1], background: [0, 0, 0] },
      frame: { foreground: [2, 2, 2], background: [0, 0, 0], bold: true },
      item,
      selectedItem: selected,
    },
  });
  // Same span arithmetic exomux shipped with: width 48 has margin 8 clamped in 60.
  assertEquals(rect.width, 48);
  assertEquals(rect.height, 4);
  assertEquals(cells.get(`${rect.column},${rect.row}`)!.char, "#");
  assertEquals(cells.get(`${rect.column + 1},${rect.row + 2}`)!.char, ">");
  assertEquals(cells.get(`${rect.column + 1},${rect.row + 2}`)!.style, selected);
});

Deno.test("menu panels frame and stop rows at the border", () => {
  const { surface, cells } = recordingSurface();
  paintShellMenuPanel(
    surface,
    { column: 0, row: 0, width: 12, height: 4 },
    [
      { rect: { column: 1, row: 1, width: 10, height: 1 }, label: "open" },
      { rect: { column: 1, row: 2, width: 10, height: 1 }, label: "quit", danger: true },
      { rect: { column: 1, row: 3, width: 10, height: 1 }, label: "past the border" },
    ],
    {
      panelFill: { foreground: [1, 1, 1], background: [0, 0, 0] },
      borderGlyphs: GLYPHS,
      borderStyle: { foreground: [2, 2, 2], background: [0, 0, 0], bold: true },
      rowStyle: { foreground: [1, 1, 1], background: [0, 0, 0] },
      dangerForeground: [9, 0, 0],
    },
  );
  assertEquals(cells.get("0,0")!.char, "┌");
  assertEquals(cells.get("1,1")!.char, "o");
  assertEquals(cells.get("1,2")!.style.foreground, [9, 0, 0]);
  assert(cells.get("1,2")!.style.bold);
  // The row that would cross the bottom border never painted its label —
  // the border glyph is still there.
  assertEquals(cells.get("1,3")!.char, "─");
});

Deno.test("tab strips return the rects they painted and respect the tail", () => {
  const { surface, cells } = recordingSurface();
  const placed = paintShellTabStrip(
    surface,
    { column: 2, row: 0, width: 20, height: 1 },
    [
      { id: "one", label: "one", active: true },
      { id: "two", label: "two", active: false, dimmed: true },
      { id: "three", label: "a very long tab label", active: false },
    ],
    {
      activeTab: { foreground: [9, 9, 9], background: [8, 8, 8] },
      tab: { foreground: [1, 1, 1], background: [0, 0, 0] },
      dimmedTab: { foreground: [4, 4, 4], background: [0, 0, 0] },
    },
    4,
  );
  // The long third tab did not fit inside width minus the reserved tail.
  assertEquals(placed.map((tab) => tab.id), ["one", "two"]);
  assertEquals(placed[0]!.rect, { column: 2, row: 0, width: 5, height: 1 });
  assertEquals(cells.get("2,0")!.style.background, [8, 8, 8]);
  assertEquals(cells.get(`${placed[1]!.rect.column},0`)!.style.foreground, [4, 4, 4]);
});
