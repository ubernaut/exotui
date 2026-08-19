// Copyright 2023 Im-Beast. MIT license.

// 044 slice D. Two sessions panels on screen, one holding the keyboard: the
// focused one accents its current row, the other keeps its place muted. Before
// this, an unfocused panel drew no highlight at all, which loses the user's
// place rather than de-emphasising it.

import { assert } from "./deps.ts";
import { ExomuxSessionList } from "../session_list.ts";

const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");

function plainRow(list: ExomuxSessionList, row: number, width: number): string {
  let text = "";
  for (let column = 0; column < width; column += 1) {
    const cell = list.cellAt(row, column);
    text += typeof cell === "string" ? cell.replace(SGR, "") : " ";
  }
  return text;
}

/** The raw cell, SGR intact, so a background colour can be asserted. */
function styledRow(list: ExomuxSessionList, row: number, width: number): string {
  let text = "";
  for (let column = 0; column < width; column += 1) {
    const cell = list.cellAt(row, column);
    if (typeof cell === "string") text += cell;
  }
  return text;
}

async function settle(pending: () => boolean, limit = 60) {
  for (let attempt = 0; attempt < limit && pending(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const ACCENT = [255, 105, 180] as const;
const MUTED = [64, 70, 90] as const;
const background = (rgb: readonly number[]) => `48;2;${rgb[0]};${rgb[1]};${rgb[2]}`;

const BASE = {
  width: 24,
  height: 4,
  selectedIndex: 1,
  scrollTop: -1,
  rows: [
    { label: "1: build", running: true },
    { label: "2: logs", running: true },
    { label: "3: shell", running: false },
  ],
  foreground: [220, 230, 255] as const,
  mutedForeground: [120, 130, 160] as const,
  background: [30, 40, 70] as const,
  selectedForeground: [10, 10, 20] as const,
  selectedBackground: ACCENT,
  selectedUnfocusedForeground: [200, 210, 230] as const,
  selectedUnfocusedBackground: MUTED,
  scrollbarTrack: [40, 50, 80] as const,
  scrollbarThumb: [120, 130, 160] as const,
};

async function render(active: boolean): Promise<ExomuxSessionList> {
  const list = new ExomuxSessionList(() => {});
  list.sync({ ...BASE, active });
  await settle(() => !list.ready());
  assert(list.ready(), `the ${active ? "focused" : "unfocused"} panel renders`);
  return list;
}

Deno.test("only the panel holding the keyboard shows an active selection", async () => {
  const focused = await render(true);
  const unfocused = await render(false);

  try {
    // Both still show which row is current — that fact does not depend on focus.
    assert(plainRow(focused, 1, 24).trimStart().startsWith(">"), "the focused panel points at its row");
    assert(plainRow(unfocused, 1, 24).trimStart().startsWith("·"), "the unfocused panel still marks its row");

    // But only one of them is painted as where typing goes.
    const focusedRow = styledRow(focused, 1, 24);
    const unfocusedRow = styledRow(unfocused, 1, 24);
    assert(focusedRow.includes(background(ACCENT)), "the focused selection is the accent");
    assert(!unfocusedRow.includes(background(ACCENT)), "the unfocused selection is NOT the accent");
    assert(unfocusedRow.includes(background(MUTED)), "the unfocused selection is muted, not absent");
  } finally {
    focused.dispose();
    unfocused.dispose();
  }
});

Deno.test("a panel losing focus repaints rather than reusing its accented frame", async () => {
  // The signature decides whether a frame is reused. An unfocused colour left
  // out of it would freeze the accent on a panel that had lost focus.
  const list = new ExomuxSessionList(() => {});
  try {
    list.sync({ ...BASE, active: true });
    await settle(() => !list.ready());
    assert(styledRow(list, 1, 24).includes(background(ACCENT)));

    list.sync({ ...BASE, active: false });
    await settle(() => !styledRow(list, 1, 24).includes(background(MUTED)));
    assert(styledRow(list, 1, 24).includes(background(MUTED)), "losing focus repainted the row muted");
  } finally {
    list.dispose();
  }
});
