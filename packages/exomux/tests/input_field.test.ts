// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { ExomuxInputField, type ExomuxInputFieldSpec } from "../input_field.ts";

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

const SGR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");
function rowText(field: ExomuxInputField, width: number): string {
  let text = "";
  for (let column = 0; column < width; column += 1) {
    const cell = field.cellAt(0, column);
    text += typeof cell === "string" ? cell.replace(SGR, "") : " ";
  }
  return text;
}

function spec(width: number): ExomuxInputFieldSpec {
  return {
    column: 0,
    row: 0,
    width,
    foreground: [220, 220, 220],
    background: [20, 20, 20],
    cursorForeground: [20, 20, 20],
    cursorBackground: [220, 220, 220],
  };
}

Deno.test("ExomuxInputField composites a masked, interactive Input", async () => {
  const values: string[] = [];
  const field = new ExomuxInputField({
    requestRepaint: () => {},
    onChange: (value) => values.push(value),
    password: true,
  });
  try {
    assert(!field.active, "starts inactive");
    field.sync(true, "", spec(12));
    assert(field.active, "sync(true) mounts the Input synchronously");
    await settle();
    assert(field.ready(), "a snapshot should render");

    // The Input owns the typing and pushes each value through onChange.
    for (const key of ["a", "b", "c"]) field.handleKey({ key });
    await settle();
    assertEquals(values.at(-1), "abc");

    // Masked: the rendered cells show '*', never the plaintext.
    const text = rowText(field, 12);
    assert(text.includes("*"), `expected masking, saw "${text}"`);
    assert(!text.includes("abc"), `plaintext leaked into the render: "${text}"`);

    // Backspace is native to the Input.
    field.handleKey({ key: "backspace" });
    await settle();
    assertEquals(values.at(-1), "ab");

    // Going inactive tears the Input down.
    field.sync(false, "", spec(12));
    assert(!field.active);
  } finally {
    field.dispose();
  }
});

Deno.test("ExomuxInputField respects a validator and is not masked by default", async () => {
  const values: string[] = [];
  const field = new ExomuxInputField({
    requestRepaint: () => {},
    onChange: (value) => values.push(value),
    validator: /[a-z]/,
  });
  try {
    field.sync(true, "", spec(10));
    await settle();
    // Digits are rejected by the validator; letters pass.
    for (const key of ["a", "1", "b"]) field.handleKey({ key });
    await settle();
    assertEquals(values.at(-1), "ab");
    // Not a password: the value renders in the clear.
    assert(rowText(field, 10).includes("ab"), "an unmasked field shows its value");
  } finally {
    field.dispose();
  }
});
