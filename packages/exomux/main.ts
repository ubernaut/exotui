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
import { createExomuxController, type ExomuxController } from "./controller.ts";
import { type ExomuxHostServer, serveExomuxHost } from "./host.ts";
import { isExomuxAuthToken } from "./protocol.ts";

/** Deliberately small launcher/daemon CLI surface. */
export interface ExomuxShowcaseLaunchOptions {
  readonly daemon: boolean;
  readonly stateDirectory?: string;
  readonly descriptorPath?: string;
  readonly layoutPath?: string;
  readonly persistLayout: boolean;
  readonly listSessions: boolean;
  readonly attachSession?: string;
  readonly newSession: boolean;
  readonly newSessionName?: string;
}

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
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--daemon") daemon = true;
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
    ...(stateDirectory ? { stateDirectory } : {}),
    ...(descriptorPath ? { descriptorPath } : {}),
    ...(layoutPath ? { layoutPath } : {}),
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
  if (options.daemon) {
    await runExomuxDaemon(options);
    return;
  }
  await runExomuxClient(options);
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
export async function runExomuxClient(options: ExomuxShowcaseLaunchOptions): Promise<void> {
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
  const controller = await createExomuxController({
    client: connection.client,
    store: storage.store,
    diagnostics,
    persistenceDebounceMs: storage.inspect().durable ? 120 : 0,
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

if (import.meta.main) await runExomuxShowcase(parseExomuxShowcaseArgs(Deno.args));
