import { assert, assertEquals, assertRejects, assertStringIncludes } from "./deps.ts";
import { TerminalOutputController } from "@ubernaut/exotui";
import type { ProcessSessionCommand, ProcessSessionInspection, ProcessSessionStatus } from "@ubernaut/exotui/terminal";
import type {
  TerminalBackend,
  TerminalBackendSpawnOptions,
  TerminalSessionHandle,
  TerminalSessionHandleInspection,
} from "@ubernaut/exotui/terminal";
import {
  decodeExomuxData,
  decodeExomuxServerMessage,
  encodeExomuxData,
  EXOMUX_PROTOCOL_LIMITS,
  type ExomuxServerMessage,
} from "../protocol.ts";
import {
  createDefaultExomuxTerminalBackend,
  EXOMUX_PTY_POLLING_INTERVAL_MS,
  type ExomuxHostConnection,
  ExomuxHostController,
  type ExomuxHostPeer,
  selectExomuxTerminalBackend,
} from "../host.ts";

const AUTH_TOKEN = "ab".repeat(32);
const textDecoder = new TextDecoder();

Deno.test("exomux default PTY backend uses the responsive output polling cadence", async () => {
  const backend = new FakeTerminalBackend();
  let observedPollingInterval: number | undefined;
  const selected = await createDefaultExomuxTerminalBackend((options) => {
    observedPollingInterval = options.pollingIntervalMs;
    return Promise.resolve(backend);
  });

  assertEquals(selected, backend);
  assertEquals(EXOMUX_PTY_POLLING_INTERVAL_MS, 8);
  assertEquals(observedPollingInterval, EXOMUX_PTY_POLLING_INTERVAL_MS);
});

Deno.test("exomux records why it fell back off the PTY instead of swallowing it", async () => {
  const loaded = await selectExomuxTerminalBackend(() => Promise.resolve(new FakeTerminalBackend()));
  assertEquals(loaded.pty, true);
  assertEquals(loaded.degradedReason, undefined);

  const denied = await selectExomuxTerminalBackend(() =>
    Promise.reject(new Deno.errors.PermissionDenied('Requires ffi access to "libpty"'))
  );
  assertEquals(denied.pty, false);
  assert(denied.backend.pty === false, "the fallback must not claim to be a PTY");
  assertStringIncludes(denied.degradedReason ?? "", "ffi access");

  // A reason is always present on a fallback, even from a non-Error throw, and
  // never carries a multi-line stack into the field consumers display.
  const odd = await selectExomuxTerminalBackend(() => Promise.reject("line one\n  line two"));
  assertEquals(odd.pty, false);
  assertEquals(odd.degradedReason, "line one line two");
});

Deno.test("exomux host reports a degraded backend on its inspection", async () => {
  const host = createHostWithOptions({});
  assertEquals(host.inspect().backend, undefined, "unresolved until warmed or first spawn");

  const degraded = new ExomuxHostController({
    authToken: AUTH_TOKEN,
    backendFactory: () => new FakeTerminalBackend(),
  });
  const warmed = await degraded.warmBackend();
  assertEquals(warmed.pty, true);
  assertEquals(degraded.inspect().backend?.pty, true);
  assertEquals(degraded.inspect().backend?.degradedReason, undefined);
  // Warming is idempotent — the second call must not re-run the selection.
  assertEquals(await degraded.warmBackend(), warmed);
});

Deno.test("exomux host publishes foreground application title changes", async () => {
  const backend = new FakeTerminalBackend();
  let now = 1_000;
  let nextId = 0;
  const host = new ExomuxHostController({
    authToken: AUTH_TOKEN,
    backend,
    now: () => now,
    idFactory: () => `title-${++nextId}`,
  });
  const peer = new FakePeer();
  const connection = host.connect(peer);
  await authenticate(connection);
  await connection.receive(wire({
    version: 1,
    type: "spawn",
    requestId: 1,
    command: "/bin/bash",
    title: "terminal 1",
  }));
  await drain();

  const spawned = peer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  assertEquals(spawned.session.title, "bash");
  const handle = backend.handles[0]!;
  handle.title = "vim";
  now += 200;
  handle.emit("screen update");
  await drain();

  const states = peer.messages().filter((message) => message.type === "session-state");
  assertEquals(states.at(-1)?.type === "session-state" ? states.at(-1)!.session.title : undefined, "vim");
  await host.shutdown();
});

Deno.test("exomux host disconnect retains backend session and stable id for reconnect", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const firstPeer = new FakePeer();
  const first = host.connect(firstPeer);
  await authenticate(first);
  await first.receive(wire({
    version: 1,
    type: "spawn",
    requestId: 1,
    command: "/bin/sh",
    args: ["-l"],
    columns: 90,
    rows: 28,
    title: "persistent shell",
  }));
  await drain();

  const spawned = firstPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  const sessionId = spawned.session.id;
  const handle = backend.handles[0]!;
  handle.emit("before disconnect");
  await drain();
  first.disconnect();

  assertEquals(handle.killCalls, 0);
  assertEquals(handle.disposeCalls, 0);
  assertEquals(host.inspect().sessions.map((session) => session.id), [sessionId]);
  assertEquals(host.inspect().sessions[0]?.attachedClients, 0);

  handle.emit("while detached");
  const secondPeer = new FakePeer();
  const second = host.connect(secondPeer);
  await authenticate(second);
  await second.receive(wire({ version: 1, type: "list", requestId: 1 }));
  await second.receive(wire({
    version: 1,
    type: "attach",
    requestId: 2,
    sessionId,
    afterSequence: 1,
  }));
  await drain();

  const sessions = secondPeer.messages().find((message) => message.type === "sessions");
  assert(sessions?.type === "sessions");
  assertEquals(sessions.sessions.map((session) => session.id), [sessionId]);
  const attached = secondPeer.messages().find((message) => message.type === "attached");
  assert(attached?.type === "attached");
  assertEquals(attached.truncated, false);
  const replay = secondPeer.messages().filter((message) => message.type === "output");
  assertEquals(replay.map((message) => message.sequence), [2]);
  assertEquals(textDecoder.decode(decodeExomuxData(replay[0]!.data)), "while detached");

  second.disconnect();
  await host.shutdown();
  assertEquals(handle.killCalls, 1);
  assertEquals(handle.disposeCalls, 1);
});

Deno.test("exomux attach reports replay truncation and preserves monotonic output order", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { replayEntries: 2, replayBytes: 1024 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "demo" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();

  const handle = backend.handles[0]!;
  handle.emit("one");
  handle.emit("two");
  handle.emit("three");

  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await drain();

  const attached = peer.messages().find((message) => message.type === "attached");
  assert(attached?.type === "attached");
  assertEquals(attached.truncated, true);
  assertEquals(attached.replayFromSequence, 2);
  assertEquals(attached.latestSequence, 3);
  const replay = peer.messages().filter((message) => message.type === "output");
  assertEquals(replay.map((message) => message.sequence), [2, 3]);
  assertEquals(
    replay.map((message) => textDecoder.decode(decodeExomuxData(message.data))),
    ["two", "three"],
  );

  await host.shutdown();
});

Deno.test("exomux streams retained replay larger than the outbound message quota", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, {
    outboundMessages: 8,
    outboundBytes: 16 * 1024,
    replayEntries: 700,
    replayBytes: 1024 * 1024,
  });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "verbose" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();

  const replayCount = 600;
  for (let sequence = 1; sequence <= replayCount; sequence += 1) {
    backend.handles[0]!.emit(`frame-${sequence}`);
  }

  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await waitFor(() => peer.sent.length === replayCount + 2);
  await drain();

  assertEquals(peer.closes, []);
  assertEquals(
    peer.messages().filter((message) => message.type === "output").map((message) => message.sequence),
    Array.from({ length: replayCount }, (_, index) => index + 1),
  );
  assertEquals(client.inspect().queuedOutboundMessages, 0);
  assertEquals(client.inspect().queuedOutboundBytes, 0);
  await host.shutdown();
});

Deno.test("exomux fairly replays multiple sessions and fences their live output", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, {
    outboundMessages: 32,
    outboundBytes: 16 * 1024,
    replayEntries: 8,
    replayBytes: 1024 * 1024,
  });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "first" }));
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 2, command: "second" }));
  await drain(30);
  const sessions = ownerPeer.messages().filter((message) => message.type === "spawned");
  assertEquals(sessions.length, 2);
  const firstId = sessions[0]!.session.id;
  const secondId = sessions[1]!.session.id;
  owner.disconnect();
  for (let sequence = 1; sequence <= 8; sequence += 1) {
    backend.handles[0]!.emit(`first-replay-${sequence}`);
    backend.handles[1]!.emit(`second-replay-${sequence}`);
  }

  const peer = new PausablePeer();
  const client = host.connect(peer);
  await authenticate(client);
  peer.pause();
  const firstAttach = client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: firstId,
    afterSequence: 0,
  }));
  const secondAttach = client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 2,
    sessionId: secondId,
    afterSequence: 0,
  }));
  await Promise.all([firstAttach, secondAttach]);
  for (let sequence = 1; sequence <= 8; sequence += 1) {
    backend.handles[0]!.emit(`first-live-${sequence}`);
    backend.handles[1]!.emit(`second-live-${sequence}`);
  }

  assertEquals(client.inspect().queuedOutboundMessages, 18);
  assert(client.inspect().queuedOutboundBytes <= 16 * 1024);
  peer.resume();
  await waitFor(() => peer.messages().filter((message) => message.type === "output").length === 32);

  assertEquals(peer.closes, []);
  const delivered = peer.messages();
  const attached = delivered.filter((message) => message.type === "attached");
  assertEquals(attached.map((message) => message.session.id), [firstId, secondId]);
  for (const [sessionId, prefix] of [[firstId, "first"], [secondId, "second"]] as const) {
    const output = delivered.filter((message) => message.type === "output").filter((message) =>
      message.sessionId === sessionId
    );
    assertEquals(output.map((message) => message.sequence), Array.from({ length: 16 }, (_, index) => index + 1));
    assertEquals(
      output.map((message) => textDecoder.decode(decodeExomuxData(message.data))),
      [
        ...Array.from({ length: 8 }, (_, index) => `${prefix}-replay-${index + 1}`),
        ...Array.from({ length: 8 }, (_, index) => `${prefix}-live-${index + 1}`),
      ],
    );
  }
  const firstOutputSessions = delivered.filter((message) => message.type === "output").slice(0, 4).map((message) =>
    message.sessionId
  );
  assertEquals(firstOutputSessions, [firstId, secondId, firstId, secondId]);
  await host.shutdown();
});

Deno.test("exomux snapshots three full replay rings before live output rotates them", async () => {
  const backend = new FakeTerminalBackend();
  const replayEntries = 2048;
  const host = createHost(backend, {
    outboundMessages: 16,
    outboundBytes: 1024 * 1024,
    replayEntries,
    replayBytes: 1024 * 1024,
  });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  for (let requestId = 1; requestId <= 3; requestId += 1) {
    await owner.receive(wire({ version: 1, type: "spawn", requestId, command: `full-ring-${requestId}` }));
  }
  await drain(30);
  const spawned = ownerPeer.messages().filter((message) => message.type === "spawned");
  assertEquals(spawned.length, 3);
  owner.disconnect();
  for (const handle of backend.handles) {
    for (let sequence = 1; sequence <= replayEntries; sequence += 1) handle.emit(`r${sequence}`);
  }

  const peer = new PausablePeer();
  const client = host.connect(peer);
  await authenticate(client);
  peer.pause();
  const attaches = spawned.map((message, index) =>
    client.receive(wire({
      version: 1,
      type: "attach",
      requestId: index + 1,
      sessionId: message.session.id,
      afterSequence: 0,
    }))
  );
  await Promise.all(attaches);
  for (const handle of backend.handles) handle.emit("live-after-barrier");
  await client.receive(wire({ version: 1, type: "ping", requestId: 4 }));
  peer.resume();
  const expectedMessages = 1 + 3 + (3 * (replayEntries + 1)) + 1;
  await waitFor(() => peer.sent.length === expectedMessages, 100_000);
  await drain();

  assertEquals(peer.closes, []);
  const delivered = peer.messages();
  const firstOutput = delivered.findIndex((message) => message.type === "output");
  const pong = delivered.findIndex((message) => message.type === "pong");
  assert(pong >= 0 && pong < firstOutput);
  for (const session of spawned) {
    const output = delivered.filter((message) => message.type === "output").filter((message) =>
      message.sessionId === session.session.id
    );
    assertEquals(
      output.map((message) => message.sequence),
      Array.from({ length: replayEntries + 1 }, (_, index) => index + 1),
    );
    assertEquals(textDecoder.decode(decodeExomuxData(output.at(-1)!.data)), "live-after-barrier");
  }
  await host.shutdown();
});

Deno.test("exomux closes a backpressured replay transport without killing its PTY", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { outboundMessages: 4, replayEntries: 16 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "persistent" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();
  backend.handles[0]!.emit("retained");

  const peer = new RejectingPeer();
  const client = host.connect(peer);
  await authenticate(client);
  peer.reject = true;
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await drain();

  assertEquals(peer.closes, [{ code: 1013, reason: "slow-client" }]);
  assertEquals(client.inspect().closed, true);
  assertEquals(host.inspect().sessions[0]?.attachedClients, 0);
  assertEquals(backend.handles[0]!.killCalls, 0);
  assertEquals(backend.handles[0]!.disposeCalls, 0);
  await host.shutdown();
});

Deno.test("exomux detach cancels blocked replay before ack and permits immediate reattach", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { outboundMessages: 8, replayEntries: 16 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "detach-race" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();
  backend.handles[0]!.emit("one");
  backend.handles[0]!.emit("two");
  backend.handles[0]!.emit("three");

  const peer = new AbortableOncePeer();
  const client = host.connect(peer);
  await authenticate(client);
  peer.blockNext();
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await client.receive(wire({
    version: 1,
    type: "detach",
    requestId: 2,
    sessionId: spawned.session.id,
  }));
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 3,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await waitFor(() => peer.sent.length === 7);
  await drain();

  const messages = peer.messages();
  assertEquals(messages.map((message) => message.type), [
    "ready",
    "attached",
    "ack",
    "attached",
    "output",
    "output",
    "output",
  ]);
  const detachAck = messages[2];
  assert(detachAck?.type === "ack");
  assertEquals(detachAck.operation, "detach");
  assertEquals(messages.slice(3).filter((message) => message.type === "output").map((message) => message.sequence), [
    1,
    2,
    3,
  ]);
  assertEquals(peer.closes, []);
  assertEquals(peer.abortedSends, 1);
  await host.shutdown();
});

Deno.test("exomux kill cancels blocked replay before acknowledging session removal", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { outboundMessages: 4, replayEntries: 16 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "kill-race" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();
  backend.handles[0]!.emit("must-not-follow-kill-ack");

  const peer = new AbortableOncePeer();
  const client = host.connect(peer);
  await authenticate(client);
  peer.blockNext();
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await client.receive(wire({
    version: 1,
    type: "kill",
    requestId: 2,
    sessionId: spawned.session.id,
  }));
  await waitFor(() => peer.sent.length === 3);
  await drain();

  const messages = peer.messages();
  assertEquals(messages.map((message) => message.type), ["ready", "attached", "ack"]);
  const killAck = messages[2];
  assert(killAck?.type === "ack");
  assertEquals(killAck.operation, "kill");
  assertEquals(host.inspect().sessions, []);
  assertEquals(backend.handles[0]!.killCalls, 1);
  assertEquals(backend.handles[0]!.disposeCalls, 1);
  assertEquals(peer.abortedSends, 1);
  await host.shutdown();
});

Deno.test("exomux replay lanes yield to ping and list control traffic", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { outboundMessages: 4, replayEntries: 16 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "fair-control" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();
  for (let sequence = 1; sequence <= 8; sequence += 1) backend.handles[0]!.emit(`replay-${sequence}`);

  const peer = new PausablePeer();
  const client = host.connect(peer);
  await authenticate(client);
  peer.pause();
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await client.receive(wire({ version: 1, type: "ping", requestId: 2 }));
  await client.receive(wire({ version: 1, type: "list", requestId: 3 }));
  peer.resume();
  await waitFor(() => peer.sent.length === 12);

  assertEquals(peer.messages().slice(1, 5).map((message) => message.type), [
    "attached",
    "pong",
    "sessions",
    "output",
  ]);
  assertEquals(peer.closes, []);
  await host.shutdown();
});

Deno.test("exomux closes a replay client whose blocked lane fills with live output", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { outboundMessages: 3, replayEntries: 16 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "live-flood" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();
  backend.handles[0]!.emit("retained");

  const peer = new PausablePeer();
  const client = host.connect(peer);
  await authenticate(client);
  peer.pause();
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  backend.handles[0]!.emit("live-one");
  backend.handles[0]!.emit("live-two");
  backend.handles[0]!.emit("live-over-quota");
  await drain();

  assertEquals(peer.closes, [{ code: 1013, reason: "slow-client" }]);
  assertEquals(client.inspect().closed, true);
  assertEquals(host.inspect().sessions[0]?.attachedClients, 0);
  assertEquals(backend.handles[0]!.killCalls, 0);
  assertEquals(backend.handles[0]!.disposeCalls, 0);
  await host.shutdown();
});

Deno.test("exomux host routes bounded input and resize only to attached backend handle", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "interactive" }));
  await drain();
  const spawned = peer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");

  await client.receive(wire({
    version: 1,
    type: "input",
    requestId: 2,
    sessionId: spawned.session.id,
    data: encodeExomuxData(new Uint8Array([0x1b, 0x5b, 0x41])),
  }));
  await client.receive(wire({
    version: 1,
    type: "resize",
    requestId: 3,
    sessionId: spawned.session.id,
    columns: 132,
    rows: 41,
  }));
  await drain();

  const handle = backend.handles[0]!;
  assertEquals(handle.writes, [new Uint8Array([0x1b, 0x5b, 0x41])]);
  assertEquals(handle.resizes, [{ columns: 132, rows: 41 }]);
  assertEquals(
    peer.messages().filter((message) => message.type === "ack").map((message) => message.operation),
    ["input", "resize"],
  );

  await host.shutdown();
});

Deno.test("exomux host rejects missing auth, wrong auth, and malformed protocol before backend calls", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);

  const missingPeer = new FakePeer();
  const missing = host.connect(missingPeer);
  await missing.receive(wire({ version: 1, type: "list", requestId: 1 }));
  assertEquals(missingPeer.closes, [{ code: 1008, reason: "auth-required" }]);

  const wrongPeer = new FakePeer();
  const wrong = host.connect(wrongPeer);
  await wrong.receive(wire({ version: 1, type: "auth", token: "cd".repeat(32) }));
  assertEquals(wrongPeer.closes, [{ code: 1008, reason: "auth-rejected" }]);

  const malformedPeer = new FakePeer();
  const malformed = host.connect(malformedPeer);
  await authenticate(malformed);
  await malformed.receive(wire({ version: 2, type: "spawn", requestId: 1, command: "bad" }));
  assertEquals(malformedPeer.closes, [{ code: 1002, reason: "protocol-error" }]);

  const extraPeer = new FakePeer();
  const extra = host.connect(extraPeer);
  await authenticate(extra);
  await extra.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "bad", surprise: true }));
  assertEquals(extraPeer.closes, [{ code: 1002, reason: "protocol-error" }]);

  const quotaPeer = new FakePeer();
  const quota = host.connect(quotaPeer);
  await authenticate(quota);
  await quota.receive(wire({
    version: 1,
    type: "spawn",
    requestId: 1,
    command: "bad",
    columns: 513,
    rows: 24,
  }));
  assertEquals(quotaPeer.closes, [{ code: 1002, reason: "protocol-error" }]);
  assertEquals(backend.spawnCalls, 0);

  await host.shutdown();
});

Deno.test("exomux explicit kill invokes backend kill and dispose exactly once", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "long-running" }));
  await drain();
  const spawned = peer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");

  await client.receive(wire({
    version: 1,
    type: "kill",
    requestId: 2,
    sessionId: spawned.session.id,
  }));
  await client.receive(wire({
    version: 1,
    type: "kill",
    requestId: 3,
    sessionId: spawned.session.id,
  }));
  await drain();

  const handle = backend.handles[0]!;
  assertEquals(handle.killCalls, 1);
  assertEquals(handle.disposeCalls, 1);
  assertEquals(host.inspect().sessions, []);
  assertEquals(
    peer.messages().filter((message) => message.type === "ack" && message.operation === "kill").length,
    1,
  );
  assertEquals(
    peer.messages().filter((message) => message.type === "error" && message.code === "session-not-found").length,
    1,
  );

  await host.shutdown();
  assertEquals(handle.killCalls, 1);
  assertEquals(handle.disposeCalls, 1);
});

Deno.test("exomux slow-client quota closes only the peer and retains its PTY", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { outboundMessages: 2, outboundBytes: 1024 * 1024 });
  const peer = new BlockingPeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "chatty" }));
  backend.handles[0]!.emit("first queued output");
  await drain();

  assertEquals(peer.closes, [{ code: 1013, reason: "slow-client" }]);
  assertEquals(backend.handles[0]!.killCalls, 0);
  assertEquals(backend.handles[0]!.disposeCalls, 0);
  assertEquals(host.inspect().sessions.length, 1);
  assertEquals(host.inspect().sessions[0]?.attachedClients, 0);

  await host.shutdown();
  assertEquals(backend.handles[0]!.killCalls, 1);
  assertEquals(backend.handles[0]!.disposeCalls, 1);
});

Deno.test("exomux shutdown prevents a delayed backend factory from spawning afterward", async () => {
  const backend = new FakeTerminalBackend();
  const backendGate = deferred<TerminalBackend>();
  const host = createHostWithOptions({ backendFactory: () => backendGate.promise });
  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);

  const spawn = client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "late" }));
  await drain();
  await host.shutdown();
  backendGate.resolve(backend);
  await spawn;

  assertEquals(backend.spawnCalls, 0);
  assertEquals(host.inspect().running, false);
  assertEquals(host.inspect().sessions, []);
});

Deno.test("exomux reserves async spawn slots before awaiting the shared backend", async () => {
  const backend = new FakeTerminalBackend();
  const backendGate = deferred<TerminalBackend>();
  const host = createHostWithOptions({
    backendFactory: () => backendGate.promise,
    limits: { sessions: 1 },
  });
  const firstPeer = new FakePeer();
  const secondPeer = new FakePeer();
  const first = host.connect(firstPeer);
  const second = host.connect(secondPeer);
  await authenticate(first);
  await authenticate(second);

  const firstSpawn = first.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "first" }));
  await drain();
  await second.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "second" }));
  backendGate.resolve(backend);
  await firstSpawn;
  await drain();

  assertEquals(backend.spawnCalls, 1);
  assertEquals(host.inspect().sessions.length, 1);
  assertEquals(
    secondPeer.messages().filter((message) => message.type === "error").map((message) => message.code),
    ["session-quota"],
  );
  await host.shutdown();
});

Deno.test("exomux shutdown awaits the exact shared in-flight termination", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "slow-stop" }));
  await drain();
  const spawned = peer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  const handle = backend.handles[0]!;
  handle.killGate = deferred<boolean>();
  handle.disposeGate = deferred<void>();

  const kill = client.receive(wire({
    version: 1,
    type: "kill",
    requestId: 2,
    sessionId: spawned.session.id,
  }));
  await drain();
  let shutdownFinished = false;
  const shutdown = host.shutdown().then(() => {
    shutdownFinished = true;
  });
  await drain();
  assertEquals(shutdownFinished, false);
  assertEquals(handle.killCalls, 1);

  handle.killGate.resolve(true);
  await drain();
  assertEquals(handle.disposeCalls, 1);
  assertEquals(shutdownFinished, false);
  handle.disposeGate.resolve();
  await Promise.all([kill, shutdown]);

  assertEquals(handle.killCalls, 1);
  assertEquals(handle.disposeCalls, 1);
  assertEquals(host.inspect().sessions, []);
});

Deno.test("exomux shutdown request delivers its acknowledgement before closing the peer", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const events: string[] = [];
  const peer = new EventPeer(events);
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "shutdown-ack" }));
  await drain();

  await client.receive(wire({ version: 1, type: "shutdown", requestId: 2 }));
  await drain();

  const acknowledgement = peer.messages().find((message) => message.type === "ack" && message.operation === "shutdown");
  assert(acknowledgement?.type === "ack");
  assertEquals(events.slice(-2), ["send:ack", "close:host-shutdown"]);
  assertEquals(peer.closes, [{ code: 1001, reason: "host-shutdown" }]);
  assertEquals(backend.handles[0]!.killCalls, 1);
  assertEquals(backend.handles[0]!.disposeCalls, 1);
  assertEquals(host.inspect().running, false);
});

Deno.test("exomux reaps a dead session even when its handle disposal fails", async () => {
  // The process is dead (kill succeeded); dispose() throwing must not leave an
  // unkillable zombie window behind (UX-005) — the session is reaped and the
  // disposal failure is merely noted.
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "broken-stop" }));
  await drain();
  const spawned = peer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  const handle = backend.handles[0]!;
  handle.disposeFailure = true;

  await client.receive(wire({
    version: 1,
    type: "kill",
    requestId: 2,
    sessionId: spawned.session.id,
  }));
  await drain();

  assertEquals(handle.killCalls, 1);
  assertEquals(handle.disposeCalls, 1);
  assertEquals(host.inspect().sessions.length, 0);
  assertEquals(
    peer.messages().filter((message) => message.type === "ack" && message.operation === "kill").length,
    1,
  );
  await host.shutdown();
  client.disconnect();
});

Deno.test("exomux retains a still-running session whose termination failed", async () => {
  // The other half of the contract: while the process is actually alive, a
  // failed termination is reported and the session stays — a live PTY must
  // never silently vanish.
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "unkillable" }));
  await drain();
  const spawned = peer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  const handle = backend.handles[0]!;
  // The kill is refused, so the process keeps running; disposal also fails.
  handle.killGate = deferred<boolean>();
  handle.disposeFailure = true;
  const killRequest = client.receive(wire({
    version: 1,
    type: "kill",
    requestId: 2,
    sessionId: spawned.session.id,
  }));
  handle.killGate.resolve(false);
  await killRequest;
  await drain();

  assertEquals(handle.killCalls, 1);
  assertEquals(host.inspect().sessions.length, 1);
  assertEquals(
    peer.messages().filter((message) => message.type === "error" && message.code === "termination-failed").length,
    1,
  );
  await assertRejects(() => host.shutdown());
  client.disconnect();
});

Deno.test("exomux rejects oversized inbound bytes before they enter the request queue", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const client = host.connect(peer);

  await client.receive("x".repeat(EXOMUX_PROTOCOL_LIMITS.messageBytes + 1));

  assertEquals(peer.closes, [{ code: 1009, reason: "message-too-large" }]);
  assertEquals(client.inspect().pendingInboundMessages, 0);
  assertEquals(client.inspect().pendingInboundBytes, 0);
  assertEquals(backend.spawnCalls, 0);
  await host.shutdown();
});

function createHost(backend: FakeTerminalBackend, limits: Record<string, number> = {}): ExomuxHostController {
  return createHostWithOptions({ backend, limits });
}

function createHostWithOptions(
  options: Pick<ConstructorParameters<typeof ExomuxHostController>[0], "backend" | "backendFactory" | "limits">,
): ExomuxHostController {
  let nextId = 0;
  return new ExomuxHostController({
    authToken: AUTH_TOKEN,
    ...options,
    now: () => 1000 + nextId,
    idFactory: () => `mux-${++nextId}`,
  });
}

async function authenticate(connection: ExomuxHostConnection): Promise<void> {
  await connection.receive(wire({ version: 1, type: "auth", token: AUTH_TOKEN }));
  await drain();
}

function wire(message: unknown): string {
  return JSON.stringify(message);
}

async function drain(turns = 12): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

async function waitFor(predicate: () => boolean, turns = 10_000): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Timed out waiting for asynchronous host output.");
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

class FakePeer implements ExomuxHostPeer {
  readonly sent: string[] = [];
  readonly closes: Array<{ code: number; reason: string }> = [];

  send(message: string, _signal: AbortSignal): boolean | void | Promise<void> {
    this.sent.push(message);
  }

  close(code: number, reason: string): void {
    this.closes.push({ code, reason });
  }

  messages(): ExomuxServerMessage[] {
    return this.sent.map(decodeExomuxServerMessage);
  }
}

class EventPeer extends FakePeer {
  constructor(readonly events: string[]) {
    super();
  }

  override send(message: string, signal: AbortSignal): boolean | void | Promise<void> {
    const decoded = decodeExomuxServerMessage(message);
    this.events.push(`send:${decoded.type}`);
    return super.send(message, signal);
  }

  override close(code: number, reason: string): void {
    this.events.push(`close:${reason}`);
    super.close(code, reason);
  }
}

class BlockingPeer extends FakePeer {
  override send(message: string): Promise<void> {
    this.sent.push(message);
    return new Promise(() => undefined);
  }
}

class PausablePeer extends FakePeer {
  #gate?: ReturnType<typeof deferred<void>>;

  pause(): void {
    this.#gate ??= deferred<void>();
  }

  resume(): void {
    this.#gate?.resolve();
    this.#gate = undefined;
  }

  override send(message: string): void | Promise<void> {
    this.sent.push(message);
    return this.#gate?.promise;
  }
}

class RejectingPeer extends FakePeer {
  reject = false;

  override send(message: string): boolean | void {
    if (this.reject) return false;
    this.sent.push(message);
  }
}

class AbortableOncePeer extends FakePeer {
  #blockNext = false;
  abortedSends = 0;

  blockNext(): void {
    this.#blockNext = true;
  }

  override send(message: string, signal: AbortSignal): void | Promise<void> {
    this.sent.push(message);
    if (!this.#blockNext) return;
    this.#blockNext = false;
    return new Promise((resolve) => {
      const aborted = () => {
        this.abortedSends += 1;
        resolve();
      };
      if (signal.aborted) aborted();
      else signal.addEventListener("abort", aborted, { once: true });
    });
  }
}

class FakeTerminalBackend implements TerminalBackend {
  readonly id = "fake-pty";
  readonly label = "Fake PTY";
  readonly pty = true;
  readonly detachable = false;
  readonly reconnectable = false;
  readonly handles: FakeTerminalHandle[] = [];
  spawnCalls = 0;

  spawn(options: TerminalBackendSpawnOptions): TerminalSessionHandle {
    this.spawnCalls += 1;
    const handle = new FakeTerminalHandle(options, this.handles.length + 1);
    this.handles.push(handle);
    return handle;
  }
}

class FakeTerminalHandle implements TerminalSessionHandle {
  readonly id: string;
  readonly backendId = "fake-pty";
  readonly command: ProcessSessionCommand;
  readonly output = new TerminalOutputController();
  readonly closed: Promise<ProcessSessionInspection>;
  readonly writes: Uint8Array[] = [];
  readonly resizes: Array<{ columns: number; rows: number }> = [];
  readonly #onData?: TerminalBackendSpawnOptions["onData"];
  #resolveClosed!: (inspection: ProcessSessionInspection) => void;
  #status: ProcessSessionStatus = "running";
  #columns: number;
  #rows: number;
  killCalls = 0;
  disposeCalls = 0;
  killGate?: ReturnType<typeof deferred<boolean>>;
  disposeGate?: ReturnType<typeof deferred<void>>;
  disposeFailure = false;
  title: string;

  constructor(options: TerminalBackendSpawnOptions, index: number) {
    this.id = `fake-handle-${index}`;
    this.command = {
      command: options.command,
      ...(options.args ? { args: [...options.args] } : {}),
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: { ...options.env } } : {}),
    };
    this.#columns = options.columns ?? 80;
    this.#rows = options.rows ?? 24;
    this.#onData = options.onData;
    this.title = options.command;
    this.closed = new Promise((resolve) => {
      this.#resolveClosed = resolve;
    });
  }

  emit(data: string | Uint8Array): void | Promise<void> {
    // Surfaces the consumer's backpressure deferral exactly as the PTY poll
    // loop sees it, so ingestion flow control is assertable.
    return this.#onData?.(data, "stdout");
  }

  write(data: string | Uint8Array): Promise<boolean> {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    this.writes.push(bytes);
    return Promise.resolve(this.#status === "running");
  }

  resize(columns: number, rows: number): Promise<boolean> {
    this.#columns = columns;
    this.#rows = rows;
    this.resizes.push({ columns, rows });
    return Promise.resolve(this.#status === "running");
  }

  kill(): Promise<boolean> {
    this.killCalls += 1;
    if (this.killGate) return this.killGate.promise.then((accepted) => this.finishKill(accepted));
    return Promise.resolve(this.finishKill(this.#status === "running"));
  }

  inspect(): TerminalSessionHandleInspection {
    return {
      id: this.id,
      backendId: this.backendId,
      pty: true,
      title: this.title,
      commandLine: [this.command.command, ...(this.command.args ?? [])].join(" "),
      status: this.#status,
      running: this.#status === "running",
      columns: this.#columns,
      rows: this.#rows,
      resizeSupported: true,
    };
  }

  dispose(): Promise<void> {
    this.disposeCalls += 1;
    if (this.disposeFailure) return Promise.reject(new Error("fake dispose failed"));
    return this.disposeGate?.promise ?? Promise.resolve();
  }

  private finishKill(accepted: boolean): boolean {
    if (!accepted || this.#status !== "running") return false;
    this.#status = "cancelled";
    this.#resolveClosed(this.processInspection());
    return true;
  }

  private processInspection(): ProcessSessionInspection {
    return {
      command: this.command,
      commandLine: [this.command.command, ...(this.command.args ?? [])].join(" "),
      status: this.#status,
      running: false,
      output: this.output.inspect(),
    };
  }
}

Deno.test("exomux re-asserts sticky terminal modes when the replay ring has rotated", async () => {
  const backend = new FakeTerminalBackend();
  // A tiny ring so the opening bytes are evicted almost immediately, exactly as
  // a long-running tmux session evicts the modes it set once at startup.
  const host = createHost(backend, { replayEntries: 2, replayBytes: 1024 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "demo" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();

  const handle = backend.handles[0]!;
  // What tmux emits on startup: alternate screen, cursor keys, SGR mouse,
  // bracketed paste. These are set once and never repeated.
  handle.emit("\x1b[?1049h\x1b[?1h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?2004h");
  handle.emit("later output one");
  handle.emit("later output two");

  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await drain();

  const attached = peer.messages().find((message) => message.type === "attached");
  assert(attached?.type === "attached");
  assertEquals(attached.truncated, true);

  const replayed = peer.messages()
    .filter((message) => message.type === "output")
    .map((message) => textDecoder.decode(decodeExomuxData(message.data)))
    .join("");

  // The evicted mode-setting bytes are re-asserted ahead of what survived, so a
  // fresh view still knows the child wants mouse reporting and the alt screen.
  for (const mode of ["\x1b[?1h", "\x1b[?1000h", "\x1b[?1002h", "\x1b[?1006h", "\x1b[?2004h", "\x1b[?1049h"]) {
    assertStringIncludes(replayed, mode);
  }
  // Alternate screen is asserted after the rest so entering it cannot clobber them.
  assert(
    replayed.indexOf("\x1b[?1049h") > replayed.indexOf("\x1b[?1006h"),
    "alternate screen must be re-entered after the other modes",
  );
  // The surviving output still arrives, and in order.
  assertStringIncludes(replayed, "later output one");
  assertStringIncludes(replayed, "later output two");
  assert(replayed.indexOf("later output one") < replayed.indexOf("later output two"));
});

Deno.test("exomux drops sticky modes the child turned off before a client attaches", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { replayEntries: 2, replayBytes: 1024 });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "demo" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  owner.disconnect();

  const handle = backend.handles[0]!;
  handle.emit("\x1b[?1049h\x1b[?1006h\x1b[?1000h");
  // The program exits its full-screen mode again, so nothing should be asserted.
  handle.emit("\x1b[?1000l\x1b[?1006l\x1b[?1049l");
  handle.emit("back at the shell");
  handle.emit("still at the shell");

  const peer = new FakePeer();
  const client = host.connect(peer);
  await authenticate(client);
  await client.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await drain();

  const replayed = peer.messages()
    .filter((message) => message.type === "output")
    .map((message) => textDecoder.decode(decodeExomuxData(message.data)))
    .join("");
  assertEquals(replayed.includes("\x1b[?1049h"), false, "a mode the child turned off must not come back");
  assertEquals(replayed.includes("\x1b[?1006h"), false);
  assertStringIncludes(replayed, "still at the shell");
});

Deno.test("exomux throttles an unattached flooding session and restores full speed on attach", async () => {
  const backend = new FakeTerminalBackend();
  let clock = 1_000;
  let nextId = 0;
  const host = new ExomuxHostController({
    authToken: AUTH_TOKEN,
    backend,
    limits: { unattachedBytesPerSecond: 1_024 },
    now: () => clock,
    idFactory: () => `mux-${++nextId}`,
  });
  const ownerPeer = new FakePeer();
  const owner = host.connect(ownerPeer);
  await authenticate(owner);
  await owner.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "flood" }));
  await drain();
  const spawned = ownerPeer.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  const handle = backend.handles[0]!;

  // Attached to a draining client: even a large burst flows freely.
  assertEquals(handle.emit("a".repeat(4_096)), undefined);
  owner.disconnect();

  // Roll into a fresh unattached window with a trivial chunk.
  clock = 2_000;
  assertEquals(handle.emit("b".repeat(8)), undefined);
  // Blow the budget near the end of the window: reads defer to the window edge.
  clock = 2_998;
  const throttled = handle.emit("c".repeat(2_048));
  assert(throttled instanceof Promise, "an over-budget unattached session must defer reads");
  await throttled;
  // A fresh window drains freely again.
  clock = 3_000;
  assertEquals(handle.emit("d".repeat(8)), undefined);
  // Saturate once more, then let a watcher attach: full speed must return.
  clock = 3_998;
  const throttledAgain = handle.emit("e".repeat(2_048));
  assert(throttledAgain instanceof Promise);
  await throttledAgain;

  const watcherPeer = new FakePeer();
  const watcher = host.connect(watcherPeer);
  await authenticate(watcher);
  await watcher.receive(wire({
    version: 1,
    type: "attach",
    requestId: 1,
    sessionId: spawned.session.id,
    afterSequence: 0,
  }));
  await drain();
  assertEquals(handle.emit("f".repeat(4_096)), undefined, "attaching must restore full-speed ingestion");
  watcher.disconnect();
  await host.shutdown();
});

Deno.test("exomux defers ingestion while every attached client is saturated instead of executing them", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend, { outboundBytes: 4_096 });
  const peer = new PausablePeer();
  const connection = host.connect(peer);
  await authenticate(connection);
  await connection.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "flood" }));
  await drain();
  const handle = backend.handles[0]!;
  peer.pause();

  // The transport stalls, the queue grows; past the high-water mark the read
  // loop defers instead of overflowing the queue into a slow-client close.
  let deferral: void | Promise<void> = undefined;
  for (let burst = 0; burst < 8 && !deferral; burst += 1) {
    deferral = handle.emit("z".repeat(512));
    await drain();
  }
  assert(deferral instanceof Promise, "saturated clients must defer PTY ingestion");
  assertEquals(peer.closes, [], "a deferring session must not execute its client as slow-client");

  // The deferral resolves once the client actually drains, not on a timer.
  peer.resume();
  await deferral;
  await waitFor(() => connection.inspect().queuedOutboundBytes === 0);
  assertEquals(handle.emit("ok"), undefined, "a drained client restores full-speed ingestion");
  assertEquals(peer.closes, []);
  connection.disconnect();
  await host.shutdown();
});

Deno.test("exomux host relocates its descriptor on rename and acknowledges", async () => {
  const backend = new FakeTerminalBackend();
  const relocations: string[] = [];
  const host = new ExomuxHostController({
    authToken: AUTH_TOKEN,
    backend,
    relocateDescriptor: (path) => {
      relocations.push(path);
      return true;
    },
    now: () => 1000,
    idFactory: (() => {
      let n = 0;
      return () => `mux-${++n}`;
    })(),
  });
  const peer = new FakePeer();
  const connection = host.connect(peer);
  await authenticate(connection);
  await connection.receive(wire({
    version: 1,
    type: "rename",
    requestId: 7,
    descriptorPath: "/state/sessions/work/host.json",
  }));
  await drain();
  const ack = peer.messages().find((message) => message.type === "ack");
  assert(ack?.type === "ack");
  assertEquals(ack.operation, "rename");
  assertEquals(relocations, ["/state/sessions/work/host.json"]);
  await host.shutdown();
});

Deno.test("exomux host reports a rename failure when relocation is refused", async () => {
  const backend = new FakeTerminalBackend();
  const host = new ExomuxHostController({
    authToken: AUTH_TOKEN,
    backend,
    relocateDescriptor: () => false,
    now: () => 1000,
    idFactory: (() => {
      let n = 0;
      return () => `mux-${++n}`;
    })(),
  });
  const peer = new FakePeer();
  const connection = host.connect(peer);
  await authenticate(connection);
  await connection.receive(wire({ version: 1, type: "rename", requestId: 3, descriptorPath: "/state/host.json" }));
  await drain();
  const error = peer.messages().find((message) => message.type === "error");
  assert(error?.type === "error");
  assertEquals(error.code, "rename-failed");
  await host.shutdown();
});

// An in-process host with no relocator (tests, embedded hosts) still acks a
// rename as a no-op, since the client owns the filesystem side of the move.
Deno.test("exomux host acknowledges rename as a no-op without a relocator", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const connection = host.connect(peer);
  await authenticate(connection);
  await connection.receive(wire({ version: 1, type: "rename", requestId: 1, descriptorPath: "/anywhere/host.json" }));
  await drain();
  const ack = peer.messages().find((message) => message.type === "ack");
  assert(ack?.type === "ack" && ack.operation === "rename");
  await host.shutdown();
});

Deno.test("exomux broadcasts terminal lifecycle to every authenticated client (UX-007)", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peerA = new FakePeer();
  const peerB = new FakePeer();
  const clientA = host.connect(peerA);
  const clientB = host.connect(peerB);
  await authenticate(clientA);
  await authenticate(clientB);

  // A spawns; B — attached to nothing — still hears about the new terminal.
  await clientA.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "shared-shell" }));
  await drain();
  const spawned = peerA.messages().find((message) => message.type === "spawned");
  assert(spawned?.type === "spawned");
  const seenByB = peerB.messages().filter((message) =>
    message.type === "session-state" && message.session.id === spawned.session.id
  );
  assert(seenByB.length >= 1, "the second client hears the spawn");

  // A kills; B hears a final not-running state before the session vanishes.
  await clientA.receive(wire({ version: 1, type: "kill", requestId: 2, sessionId: spawned.session.id }));
  await drain();
  const finalStates = peerB.messages().filter((message) =>
    message.type === "session-state" && message.session.id === spawned.session.id &&
    message.session.running === false
  );
  assert(finalStates.length >= 1, "the second client hears the terminal end");

  await host.shutdown();
  clientA.disconnect();
  clientB.disconnect();
});

// Plan 041 phase B: the shared-state channel. The host retains one record per
// key and relays it to every OTHER client, so appearance and window lifecycle
// can be shared without the host understanding either.

Deno.test("workspace state is retained, relayed to other clients, and replayed on attach", async () => {
  const backend = new FakeTerminalBackend();
  const host = new ExomuxHostController({ authToken: AUTH_TOKEN, backend });
  const firstPeer = new FakePeer();
  const first = host.connect(firstPeer);
  await authenticate(first);
  const secondPeer = new FakePeer();
  const second = host.connect(secondPeer);
  await authenticate(second);

  const before = secondPeer.messages().length;
  await first.receive(JSON.stringify({
    version: 1,
    type: "workspace",
    requestId: 7,
    key: "preferences",
    revision: 1,
    payload: { themeId: "matrix" },
  }));

  // The publisher gets an ack and nothing else; the other client gets the state.
  const acks = firstPeer.messages().filter((message) => message.type === "ack");
  assertEquals(acks.at(-1), { version: 1, type: "ack", requestId: 7, operation: "workspace" });
  assert(
    !firstPeer.messages().some((message) => message.type === "workspace-state"),
    "a publisher is not echoed its own state",
  );
  const relayed = secondPeer.messages().slice(before).filter((message) => message.type === "workspace-state");
  assertEquals(relayed.length, 1);
  assertEquals(relayed[0], {
    version: 1,
    type: "workspace-state",
    key: "preferences",
    revision: 1,
    payload: { themeId: "matrix" },
  });

  // A stale revision cannot roll the desktop back.
  const beforeStale = secondPeer.messages().length;
  await first.receive(JSON.stringify({
    version: 1,
    type: "workspace",
    requestId: 8,
    key: "preferences",
    revision: 1,
    payload: { themeId: "paper" },
  }));
  assertEquals(
    secondPeer.messages().slice(beforeStale).filter((message) => message.type === "workspace-state").length,
    0,
    "a revision that is not newer is dropped",
  );

  // A client joining later adopts the desktop as it already is.
  const thirdPeer = new FakePeer();
  const third = host.connect(thirdPeer);
  await authenticate(third);
  const replayed = thirdPeer.messages().filter((message) => message.type === "workspace-state");
  assertEquals(replayed.length, 1);
  assertEquals(replayed[0]?.payload, { themeId: "matrix" });

  await host.shutdown();
});

Deno.test("workspace keys and payloads are validated at the protocol edge", async () => {
  const backend = new FakeTerminalBackend();
  const host = new ExomuxHostController({ authToken: AUTH_TOKEN, backend });

  // A protocol violation is fatal to its connection, so each case gets its own.
  for (
    const [label, message] of [
      ["an upper-case key", { key: "Preferences", revision: 1, payload: {} }],
      ["a zero revision", { key: "preferences", revision: 0, payload: {} }],
      ["an oversized payload", { key: "preferences", revision: 1, payload: { blob: "x".repeat(70_000) } }],
    ] as const
  ) {
    const peer = new FakePeer();
    const connection = host.connect(peer);
    await authenticate(connection);
    const before = peer.messages().length;
    await connection.receive(JSON.stringify({ version: 1, type: "workspace", requestId: 3, ...message }));
    const responses = peer.messages().slice(before);
    assert(
      responses.some((response) => response.type === "error") || peer.closes.length > 0,
      `${label} is rejected`,
    );
    assert(
      !responses.some((response) => response.type === "ack"),
      `${label} is never acknowledged`,
    );
  }

  await host.shutdown();
});

// A daemon outlives the clients that connect to it — that is the entire point
// of detaching — so a client reinstalled around a running daemon routinely
// speaks a slightly larger protocol than the daemon knows. Closing the
// connection over that takes every live terminal down with it. That is how a
// shared-state message from a newer client bricked reattaching to a daemon
// which had been holding a tmux session for an hour and a half.

Deno.test("exomux host refuses an unknown message type without dropping the session", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);
  const peer = new FakePeer();
  const connection = host.connect(peer);
  await authenticate(connection);
  await connection.receive(wire({ version: 1, type: "spawn", requestId: 1, command: "/bin/fake" }));
  assert(peer.messages().some((message) => message.type === "spawned"), "the session exists before the skew");

  await connection.receive(wire({ version: 1, type: "presence", requestId: 7, payload: { any: true } }));

  assertEquals(peer.closes, [], "version skew does not close the connection");
  const refusal = peer.messages().find((message) => message.type === "error");
  assertEquals(refusal?.code, "unknown-message");
  assertEquals(
    refusal?.requestId,
    7,
    "the refusal is correlated, so only that call fails — an uncorrelated error is terminal on the client",
  );

  // The connection is still usable, which is the whole point: the terminal
  // this client is showing survives the skew.
  await connection.receive(wire({ version: 1, type: "list", requestId: 8 }));
  assertEquals(peer.messages().filter((message) => message.type === "sessions").length, 1);

  await host.shutdown();
});

Deno.test("an unknown message type still closes when uncorrelated or unauthenticated", async () => {
  const backend = new FakeTerminalBackend();
  const host = createHost(backend);

  const uncorrelated = new FakePeer();
  const first = host.connect(uncorrelated);
  await authenticate(first);
  await first.receive(wire({ version: 1, type: "presence", payload: 1 }));
  assertEquals(uncorrelated.closes, [{ code: 1002, reason: "protocol-error" }]);

  const unauthenticated = new FakePeer();
  const second = host.connect(unauthenticated);
  await second.receive(wire({ version: 1, type: "presence", requestId: 3 }));
  assertEquals(unauthenticated.closes.length, 1, "an unauthenticated stranger is still shown the door");

  await host.shutdown();
});
