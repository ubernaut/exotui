// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes, assertThrows } from "./deps.ts";
import { createExomuxAuthToken, readExomuxHostDescriptor, writeExomuxHostDescriptor } from "../mod.ts";
import {
  discoverExomuxSessions,
  ensureExomuxSessionDirectories,
  EXOMUX_DEFAULT_SESSION_NAME,
  type ExomuxSessionProbe,
  exomuxSessionStateRoot,
  formatExomuxSessionList,
  formatExomuxUptime,
  generateExomuxSessionName,
  isExomuxDescriptorRelocation,
  isExomuxSessionName,
  probeExomuxSessions,
  resolveExomuxSessionPaths,
} from "../sessions.ts";
import { createExomuxDaemonFatalHandler, parseExomuxShowcaseArgs } from "../main.ts";
import { type ExomuxHostServer, serveExomuxHost } from "../host.ts";

Deno.test("Exomux session names are path-safe and generated numerically", () => {
  for (const name of ["main", "0", "work-2", "a.b_c", "A"]) assert(isExomuxSessionName(name), name);
  for (const name of ["", ".hidden", "-flag", "a/b", "a\\b", "a b", "x".repeat(65), 42]) {
    assert(!isExomuxSessionName(name), String(name));
  }
  assertEquals(generateExomuxSessionName([]), "1");
  assertEquals(generateExomuxSessionName(["main", "1", "2", "4"]), "3");
});

Deno.test("Exomux session paths keep the default session in the legacy state root", () => {
  const main = resolveExomuxSessionPaths("/state", EXOMUX_DEFAULT_SESSION_NAME);
  assertEquals(main.stateDirectory, "/state");
  assertEquals(main.descriptorPath, "/state/host.json");
  assertEquals(main.layoutPath, "/state/layout.json");
  const named = resolveExomuxSessionPaths("/state", "work");
  assertEquals(named.stateDirectory, "/state/sessions/work");
  assertEquals(named.descriptorPath, "/state/sessions/work/host.json");
  assertEquals(named.layoutPath, "/state/sessions/work/layout.json");
  assertThrows(() => resolveExomuxSessionPaths("/state", "../escape"), Error, "session names");
});

Deno.test("Exomux launcher parses tmux-like session selection flags", () => {
  assertEquals(parseExomuxShowcaseArgs(["--list-sessions"]).listSessions, true);
  assertEquals(parseExomuxShowcaseArgs(["-a", "work"]).attachSession, "work");
  assertEquals(parseExomuxShowcaseArgs(["--attach=work"]).attachSession, "work");
  const bareNew = parseExomuxShowcaseArgs(["-n"]);
  assertEquals(bareNew.newSession, true);
  assertEquals(bareNew.newSessionName, undefined);
  const namedNew = parseExomuxShowcaseArgs(["-n", "scratch", "--memory"]);
  assertEquals(namedNew.newSession, true);
  assertEquals(namedNew.newSessionName, "scratch");
  assertEquals(namedNew.persistLayout, false);
  assertEquals(parseExomuxShowcaseArgs(["--new-session=scratch"]).newSessionName, "scratch");

  assertThrows(() => parseExomuxShowcaseArgs(["-a"]), TypeError, "needs a session name");
  assertThrows(() => parseExomuxShowcaseArgs(["-a", "--memory"]), TypeError, "needs a session name");
  assertThrows(() => parseExomuxShowcaseArgs(["-a", "bad/name"]), TypeError, "session name");
  assertThrows(() => parseExomuxShowcaseArgs(["-a", "one", "-n"]), TypeError, "only one of");
  assertThrows(() => parseExomuxShowcaseArgs(["--list-sessions", "-n"]), TypeError, "only one of");
  assertThrows(() => parseExomuxShowcaseArgs(["--daemon", "-a", "one"]), TypeError, "--daemon");
  assertThrows(
    () => parseExomuxShowcaseArgs(["--descriptor=/tmp/host.json", "-n"]),
    TypeError,
    "--descriptor",
  );
});

Deno.test("Exomux probing keeps live sessions and sweeps the terminated ones", async () => {
  const stateRoot = await Deno.makeTempDir({ prefix: "exomux-sessions-" });
  await Deno.chmod(stateRoot, 0o700);
  const authToken = createExomuxAuthToken();
  let server: ExomuxHostServer | undefined;
  try {
    // "alpha" is a live session backed by a real in-process host.
    server = serveExomuxHost({ authToken });
    const address = await server.address;
    const alpha = await ensureExomuxSessionDirectories(stateRoot, "alpha");
    await writeExomuxHostDescriptor(alpha.descriptorPath, {
      schemaVersion: 1,
      flowControlledReplay: true,
      hostId: server.controller.id,
      url: address.url,
      token: authToken,
      pid: Deno.pid,
      startedAt: Date.now() - 5_000,
    });
    // "beta" crashed: its recorded pid no longer belongs to an Exomux daemon.
    const beta = await ensureExomuxSessionDirectories(stateRoot, "beta");
    await writeExomuxHostDescriptor(beta.descriptorPath, {
      schemaVersion: 1,
      hostId: "beta-crashed",
      url: "ws://127.0.0.1:9/exomux/v1",
      token: createExomuxAuthToken(),
      pid: Deno.pid,
      startedAt: Date.now() - 60_000,
    });
    // The default session is stopped but left a persisted layout behind.
    await Deno.writeTextFile(`${stateRoot}/layout.json`, "{}");

    const discovered = await discoverExomuxSessions(stateRoot);
    assertEquals(discovered.map((paths) => paths.name), ["main", "alpha", "beta"]);

    const probes = await probeExomuxSessions({
      stateRoot,
      timeoutMs: 1_000,
      processProbe: () => "foreign",
    });
    const byName = new Map(probes.map((probe) => [probe.name, probe]));
    // A terminated session is not a session: it is gone from the listing, so
    // nothing shows it as "stopped" and nothing holds its name.
    assertEquals(probes.map((probe) => probe.name), ["alpha"]);
    assertEquals(byName.get("alpha")?.state, "attachable");
    assertEquals(byName.get("alpha")?.terminals, []);
    assert((byName.get("alpha")?.upMs ?? 0) >= 5_000);
    assertEquals(byName.get("beta")?.state, undefined);
    // Probing prunes the dead descriptor exactly as launching would, and takes
    // the rest of the dead session's directory with it so the name is free.
    assertEquals(await readExomuxHostDescriptor(beta.descriptorPath).catch(() => undefined), undefined);
    assertEquals(await directoryExists(beta.stateDirectory), false);
    // The default session is the exception: its directory is the state root,
    // and a bare launch resumes the desktop it saved there.
    assertEquals(await Deno.readTextFile(`${stateRoot}/layout.json`), "{}");
    assertEquals(await directoryExists(alpha.stateDirectory), true);
  } finally {
    await server?.shutdown();
    await Deno.remove(stateRoot, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux session listing formats age, terminal counts, and foreground commands", () => {
  const paths = (name: string) => resolveExomuxSessionPaths("/state", name);
  const probes: ExomuxSessionProbe[] = [
    {
      ...paths("main"),
      state: "attachable",
      upMs: 3 * 3_600_000 + 12 * 60_000,
      terminals: [
        { title: "nvim", commandLine: "/bin/bash", running: true },
        { title: "htop", commandLine: "/bin/bash", running: true },
        { title: "", commandLine: "/bin/zsh", running: false },
      ],
    },
    {
      ...paths("work"),
      state: "unresponsive",
      upMs: 26 * 3_600_000,
      descriptor: {
        schemaVersion: 1,
        hostId: "wedged",
        url: "ws://127.0.0.1:9/exomux/v1",
        token: "00".repeat(32),
        pid: 4242,
        startedAt: 0,
      },
      terminals: [],
    },
    { ...paths("scratch"), state: "stopped", terminals: [] },
  ];
  const listing = formatExomuxSessionList(probes);
  const lines = listing.split("\n");
  assertEquals(lines.length, 4);
  assertStringIncludes(lines[0]!, "NAME");
  assertStringIncludes(lines[0]!, "RUNNING");
  assertStringIncludes(lines[1]!, "main");
  assertStringIncludes(lines[1]!, "3h 12m");
  assertStringIncludes(lines[1]!, "3");
  assertStringIncludes(lines[1]!, "nvim, htop");
  assertStringIncludes(lines[2]!, "1d 2h");
  assertStringIncludes(lines[2]!, "host pid 4242 is not answering");
  assertStringIncludes(lines[3]!, "not running");
  assertEquals(formatExomuxSessionList([]), "No Exomux sessions. Launching exomux creates one.");

  assertEquals(formatExomuxUptime(12_000), "12s");
  assertEquals(formatExomuxUptime(5 * 60_000), "5m");
  assertEquals(formatExomuxUptime(90 * 60_000), "1h 30m");
  assertEquals(formatExomuxUptime(49 * 3_600_000), "2d 1h");
});

Deno.test("Exomux daemon fatal handler shuts down, and force-exits only when shutdown wedges", async () => {
  // A clean shutdown needs no forced exit; the daemon's own teardown runs.
  {
    let shutdowns = 0;
    const exits: number[] = [];
    const handler = createExomuxDaemonFatalHandler(
      { shutdown: () => (shutdowns++, Promise.resolve()) },
      () => Promise.resolve(),
      (code) => void exits.push(code),
      50,
    );
    handler({ preventDefault: () => {} });
    handler({ preventDefault: () => {} });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assertEquals(shutdowns, 1);
    assertEquals(exits, []);
  }
  // A failing shutdown clears the descriptor and force-exits.
  {
    const exits: number[] = [];
    let removed = 0;
    const handler = createExomuxDaemonFatalHandler(
      { shutdown: () => Promise.reject(new Error("wedged")) },
      () => (removed++, Promise.resolve()),
      (code) => void exits.push(code),
      50,
    );
    handler({ preventDefault: () => {} });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assertEquals(removed, 1);
    assertEquals(exits, [1]);
  }
  // A shutdown that hangs past its deadline also force-exits.
  {
    const exits: number[] = [];
    let removed = 0;
    const handler = createExomuxDaemonFatalHandler(
      { shutdown: () => new Promise<void>(() => {}) },
      () => (removed++, Promise.resolve()),
      (code) => void exits.push(code),
      50,
    );
    handler({ preventDefault: () => {} });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assertEquals(removed, 1);
    assertEquals(exits, [1]);
  }
});

// Deterministic guard for the reported stuck launch: a descriptor whose pid is
// alive but is not an Exomux daemon must never block bootstrap; that exact
// combination previously threw "still appears alive but did not respond" on
// every launch after a crash. Covered end-to-end in client.test.ts; this pins
// the attach-time judgement that listings rely on.
Deno.test("Exomux probing a recycled-pid session reports stopped instead of failing", async () => {
  const stateRoot = await Deno.makeTempDir({ prefix: "exomux-recycled-" });
  await Deno.chmod(stateRoot, 0o700);
  try {
    const crashed = await ensureExomuxSessionDirectories(stateRoot, "crashed");
    await writeExomuxHostDescriptor(crashed.descriptorPath, {
      schemaVersion: 1,
      hostId: "crashed-generation",
      url: "ws://127.0.0.1:9/exomux/v1",
      token: createExomuxAuthToken(),
      pid: Deno.pid,
      startedAt: Date.now(),
    });
    // The real probe classifies this test process (argv without --daemon) as a
    // recycled pid on Linux; other platforms use the injected judgement.
    const probes = await probeExomuxSessions({
      stateRoot,
      timeoutMs: 500,
      ...(Deno.build.os === "linux" ? {} : { processProbe: () => "foreign" as const }),
    });
    assertEquals(probes, [], "a recycled pid means the session is gone, not that it is listed as stopped");
    assertEquals(await directoryExists(crashed.stateDirectory), false);
    // And the name it held is available again.
    assertEquals(generateExomuxSessionName(probes.map((probe) => probe.name)), "1");
  } finally {
    await Deno.remove(stateRoot, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux descriptor relocation is confined to the same state root", () => {
  const root = "/state";
  const main = `${root}/host.json`;
  const work = `${root}/sessions/work/host.json`;
  assertEquals(exomuxSessionStateRoot(main), root);
  assertEquals(exomuxSessionStateRoot(work), root);
  assertEquals(exomuxSessionStateRoot("/state/sessions/work/layout.json"), undefined);

  // Same root, either direction: allowed.
  assert(isExomuxDescriptorRelocation(main, work));
  assert(isExomuxDescriptorRelocation(work, main));
  assert(isExomuxDescriptorRelocation(work, `${root}/sessions/other/host.json`));
  // Different roots or traversal: refused.
  assert(!isExomuxDescriptorRelocation(main, "/elsewhere/host.json"));
  assert(!isExomuxDescriptorRelocation(main, `${root}/../evil/host.json`));
  assert(!isExomuxDescriptorRelocation(main, `${root}/sessions/work/notdescriptor`));
});

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await Deno.lstat(path)).isDirectory;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
