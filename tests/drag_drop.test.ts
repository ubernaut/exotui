// Copyright 2023 Im-Beast. MIT license.

// INP-008: typed drag-and-drop — denied files expose metadata only,
// accepted drops are cancellable, and browser and terminal adapters share
// one event shape.

import { assert, assertEquals, assertRejects } from "./deps.ts";
import { adaptBrowserDrop, adaptTerminalDrop, createDragDropRouter } from "../mod.ts";

const READER = (name: string, signal: AbortSignal) =>
  new Promise<Uint8Array>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("read aborted")));
    if (!signal.aborted) resolve(new TextEncoder().encode(`content of ${name}`));
  });

Deno.test("denied file drops expose metadata only - the reader is structurally absent", () => {
  const router = createDragDropRouter((payload) =>
    payload.kind === "files" && payload.files.some((file) => file.size > 1000) ? "deny" : "accept"
  );
  const outcome = router.route({
    payload: { kind: "files", files: [{ name: "huge.bin", size: 5000 }] },
    x: 3,
    y: 4,
    readFile: READER,
  });
  assertEquals(outcome.kind, "denied");
  if (outcome.kind === "denied") {
    assertEquals(outcome.metadata, { kind: "files", files: [{ name: "huge.bin", size: 5000 }] });
    // Metadata only: nothing on the denied branch can read content.
    assert(!("readFile" in outcome));
  }
});

Deno.test("accepted drops read through the gate and cancel abortably", async () => {
  const router = createDragDropRouter(() => "accept");
  const outcome = router.route({
    payload: { kind: "files", files: [{ name: "notes.txt", size: 12 }] },
    x: 0,
    y: 0,
    readFile: READER,
  });
  assert(outcome.kind === "accepted");
  const content = await outcome.drop.readFile!("notes.txt");
  assertEquals(new TextDecoder().decode(content), "content of notes.txt");

  outcome.drop.cancel();
  assert(outcome.drop.cancelled);
  await assertRejects(() => outcome.drop.readFile!("notes.txt"), Error, "cancelled");
});

Deno.test("browser and terminal adapters produce the same event shape", () => {
  const browser = adaptBrowserDrop(
    {
      types: ["Files"],
      getData: () => "",
      files: [{ name: "a.png", size: 10, type: "image/png" }],
    },
    { x: 1, y: 2 },
  );
  const terminal = adaptTerminalDrop(["a.png"], { x: 1, y: 2 }, () => ({ size: 10 }));
  assertEquals(browser.payload.kind, "files");
  assertEquals(terminal.payload.kind, "files");
  if (browser.payload.kind === "files" && terminal.payload.kind === "files") {
    assertEquals(browser.payload.files[0]!.name, terminal.payload.files[0]!.name);
    assertEquals(browser.payload.files[0]!.size, terminal.payload.files[0]!.size);
  }

  // Text and application payloads flow through the browser adapter too.
  const text = adaptBrowserDrop({ types: ["text/plain"], getData: () => "hello" }, { x: 0, y: 0 });
  assertEquals(text.payload, { kind: "text", text: "hello" });
  const app = adaptBrowserDrop(
    { types: ["application/json"], getData: () => '{"id":7}' },
    { x: 0, y: 0 },
  );
  assertEquals(app.payload, { kind: "application", format: "application/json", data: { id: 7 } });
});
