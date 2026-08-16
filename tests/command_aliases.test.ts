// Copyright 2023 Im-Beast. MIT license.

// AUT-010: aliases reference command ids with partial arguments; renamed
// or removed targets produce migration diagnostics and never execute a
// different command.

import { assert, assertEquals } from "./deps.ts";
import { createCommandAliasStore, createTypedCommandRegistry } from "../mod.ts";

Deno.test("aliases merge partial arguments and run through the registry gates", async () => {
  const registry = createTypedCommandRegistry();
  registry.register<{ path: string; recursive?: boolean }, string>({
    id: "fs.list",
    validateInput: (input) => typeof (input as { path?: unknown })?.path === "string" ? undefined : "path required",
    run: (input) => `${input.path}${input.recursive ? " -R" : ""}`,
  });
  const aliases = createCommandAliasStore(registry);
  assertEquals(aliases.define({ name: "lr", commandId: "fs.list", partialArgs: { recursive: true } }), { ok: true });
  assertEquals(aliases.define({ name: "bad", commandId: "nope" }).ok, false);

  assertEquals(await aliases.invoke("lr", { path: "/src" }), { status: "succeeded", result: "/src -R" });
  // Caller args win over the partial; registry gates still apply.
  assertEquals(await aliases.invoke("lr", { path: "/x", recursive: false }), { status: "succeeded", result: "/x" });
  assertEquals((await aliases.invoke("lr", {})).status, "rejected"); // gate fired
});

Deno.test("removed and renamed targets fail closed with migration diagnostics", async () => {
  const registry = createTypedCommandRegistry();
  const dispose = registry.register({ id: "old.cmd", run: () => "old" });
  registry.register({ id: "new.cmd", run: () => "new" });
  const aliases = createCommandAliasStore(registry);
  aliases.define({ name: "mine", commandId: "old.cmd", favorite: true });

  dispose(); // the command goes away
  const removed = await aliases.invoke("mine");
  assert(removed.status === "stale-alias" && removed.diagnostic.kind === "removed");

  aliases.declareRename("old.cmd", "new.cmd");
  const renamed = await aliases.invoke("mine");
  assert(renamed.status === "stale-alias" && renamed.diagnostic.kind === "renamed");
  assertEquals(renamed.status === "stale-alias" ? renamed.diagnostic.renamedTo : "", "new.cmd");
  // Never silently a different command: only an explicit migration runs it.
  assert(aliases.migrate("mine"));
  assertEquals(await aliases.invoke("mine"), { status: "succeeded", result: "new" });

  assertEquals(aliases.list()[0]!.name, "mine"); // favorites first
});
