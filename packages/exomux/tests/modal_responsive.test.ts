// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import type { Rectangle } from "@ubernaut/deno-tui";
import { createTestTerminalApp } from "@ubernaut/deno-tui/testing";
import { FakeExomuxClient, session } from "./fakes.ts";
import { createExomuxController } from "../controller.ts";
import {
  createExomuxTerminalOptions,
  type ExomuxAppMountRef,
  exomuxHelpLayout,
  exomuxHelpLines,
  exomuxModalProse,
  exomuxQuitLayout,
  exomuxWindowConfigLayout,
} from "../app.ts";

// User report (Aug 18 2026): "modals are not responsive to mobile screen
// sizes". They were sized responsively and then had their contents truncated
// to fit, which is not the same thing — a phone showed "Detach keeps terminals
// runn..." for the description of a destructive choice, and every one of the
// eighteen key-reference rows ended in an ellipsis.

const PHONE: Rectangle = { column: 0, row: 0, width: 36, height: 30 };
const NARROW_PHONE: Rectangle = { column: 0, row: 0, width: 28, height: 24 };
const DESKTOP: Rectangle = { column: 0, row: 0, width: 120, height: 40 };

Deno.test("modal prose wraps to the width it is given instead of being cut", () => {
  const text = "Detach keeps terminals running · Terminate kills the host and every terminal";
  const wrapped = exomuxModalProse(text, 30);
  assert(wrapped.length > 1, "a long line needs more than one row at 30 columns");
  for (const line of wrapped) assert(line.length <= 30, `"${line}" overflows 30 columns`);
  // Nothing is dropped on the way: every word survives the wrap.
  assertEquals(wrapped.join(" ").split(/\s+/), text.split(/\s+/));
  assertEquals(exomuxModalProse(text, 0), []);
});

Deno.test("the key reference reflows from two columns to one to stacked", () => {
  const wide = exomuxHelpLines(100);
  const single = exomuxHelpLines(40);
  const stacked = exomuxHelpLines(24);
  const entryRow = (lines: readonly string[], keys: string) => lines.find((line) => line.startsWith(keys));

  // Wide enough for two entries per row.
  const paired = entryRow(wide, "Ctrl-N c")!;
  assert(paired.includes("new floating term"), "the action stays with its key");
  assert(paired.includes("split right / below"), "a wide box pairs two entries per row");

  // One entry per row, still complete.
  const singleRow = entryRow(single, "Ctrl-N c")!;
  assert(singleRow.includes("new floating term"));
  assert(!singleRow.includes("split right"), "a narrow box gives each entry its own row");

  // Too narrow for even one key-and-action column: the action moves below.
  assertEquals(entryRow(stacked, "Ctrl-N c"), "Ctrl-N c");
  assert(stacked.some((line) => line.trim() === "new floating term"), "the action is still there, indented");

  for (const [width, lines] of [[100, wide], [40, single], [24, stacked]] as const) {
    for (const line of lines) assert(line.length <= width, `"${line}" overflows ${width} columns`);
  }
});

Deno.test("the key reference scrolls when it cannot fit, and not when it can", () => {
  const phone = exomuxHelpLayout(PHONE);
  assert(phone.maxScroll > 0, "the whole reference does not fit on a phone");
  assertEquals(exomuxHelpLayout(PHONE, -5).scroll, 0, "scroll clamps at the top");
  assertEquals(exomuxHelpLayout(PHONE, 9_999).scroll, phone.maxScroll, "and at the bottom");
  // Every line is reachable: the last screen starts at maxScroll and the box
  // shows the rows from there to the end.
  const visibleRows = Math.max(0, phone.rect.height - 3);
  assertEquals(phone.maxScroll + visibleRows, phone.lines.length);

  const desktop = exomuxHelpLayout(DESKTOP);
  assertEquals(desktop.maxScroll, 0, "a desktop shows the whole reference at once");
});

Deno.test("the end-session modal wraps its explanation clear of its buttons", () => {
  const phone = exomuxQuitLayout(PHONE);
  assert(phone.prose.length > 1, "the explanation wraps on a phone");
  for (const line of phone.prose) {
    assert(line.length <= phone.rect.width - 4, `"${line}" overflows the box`);
  }
  // The prose starts under the title and ends before the first button, which
  // is what a fixed-height box got wrong: the third line landed on [ Cancel ].
  const firstButtonRow = Math.min(phone.cancelRect.row, phone.detachRect.row, phone.terminateRect.row);
  assertEquals(phone.rect.row + 3 + phone.prose.length <= firstButtonRow, true);
  // Every button is inside the box, stacked or not.
  for (const button of [phone.cancelRect, phone.detachRect, phone.terminateRect]) {
    assert(button.row > phone.rect.row && button.row < phone.rect.row + phone.rect.height - 1);
    assert(button.column + button.width <= phone.rect.column + phone.rect.width);
  }

  const desktop = exomuxQuitLayout(DESKTOP);
  assertEquals(desktop.prose.length, 1, "one line is enough when there is room");
  assertEquals(desktop.cancelRect.row, desktop.terminateRect.row, "and the buttons spread across one row");
});

Deno.test("per-window settings reserve rows for a wrapped detail line", () => {
  for (const bounds of [NARROW_PHONE, PHONE, DESKTOP]) {
    const layout = exomuxWindowConfigLayout(bounds);
    const buttonRow = layout.closeRect.row;
    for (const row of layout.rowRects) {
      assert(row.row < buttonRow, "setting rows stay above the action row");
      assert(row.column + row.width <= layout.rect.column + layout.rect.width);
    }
    assert(layout.rect.height <= bounds.height, "the box never exceeds the screen");
  }
  // The narrow box is taller in rows than the wide one, because the same
  // detail needs more of them — that is what being responsive costs.
  assert(exomuxWindowConfigLayout(NARROW_PHONE).rect.height >= exomuxWindowConfigLayout(DESKTOP).rect.height);
});

// The layout above is pure, and the two bugs that actually broke scrolling
// were not: the modal catcher swallowed the wheel before any modal saw it, and
// the desktop's paint signature did not include the scroll offset, so the
// frame stayed on the row it was already showing. Drive the real wheel.

Deno.test("the wheel scrolls the key reference and repaints it", async () => {
  const sessions = [session("help-scroll", "zsh", 0)];
  const client = new FakeExomuxClient(sessions);
  const controller = await createExomuxController({ client, initialSessions: sessions });
  await controller.ready;
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headless } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headless, size: { columns: 36, rows: 30 } });
  try {
    await harness.pilot.settle();
    controller.openHelp();
    await harness.pilot.settle();
    const bounds = mount.current!.windowProjection.peek().bounds;
    assert(exomuxHelpLayout(bounds).maxScroll > 0, "this screen cannot show the whole reference");

    const firstRow = (): string => {
      const rect = exomuxHelpLayout(bounds, controller.helpScroll.peek()).rect;
      let text = "";
      for (let column = rect.column + 1; column < rect.column + rect.width - 1; column += 1) {
        const value = harness.canvas.frameBuffer[rect.row + 1]?.[column] ?? " ";
        const decoded = typeof value === "string" ? value : new TextDecoder().decode(value);
        text += decoded.replace(/\x1b\[[0-9;]*m/g, "") || " ";
      }
      return text.trim();
    };

    const top = firstRow();
    for (let notch = 0; notch < 4; notch += 1) await harness.pilot.scroll(1, 18, 15);
    assertEquals(controller.helpScroll.peek(), 4, "the wheel moved the reference");
    assert(firstRow() !== top, "and the frame repainted at the new offset");

    for (let notch = 0; notch < 20; notch += 1) await harness.pilot.scroll(-1, 18, 15);
    assertEquals(controller.helpScroll.peek(), 0, "scrolling back up stops at the top");
    assertEquals(firstRow(), top);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
