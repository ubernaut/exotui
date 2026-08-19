// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertRejects } from "./deps.ts";
import { TerminalOutputController } from "@ubernaut/exotui";
import {
  connectExomuxWebSocket,
  connectOrLaunchExomuxLocalHost,
  ExomuxClientError,
  exomuxDaemonLaunchArgs,
  ExomuxWebSocketClient,
  type ExomuxWebSocketLike,
  readExomuxHostDescriptor,
  writeExomuxHostDescriptor,
} from "../client.ts";
import { type ExomuxHostServer, serveExomuxHost } from "../host.ts";
import {
  createExomuxAuthToken,
  encodeExomuxData,
  encodeExomuxMessage,
  type ExomuxServerMessage,
  type ExomuxSessionDescriptor,
} from "../protocol.ts";
import type {
  TerminalBackend,
  TerminalBackendSpawnOptions,
  TerminalSessionHandle,
  TerminalSessionHandleInspection,
} from "@ubernaut/exotui/terminal";
import type { ProcessSessionCommand, ProcessSessionInspection } from "@ubernaut/exotui/terminal";

Deno.test("Exomux launches its daemon differently from a script and a compiled binary", () => {
  const mainModuleUrl = new URL("file:///opt/exomux/main.ts");
  const descriptorPath = "/run/exomux/host.json";

  // Script mode: Deno.execPath() is `deno`, so it needs a subcommand and a real
  // module path on disk.
  assertEquals(exomuxDaemonLaunchArgs({ mainModuleUrl, descriptorPath, standalone: false }), [
    "run",
    "-A",
    "/opt/exomux/main.ts",
    "--daemon",
    `--descriptor=${descriptorPath}`,
  ]);

  // Standalone mode: Deno.execPath() is Exomux itself. Passing "run" would make
  // its own parser throw `Unknown Exomux option: run`, and the module path would
  // point inside the virtual compile root, which does not exist on disk.
  const standalone = exomuxDaemonLaunchArgs({ mainModuleUrl, descriptorPath, standalone: true });
  assertEquals(standalone, ["--daemon", `--descriptor=${descriptorPath}`]);
  assert(!standalone.includes("run"), "a standalone binary must not be handed a deno subcommand");
  assert(
    standalone.every((argument) => !argument.endsWith("main.ts")),
    "a standalone binary must not be handed a module path",
  );
});

Deno.test("Exomux client reports a pre-authentication close without an orphan rejection", async () => {
  await auditUnhandledRejections(async () => {
    const socket = new ScriptedExomuxSocket();
    const client = new ExomuxWebSocketClient(fakeSocketOptions(socket));
    try {
      socket.serverClose();
      await nextMacrotask();
      await assertExomuxClientError(client.ready(), "connection-closed", "host connection closed");
    } finally {
      await client.dispose();
    }
  });
});

Deno.test("Exomux client disposal settles authentication waiters", async () => {
  await auditUnhandledRejections(async () => {
    const socket = new ScriptedExomuxSocket();
    const client = new ExomuxWebSocketClient(fakeSocketOptions(socket));
    await client.dispose();
    await nextMacrotask();
    await assertExomuxClientError(client.ready(), "client-disposed", "client was disposed");
  });
});

Deno.test("Exomux disconnect during an attach request rejects only the caller", async () => {
  await auditUnhandledRejections(async () => {
    const { client, socket } = await connectedScriptedClient();
    try {
      const attachment = client.attach("terminal-1", { onOutput: () => {} });
      const rejected = assertExomuxClientError(attachment, "connection-closed", "host connection closed");
      const list = await socket.waitForRequest("list");
      socket.receive(sessionsMessage(list.requestId, [fakeSession("terminal-1", 2)]));
      await socket.waitForRequest("attach");
      socket.serverClose();
      await rejected;
    } finally {
      await client.dispose();
    }
  });
});

Deno.test("Exomux disconnect during replay rejects the awaited attachment without an orphan", async () => {
  await auditUnhandledRejections(async () => {
    const { client, socket } = await connectedScriptedClient();
    try {
      const attachment = client.attach("terminal-1", { onOutput: () => {} });
      const rejected = assertExomuxClientError(attachment, "connection-closed", "host connection closed");
      const list = await socket.waitForRequest("list");
      const session = fakeSession("terminal-1", 2);
      socket.receive(sessionsMessage(list.requestId, [session]));
      const attach = await socket.waitForRequest("attach");
      socket.receive(attachedMessage(attach.requestId, session, 0));
      await Promise.resolve();
      socket.serverClose();
      await rejected;
    } finally {
      await client.dispose();
    }
  });
});

Deno.test("Exomux disposal during replay rejects the awaited attachment", async () => {
  await auditUnhandledRejections(async () => {
    const { client, socket } = await connectedScriptedClient();
    const attachment = client.attach("terminal-1", { onOutput: () => {} });
    const rejected = assertExomuxClientError(attachment, "client-disposed", "client was disposed");
    const list = await socket.waitForRequest("list");
    const session = fakeSession("terminal-1", 2);
    socket.receive(sessionsMessage(list.requestId, [session]));
    const attach = await socket.waitForRequest("attach");
    socket.receive(attachedMessage(attach.requestId, session, 0));
    await Promise.resolve();
    await client.dispose();
    await rejected;
  });
});

Deno.test("Exomux client bounds legacy-host replay and reports its intentional gap", async () => {
  const { client, socket } = await connectedScriptedClient();
  try {
    const attachment = client.attach("terminal-1", { onOutput: () => {} });
    const list = await socket.waitForRequest("list");
    const session = fakeSession("terminal-1", 100);
    socket.receive(sessionsMessage(list.requestId, [session]));
    const attach = await socket.waitForRequest("attach");
    assertEquals(attach.afterSequence, 84);
    socket.receive(attachedMessage(attach.requestId, session, 85));
    for (let sequence = 85; sequence <= 100; sequence += 1) {
      socket.receive({
        version: 1,
        type: "output",
        sessionId: session.id,
        sequence,
        data: encodeExomuxData(String(sequence)),
      });
    }
    const result = await attachment;
    assertEquals(result.replay.map((frame) => frame.sequence), Array.from({ length: 16 }, (_, index) => 85 + index));
    assertEquals(result.truncated, true);
  } finally {
    await client.dispose();
  }
});

Deno.test("Exomux client serializes replay-producing attach handshakes", async () => {
  const { client, socket } = await connectedScriptedClient();
  try {
    const first = client.attach("terminal-1", { onOutput: () => {} });
    const second = client.attach("terminal-2", { onOutput: () => {} });
    const firstList = await socket.waitForRequest("list");
    await nextMacrotask();
    assertEquals(socket.requests("list").length, 1);
    const sessions = [fakeSession("terminal-1", 0), fakeSession("terminal-2", 0)];
    socket.receive(sessionsMessage(firstList.requestId, sessions));
    const firstAttach = await socket.waitForRequest("attach");
    socket.receive(attachedMessage(firstAttach.requestId, sessions[0]!, 1));
    await first;

    const secondList = await socket.waitForRequest("list", 1);
    socket.receive(sessionsMessage(secondList.requestId, sessions));
    const secondAttach = await socket.waitForRequest("attach", 1);
    socket.receive(attachedMessage(secondAttach.requestId, sessions[1]!, 1));
    await second;
  } finally {
    await client.dispose();
  }
});

Deno.test("Exomux attach returns post-barrier frames after replay instead of firing live callbacks early", async () => {
  const { client, socket } = await connectedScriptedClient();
  const live: number[] = [];
  try {
    const attachment = client.attach("terminal-1", {
      onOutput: (frame) => live.push(frame.sequence),
    });
    const list = await socket.waitForRequest("list");
    const listed = fakeSession("terminal-1", 20);
    socket.receive(sessionsMessage(list.requestId, [listed]));
    const attach = await socket.waitForRequest("attach");
    const attached = fakeSession("terminal-1", 21);
    socket.receive(attachedMessage(attach.requestId, attached, 21));
    socket.receive(outputMessage("terminal-1", 21));
    socket.receive(outputMessage("terminal-1", 22));

    const result = await attachment;
    assertEquals(live, []);
    assertEquals(result.replay.map((frame) => frame.sequence), [21, 22]);
    socket.receive(outputMessage("terminal-1", 23));
    assertEquals(live, [23]);
  } finally {
    await client.dispose();
  }
});

Deno.test("Exomux attach settles an empty replay that the host reports as truncated", async () => {
  const { client, socket } = await connectedScriptedClient(1_000, true);
  try {
    const attachment = client.attach("terminal-1", { sinceSequence: 0, onOutput: () => {} });
    const attach = await socket.waitForRequest("attach");
    const session = fakeSession("terminal-1", 1);
    const response = attachedMessage(attach.requestId, session, 2);
    assert(response.type === "attached");
    socket.receive({
      ...response,
      truncated: true,
    });

    const result = await attachment;
    assertEquals(result.replay, []);
    assertEquals(result.truncated, true);
    assertEquals(client.connected, true);
  } finally {
    await client.dispose();
  }
});

Deno.test("Exomux replay timeout closes only the client lane and rejects retries deterministically", async () => {
  await auditUnhandledRejections(async () => {
    const { client, socket } = await connectedScriptedClient(100);
    const attachment = client.attach("terminal-1", { onOutput: () => {} });
    const rejected = assertExomuxClientError(attachment, "request-timeout", "request timed out");
    const list = await socket.waitForRequest("list");
    const session = fakeSession("terminal-1", 1);
    socket.receive(sessionsMessage(list.requestId, [session]));
    const attach = await socket.waitForRequest("attach");
    socket.receive(attachedMessage(attach.requestId, session, 1));
    await rejected;
    assertEquals(client.connected, false);
    assertEquals(socket.closeCalls.at(-1)?.code, 1011);
    await assertExomuxClientError(
      client.attach("terminal-1", { onOutput: () => {} }),
      "request-timeout",
      "request timed out",
    );
    await client.dispose();
  });
});

Deno.test("Exomux capable hosts retain concurrent full-replay attach requests", async () => {
  const { client, socket } = await connectedScriptedClient(1_000, true);
  try {
    const first = client.attach("terminal-1", { sinceSequence: 0, onOutput: () => {} });
    const second = client.attach("terminal-2", { sinceSequence: 0, onOutput: () => {} });
    const firstAttach = await socket.waitForRequest("attach");
    const secondAttach = await socket.waitForRequest("attach", 1);
    assertEquals(socket.requests("list"), []);
    assertEquals(firstAttach.afterSequence, 0);
    assertEquals(secondAttach.afterSequence, 0);
    const firstSession = fakeSession("terminal-1", 0);
    const secondSession = fakeSession("terminal-2", 0);
    socket.receive(attachedMessage(firstAttach.requestId, firstSession, 1));
    socket.receive(attachedMessage(secondAttach.requestId, secondSession, 1));
    assertEquals((await Promise.all([first, second])).map((result) => result.truncated), [false, false]);
  } finally {
    await client.dispose();
  }
});

Deno.test("Exomux client rejects a duplicate session attachment without replacing the first", async () => {
  const { client, socket } = await connectedScriptedClient(1_000, true);
  try {
    const first = client.attach("terminal-1", { onOutput: () => {} });
    const attach = await socket.waitForRequest("attach");
    await assertExomuxClientError(
      client.attach("terminal-1", { onOutput: () => {} }),
      "attachment-exists",
      "already has a client attachment",
    );
    const session = fakeSession("terminal-1", 0);
    socket.receive(attachedMessage(attach.requestId, session, 1));
    await first;
  } finally {
    await client.dispose();
  }
});

Deno.test("Exomux WebSocket client correlates replay/control and disconnect leaves host PTY alive", async () => {
  const token = createExomuxAuthToken();
  const backend = new FakeRetainingBackend();
  const server = serveExomuxHost({ authToken: token, backend, port: 0 });
  const address = await server.address;
  const first = await connectExomuxWebSocket({ url: address.url, authToken: token, requestTimeoutMs: 2_000 });
  try {
    assertEquals(await first.list(), []);
    const spawned = await first.spawn({ command: "/bin/fake", title: "client smoke", columns: 90, rows: 28 });
    const handle = backend.handles[0]!;
    handle.emit("\x1b[31mretained\x1b[0m");

    const live: string[] = [];
    const attached = await first.attach(spawned.id, {
      sinceSequence: 0,
      onOutput: (frame) => live.push(new TextDecoder().decode(frame.data as Uint8Array)),
    });
    assertEquals(attached.truncated, false);
    assertEquals(attached.replay.length, 1);
    assertEquals(new TextDecoder().decode(attached.replay[0]!.data as Uint8Array), "\x1b[31mretained\x1b[0m");

    handle.emit("live");
    await waitFor(() => live.includes("live"));
    assertEquals(await first.input(spawned.id, "echo exact\n"), true);
    assertEquals(handle.writes, ["echo exact\n"]);
    assertEquals(await first.resize(spawned.id, 101, 31), true);
    assertEquals(handle.resizes.at(-1), { columns: 101, rows: 31 });

    await first.dispose();
    assertEquals(handle.killCalls, 0);
    assertEquals(handle.disposeCalls, 0);
    assertEquals(server.controller.inspect().sessions.map((session) => session.id), [spawned.id]);

    const second = await connectExomuxWebSocket({ url: address.url, authToken: token, requestTimeoutMs: 2_000 });
    try {
      const inventory = await second.list();
      assertEquals(inventory.map((session) => session.id), [spawned.id]);
      const reattached = await second.attach(spawned.id, {
        sinceSequence: attached.replay.at(-1)?.sequence,
        onOutput: () => {},
      });
      assertEquals(reattached.replay.length, 1);
      assertEquals(await second.kill(spawned.id), true);
      assertEquals(handle.killCalls, 1);
      assertEquals(handle.disposeCalls, 1);
      assertEquals(await second.list(), []);
    } finally {
      await second.dispose();
    }
  } finally {
    await first.dispose();
    await server.shutdown();
  }
});

Deno.test("Exomux client keeps sustained attached output sequence bookkeeping bounded", async () => {
  const token = createExomuxAuthToken();
  const backend = new FakeRetainingBackend();
  const server = serveExomuxHost({ authToken: token, backend, port: 0 });
  const address = await server.address;
  const client = await connectExomuxWebSocket({ url: address.url, authToken: token, requestTimeoutMs: 4_000 });
  try {
    const spawned = await client.spawn({ command: "/bin/fake" });
    const output: number[] = [];
    await client.attach(spawned.id, {
      onOutput: (frame) => output.push(frame.sequence),
    });
    const handle = backend.handles[0]!;
    for (let batch = 1; batch <= 100; batch += 1) {
      for (let index = 0; index < 100; index += 1) handle.emit("x");
      await waitFor(() => output.length === batch * 100, 2_000);
    }
    assertEquals(output[0], 1);
    assertEquals(output.at(-1), 10_000);
    assertEquals(new Set(output).size, 10_000);
  } finally {
    await client.dispose();
    await server.shutdown();
  }
});

Deno.test({
  name: "Exomux daemon starts in an independent Unix session and survives client disposal",
  ignore: Deno.build.os !== "linux",
  async fn() {
    const directory = await Deno.makeTempDir({ prefix: "exomux-detached-" });
    const descriptorPath = `${directory}/host.json`;
    let first: Awaited<ReturnType<typeof connectOrLaunchExomuxLocalHost>> | undefined;
    let second: Awaited<ReturnType<typeof connectExomuxWebSocket>> | undefined;
    try {
      first = await connectOrLaunchExomuxLocalHost({
        stateDirectory: directory,
        descriptorPath,
        timeoutMs: 10_000,
        requestTimeoutMs: 3_000,
      });
      assertEquals(first.launched, true);
      assertEquals(first.descriptor.flowControlledReplay, true);
      const process = await new Deno.Command("/usr/bin/ps", {
        args: ["-o", "pid=,pgid=,sid=", "-p", String(first.descriptor.pid)],
        stdout: "piped",
        stderr: "piped",
      }).output();
      assert(process.success);
      const fields = new TextDecoder().decode(process.stdout).trim().split(/\s+/).map(Number);
      assertEquals(fields, [first.descriptor.pid, first.descriptor.pid, first.descriptor.pid]);

      await first.client.dispose();
      first = undefined;
      const descriptor = await readExomuxHostDescriptor(descriptorPath);
      assert(descriptor);
      assertEquals(descriptor.flowControlledReplay, true);
      second = await connectExomuxWebSocket({
        url: descriptor.url,
        authToken: descriptor.token,
        requestTimeoutMs: 3_000,
        flowControlledReplay: descriptor.flowControlledReplay === true,
      });
      assert(Number.isFinite(await second.ping()));
      await second.shutdownHost();
    } finally {
      await first?.client.dispose();
      await second?.dispose();
      try {
        const descriptor = await readExomuxHostDescriptor(descriptorPath);
        if (descriptor) {
          const cleanup = await connectExomuxWebSocket({
            url: descriptor.url,
            authToken: descriptor.token,
            requestTimeoutMs: 1_000,
            flowControlledReplay: descriptor.flowControlledReplay === true,
          });
          try {
            await cleanup.shutdownHost();
          } finally {
            await cleanup.dispose();
          }
        }
      } catch {
        // The explicitly shut down daemon normally removes its descriptor.
      }
      await Deno.remove(directory, { recursive: true }).catch(() => undefined);
    }
  },
});

function unreachableDescriptor(hostId: string) {
  return {
    schemaVersion: 1 as const,
    hostId,
    url: "ws://127.0.0.1:9/exomux/v1",
    token: createExomuxAuthToken(),
    pid: Deno.pid,
    startedAt: Date.now() - 60_000,
  };
}

/** A spawnDaemon seam that brings up a real in-process host and its descriptor. */
function inProcessDaemonSpawner(state: { server?: ExomuxHostServer; spawnCalls: number }) {
  return async (options: { descriptorPath: string; authToken: string }) => {
    state.spawnCalls += 1;
    state.server = serveExomuxHost({ authToken: options.authToken });
    const address = await state.server.address;
    await writeExomuxHostDescriptor(options.descriptorPath, {
      schemaVersion: 1,
      flowControlledReplay: true,
      hostId: state.server.controller.id,
      url: address.url,
      token: options.authToken,
      pid: Deno.pid,
      startedAt: Date.now(),
    });
  };
}

Deno.test("Exomux bootstrap replaces a descriptor whose pid is no longer an Exomux daemon", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-stale-pid-" });
  const descriptorPath = `${directory}/host.json`;
  const state: { server?: ExomuxHostServer; spawnCalls: number } = { spawnCalls: 0 };
  try {
    await writeExomuxHostDescriptor(descriptorPath, unreachableDescriptor("crashed-generation"));
    const connection = await connectOrLaunchExomuxLocalHost({
      stateDirectory: directory,
      descriptorPath,
      timeoutMs: 5_000,
      requestTimeoutMs: 500,
      // The crash left the recorded pid to be recycled by an unrelated process.
      processProbe: () => "foreign",
      spawnDaemon: inProcessDaemonSpawner(state),
    });
    try {
      assertEquals(state.spawnCalls, 1);
      assertEquals(connection.launched, true);
      assertEquals(connection.recovery?.reason, "stale-process");
      assertEquals(connection.recovery?.hostId, "crashed-generation");
      assert(Number.isFinite(await connection.client.ping()));
      assertEquals((await readExomuxHostDescriptor(descriptorPath))?.hostId, state.server?.controller.id);
    } finally {
      await connection.client.dispose();
    }
  } finally {
    await state.server?.shutdown();
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux bootstrap quarantines an unresponsive daemon descriptor and launches a fresh host", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-wedged-" });
  const descriptorPath = `${directory}/host.json`;
  const state: { server?: ExomuxHostServer; spawnCalls: number } = { spawnCalls: 0 };
  try {
    await writeExomuxHostDescriptor(descriptorPath, unreachableDescriptor("wedged-generation"));
    const connection = await connectOrLaunchExomuxLocalHost({
      stateDirectory: directory,
      descriptorPath,
      timeoutMs: 1_000,
      requestTimeoutMs: 200,
      // The pid still looks like an Exomux daemon, but it never answers.
      processProbe: () => "daemon",
      spawnDaemon: inProcessDaemonSpawner(state),
    });
    try {
      assertEquals(state.spawnCalls, 1);
      assertEquals(connection.launched, true);
      assertEquals(connection.recovery?.reason, "unresponsive-host");
      assertEquals(connection.recovery?.quarantinedPath, `${descriptorPath}.unresponsive`);
      const quarantined = await readExomuxHostDescriptor(`${descriptorPath}.unresponsive`);
      assertEquals(quarantined?.hostId, "wedged-generation");
      assertEquals((await readExomuxHostDescriptor(descriptorPath))?.hostId, state.server?.controller.id);
    } finally {
      await connection.client.dispose();
    }
  } finally {
    await state.server?.shutdown();
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux attach-only bootstrap never launches and explains absent, stale, and wedged hosts", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-attach-only-" });
  const descriptorPath = `${directory}/host.json`;
  let spawnCalls = 0;
  const bootstrap = (processProbe: () => "foreign" | "daemon") =>
    connectOrLaunchExomuxLocalHost({
      stateDirectory: directory,
      descriptorPath,
      mode: "attach-only",
      timeoutMs: 300,
      requestTimeoutMs: 100,
      processProbe,
      spawnDaemon: () => {
        spawnCalls += 1;
      },
    });
  try {
    await assertExomuxClientError(bootstrap(() => "daemon"), "no-session-host", "No Exomux host is recorded");

    await writeExomuxHostDescriptor(descriptorPath, unreachableDescriptor("stale-generation"));
    await assertExomuxClientError(bootstrap(() => "foreign"), "stale-session-host", "stale descriptor was removed");
    assertEquals(await readExomuxHostDescriptor(descriptorPath), undefined);

    await writeExomuxHostDescriptor(descriptorPath, unreachableDescriptor("wedged-generation"));
    await assertExomuxClientError(bootstrap(() => "daemon"), "existing-host-unreachable", "did not respond");
    assertEquals(await readExomuxHostDescriptor(descriptorPath), undefined);
    assertEquals(
      (await readExomuxHostDescriptor(`${descriptorPath}.unresponsive`))?.hostId,
      "wedged-generation",
    );
    assertEquals(spawnCalls, 0);
  } finally {
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux launch-only bootstrap refuses a session whose host is already answering", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-launch-only-" });
  const descriptorPath = `${directory}/host.json`;
  const authToken = createExomuxAuthToken();
  const server = serveExomuxHost({ authToken });
  let spawnCalls = 0;
  try {
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
    await assertExomuxClientError(
      connectOrLaunchExomuxLocalHost({
        stateDirectory: directory,
        descriptorPath,
        mode: "launch-only",
        timeoutMs: 2_000,
        requestTimeoutMs: 500,
        spawnDaemon: () => {
          spawnCalls += 1;
        },
      }),
      "session-exists",
      "already running",
    );
    assertEquals(spawnCalls, 0);
  } finally {
    await server.shutdown();
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux host descriptor is private atomic and strictly normalized", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-client-" });
  const path = `${directory}/host.json`;
  try {
    const descriptor = {
      schemaVersion: 1 as const,
      hostId: "host-generation-1",
      url: "ws://127.0.0.1:34567/exomux/v1",
      token: createExomuxAuthToken(),
      pid: Deno.pid,
      startedAt: 1234,
    };
    await writeExomuxHostDescriptor(path, descriptor);
    assertEquals(await readExomuxHostDescriptor(path), descriptor);
    const capableDescriptor = { ...descriptor, flowControlledReplay: true as const };
    await writeExomuxHostDescriptor(path, capableDescriptor);
    assertEquals(await readExomuxHostDescriptor(path), capableDescriptor);
    if (Deno.build.os !== "windows") assertEquals((await Deno.stat(path)).mode! & 0o777, 0o600);

    if (Deno.build.os !== "windows") {
      await Deno.chmod(path, 0o644);
      await assertRejects(() => readExomuxHostDescriptor(path), Error, "accessible by other users");
      await Deno.chmod(path, 0o600);
      await Deno.chmod(directory, 0o755);
      await assertRejects(() => readExomuxHostDescriptor(path), Error, "descriptor parent");
      await Deno.chmod(directory, 0o700);
    }

    // An unrecognised key is tolerated and dropped. Strictness here bought no
    // safety — anyone who can write this file can write a perfectly valid one,
    // and every field that matters is still validated — while it cost forward
    // compatibility: a daemon newer than its client is the normal state after
    // an upgrade, and rejecting its descriptor strands the terminals it holds.
    await Deno.writeTextFile(path, JSON.stringify({ ...capableDescriptor, unexpected: true }));
    assertEquals(await readExomuxHostDescriptor(path), capableDescriptor);
    // A key this build DOES know, carrying a value it does not accept, is
    // still corruption rather than skew.
    await Deno.writeTextFile(path, JSON.stringify({ ...descriptor, flowControlledReplay: false }));
    await assertRejects(() => readExomuxHostDescriptor(path), Error, "invalid");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

class ScriptedExomuxSocket implements ExomuxWebSocketLike {
  readyState: number = WebSocket.CONNECTING;
  readonly bufferedAmount = 0;
  binaryType: BinaryType = "blob";
  readonly sent: string[] = [];
  readonly closeCalls: Array<{ code?: number; reason?: string }> = [];
  readonly #listeners = new Map<string, Set<(event: Event & { data?: unknown }) => void>>();

  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) throw new Error("scripted socket is not open");
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
  }

  addEventListener(type: string, listener: (event: Event & { data?: unknown }) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: Event & { data?: unknown }) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.#emit("open");
  }

  serverClose(): void {
    this.readyState = WebSocket.CLOSED;
    this.#emit("close");
  }

  receive(message: ExomuxServerMessage): void {
    this.#emit("message", encodeExomuxMessage(message));
  }

  requests(type: string): Array<Record<string, unknown> & { requestId: number }> {
    const requests: Array<Record<string, unknown> & { requestId: number }> = [];
    for (const encoded of this.sent) {
      const value: unknown = JSON.parse(encoded);
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      if (record.type === type && typeof record.requestId === "number") {
        requests.push({ ...record, requestId: record.requestId });
      }
    }
    return requests;
  }

  async waitForRequest(
    type: string,
    occurrence = 0,
  ): Promise<Record<string, unknown> & { requestId: number }> {
    await waitFor(() => this.requests(type).length > occurrence);
    return this.requests(type)[occurrence]!;
  }

  #emit(type: string, data?: unknown): void {
    const event = { data } as Event & { data?: unknown };
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

function fakeSocketOptions(
  socket: ScriptedExomuxSocket,
  requestTimeoutMs = 1_000,
  flowControlledReplay = false,
) {
  return {
    url: "ws://127.0.0.1:34567/exomux/v1",
    authToken: "00".repeat(32),
    requestTimeoutMs,
    flowControlledReplay,
    createWebSocket: () => socket,
  };
}

async function connectedScriptedClient(
  requestTimeoutMs = 1_000,
  flowControlledReplay = false,
): Promise<{
  client: ExomuxWebSocketClient;
  socket: ScriptedExomuxSocket;
}> {
  const socket = new ScriptedExomuxSocket();
  const client = new ExomuxWebSocketClient(fakeSocketOptions(socket, requestTimeoutMs, flowControlledReplay));
  socket.open();
  socket.receive({ version: 1, type: "ready", hostId: "scripted-host" });
  await client.ready();
  return { client, socket };
}

function fakeSession(id: string, latestSequence: number): ExomuxSessionDescriptor {
  return {
    id,
    backendId: "scripted",
    title: id,
    commandLine: "/bin/fake",
    status: "running",
    running: true,
    columns: 80,
    rows: 24,
    createdAt: 1,
    updatedAt: 1,
    latestSequence,
    attachedClients: 0,
  };
}

function sessionsMessage(
  requestId: number,
  sessions: readonly ExomuxSessionDescriptor[],
): ExomuxServerMessage {
  return { version: 1, type: "sessions", requestId, sessions };
}

function attachedMessage(
  requestId: number,
  session: ExomuxSessionDescriptor,
  replayFromSequence: number,
): ExomuxServerMessage {
  return {
    version: 1,
    type: "attached",
    requestId,
    session,
    replayFromSequence,
    latestSequence: session.latestSequence,
    truncated: false,
  };
}

function outputMessage(sessionId: string, sequence: number): ExomuxServerMessage {
  return { version: 1, type: "output", sessionId, sequence, data: encodeExomuxData(String(sequence)) };
}

async function assertExomuxClientError(
  promise: Promise<unknown>,
  code: string,
  message: string,
): Promise<void> {
  const error = await assertRejects(() => promise, ExomuxClientError, message);
  assertEquals(error.code, code);
}

async function auditUnhandledRejections(run: () => Promise<void>): Promise<void> {
  const reasons: unknown[] = [];
  const listener = (event: PromiseRejectionEvent) => {
    reasons.push(event.reason);
    event.preventDefault();
  };
  globalThis.addEventListener("unhandledrejection", listener);
  try {
    await run();
    await nextMacrotask();
    assertEquals(reasons, []);
  } finally {
    globalThis.removeEventListener("unhandledrejection", listener);
  }
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeRetainingBackend implements TerminalBackend {
  readonly id = "fake-retaining";
  readonly label = "Fake retaining PTY";
  readonly pty = true;
  readonly detachable = false;
  readonly reconnectable = false;
  readonly handles: FakeTerminalHandle[] = [];

  spawn(options: TerminalBackendSpawnOptions): TerminalSessionHandle {
    const handle = new FakeTerminalHandle(options, this.id);
    this.handles.push(handle);
    return handle;
  }
}

class FakeTerminalHandle implements TerminalSessionHandle {
  readonly id = crypto.randomUUID();
  readonly output = new TerminalOutputController();
  readonly command: ProcessSessionCommand;
  readonly closed: Promise<ProcessSessionInspection>;
  readonly writes: string[] = [];
  readonly resizes: Array<{ columns: number; rows: number }> = [];
  readonly #onData?: TerminalBackendSpawnOptions["onData"];
  #resolveClosed!: (inspection: ProcessSessionInspection) => void;
  #running = true;
  #columns: number;
  #rows: number;
  killCalls = 0;
  disposeCalls = 0;

  constructor(options: TerminalBackendSpawnOptions, readonly backendId: string) {
    this.command = {
      command: options.command,
      ...(options.args ? { args: [...options.args] } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: { ...options.env } } : {}),
    };
    this.#columns = options.columns ?? 80;
    this.#rows = options.rows ?? 24;
    this.#onData = options.onData;
    this.closed = new Promise((resolve) => this.#resolveClosed = resolve);
  }

  emit(data: string): void {
    this.#onData?.(data, "stdout");
  }

  write(data: string | Uint8Array): Promise<boolean> {
    this.writes.push(typeof data === "string" ? data : new TextDecoder().decode(data));
    return Promise.resolve(this.#running);
  }

  resize(columns: number, rows: number): Promise<boolean> {
    this.#columns = columns;
    this.#rows = rows;
    this.resizes.push({ columns, rows });
    return Promise.resolve(this.#running);
  }

  kill(): Promise<boolean> {
    this.killCalls += 1;
    const wasRunning = this.#running;
    this.#running = false;
    this.#resolveClosed(this.#processInspection());
    return Promise.resolve(wasRunning);
  }

  inspect(): TerminalSessionHandleInspection {
    return {
      id: this.id,
      backendId: this.backendId,
      pty: true,
      title: "fake",
      commandLine: this.command.command,
      status: this.#running ? "running" : "exited",
      running: this.#running,
      columns: this.#columns,
      rows: this.#rows,
      resizeSupported: true,
    };
  }

  dispose(): Promise<void> {
    this.disposeCalls += 1;
    return Promise.resolve();
  }

  #processInspection(): ProcessSessionInspection {
    return {
      status: this.#running ? "running" : "exited",
      running: this.#running,
      command: { ...this.command },
      commandLine: this.command.command,
      output: this.output.inspect(),
    };
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

Deno.test({
  name: "Exomux renames a live session's descriptor, layout, and attach key end to end",
  ignore: Deno.build.os !== "linux",
  async fn() {
    const { createExomuxSessionRenamer, ExomuxRetargetableStore } = await import("../main.ts");
    const { resolveExomuxSessionPaths } = await import("../sessions.ts");
    const { createShowcaseTerminalStore } = await import("@showcase/kit");

    const stateRoot = await Deno.makeTempDir({ prefix: "exomux-rename-" });
    await Deno.chmod(stateRoot, 0o700);
    const mainPaths = resolveExomuxSessionPaths(stateRoot, "main");
    let connection: Awaited<ReturnType<typeof connectOrLaunchExomuxLocalHost>> | undefined;
    try {
      connection = await connectOrLaunchExomuxLocalHost({
        stateDirectory: stateRoot,
        descriptorPath: mainPaths.descriptorPath,
        timeoutMs: 10_000,
        requestTimeoutMs: 3_000,
      });
      assertEquals(connection.launched, true);
      const originalHostId = connection.descriptor.hostId;
      // Seed a layout the rename must carry over.
      await Deno.writeTextFile(mainPaths.layoutPath, JSON.stringify({ marker: "keep-me" }));

      const store = new ExomuxRetargetableStore(
        (await createShowcaseTerminalStore({ enabled: true, path: mainPaths.layoutPath })).store,
      );
      const rename = createExomuxSessionRenamer({
        stateRoot,
        current: mainPaths,
        client: connection.client,
        store,
        persistLayout: true,
      });

      const result = await rename("work");
      assertEquals(result.ok, true);
      assertEquals(result.name, "work");

      const work = resolveExomuxSessionPaths(stateRoot, "work");
      // The descriptor moved to the new session directory, same host generation.
      const moved = await readExomuxHostDescriptor(work.descriptorPath);
      assertEquals(moved?.hostId, originalHostId);
      // The old default-session descriptor is gone; -a main would find nothing.
      assertEquals(await readExomuxHostDescriptor(mainPaths.descriptorPath), undefined);
      // The layout carried over.
      assertEquals(JSON.parse(await Deno.readTextFile(work.layoutPath)).marker, "keep-me");

      // Attaching under the new name reaches the same live daemon.
      const reattached = await connectExomuxWebSocket({
        url: moved!.url,
        authToken: moved!.token,
        requestTimeoutMs: 2_000,
        flowControlledReplay: moved!.flowControlledReplay === true,
      });
      try {
        assert(Number.isFinite(await reattached.ping()));
        assertEquals(reattached.hostId, originalHostId);
        await reattached.shutdownHost();
      } finally {
        await reattached.dispose();
      }
    } finally {
      await connection?.client.dispose();
      try {
        const descriptor = await readExomuxHostDescriptor(resolveExomuxSessionPaths(stateRoot, "work").descriptorPath);
        if (descriptor) {
          const cleanup = await connectExomuxWebSocket({
            url: descriptor.url,
            authToken: descriptor.token,
            requestTimeoutMs: 1_000,
            flowControlledReplay: descriptor.flowControlledReplay === true,
          });
          try {
            await cleanup.shutdownHost();
          } finally {
            await cleanup.dispose();
          }
        }
      } catch {
        // The daemon was already shut down above.
      }
      await Deno.remove(stateRoot, { recursive: true }).catch(() => undefined);
    }
  },
});

// The daemon is meant to outlive the client that launched it, so "a newer
// client, an older daemon" is the normal state of affairs after an upgrade —
// not an edge case. A capability the daemon never advertised must therefore
// never be exercised: sending it is fatal on hosts old enough not to know it.

Deno.test("a client does not publish shared state to a host that never advertised it", async () => {
  const token = createExomuxAuthToken();
  const backend = new FakeRetainingBackend();
  const server = serveExomuxHost({ authToken: token, backend, port: 0 });
  const address = await server.address;
  const client = await connectExomuxWebSocket({ url: address.url, authToken: token, requestTimeoutMs: 2_000 });
  try {
    const spawned = await client.spawn({ command: "/bin/fake", title: "skew" });
    // No sharedWorkspace in the connect options: this stands in for a daemon
    // whose descriptor predates the channel.
    assertEquals(await client.publishWorkspace("preferences", 1, { themeId: "matrix" }), false);
    assertEquals(client.connected, true, "the connection survives, so the terminals do too");
    const attached = await client.attach(spawned.id, { onOutput: () => {} });
    assertEquals(attached.session.id, spawned.id);
  } finally {
    await client.dispose();
    await server.controller.shutdown();
  }
});

Deno.test("a client publishes shared state once the host advertises the channel", async () => {
  const token = createExomuxAuthToken();
  const server = serveExomuxHost({ authToken: token, port: 0 });
  const address = await server.address;
  const client = await connectExomuxWebSocket({
    url: address.url,
    authToken: token,
    requestTimeoutMs: 2_000,
    sharedWorkspace: true,
  });
  try {
    assertEquals(await client.publishWorkspace("preferences", 1, { themeId: "matrix" }), true);
  } finally {
    await client.dispose();
    await server.controller.shutdown();
  }
});

Deno.test("a descriptor written by a newer daemon still loads", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-descriptor-skew-" });
  await Deno.chmod(directory, 0o700);
  const path = `${directory}/host.json`;
  try {
    // Written by hand the way a future daemon would: fields this build has
    // never heard of. Rejecting the file would strand every terminal that
    // daemon is holding, which is the opposite of what strictness is for.
    await Deno.writeTextFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        hostId: "future-host",
        url: "ws://127.0.0.1:9/exomux/v1",
        token: "ab".repeat(32),
        pid: 4242,
        startedAt: 1_700_000_000_000,
        flowControlledReplay: true,
        sharedWorkspace: true,
        somethingAddedLater: { nested: true },
      }),
    );
    await Deno.chmod(path, 0o600);
    const descriptor = await readExomuxHostDescriptor(path);
    assert(descriptor, "the file loaded");
    assertEquals(descriptor.hostId, "future-host");
    assertEquals(descriptor.sharedWorkspace, true);
    assertEquals("somethingAddedLater" in descriptor, false, "unknown fields are ignored, not carried forward");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
