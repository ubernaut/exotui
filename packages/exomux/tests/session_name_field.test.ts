// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { ExomuxInputField, type ExomuxInputFieldSpec } from "../input_field.ts";

const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function plain(field: ExomuxInputField, width: number): string {
  let text = "";
  for (let column = 0; column < width; column += 1) {
    const cell = field.cellAt(0, column);
    text += typeof cell === "string" ? cell.replace(SGR, "") : " ";
  }
  return text;
}

async function settle(pending: () => boolean, limit = 60) {
  for (let attempt = 0; attempt < limit && pending(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const SPEC: ExomuxInputFieldSpec = {
  column: 0,
  row: 0,
  width: 20,
  foreground: [220, 230, 255],
  background: [30, 40, 70],
  cursorForeground: [30, 40, 70],
  cursorBackground: [220, 230, 255],
};

Deno.test("session-name field edits through a real Input and submits", async () => {
  const drafts: string[] = [];
  let submits = 0;
  // The session-name editor is the reusable ExomuxInputField with the
  // session-name alphabet as its validator (WS-010).
  const field = new ExomuxInputField({
    requestRepaint: () => {},
    onChange: (text) => {
      drafts.push(text);
    },
    onSubmit: () => {
      submits += 1;
    },
    validator: /[A-Za-z0-9._-]/,
  });
  try {
    field.sync(true, "ab", SPEC);
    assert(field.active, "the field is editing after sync(true)");
    await settle(() => !field.ready());
    assert(field.ready(), "the Input renders a snapshot");
    assert(plain(field, 20).includes("ab"), "the seeded draft renders");

    // Backspace clears, then typing a new name reaches the draft via the Input.
    field.handleKey({ key: "backspace" });
    field.handleKey({ key: "backspace" });
    for (const key of ["d", "e", "v"]) field.handleKey({ key });
    assertEquals(drafts.at(-1), "dev");

    // A rejected character (space) does not change the draft.
    const before = drafts.length;
    field.handleKey({ key: "space" });
    assert(drafts.length === before || drafts.at(-1) === "dev", "invalid characters are filtered");

    // Enter submits.
    field.handleKey({ key: "return" });
    assertEquals(submits, 1);

    // The composited text reflects the edit.
    await settle(() => !plain(field, 20).includes("dev"));
    assert(plain(field, 20).includes("dev"), "the Input shows the typed name");

    // Leaving edit mode tears the Input down.
    field.sync(false, "", SPEC);
    assert(!field.active, "the field stops editing after sync(false)");
    assertEquals(field.ready(), false);
  } finally {
    field.dispose();
  }
});
