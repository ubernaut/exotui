// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { type RuntimeChildProcess, runtimeHost } from "@ubernaut/exotui/runtime";
import { verifyNativeJobControl } from "./fixtures/native_job_control.ts";
import {
  connectExomuxWebSocket,
  connectOrLaunchExomuxLocalHost,
  type ExomuxWebSocketClient,
  readExomuxHostDescriptor,
} from "../client.ts";

Deno.test({
  name: "Exomux native daemon retains real PTY output, input and geometry across detach and reattach",
  ignore: runtimeHost.build.os !== "linux",
  async fn() {
    const directory = await runtimeHost.makeTempDir({ prefix: "exomux-native-lifecycle-" });
    const descriptorPath = `${directory}/state/host.json`;
    const configRoot = `${directory}/config`;
    const previousConfig = runtimeHost.env.get("XDG_CONFIG_HOME");
    let first: ExomuxWebSocketClient | undefined;
    let second: ExomuxWebSocketClient | undefined;
    runtimeHost.env.set("XDG_CONFIG_HOME", configRoot);
    try {
      const launched = await connectOrLaunchExomuxLocalHost({
        stateDirectory: `${directory}/state`,
        descriptorPath,
        timeoutMs: 10_000,
        requestTimeoutMs: 3_000,
      });
      assertEquals(launched.launched, true);
      first = launched.client;
      const spawned = await first.spawn({
        command: "/bin/sh",
        args: [
          "-c",
          "test -t 0 || exit 42; stty -echo; printf 'NATIVE_READY\\n'; while IFS= read -r line; do printf 'INPUT:%s\\n' \"$line\"; stty size; done",
        ],
        columns: 81,
        rows: 27,
      });
      let firstOutput = "";
      const attached = await first.attach(spawned.id, {
        sinceSequence: 0,
        onOutput: (frame) => firstOutput += decode(frame.data),
      });
      for (const frame of attached.replay) firstOutput += decode(frame.data);
      await waitFor(() => firstOutput.includes("NATIVE_READY"));
      await first.input(spawned.id, "before-detach\n");
      await waitFor(() => firstOutput.includes("INPUT:before-detach") && firstOutput.includes("27 81"));
      await first.resize(spawned.id, 103, 33);
      await first.input(spawned.id, "resized\n");
      await waitFor(() => firstOutput.includes("INPUT:resized") && firstOutput.includes("33 103"));
      await first.detach(spawned.id);
      await first.dispose();
      first = undefined;

      const descriptor = await readExomuxHostDescriptor(descriptorPath);
      assert(descriptor, "disposing the client must leave the daemon descriptor intact");
      second = await connectExomuxWebSocket({
        url: descriptor.url,
        authToken: descriptor.token,
        flowControlledReplay: descriptor.flowControlledReplay,
        requestTimeoutMs: 3_000,
      });
      const inventory = await second.list();
      assertEquals(inventory.map((session) => session.id), [spawned.id]);
      let secondOutput = "";
      const reattached = await second.attach(spawned.id, {
        sinceSequence: 0,
        onOutput: (frame) => secondOutput += decode(frame.data),
      });
      const scrollback = reattached.replay.map((frame) => decode(frame.data)).join("");
      assertStringIncludes(scrollback, "NATIVE_READY");
      assertStringIncludes(scrollback, "INPUT:before-detach");
      assertStringIncludes(scrollback, "INPUT:resized");
      assertStringIncludes(scrollback, "33 103");
      await second.input(spawned.id, "after-reattach\n");
      await waitFor(() => secondOutput.includes("INPUT:after-reattach"));
      await second.kill(spawned.id);
      assertEquals(await second.list(), []);
      await second.shutdownHost();
      await second.dispose();
      second = undefined;
      await waitFor(async () => await readExomuxHostDescriptor(descriptorPath) === undefined);
    } finally {
      await first?.dispose();
      await second?.dispose();
      const descriptor = await readExomuxHostDescriptor(descriptorPath).catch(() => undefined);
      if (descriptor) {
        const cleanup = await connectExomuxWebSocket({
          url: descriptor.url,
          authToken: descriptor.token,
          requestTimeoutMs: 1_000,
        }).catch(() => undefined);
        if (cleanup) {
          try {
            await cleanup.shutdownHost();
          } catch {
            // Only terminate the daemon identified by this test's private state.
            try {
              runtimeHost.kill(descriptor.pid, "SIGTERM");
            } catch { /* already stopped */ }
          } finally {
            await cleanup.dispose();
          }
        } else {
          // This PID came only from this test's freshly created private descriptor.
          try {
            runtimeHost.kill(descriptor.pid, "SIGTERM");
          } catch { /* already stopped */ }
        }
      }
      if (previousConfig === undefined) runtimeHost.env.delete("XDG_CONFIG_HOME");
      else runtimeHost.env.set("XDG_CONFIG_HOME", previousConfig);
      await runtimeHost.remove(directory, { recursive: true });
    }
  },
});

Deno.test({
  name: "Exomux native daemon gives the shell a controlling terminal, resize signals, Ctrl-Z/fg and Ctrl-C",
  ignore: runtimeHost.build.os !== "linux",
  async fn() {
    const directory = await runtimeHost.makeTempDir({ prefix: "exomux-native-job-control-" });
    const descriptorPath = `${directory}/host.json`;
    const previousConfig = runtimeHost.env.get("XDG_CONFIG_HOME");
    runtimeHost.env.set("XDG_CONFIG_HOME", `${directory}/config`);
    const executable = runtimeHost.env.get("EXOMUX_TEST_EXECUTABLE");
    let daemon: RuntimeChildProcess | undefined;
    let client: ExomuxWebSocketClient | undefined;
    try {
      const connection = await connectOrLaunchExomuxLocalHost({
        stateDirectory: directory,
        descriptorPath,
        timeoutMs: 10_000,
        requestTimeoutMs: 3_000,
        ...(executable
          ? {
            spawnDaemon({ descriptorPath, authToken }) {
              daemon = new runtimeHost.Command(executable, {
                args: ["--daemon", `--descriptor=${descriptorPath}`],
                env: { EXOMUX_TOKEN: authToken },
                stdin: "null",
                stdout: "null",
                stderr: "inherit",
              }).spawn();
            },
          }
          : {}),
      });
      client = connection.client;
      assertEquals(await verifyNativeJobControl(client), {
        controllingTerminal: true,
        resizeSignal: true,
        suspendResume: true,
        interrupt: true,
      });
      assertEquals(await client.list(), []);
      await client.shutdownHost();
      await client.dispose();
      client = undefined;
      await waitFor(async () => await readExomuxHostDescriptor(descriptorPath) === undefined);
    } finally {
      if (client) {
        await client.shutdownHost().catch(() => undefined);
        await client.dispose();
      }
      const descriptor = await readExomuxHostDescriptor(descriptorPath).catch(() => undefined);
      if (descriptor) {
        try {
          runtimeHost.kill(descriptor.pid, "SIGKILL");
        } catch { /* already stopped */ }
      }
      if (daemon) await daemon.status;
      if (previousConfig === undefined) runtimeHost.env.delete("XDG_CONFIG_HOME");
      else runtimeHost.env.set("XDG_CONFIG_HOME", previousConfig);
      await runtimeHost.remove(directory, { recursive: true });
    }
  },
});

function decode(data: string | Uint8Array): string {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for native daemon/PTY behavior.");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}
