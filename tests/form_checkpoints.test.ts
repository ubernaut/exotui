// Copyright 2023 Im-Beast. MIT license.

// FRM-009: one typing burst undoes coherently; paste and field-array
// operations stay atomic and break bursts.

import { assertEquals } from "./deps.ts";
import { createFormCheckpointHistory } from "../mod.ts";

Deno.test("a typing burst coalesces into one undo step", () => {
  const history = createFormCheckpointHistory({ name: "" }, { typingCoalesceMs: 500 });
  history.record({ name: "h" }, { kind: "typing", field: "name", at: 0 });
  history.record({ name: "he" }, { kind: "typing", field: "name", at: 100 });
  history.record({ name: "hey" }, { kind: "typing", field: "name", at: 200 });
  assertEquals(history.inspect().checkpoints, 2); // initial + one burst
  assertEquals(history.undo(), { name: "" }); // the whole burst in one step
  assertEquals(history.redo(), { name: "hey" });

  // A pause past the window starts a fresh burst...
  history.record({ name: "hey there" }, { kind: "typing", field: "name", at: 1000 });
  // ...and typing in a DIFFERENT field breaks the burst too.
  history.record({ name: "hey there!" }, { kind: "typing", field: "other", at: 1050 });
  assertEquals(history.undo(), { name: "hey there" });
  assertEquals(history.undo(), { name: "hey" });
});

Deno.test("paste and structural edits are atomic and break bursts", () => {
  const history = createFormCheckpointHistory({ body: "", rows: 1 });
  history.record({ body: "a", rows: 1 }, { kind: "typing", field: "body", at: 0 });
  history.record({ body: "a<pasted>", rows: 1 }, { kind: "paste", field: "body", at: 50 });
  history.record({ body: "a<pasted>b", rows: 1 }, { kind: "typing", field: "body", at: 100 });
  history.record({ body: "a<pasted>b", rows: 2 }, { kind: "structural", at: 150 });

  // Four distinct steps: typing burst, paste, typing burst, structural.
  assertEquals(history.undo(), { body: "a<pasted>b", rows: 1 });
  assertEquals(history.undo(), { body: "a<pasted>", rows: 1 });
  assertEquals(history.undo(), { body: "a", rows: 1 });
  assertEquals(history.undo(), { body: "", rows: 1 });
  assertEquals(history.undo(), undefined);
});

Deno.test("new edits truncate the redo tail", () => {
  const history = createFormCheckpointHistory("v0");
  history.record("v1", { kind: "paste", at: 0 });
  history.record("v2", { kind: "paste", at: 10 });
  history.undo();
  assertEquals(history.value, "v1");
  history.record("v1-alt", { kind: "typing", field: "x", at: 20 });
  assertEquals(history.redo(), undefined); // the old future is gone (linear)
  assertEquals(history.undo(), "v1");
});
