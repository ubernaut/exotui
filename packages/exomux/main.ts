// Copyright 2023 Im-Beast. MIT license.

import { DiagnosticsCollector } from "@ubernaut/deno-tui";
import { createShowcaseTerminalStore } from "@showcase/kit";
import { createExomuxTerminalApp, type ExomuxTerminalAppRuntime } from "./app.ts";
import {
  connectOrLaunchExomuxLocalHost,
  defaultExomuxStateDirectory,
  ExomuxClientError,
  type ExomuxConnectMode,
  removeExomuxHostDescriptor,
  writeExomuxHostDescriptor,
} from "./client.ts";
import {
  assertExomuxSessionName,
  ensureExomuxSessionDirectories,
  EXOMUX_DEFAULT_SESSION_NAME,
  type ExomuxSessionPaths,
  formatExomuxSessionList,
  generateExomuxSessionName,
  probeExomuxSessions,
  resolveExomuxSessionPaths,
} from "./sessions.ts";
import { createExomuxController, type ExomuxController, type ExomuxPreferences } from "./controller.ts";
import {
  defaultExomuxConfigDirectory,
  type ExomuxConfig,
  exomuxConfigFilePath,
  loadExomuxConfig,
  persistExomuxBackgroundImage,
  resetExomuxConfig,
  writeExomuxConfig,
} from "./config.ts";
import { exomuxBackgroundSettingsFor, withExomuxBackgroundString } from "./model.ts";
import { type ExomuxHostServer, serveExomuxHost } from "./host.ts";
import { isExomuxAuthToken } from "./protocol.ts";

/** Deliberately small launcher/daemon CLI surface. */
export interface ExomuxShowcaseLaunchOptions {
  readonly daemon: boolean;
  readonly stateDirectory?: string;
  readonly descriptorPath?: string;
  readonly layoutPath?: string;
  readonly configDirectory?: string;
  readonly persistLayout: boolean;
  readonly listSessions: boolean;
  readonly attachSession?: string;
  readonly newSession: boolean;
  readonly newSessionName?: string;
  readonly showHelp: boolean;
  readonly resetConfig: boolean;
}

/** Every flag and prefix command, printed by `-h`/`--help` and on launch failure. */
export const EXOMUX_HELP_TEXT = `Exomux — a terminal multiplexer with a detachable host.

Usage: exomux [options]

Session options:
  (none)               Attach to the single live session, or create "main"
  -a, --attach <name>  Attach to a named session; never launches a host
  -n, --new-session [name]
                       Create a new session (numeric name generated if omitted)
  --list-sessions      List every session with state, uptime, and terminals

Config options:
  --reset-config       Reset saved settings to safe defaults and exit
  --config-dir=<path>  Use a config directory other than ~/.config/exomux

Other options:
  --memory             Do not persist this session's window layout
  --persist            Persist the window layout (the default)
  -h, --help           Show this help and exit

Config and wallpapers live in ~/.config/exomux (exomux.json, images/).

Inside the workbench, Ctrl-N is the prefix key; Ctrl-N ? lists every command.`;

/** Parses Exomux options without performing filesystem or network I/O. */
export function parseExomuxShowcaseArgs(args: readonly string[]): ExomuxShowcaseLaunchOptions {
  let daemon = false;
  let stateDirectory: string | undefined;
  let descriptorPath: string | undefined;
  let layoutPath: string | undefined;
  let persistLayout = true;
  let listSessions = false;
  let attachSession: string | undefined;
  let newSession = false;
  let newSessionName: string | undefined;
  let configDirectory: string | undefined;
  let showHelp = false;
  let resetConfig = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--daemon") daemon = true;
    else if (argument === "-h" || argument === "--help") showHelp = true;
    else if (argument === "--reset-config") resetConfig = true;
    else if (argument.startsWith("--config-dir=")) configDirectory = requiredOption(argument, "--config-dir=");
    else if (argument === "--memory") persistLayout = false;
    else if (argument === "--persist") persistLayout = true;
    else if (argument === "--list-sessions") listSessions = true;
    else if (argument === "-a" || argument === "--attach") {
      attachSession = sessionNameValue(args[++index], argument);
    } else if (argument.startsWith("--attach=")) {
      attachSession = sessionNameValue(argument.slice("--attach=".length), "--attach");
    } else if (argument === "-n" || argument === "--new-session") {
      newSession = true;
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) newSessionName = sessionNameValue(args[++index], argument);
    } else if (argument.startsWith("--new-session=")) {
      newSession = true;
      newSessionName = sessionNameValue(argument.slice("--new-session=".length), "--new-session");
    } else if (argument.startsWith("--state-dir=")) stateDirectory = requiredOption(argument, "--state-dir=");
    else if (argument.startsWith("--descriptor=")) descriptorPath = requiredOption(argument, "--descriptor=");
    else if (argument.startsWith("--layout-file=")) {
      layoutPath = requiredOption(argument, "--layout-file=");
      persistLayout = true;
    } else throw new TypeError(`Unknown Exomux option: ${argument}`);
  }
  const selections = [listSessions, attachSession !== undefined, newSession].filter(Boolean).length;
  if (selections > 1) throw new TypeError("Exomux accepts only one of --list-sessions, -a, or -n.");
  if (daemon && selections > 0) throw new TypeError("Exomux --daemon does not combine with session selection.");
  if (descriptorPath && selections > 0) {
    throw new TypeError("Exomux --descriptor pins one host file and does not combine with session selection.");
  }
  return Object.freeze({
    daemon,
    persistLayout,
    listSessions,
    newSession,
    showHelp,
    resetConfig,
    ...(stateDirectory ? { stateDirectory } : {}),
    ...(descriptorPath ? { descriptorPath } : {}),
    ...(layoutPath ? { layoutPath } : {}),
    ...(configDirectory ? { configDirectory } : {}),
    ...(attachSession !== undefined ? { attachSession } : {}),
    ...(newSessionName !== undefined ? { newSessionName } : {}),
  });
}

function sessionNameValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("-")) throw new TypeError(`Exomux option ${flag} needs a session name.`);
  try {
    return assertExomuxSessionName(value);
  } catch {
    throw new TypeError(
      `Exomux option ${flag} needs a session name made of letters, digits, dots, dashes, or underscores.`,
    );
  }
}

/** Runs either the persistent local host or its detachable terminal workbench client. */
export async function runExomuxShowcase(options: ExomuxShowcaseLaunchOptions): Promise<void> {
  if (options.showHelp) {
    console.log(EXOMUX_HELP_TEXT);
    return;
  }
  const configDirectory = options.configDirectory ?? defaultExomuxConfigDirectory();
  const configPath = exomuxConfigFilePath(configDirectory);
  if (options.resetConfig) {
    await resetExomuxConfig(configPath);
    console.log(`Reset Exomux settings to defaults at ${configPath}`);
    return;
  }
  if (options.daemon) {
    await runExomuxDaemon(options);
    return;
  }
  await runExomuxClient(options, configDirectory, configPath);
}

/** The session and bootstrap mode one client invocation resolved to. */
interface ExomuxLaunchTarget extends ExomuxSessionPaths {
  readonly mode: ExomuxConnectMode;
}

/**
 * Chooses the tmux-like target: `-a` attaches and never launches, `-n`
 * creates and never reuses, and a bare launch attaches to the single live
 * session, creates the default session when none exists, or — when the choice
 * is ambiguous — lists the candidates and returns undefined.
 */
async function resolveExomuxLaunchTarget(
  options: ExomuxShowcaseLaunchOptions,
  stateRoot: string,
): Promise<ExomuxLaunchTarget | undefined> {
  if (options.attachSession) {
    return { ...resolveExomuxSessionPaths(stateRoot, options.attachSession), mode: "attach-only" };
  }
  if (options.newSession) {
    const existing = await probeExomuxSessions({ stateRoot });
    const name = options.newSessionName ?? generateExomuxSessionName(existing.map((probe) => probe.name));
    if (existing.some((probe) => probe.name === name && probe.state === "attachable")) {
      throw new ExomuxClientError(
        "session-exists",
        `Exomux session "${name}" is already running; attach to it with: -a ${name}`,
      );
    }
    return { ...(await ensureExomuxSessionDirectories(stateRoot, name)), mode: "launch-only" };
  }
  const probes = await probeExomuxSessions({ stateRoot });
  const live = probes.filter((probe) => probe.state === "attachable");
  if (live.length > 1) {
    console.log(formatExomuxSessionList(probes));
    console.log('\nSeveral sessions are live; attach with "-a <name>" or create another with "-n".');
    return undefined;
  }
  const name = live[0]?.name ?? EXOMUX_DEFAULT_SESSION_NAME;
  return { ...(await ensureExomuxSessionDirectories(stateRoot, name)), mode: "attach-or-launch" };
}

/** Starts the UI client; destroying it never shuts down the detached host. */
export async function runExomuxClient(
  options: ExomuxShowcaseLaunchOptions,
  configDirectory: string = options.configDirectory ?? defaultExomuxConfigDirectory(),
  configPath: string = exomuxConfigFilePath(configDirectory),
): Promise<void> {
  const stateRoot = options.stateDirectory ?? defaultExomuxStateDirectory();
  if (options.listSessions) {
    console.log(formatExomuxSessionList(await probeExomuxSessions({ stateRoot })));
    return;
  }
  // An explicit descriptor pins one host file and bypasses session discovery.
  const target: ExomuxLaunchTarget | undefined = options.descriptorPath
    ? {
      name: EXOMUX_DEFAULT_SESSION_NAME,
      mode: "attach-or-launch",
      stateDirectory: stateRoot,
      descriptorPath: options.descriptorPath,
      layoutPath: joinPath(stateRoot, "layout.json"),
    }
    : await resolveExomuxLaunchTarget(options, stateRoot);
  if (!target) return;
  const diagnostics = new DiagnosticsCollector();
  let connection;
  try {
    connection = await connectOrLaunchExomuxLocalHost({
      stateDirectory: target.stateDirectory,
      descriptorPath: target.descriptorPath,
      mode: target.mode,
    });
  } catch (error) {
    if (target.mode === "attach-only" && error instanceof ExomuxClientError) {
      console.log(formatExomuxSessionList(await probeExomuxSessions({ stateRoot })));
      console.error(`\nCannot attach to session "${target.name}": ${error.message}`);
      Deno.exitCode = 1;
      return;
    }
    throw error;
  }
  const layoutPath = options.persistLayout ? options.layoutPath ?? target.layoutPath : undefined;
  const storage = await createShowcaseTerminalStore({
    enabled: options.persistLayout,
    path: layoutPath,
    diagnostics,
  });
  const config = await loadExomuxConfig(configPath);
  const persistPreferences = createExomuxPreferenceWriter(configDirectory, configPath, config);
  const controller = await createExomuxController({
    client: connection.client,
    store: storage.store,
    diagnostics,
    persistenceDebounceMs: storage.inspect().durable ? 120 : 0,
    initialPreferences: exomuxConfigToPreferences(config),
    onPreferencesChanged: persistPreferences,
  });
  let connectionStatus = connection.launched
    ? `Started session "${target.name}" · terminals survive UI exit · Ctrl-N ? commands`
    : `Attached to session "${target.name}" · Ctrl-N ? commands`;
  if (connection.recovery) {
    connectionStatus += connection.recovery.reason === "unresponsive-host"
      ? ` · replaced unresponsive host pid ${connection.recovery.pid}`
      : " · cleared crashed host state";
  }
  await launchInitialExomuxTerminalIfEmpty(controller, connectionStatus);
  const runtime = await createExomuxTerminalApp({ controller });
  bindAwaitedExomuxClientShutdown(runtime);
  runtime.start();
}

/** The preference subset the config file carries, drawn from a loaded config. */
export function exomuxConfigToPreferences(config: ExomuxConfig): ExomuxPreferences {
  return {
    themeId: config.themeId,
    backgroundId: config.backgroundId,
    globalSettings: config.globalSettings,
    backgroundSettings: config.backgroundSettings,
  };
}

/**
 * Builds the debounced preference sink handed to the controller. It copies a
 * freshly chosen background image into the config directory (so the wallpaper
 * survives the original moving) and writes the config file. Writes are
 * coalesced and best-effort: a failed persist must never disturb the session.
 */
export function createExomuxPreferenceWriter(
  configDirectory: string,
  configPath: string,
  initial: ExomuxConfig,
): (preferences: ExomuxPreferences) => void {
  let last = JSON.stringify(exomuxConfigToPreferences(initial));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();
  const flush = (preferences: ExomuxPreferences) => {
    writing = writing.then(async () => {
      let backgroundSettings = preferences.backgroundSettings;
      const imagePath = exomuxBackgroundSettingsFor(backgroundSettings, "image").path;
      if (typeof imagePath === "string" && imagePath.length > 0) {
        const stored = await persistExomuxBackgroundImage(configDirectory, imagePath);
        if (stored !== imagePath) {
          backgroundSettings = withExomuxBackgroundString(backgroundSettings, "image", "path", stored);
        }
      }
      await writeExomuxConfig(configPath, {
        schemaVersion: 1,
        themeId: preferences.themeId,
        backgroundId: preferences.backgroundId,
        globalSettings: preferences.globalSettings,
        backgroundSettings,
      });
    }).catch(() => undefined);
  };
  return (preferences) => {
    const signature = JSON.stringify(preferences);
    if (signature === last) return;
    last = signature;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => flush(preferences), 150);
    Deno.unrefTimer?.(timer);
  };
}

/** Launches the default floating shell only when the persistent host is empty. */
export async function launchInitialExomuxTerminalIfEmpty(
  controller: ExomuxController,
  connectionStatus: string,
): Promise<boolean> {
  if (controller.sessions.peek().length > 0) {
    controller.status.value = connectionStatus;
    return false;
  }
  const firstTerminal = await controller.spawn();
  controller.status.value = firstTerminal
    ? `${connectionStatus} · floating terminal ready`
    : `${connectionStatus} · ${controller.status.peek()}`;
  return firstTerminal !== undefined;
}

/** Runs the retaining host until an authenticated shutdown or process signal. */
export async function runExomuxDaemon(options: ExomuxShowcaseLaunchOptions): Promise<void> {
  const stateDirectory = options.stateDirectory ?? defaultExomuxStateDirectory();
  const descriptorPath = options.descriptorPath ?? joinPath(stateDirectory, "host.json");
  let authToken: string | undefined;
  try {
    authToken = Deno.env.get("EXOMUX_TOKEN");
    Deno.env.delete("EXOMUX_TOKEN");
  } catch {
    authToken = undefined;
  }
  if (!isExomuxAuthToken(authToken)) throw new TypeError("Exomux daemon requires a valid private startup token.");

  const server = serveExomuxHost({ authToken });
  const address = await server.address;
  await writeExomuxHostDescriptor(descriptorPath, {
    schemaVersion: 1,
    flowControlledReplay: true,
    hostId: server.controller.id,
    url: address.url,
    token: authToken,
    pid: Deno.pid,
    startedAt: Date.now(),
  });
  const fatalHandler = createExomuxDaemonFatalHandler(
    server,
    () => removeExomuxHostDescriptor(descriptorPath, server.controller.id),
  );
  globalThis.addEventListener("unhandledrejection", fatalHandler);
  globalThis.addEventListener("error", fatalHandler);
  const unbind = bindExomuxDaemonSignals(server);
  try {
    await server.finished;
  } finally {
    globalThis.removeEventListener("unhandledrejection", fatalHandler);
    globalThis.removeEventListener("error", fatalHandler);
    unbind();
    await removeExomuxHostDescriptor(descriptorPath, server.controller.id);
  }
}

/**
 * A daemon that faults must exit and clear its descriptor rather than linger:
 * a half-alive host answers `/proc` liveness checks while refusing every
 * connection, which is exactly the state that used to block relaunching after
 * a crash. Shutdown is bounded — if it wedges too, the descriptor is removed
 * and the process force-exits so the next launch starts clean.
 */
export function createExomuxDaemonFatalHandler(
  server: { shutdown(): Promise<void> },
  removeDescriptor: () => Promise<void>,
  exit: (code: number) => void = Deno.exit,
  shutdownTimeoutMs = 3_000,
): (event: { preventDefault(): void }) => void {
  let faulted = false;
  const abandon = async () => {
    try {
      await removeDescriptor();
    } finally {
      exit(1);
    }
  };
  return (event) => {
    event.preventDefault();
    if (faulted) return;
    faulted = true;
    const deadline = setTimeout(() => void abandon(), shutdownTimeoutMs);
    // The timer must never keep an otherwise-exiting daemon alive.
    Deno.unrefTimer(deadline);
    server.shutdown().then(
      () => clearTimeout(deadline),
      () => {
        clearTimeout(deadline);
        void abandon();
      },
    );
  };
}

function bindAwaitedExomuxClientShutdown(runtime: ExomuxTerminalAppRuntime): void {
  const signals: Deno.Signal[] = Deno.build.os === "windows" ? ["SIGINT", "SIGBREAK"] : ["SIGINT", "SIGTERM"];
  let shutdown: Promise<void> | undefined;
  const removeSignals = () => {
    for (const signal of signals) {
      try {
        Deno.removeSignalListener(signal, requestShutdown);
      } catch {
        // Listener was unavailable or already removed.
      }
    }
  };
  const requestShutdown = () => {
    shutdown ??= (async () => {
      removeSignals();
      // Bounded: teardown that hangs — a host handshake, a wedged PTY — must
      // not leave the client alive and animating. Whatever happens, quit quits.
      const deadline = new Promise<void>((resolve) => setTimeout(resolve, 3000));
      await Promise.race([runtime.destroy(), deadline]);
      Deno.exit(0);
    })();
    void shutdown;
  };
  for (const signal of signals) Deno.addSignalListener(signal, requestShutdown);
  runtime.app.tui.on("destroy", requestShutdown);
}

function bindExomuxDaemonSignals(server: ExomuxHostServer): () => void {
  const signals: Deno.Signal[] = Deno.build.os === "windows" ? ["SIGINT", "SIGBREAK"] : ["SIGINT", "SIGTERM"];
  const shutdown = () => void server.shutdown();
  for (const signal of signals) Deno.addSignalListener(signal, shutdown);
  return () => {
    for (const signal of signals) {
      try {
        Deno.removeSignalListener(signal, shutdown);
      } catch {
        // Listener was unavailable or already removed.
      }
    }
  };
}

function requiredOption(argument: string, prefix: string): string {
  const value = argument.slice(prefix.length);
  if (!value || value.includes("\0")) throw new TypeError(`Exomux option ${prefix.slice(0, -1)} needs a path.`);
  return value;
}

function joinPath(parent: string, child: string): string {
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/g, "")}${separator}${child}`;
}

/** Parses argv and runs Exomux, turning a launch failure into actionable help. */
export async function runExomuxCli(argv: readonly string[]): Promise<number> {
  let options: ExomuxShowcaseLaunchOptions;
  try {
    options = parseExomuxShowcaseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${EXOMUX_HELP_TEXT}`);
    return 2;
  }
  try {
    await runExomuxShowcase(options);
    return Deno.exitCode ?? 0;
  } catch (error) {
    // A launch that fell over is most often a wedged host or a bad config;
    // show what the flags are and point at the reset that fixes the latter.
    console.error(`Exomux failed to launch: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`\n${EXOMUX_HELP_TEXT}`);
    console.error("\nIf this keeps happening, reset saved settings with: exomux --reset-config");
    return 1;
  }
}

if (import.meta.main) {
  const code = await runExomuxCli(Deno.args);
  // Never force-exit on success: the interactive client returns as soon as its
  // render loop is started and stays alive through its own event listeners, so
  // a `Deno.exit(0)` here would kill the workbench the instant it attached.
  // Terminating commands (help, reset, list) leave no pending work and exit on
  // their own. Only a nonzero code needs an explicit exit.
  if (code !== 0) Deno.exit(code);
}
