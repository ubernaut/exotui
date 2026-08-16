// Copyright 2023 Im-Beast. MIT license.

// 036 V1: cross-container selectable text and a clipboard abstraction
// shared by terminal OSC 52 and browser clipboard.

import { assert, assertEquals } from "./deps.ts";
import { createBrowserClipboard, createCrossContainerSelection, createOsc52Clipboard } from "../mod.ts";

Deno.test("the OSC 52 adapter encodes selections as base64 sequences", async () => {
  const written: string[] = [];
  const clipboard = createOsc52Clipboard((bytes) => written.push(bytes));
  await clipboard.write("hello 世界");
  assertEquals(written.length, 1);
  assert(written[0]!.startsWith("\x1b]52;c;"));
  assert(written[0]!.endsWith("\x07"));
  const payload = written[0]!.slice("\x1b]52;c;".length, -1);
  assertEquals(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))), "hello 世界");

  await clipboard.write("x", "primary");
  assert(written[1]!.startsWith("\x1b]52;p;"));
});

Deno.test("the browser adapter shares the identical contract", async () => {
  let stored = "";
  const clipboard = createBrowserClipboard({
    writeText: (text) => {
      stored = text;
      return Promise.resolve();
    },
    readText: () => Promise.resolve(stored),
  });
  await clipboard.write("browser text");
  assertEquals(stored, "browser text");
  assertEquals(await clipboard.read!(), "browser text");
  // Reading is optional (terminal parity): absent readText → no read().
  const writeOnly = createBrowserClipboard({ writeText: () => Promise.resolve() });
  assertEquals(writeOnly.read, undefined);
});

Deno.test("selection crosses registered containers in declared order", async () => {
  const selection = createCrossContainerSelection();
  selection.register({ id: "editor", order: 1, lines: () => ["function main() {", "  return 42;", "}"] });
  selection.register({ id: "output", order: 2, lines: () => ["$ run", "42"] });

  // Within one region, mid-line to mid-line.
  selection.begin({ regionId: "editor", line: 0, column: 9 });
  selection.extend({ regionId: "editor", line: 1, column: 12 });
  assertEquals(selection.selectedText(), "main() {\n  return 42;");

  // ACROSS regions: the tail of the editor plus the head of the output.
  selection.begin({ regionId: "editor", line: 2, column: 0 });
  selection.extend({ regionId: "output", line: 0, column: 5 });
  assertEquals(selection.selectedText(), "}\n$ run");

  // Backwards selections normalize.
  selection.begin({ regionId: "output", line: 0, column: 5 });
  selection.extend({ regionId: "editor", line: 2, column: 0 });
  assertEquals(selection.selectedText(), "}\n$ run");

  // Copy pipes through the shared port — the same text both hosts get.
  const written: string[] = [];
  const copied = await selection.copy(createOsc52Clipboard((bytes) => written.push(bytes)));
  assertEquals(copied, "}\n$ run");
  assertEquals(written.length, 1);

  selection.clear();
  assertEquals(selection.selectedText(), "");
  assertEquals(await selection.copy(createOsc52Clipboard(() => {})), ""); // no empty writes
});
