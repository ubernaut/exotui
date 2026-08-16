// Copyright 2023 Im-Beast. MIT license.

// WID-003: quoted parsing, duplicate policy, per-token validation,
// grapheme-safe drafting, reordering, stale-proof suggestions — and every
// mutation undoable.

import { assert, assertEquals } from "./deps.ts";
import { createTokenEditor } from "../mod.ts";

Deno.test("typing parses separators outside quotes and validates per token", () => {
  const editor = createTokenEditor({
    validate: (text) => text.length > 10 ? "too long" : undefined,
  });
  editor.type('ny,"New York, NY",boston');
  editor.commitDraft();
  const tokens = editor.tokens();
  assertEquals(tokens.map((token) => token.text), ["ny", "New York, NY", "boston"]);
  assertEquals(tokens[0]!.error, undefined);
  assertEquals(tokens[1]!.error, "too long"); // quoted token still validated
});

Deno.test("duplicate policies reject with error, ignore silently, or allow", () => {
  const reject = createTokenEditor({ duplicates: "reject" });
  reject.add("a");
  const rejected = reject.add("a");
  assertEquals(rejected?.error, "duplicate token");

  const ignore = createTokenEditor({ duplicates: "ignore" });
  ignore.add("a");
  assertEquals(ignore.add("a"), undefined);
  assertEquals(ignore.tokens().length, 1);

  const allow = createTokenEditor({ duplicates: "allow" });
  allow.add("a");
  assert(allow.add("a"));
  assertEquals(allow.tokens().length, 2);
});

Deno.test("draft editing is grapheme-safe for flags and ZWJ families", () => {
  const editor = createTokenEditor();
  editor.type("hi\u{1F1F5}\u{1F1F1}"); // "hi" + Polish flag
  assertEquals(editor.draftGraphemeCount(), 3);
  editor.backspace(); // removes the WHOLE flag, not one regional indicator
  assertEquals(editor.draft(), "hi");
  editor.type("\u{1F469}\u{200D}\u{1F469}\u{200D}\u{1F467}"); // family ZWJ
  assertEquals(editor.draftGraphemeCount(), 3);
  editor.backspace();
  assertEquals(editor.draft(), "hi");
});

Deno.test("every mutation is one undoable journal entry, redo replays it", () => {
  const editor = createTokenEditor({ duplicates: "allow" });
  const a = editor.add("alpha")!;
  const b = editor.add("beta")!;
  editor.add("gamma");
  editor.move(b.id, 0); // beta alpha gamma
  editor.edit(a.id, "ALPHA"); // beta ALPHA gamma
  editor.remove(b.id); // ALPHA gamma
  assertEquals(editor.tokens().map((token) => token.text), ["ALPHA", "gamma"]);

  assert(editor.undo()); // restore beta at index 0
  assertEquals(editor.tokens().map((token) => token.text), ["beta", "ALPHA", "gamma"]);
  assert(editor.undo()); // un-edit
  assertEquals(editor.tokens().map((token) => token.text), ["beta", "alpha", "gamma"]);
  assert(editor.undo()); // un-move
  assertEquals(editor.tokens().map((token) => token.text), ["alpha", "beta", "gamma"]);
  assert(editor.undo() && editor.undo() && editor.undo()); // un-add all
  assertEquals(editor.tokens(), []);
  assert(!editor.undo());

  assert(editor.redo() && editor.redo() && editor.redo() && editor.redo() && editor.redo() && editor.redo());
  assertEquals(editor.tokens().map((token) => token.text), ["ALPHA", "gamma"]);
});

Deno.test("stale suggestion responses never clobber newer ones", async () => {
  const editor = createTokenEditor();
  const resolvers: Array<(items: string[]) => void> = [];
  const fetch = (_query: string) => new Promise<readonly string[]>((resolve) => resolvers.push(resolve));

  editor.type("ne");
  const first = editor.requestSuggestions(fetch);
  editor.type("w");
  const second = editor.requestSuggestions(fetch);

  resolvers[1]!(["new york", "new haven"]); // newer resolves first
  await second;
  assertEquals(editor.suggestions().query, "new");
  resolvers[0]!(["nebraska"]); // stale response arrives late
  await first;
  assertEquals(editor.suggestions().query, "new"); // unchanged
  assertEquals(editor.suggestions().items, ["new york", "new haven"]);
});
