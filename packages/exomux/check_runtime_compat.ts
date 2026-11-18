// Copyright 2026 ubernaut. MIT license.
// Explicit compatibility check requires both Bun and Deno installed.
import { type RuntimeChildProcess, runtimeHost } from "@ubernaut/exotui/runtime";
import { connectExomuxWebSocket, connectOrLaunchExomuxLocalHost, readExomuxHostDescriptor } from "./client.ts";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL(".", import.meta.url));
const compiledExecutable = runtimeHost.args[0];
const combinations: Array<readonly [string, "bun" | "deno"]> = [["deno", "bun"], ["bun", "deno"]];
if (compiledExecutable) combinations.push([compiledExecutable, "bun"], [compiledExecutable, "deno"]);
for (const [daemonRuntime, clientRuntime] of combinations) {
  const directory = await runtimeHost.makeTempDir({ prefix: "exomux-cross-runtime-" });
  let daemon: RuntimeChildProcess | undefined;
  const descriptorPath = `${directory}/host.json`;
  try {
    const connection = await connectOrLaunchExomuxLocalHost({
      stateDirectory: directory,
      descriptorPath,
      timeoutMs: 20_000,
      requestTimeoutMs: 5_000,
      spawnDaemon({ descriptorPath, authToken, mainModuleUrl }) {
        daemon = new runtimeHost.Command(daemonRuntime, {
          args: [
            ...(daemonRuntime === compiledExecutable ? [] : [
              "run",
              ...(daemonRuntime === "deno" ? ["-A", "--unstable-webgpu"] : []),
              fileURLToPath(mainModuleUrl),
            ]),
            "--daemon",
            `--descriptor=${descriptorPath}`,
          ],
          cwd: packageDirectory,
          env: { EXOMUX_TOKEN: authToken, XDG_CONFIG_HOME: `${directory}/config`, XDG_STATE_HOME: directory },
          stdin: "null",
          stdout: "null",
          stderr: "inherit",
        }).spawn();
      },
    });
    await connection.client.dispose();
    const result = await new runtimeHost.Command(clientRuntime, {
      args: [
        "run",
        ...(clientRuntime === "deno" ? ["-A", "--unstable-webgpu"] : []),
        "./tests/fixtures/runtime_client.ts",
        descriptorPath,
      ],
      cwd: packageDirectory,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!result.success) {
      throw new Error(
        `${clientRuntime} client against ${daemonRuntime} daemon failed: ${new TextDecoder().decode(result.stderr)}`,
      );
    }
    console.log(JSON.stringify({ daemon: daemonRuntime, result: JSON.parse(new TextDecoder().decode(result.stdout)) }));
  } finally {
    const descriptor = await readExomuxHostDescriptor(descriptorPath).catch(() => undefined);
    if (descriptor) {
      const cleanup = await connectExomuxWebSocket({
        url: descriptor.url,
        authToken: descriptor.token,
        requestTimeoutMs: 2_000,
      }).catch(() => undefined);
      if (cleanup) {
        try {
          await cleanup.shutdownHost();
        } catch {
          // The owned child is terminated below if graceful shutdown failed.
        } finally {
          await cleanup.dispose();
        }
      }
    }
    if (daemon) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const completed = await Promise.race([
        daemon.status.then(() => true),
        new Promise<boolean>((resolve) => timer = setTimeout(() => resolve(false), 3_000)),
      ]).finally(() => clearTimeout(timer));
      if (!completed) {
        try {
          daemon.kill("SIGKILL");
        } catch { /* already exited */ }
        await daemon.status;
      }
    }
    await runtimeHost.remove(directory, { recursive: true });
  }
}
