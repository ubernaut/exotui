import type { RuntimeSignal } from "../../../src/runtime/host.ts";
import { runtimeHost } from "../../../src/runtime/host.ts";
// Copyright 2023 Im-Beast. MIT license.

import { DiagnosticsCollector } from "../../../mod.ts";
import { createShowcaseTerminalStore } from "../../../src/showcase/mod.ts";
import { createGlyphForgeTerminalApp, type GlyphForgeRuntime } from "./app.ts";
import { createGlyphForgeController } from "./controller.ts";
import { type GlyphTextFont, loadGlyphFontPack } from "./text_font.ts";

/** Explicit terminal-launch persistence options. */
export interface GlyphForgeLaunchOptions {
  readonly persist?: boolean;
  readonly sessionPath?: string;
  /** Directory of .flf/.tlf fonts (the full patorjk corpus drops in). */
  readonly fontsDirectory?: string;
}

/** Parses the deliberately small GlyphForge CLI surface. */
export function parseGlyphForgeArgs(args: readonly string[]): GlyphForgeLaunchOptions {
  let persist = false;
  let sessionPath: string | undefined;
  let fontsDirectory: string | undefined;
  for (const argument of args) {
    if (argument === "--persist") persist = true;
    else if (argument === "--memory") {
      persist = false;
      sessionPath = undefined;
    } else if (argument.startsWith("--state-file=")) {
      sessionPath = argument.slice("--state-file=".length);
      persist = true;
    } else if (argument.startsWith("--fonts-dir=")) {
      fontsDirectory = argument.slice("--fonts-dir=".length);
    } else {
      throw new TypeError(`Unknown GlyphForge option: ${argument}`);
    }
  }
  return Object.freeze({
    persist,
    ...(sessionPath ? { sessionPath } : {}),
    ...(fontsDirectory ? { fontsDirectory } : {}),
  });
}

/** Launches GlyphForge with explicit durable-state selection. */
export async function runGlyphForgeShowcase(options: GlyphForgeLaunchOptions = {}): Promise<void> {
  const diagnostics = new DiagnosticsCollector();
  const storage = await createShowcaseTerminalStore({
    enabled: options.persist === true,
    path: options.persist ? options.sessionPath ?? defaultGlyphForgeSessionPath() : undefined,
    diagnostics,
  });
  let fonts: readonly GlyphTextFont[] = [];
  if (options.fontsDirectory) {
    try {
      const pack = await loadGlyphFontPack(options.fontsDirectory);
      fonts = pack.fonts;
      diagnostics.report({
        source: "glyph-forge-launcher",
        code: "font-pack-loaded",
        severity: "info",
        message: "Loaded a figlet font pack.",
        context: { fonts: pack.fonts.length, skipped: pack.skipped.length },
      });
    } catch {
      diagnostics.report({
        source: "glyph-forge-launcher",
        code: "font-pack-unavailable",
        severity: "warning",
        message: "The font pack directory could not be read; bundled fonts remain available.",
      });
    }
  }
  const controller = createGlyphForgeController({
    store: storage.store,
    diagnostics,
    fonts,
    persistenceDebounceMs: storage.inspect().durable ? 250 : 0,
  });
  await controller.kernel.ready;
  const runtime = createGlyphForgeTerminalApp({ controller });
  bindAwaitedShutdown(runtime);
  runtime.start();
}

function defaultGlyphForgeSessionPath(): string | undefined {
  try {
    const root = runtimeHost.build.os === "windows"
      ? runtimeHost.env.get("LOCALAPPDATA") ?? runtimeHost.env.get("USERPROFILE")
      : runtimeHost.env.get("XDG_STATE_HOME") ??
        (runtimeHost.env.get("HOME") ? `${runtimeHost.env.get("HOME")}/.local/state` : undefined);
    return root ? `${root.replace(/[\\/]+$/g, "")}/deno-tui/glyph-forge-session.json` : undefined;
  } catch {
    return undefined;
  }
}

function bindAwaitedShutdown(runtime: GlyphForgeRuntime): void {
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

if (import.meta.main) await runGlyphForgeShowcase(parseGlyphForgeArgs(runtimeHost.args));
