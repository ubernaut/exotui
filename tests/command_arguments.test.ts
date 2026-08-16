// Copyright 2023 Im-Beast. MIT license.

// AUT-002: JSON-Schema command arguments — prompts render through the form
// registry and validated output is assignable because the prompt validator
// IS the command's input gate.

import { assert, assertEquals } from "./deps.ts";
import { createSchemaCommandBinder, createTypedCommandRegistry } from "../mod.ts";

const SCHEMA = {
  type: "object",
  required: ["branch"],
  properties: {
    branch: { type: "string", minLength: 1, title: "Branch" },
    force: { type: "boolean" },
    depth: { type: "integer", minimum: 1, maximum: 100 },
  },
} as const;

function fixture() {
  const registry = createTypedCommandRegistry();
  const binder = createSchemaCommandBinder(registry);
  binder.register<{ branch: string; force?: boolean; depth?: number }, string>({
    id: "git.clone",
    title: "Clone",
    argumentSchema: SCHEMA,
    run: (input) => `cloned ${input.branch}${input.force ? " --force" : ""}`,
  });
  return { registry, binder };
}

Deno.test("prompts render fields and validate with the command's own gate", async () => {
  const { registry, binder } = fixture();
  const prompt = binder.prompt("git.clone")!;
  assertEquals(prompt.fields.map((field) => `${field.path}:${field.widget}${field.required ? "!" : ""}`), [
    "branch:input!",
    "force:checkbox",
    "depth:number-input",
  ]);

  const invalid = prompt.validate({ depth: 500 });
  assertEquals(invalid.valid, false);
  assertEquals(invalid.errors.map((error) => error.path).sort(), ["branch", "depth"]);

  // A submission the prompt validated is assignable to the command input:
  // the registry accepts it because both share one validator.
  const values = { branch: "main", depth: 1 };
  assert(prompt.validate(values).valid);
  assertEquals(await registry.invoke("git.clone", values), { status: "succeeded", result: "cloned main" });
});

Deno.test("headless callers face the identical validator and rejections", async () => {
  const { registry, binder } = fixture();
  const headless = await registry.invoke("git.clone", { depth: 500 });
  assert(headless.status === "rejected");
  assert(headless.reason.includes("branch") && headless.reason.includes("depth"));

  // Overridable prompt widgets; unknown commands prompt as undefined.
  const custom = binder.prompt("git.clone", {
    resolveWidget: (schema) => schema["type"] === "boolean" ? "toggle" : undefined,
  });
  assertEquals(custom!.fields[1]!.widget, "toggle");
  assertEquals(binder.prompt("missing"), undefined);
});
