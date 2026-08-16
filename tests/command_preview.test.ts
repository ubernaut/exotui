// Copyright 2023 Im-Beast. MIT license.

// AUT-007: destructive commands cannot run from automation without preview
// acknowledgement bound to the exact input, or an explicit host override.

import { assert, assertEquals } from "./deps.ts";
import { createCommandPreviewGate, createTypedCommandRegistry } from "../mod.ts";

function fixture() {
  const registry = createTypedCommandRegistry();
  const gate = createCommandPreviewGate(registry);
  let deletions = 0;
  gate.register<{ path: string }, string>({
    id: "fs.delete",
    destructive: true,
    preview: (input) => ({ changes: [{ kind: "delete", target: input.path, detail: "recursive" }] }),
    run: (input) => {
      deletions += 1;
      return `deleted ${input.path}`;
    },
  });
  gate.register({ id: "app.refresh", run: () => "refreshed" });
  return { gate, registry, count: () => deletions };
}

Deno.test("preview returns the structured change set without mutating", async () => {
  const { gate, count } = fixture();
  const preview = await gate.preview("fs.delete", { path: "/tmp/x" });
  assertEquals(preview?.changeSet, { changes: [{ kind: "delete", target: "/tmp/x", detail: "recursive" }] });
  assert(preview!.acknowledgement.startsWith("ack-"));
  assertEquals(count(), 0); // dry-run only
  assertEquals(await gate.preview("app.refresh", {}), undefined); // no hook
});

Deno.test("destructive automation requires the matching acknowledgement", async () => {
  const { gate, count } = fixture();
  // No acknowledgement: refused before execution.
  assertEquals(await gate.invokeFromAutomation("fs.delete", { path: "/tmp/x" }), {
    status: "preview-required",
    id: "fs.delete",
  });
  assertEquals(count(), 0);

  // An acknowledgement for DIFFERENT input cannot authorize this one.
  const other = await gate.preview("fs.delete", { path: "/tmp/other" });
  assertEquals(
    (await gate.invokeFromAutomation("fs.delete", { path: "/tmp/x" }, { acknowledgement: other!.acknowledgement }))
      .status,
    "preview-required",
  );

  // The bound acknowledgement runs it.
  const preview = await gate.preview("fs.delete", { path: "/tmp/x" });
  const outcome = await gate.invokeFromAutomation("fs.delete", { path: "/tmp/x" }, {
    acknowledgement: preview!.acknowledgement,
  });
  assertEquals(outcome, { status: "succeeded", result: "deleted /tmp/x" });
  assertEquals(count(), 1);
});

Deno.test("host override and non-destructive commands pass; ordinary paths unaffected", async () => {
  const { gate, registry, count } = fixture();
  const overridden = await gate.invokeFromAutomation("fs.delete", { path: "/tmp/y" }, { hostOverride: true });
  assertEquals(overridden.status, "succeeded");
  assertEquals(count(), 1);

  assertEquals((await gate.invokeFromAutomation("app.refresh", {})).status, "succeeded");
  // Direct (non-automation) invocation stays the host's judgement call.
  assertEquals((await registry.invoke("fs.delete", { path: "/tmp/z" })).status, "succeeded");
});
