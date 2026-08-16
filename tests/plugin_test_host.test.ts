// Copyright 2023 Im-Beast. MIT license.

// PLG-010: plugin authors can verify install-to-dispose with zero
// ambient Deno permissions — the host is pure in-memory fakes.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { createContributionProxy, PluginManifestError } from "../mod.ts";
import { createPluginTestHost } from "../mod.testing.ts";

const MANIFEST = JSON.stringify({
  schemaVersion: 1,
  id: "sample",
  version: "1.0.0",
  hostApi: "^1.0.0",
  entrypoints: { main: "mod.ts" },
  contributions: { commands: ["sample.run"] },
});

const PLUGIN = {
  id: "sample",
  contributions: [
    { kind: "command", name: "sample.run", value: 1 },
    { kind: "slot", name: "status", value: 2 },
  ],
};

Deno.test("manifest contract tests and fake capabilities work headlessly", () => {
  const host = createPluginTestHost({
    manifestJson: MANIFEST,
    capabilities: { commands: { register: (id: string) => `fake:${id}` } },
  });
  assertEquals(host.manifest().id, "sample");

  const install = host.broker().install({
    id: "sample",
    capabilities: ["commands"],
    install(context) {
      const commands = context["commands"] as { register(id: string): string };
      assertEquals(commands.register("sample.run"), "fake:sample.run");
    },
  });
  assert(install.ok);

  const broken = createPluginTestHost({ manifestJson: '{"schemaVersion": 7}' });
  assertThrows(() => broken.manifest(), PluginManifestError);
});

Deno.test("the full lifecycle arc completes and disposes", () => {
  const host = createPluginTestHost({ manifestJson: MANIFEST });
  const report = host.runLifecycle(PLUGIN);
  assertEquals(report.phases.map((phase) => `${phase.phase}:${phase.result.ok}`), [
    "install:true",
    "enable:true",
    "disable:true",
    "uninstall:true",
  ]);
  assert(report.fullyDisposed);
  assert(report.rollbackClean);
});

Deno.test("fault injection at every phase rolls back cleanly and halts the arc", () => {
  for (const faultPhase of ["install", "enable", "disable", "uninstall"] as const) {
    const host = createPluginTestHost({ manifestJson: MANIFEST });
    const report = host.runLifecycle(PLUGIN, { faultPhase });
    const faulted = report.phases.find((phase) => phase.phase === faultPhase)!;
    assert(!faulted.result.ok, `${faultPhase} should have faulted`);
    assert(report.rollbackClean, `${faultPhase} rollback left residue`);
    assert(!report.fullyDisposed);
    assertEquals(report.phases[report.phases.length - 1]!.phase, faultPhase); // arc halted
  }
});

Deno.test("scripted transports drive RPC assertions including failures", async () => {
  const host = createPluginTestHost({ manifestJson: MANIFEST });
  const scripted = host.scriptedTransport();
  scripted.reply("command:sample.run", { status: "done" });
  scripted.fail("command:sample.crash", "backend exploded");

  const proxy = createContributionProxy<null, { status: string }>({
    contribution: { kind: "command", name: "sample.run" },
    transport: scripted.transport,
    validateReply: (reply) => typeof (reply as { status?: unknown })?.status === "string" ? undefined : "bad shape",
  });
  assertEquals(await proxy.invoke(null), { status: "done" });

  const crashing = createContributionProxy<null, never>({
    contribution: { kind: "command", name: "sample.crash" },
    transport: scripted.transport,
    validateReply: () => undefined,
  });
  let failed = false;
  try {
    await crashing.invoke(null);
  } catch {
    failed = true;
  }
  assert(failed);
  assertEquals(scripted.calls().map((call) => call.method), ["command:sample.run", "command:sample.crash"]);
});

Deno.test("the host module itself touches no Deno API (zero-permission contract)", async () => {
  const source = await Deno.readTextFile(new URL("../src/testing/plugin_test_host.ts", import.meta.url));
  // The word only appears in comments about the contract; no API usage.
  assert(!/\bDeno\.\w+\(/.test(source), "plugin_test_host.ts must not call Deno APIs");
});
