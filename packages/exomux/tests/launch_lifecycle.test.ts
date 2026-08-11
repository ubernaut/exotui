// Copyright 2023 Im-Beast. MIT license.

// End-to-end guard for the launcher's process lifecycle: a successfully
// attached interactive client must keep running. The render loop returns as
// soon as it is started and the process stays alive only through its own event
// listeners, so a stray `Deno.exit(0)` in the entrypoint would kill the
// workbench the instant it attached — the exact regression this reproduces.

import { assert } from "./deps.ts";

const MAIN_MODULE = new URL("../main.ts", import.meta.url).pathname;

/** Reads the child's PTY for a window, collecting decoded output. */
async function pumpFor(pty: { read(): { data: string; done: boolean } }, ms: number): Promise<
  { output: string; exited: boolean }
> {
  let output = "";
  let exited = false;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const { data, done } = pty.read();
    if (data) output += data;
    if (done) {
      exited = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return { output, exited };
}

Deno.test({
  name: "Exomux client stays alive after attaching instead of exiting immediately",
  ignore: Deno.build.os !== "linux",
  async fn() {
    let Pty:
      | (new (command: string, options: Record<string, unknown>) => {
        read(): { data: string; done: boolean };
        write(data: string): void;
        close(): void;
      })
      | undefined;
    try {
      ({ Pty } = await import("@sigma/pty-ffi"));
    } catch {
      return; // The optional PTY FFI is unavailable; skip rather than fail.
    }

    const stateDir = await Deno.makeTempDir({ prefix: "exomux-lifecycle-state-" });
    const configDir = await Deno.makeTempDir({ prefix: "exomux-lifecycle-config-" });
    let pty: InstanceType<NonNullable<typeof Pty>> | undefined;
    try {
      pty = new Pty("deno", {
        args: [
          "run",
          "-A",
          "--unstable-webgpu",
          MAIN_MODULE,
          "--memory",
          `--state-dir=${stateDir}`,
          `--config-dir=${configDir}`,
        ],
        cwd: new URL("..", import.meta.url).pathname,
        size: { rows: 30, cols: 100 },
        env: { ...Deno.env.toObject(), TERM: "xterm-256color" },
      });

      // A bare launch creates the default session and its host, then attaches.
      // Give it time to spawn the daemon and render, then confirm it is still
      // running — the bug exited within a second of the render loop starting.
      const startup = await pumpFor(pty, 6_000);
      assert(!startup.exited, "the client must not exit while it is starting up");
      assert(startup.output.length > 0, "the client should have rendered something");
      const settled = await pumpFor(pty, 4_000);
      assert(!settled.exited, "an attached client must stay alive, not exit on its own");
    } finally {
      try {
        pty?.close();
      } catch {
        // Best effort; the child is detached below regardless.
      }
      // The bare launch left a detached daemon; shut it down through the client.
      await shutdownDaemon(stateDir, configDir);
      await Deno.remove(stateDir, { recursive: true }).catch(() => undefined);
      await Deno.remove(configDir, { recursive: true }).catch(() => undefined);
    }
  },
});

/** Connects to the temp-state daemon and asks it to shut down, if one is live. */
async function shutdownDaemon(stateDir: string, configDir: string): Promise<void> {
  try {
    const { connectExomuxWebSocket, readExomuxHostDescriptor } = await import("../client.ts");
    const descriptor = await readExomuxHostDescriptor(`${stateDir}/host.json`).catch(() => undefined);
    if (!descriptor) return;
    const client = await connectExomuxWebSocket({
      url: descriptor.url,
      authToken: descriptor.token,
      requestTimeoutMs: 2_000,
      flowControlledReplay: descriptor.flowControlledReplay === true,
    });
    try {
      await client.shutdownHost();
    } finally {
      await client.dispose();
    }
  } catch {
    // Nothing live to clean up.
  }
  void configDir;
}
