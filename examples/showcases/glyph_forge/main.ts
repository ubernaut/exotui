// Copyright 2023 Im-Beast. MIT license.

import { DiagnosticsCollector } from "../../../mod.ts";
import { createShowcaseTerminalStore } from "../shared/mod.ts";
import { createGlyphForgeTerminalApp, type GlyphForgeRuntime } from "./app.ts";
import { createGlyphForgeController } from "./controller.ts";

/** Explicit terminal-launch persistence options. */
export interface GlyphForgeLaunchOptions {
  readonly persist?: boolean;
  readonly sessionPath?: string;
}

/** Parses the deliberately small GlyphForge CLI surface. */
export function parseGlyphForgeArgs(args: readonly string[]): GlyphForgeLaunchOptions {
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
      throw new TypeError(`Unknown GlyphForge option: ${argument}`);
    }
  }
  return Object.freeze({ persist, ...(sessionPath ? { sessionPath } : {}) });
}

/** Launches GlyphForge with explicit durable-state selection. */
export async function runGlyphForgeShowcase(options: GlyphForgeLaunchOptions = {}): Promise<void> {
  const diagnostics = new DiagnosticsCollector();
  const storage = await createShowcaseTerminalStore({
    enabled: options.persist === true,
    path: options.persist ? options.sessionPath ?? defaultGlyphForgeSessionPath() : undefined,
    diagnostics,
  });
  const controller = createGlyphForgeController({
    store: storage.store,
    diagnostics,
    persistenceDebounceMs: storage.inspect().durable ? 250 : 0,
  });
  await controller.kernel.ready;
  const runtime = createGlyphForgeTerminalApp({ controller });
  bindAwaitedShutdown(runtime);
  runtime.start();
}

function defaultGlyphForgeSessionPath(): string | undefined {
  try {
    const root = Deno.build.os === "windows"
      ? Deno.env.get("LOCALAPPDATA") ?? Deno.env.get("USERPROFILE")
      : Deno.env.get("XDG_STATE_HOME") ??
        (Deno.env.get("HOME") ? `${Deno.env.get("HOME")}/.local/state` : undefined);
    return root ? `${root.replace(/[\\/]+$/g, "")}/deno-tui/glyph-forge-session.json` : undefined;
  } catch {
    return undefined;
  }
}

function bindAwaitedShutdown(runtime: GlyphForgeRuntime): void {
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

if (import.meta.main) await runGlyphForgeShowcase(parseGlyphForgeArgs(Deno.args));
