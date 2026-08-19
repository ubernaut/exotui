// Copyright 2023 Im-Beast. MIT license.

import { DiagnosticsCollector } from "../../../mod.ts";
import { createShowcaseTerminalStore } from "../../../src/showcase/mod.ts";
import { createInkstoneTerminalApp, type InkstoneTerminalRuntime } from "./app.ts";
import { createInkstoneController } from "./controller.ts";

/** Explicit terminal-launch persistence options. */
export interface InkstoneShowcaseLaunchOptions {
  readonly persist?: boolean;
  readonly sessionPath?: string;
}

/** Parses the deliberately small Inkstone CLI surface without hidden I/O. */
export function parseInkstoneShowcaseArgs(args: readonly string[]): InkstoneShowcaseLaunchOptions {
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
      throw new TypeError(`Unknown Inkstone option: ${argument}`);
    }
  }
  return Object.freeze({ persist, ...(sessionPath ? { sessionPath } : {}) });
}

/** Launches Inkstone with explicit durable-state selection and awaited shutdown. */
export async function runInkstoneShowcase(
  options: InkstoneShowcaseLaunchOptions = {},
): Promise<void> {
  const diagnostics = new DiagnosticsCollector();
  const sessionPath = options.persist ? options.sessionPath ?? defaultInkstoneSessionPath() : undefined;
  const storage = await createShowcaseTerminalStore({
    enabled: options.persist === true,
    path: sessionPath,
    diagnostics,
  });
  const storageInspection = storage.inspect();
  if (storageInspection.durable) {
    diagnostics.report({
      source: "inkstone-launcher",
      code: "durable-session-ready",
      severity: "info",
      message: "Durable Inkstone session recovery is active.",
      context: { requiredPermissions: storage.permissionManifest.required.length },
    });
  }
  const controller = createInkstoneController({
    store: storage.store,
    diagnostics,
    storageMode: storageInspection.durable ? "durable" : "memory",
    persistenceDebounceMs: storageInspection.durable ? 150 : 0,
  });
  const runtime = await createInkstoneTerminalApp({ controller });
  bindAwaitedInkstoneShutdown(runtime);
  runtime.start();
}

function defaultInkstoneSessionPath(): string | undefined {
  try {
    const root = Deno.build.os === "windows"
      ? Deno.env.get("LOCALAPPDATA") ?? Deno.env.get("USERPROFILE")
      : Deno.env.get("XDG_STATE_HOME") ??
        (Deno.env.get("HOME") ? `${Deno.env.get("HOME")}/.local/state` : undefined);
    return root ? `${root.replace(/[\\/]+$/g, "")}/deno-tui/inkstone-session.json` : undefined;
  } catch {
    return undefined;
  }
}

function bindAwaitedInkstoneShutdown(runtime: InkstoneTerminalRuntime): void {
  const signals: Deno.Signal[] = Deno.build.os === "windows" ? ["SIGINT", "SIGBREAK"] : ["SIGINT", "SIGTERM"];
  let shutdown: Promise<void> | undefined;
  const removeSignals = () => {
    for (const signal of signals) {
      try {
        Deno.removeSignalListener(signal, requestShutdown);
      } catch { /* listener was not installed or was already removed */ }
    }
  };
  const requestShutdown = () => {
    shutdown ??= (async () => {
      removeSignals();
      await runtime.destroy();
      Deno.exit(0);
    })();
    void shutdown;
  };
  for (const signal of signals) Deno.addSignalListener(signal, requestShutdown);
  runtime.app.tui.on("destroy", requestShutdown);
}

if (import.meta.main) await runInkstoneShowcase(parseInkstoneShowcaseArgs(Deno.args));
