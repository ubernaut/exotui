// Copyright 2023 Im-Beast. MIT license.

// AUT-006: macros record only allowlisted, gate-validated command steps;
// playback previews permissions and stops atomically at the first failure.

import { assert, assertEquals } from "./deps.ts";
import { createCommandMacroRecorder, createTypedCommandRegistry } from "../mod.ts";

function fixture() {
  const registry = createTypedCommandRegistry();
  const log: string[] = [];
  registry.register<{ path: string }, string>({
    id: "fs.touch",
    validateInput: (input) => typeof (input as { path?: unknown })?.path === "string" ? undefined : "path required",
    run: (input) => {
      log.push(`touch ${input.path}`);
      return input.path;
    },
  });
  registry.register({ id: "app.secret", run: () => "hidden" }); // not allowlisted
  let failNext = false;
  registry.register({
    id: "net.sync",
    run: () => {
      log.push("sync");
      if (failNext) throw new Error("network down");
      return "synced";
    },
  });
  const recorder = createCommandMacroRecorder(registry, {
    allowlist: ["fs.touch", "net.sync"],
    permissions: { "fs.touch": ["write:fs"], "net.sync": ["net:outbound"] },
  });
  return { registry, recorder, log, setFailNext: (value: boolean) => failNext = value };
}

Deno.test("recording refuses non-allowlisted ids and gate-rejected args", async () => {
  const { recorder, log } = fixture();
  recorder.startRecording("setup");
  assertEquals((await recorder.recordStep("app.secret", {})).ok, false); // allowlist
  assertEquals((await recorder.recordStep("fs.touch", { path: 42 })).ok, false); // gate
  assert((await recorder.recordStep("fs.touch", { path: "/tmp/a" })).ok);
  assert((await recorder.recordStep("net.sync", {})).ok);
  const macro = recorder.stopRecording()!;
  assertEquals(macro.steps.map((step) => step.commandId), ["fs.touch", "net.sync"]);
  assertEquals(log, ["touch /tmp/a", "sync"]); // live recording executed them
});

Deno.test("playback previews the permission union and stops atomically on failure", async () => {
  const { recorder, log, setFailNext } = fixture();
  recorder.startRecording("setup");
  await recorder.recordStep("fs.touch", { path: "/tmp/a" });
  await recorder.recordStep("net.sync", {});
  await recorder.recordStep("fs.touch", { path: "/tmp/b" });
  recorder.stopRecording();
  log.length = 0;

  assertEquals(recorder.preview("setup"), {
    steps: ["fs.touch", "net.sync", "fs.touch"],
    permissions: ["net:outbound", "write:fs"],
  });

  setFailNext(true); // the sync step will fail during playback
  const result = await recorder.play("setup");
  assertEquals(result?.status, "stopped");
  assertEquals(result?.ran.map((entry) => `${entry.commandId}:${entry.outcome.status}`), [
    "fs.touch:succeeded",
    "net.sync:failed",
  ]);
  assertEquals(result?.skipped, ["fs.touch"]); // the later step never started
  assertEquals(log, ["touch /tmp/a", "sync"]);

  setFailNext(false);
  const clean = await recorder.play("setup");
  assertEquals(clean?.status, "completed");
  assertEquals(recorder.preview("missing"), undefined);
});
