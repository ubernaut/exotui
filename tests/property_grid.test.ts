// Copyright 2023 Im-Beast. MIT license.

// WID-005: registry-driven editors, grouped rows, reset-to-inherited,
// validation, provenance — one edit, one transaction.

import { assert, assertEquals } from "./deps.ts";
import { createPropertyEditorRegistry, createPropertyGridController } from "../mod.ts";

function grid() {
  const registry = createPropertyEditorRegistry();
  registry.register({
    type: "number",
    parse: (raw) => {
      const value = Number(raw);
      if (Number.isNaN(value)) throw new Error("not a number");
      return value;
    },
    validate: (value) => (value as number) < 0 ? "must be non-negative" : undefined,
  });
  registry.register({ type: "string" });
  const controller = createPropertyGridController({
    registry,
    properties: [
      { key: "width", group: "Layout", type: "number" },
      { key: "height", group: "Layout", type: "number", validate: (v) => (v as number) > 100 ? "too tall" : undefined },
      { key: "title", group: "Text", type: "string", label: "Window title" },
      { key: "shader", group: "Effects", type: "glsl" }, // no editor registered
    ],
    inherited: { width: 80, height: 24, title: "untitled", shader: "passthrough" },
  });
  return controller;
}

Deno.test("rows group in declaration order and editors are registry-driven", () => {
  const controller = grid();
  const groups = controller.groups();
  assertEquals(groups.map((group) => group.group), ["Layout", "Text", "Effects"]);
  assertEquals(groups[0]!.rows.map((row) => row.key), ["width", "height"]);
  assertEquals(controller.row("title")!.label, "Window title");
  assertEquals(controller.row("width")!.editor, "number");
  // Unregistered type: read-only with a diagnostic, never a guessed editor.
  const shader = controller.row("shader")!;
  assertEquals(shader.editor, undefined);
  assert(shader.diagnostic!.includes('type "glsl"'));
  assertEquals(controller.edit("shader", "x", { actor: "user", at: 1 }).ok, false);
});

Deno.test("edits parse and validate through the registry and property rules", () => {
  const controller = grid();
  const parsed = controller.edit("width", "120", { actor: "user", at: 10 });
  assert(parsed.ok);
  assertEquals(controller.row("width")!.effective, 120); // parsed to number
  assertEquals(controller.row("width")!.source, "local");

  assertEquals(controller.edit("width", "abc", { actor: "user", at: 11 }).ok, false); // parse
  const negative = controller.edit("width", "-5", { actor: "user", at: 12 });
  assert(!negative.ok && negative.error === "must be non-negative"); // editor rule
  const tall = controller.edit("height", 200, { actor: "user", at: 13 });
  assert(!tall.ok && tall.error === "too tall"); // property rule
  // Rejected edits leave no transaction behind.
  assertEquals(controller.history().length, 1);
});

Deno.test("reset-to-inherited and provenance ride one transaction each", () => {
  const controller = grid();
  controller.edit("title", "exomux", { actor: "cos", at: 100 });
  const reset = controller.resetToInherited("title", { actor: "cos", at: 200 });
  assert(reset.ok);
  assertEquals(controller.row("title")!.source, "inherited");
  assertEquals(controller.row("title")!.effective, "untitled");
  assertEquals(controller.resetToInherited("title", { actor: "cos", at: 201 }).ok, false); // already inherited

  const history = controller.history();
  assertEquals(history.length, 2);
  assertEquals(history[0]!.kind, "edit");
  assertEquals(history[0]!.actor, "cos");
  assertEquals(history[0]!.at, 100);
  assertEquals(history[1]!, {
    key: "title",
    kind: "reset",
    before: { value: "exomux", source: "local" },
    after: { value: "untitled", source: "inherited" },
    actor: "cos",
    at: 200,
  });
});

Deno.test("undo/redo walk whole transactions including inheritance state", () => {
  const controller = grid();
  controller.edit("width", 100, { actor: "a", at: 1 });
  controller.edit("width", 110, { actor: "a", at: 2 });
  controller.resetToInherited("width", { actor: "a", at: 3 });
  assertEquals(controller.row("width")!.source, "inherited");

  assert(controller.undo()); // back to local 110
  assertEquals(controller.row("width")!, { ...controller.row("width")!, effective: 110, source: "local" });
  assert(controller.undo()); // local 100
  assertEquals(controller.row("width")!.effective, 100);
  assert(controller.undo()); // inherited 80
  assertEquals(controller.row("width")!.source, "inherited");
  assertEquals(controller.row("width")!.effective, 80);
  assert(!controller.undo());

  assert(controller.redo() && controller.redo() && controller.redo());
  assertEquals(controller.row("width")!.source, "inherited"); // reset replayed
});
