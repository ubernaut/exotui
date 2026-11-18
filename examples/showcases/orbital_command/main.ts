import type { RuntimeSignal } from "../../../src/runtime/host.ts";
import { runtimeHost } from "../../../src/runtime/host.ts";
// Copyright 2023 Im-Beast. MIT license.

import { DiagnosticsCollector } from "../../../mod.ts";
import { probeCompatibleWebGPUDevice } from "../../../src/three_ascii/webgpu_compat.ts";
import { createShowcaseTerminalStore } from "../../../src/showcase/mod.ts";
import { createOrbitalCommandTerminalApp, type OrbitalCommandRuntime } from "./app.ts";
import { createOrbitalCommandController } from "./controller.ts";

/** Explicit terminal-launch persistence options. */
export interface OrbitalCommandLaunchOptions {
  readonly persist?: boolean;
  readonly sessionPath?: string;
}

/** Parses the deliberately small Orbital Command CLI surface. */
export function parseOrbitalCommandArgs(args: readonly string[]): OrbitalCommandLaunchOptions {
  let persist = false;
  let sessionPath: string | undefined;
  for (const argument of args) {
    if (argument === "--persist") persist = true;
    else if (argument === "--memory") {
      persist = false;
      sessionPath = undefined;
    } else if (argument.startsWith("--state-file=")) {
      sessionPath = argument.slice("--state-file=".length);
      persist = true;
    } else {
      throw new TypeError(`Unknown Orbital Command option: ${argument}`);
    }
  }
  return Object.freeze({ persist, ...(sessionPath ? { sessionPath } : {}) });
}

/** Launches Orbital Command with explicit durable-state selection. */
export async function runOrbitalCommandShowcase(options: OrbitalCommandLaunchOptions = {}): Promise<void> {
  const diagnostics = new DiagnosticsCollector();
  const storage = await createShowcaseTerminalStore({
    enabled: options.persist === true,
    path: options.persist ? options.sessionPath ?? defaultOrbitalSessionPath() : undefined,
    diagnostics,
  });
  const controller = createOrbitalCommandController({
    store: storage.store,
    diagnostics,
    persistenceDebounceMs: storage.inspect().durable ? 250 : 0,
  });
  await controller.kernel.ready;
  // ORBIT-002: the 3D observatory needs WebGPU; without it the app keeps
  // the full catalog/telemetry console with the 2D map and says so.
  const threeAscii = await probeCompatibleWebGPUDevice().catch(() => false);
  if (!threeAscii) {
    diagnostics.report({
      source: "orbital-launcher",
      code: "webgpu-unavailable",
      severity: "warning",
      message: "WebGPU is unavailable; the observatory runs the 2D text fallback.",
    });
  }
  const runtime = createOrbitalCommandTerminalApp({ controller, threeAscii });
  bindAwaitedShutdown(runtime);
  runtime.start();
}

function defaultOrbitalSessionPath(): string | undefined {
  try {
    const root = runtimeHost.build.os === "windows"
      ? runtimeHost.env.get("LOCALAPPDATA") ?? runtimeHost.env.get("USERPROFILE")
      : runtimeHost.env.get("XDG_STATE_HOME") ??
        (runtimeHost.env.get("HOME") ? `${runtimeHost.env.get("HOME")}/.local/state` : undefined);
    return root ? `${root.replace(/[\\/]+$/g, "")}/deno-tui/orbital-command-session.json` : undefined;
  } catch {
    return undefined;
  }
}

function bindAwaitedShutdown(runtime: OrbitalCommandRuntime): void {
  const signals: RuntimeSignal[] = runtimeHost.build.os === "windows" ? ["SIGINT", "SIGBREAK"] : ["SIGINT", "SIGTERM"];
  let shutdown: Promise<void> | undefined;
  const removeSignals = () => {
    for (const signal of signals) {
      try {
        runtimeHost.removeSignalListener(signal, requestShutdown);
      } catch { /* listener was not installed or was already removed */ }
    }
  };
  const requestShutdown = () => {
    shutdown ??= (async () => {
      removeSignals();
      await runtime.destroy();
      runtimeHost.exit(0);
    })();
    void shutdown;
  };
  for (const signal of signals) runtimeHost.addSignalListener(signal, requestShutdown);
  runtime.app.tui.on("destroy", requestShutdown);
}

if (import.meta.main) await runOrbitalCommandShowcase(parseOrbitalCommandArgs(runtimeHost.args));
