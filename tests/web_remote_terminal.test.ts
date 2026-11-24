import { assert, assertEquals, assertNotEquals, assertThrows } from "./deps.ts";
import { TerminalOutputController } from "../src/components/terminal_output.ts";
import type { ProcessSessionCommand, ProcessSessionInspection, ProcessSessionStatus } from "../src/runtime/mod.ts";
import type { TerminalSessionHandle } from "../src/runtime/terminal_backend.ts";
import {
  defaultWebTerminalWorkspaceSnapshot,
  normalizeWebTerminalWorkspaceSnapshot,
} from "../examples/web/api_workbench_terminal_workspace.ts";
import {
  createNegotiatedRemoteTerminalBridge,
  createNegotiatedRemoteTerminalClient,
  createRemoteTerminalBridge,
  createRemoteTerminalClient,
  decodeRemoteHandshakeMessage,
  decodeRemoteTerminalClientMessage,
  decodeRemoteTerminalServerMessage,
  encodeRemoteHandshakeMessage,
  encodeRemoteTerminalInput,
  encodeRemoteTerminalMessage,
  RemoteTerminalNegotiationError,
  type RemoteTerminalTransport,
} from "../mod.remote.ts";

Deno.test("web api workbench terminal workspace default exposes browser demo sessions", () => {
  const snapshot = defaultWebTerminalWorkspaceSnapshot();

  assertEquals(snapshot.activeId, "pages-shell");
  assertEquals(snapshot.sessions.map((session) => session.id), ["pages-shell", "remote-attach", "ci-task"]);
  assertEquals(snapshot.sessions.map((session) => session.template.kind), ["command", "attach", "deno-task"]);
  assertEquals(snapshot.sessions[0]?.status, "running");
  assertEquals(snapshot.sessions[1]?.reconnectable, true);
  assertEquals(snapshot.sessions[2]?.restartPolicy, "on-failure");
});

Deno.test("web api workbench terminal workspace normalizer rejects non-workspace values", () => {
  assertEquals(normalizeWebTerminalWorkspaceSnapshot(undefined), undefined);
  assertEquals(normalizeWebTerminalWorkspaceSnapshot({}), undefined);
  assertEquals(normalizeWebTerminalWorkspaceSnapshot({ sessions: [], layout: {} }), undefined);
});

Deno.test("web api workbench terminal workspace normalizer clones and repairs active session", () => {
  const source = defaultWebTerminalWorkspaceSnapshot();
  const normalized = normalizeWebTerminalWorkspaceSnapshot({ ...source, activeId: "missing-session" });

  assertEquals(normalized?.version, 1);
  assertEquals(normalized?.activeId, "pages-shell");
  assertEquals(normalized?.sessions.map((session) => session.id), ["pages-shell", "remote-attach", "ci-task"]);
  assertNotEquals(normalized?.sessions, source.sessions);
  assertNotEquals(normalized?.sessions[0], source.sessions[0]);
});

Deno.test("remote terminal protocol preserves input event buffers", () => {
  const encoded = encodeRemoteTerminalMessage({
    type: "input",
    input: {
      kind: "keyPress",
      event: {
        key: "a",
        meta: false,
        ctrl: true,
        shift: false,
        buffer: new Uint8Array([1, 2, 3]),
      },
    },
  });

  assertEquals(decodeRemoteTerminalClientMessage(encoded), {
    type: "input",
    input: {
      kind: "keyPress",
      event: {
        key: "a",
        meta: false,
        ctrl: true,
        shift: false,
        buffer: new Uint8Array([1, 2, 3]),
      },
    },
  });
});

Deno.test("remote terminal protocol preserves paste and focus events", () => {
  const paste = encodeRemoteTerminalMessage({
    type: "input",
    input: {
      kind: "paste",
      event: {
        key: "paste",
        text: "alpha\nbeta",
        buffer: new Uint8Array([97, 10, 98]),
      },
    },
  });
  const focus = encodeRemoteTerminalMessage({
    type: "input",
    input: {
      kind: "terminalFocus",
      event: {
        key: "focus",
        focused: true,
        buffer: new Uint8Array(),
      },
    },
  });

  assertEquals(decodeRemoteTerminalClientMessage(paste), {
    type: "input",
    input: {
      kind: "paste",
      event: {
        key: "paste",
        text: "alpha\nbeta",
        buffer: new Uint8Array([97, 10, 98]),
      },
    },
  });
  assertEquals(decodeRemoteTerminalClientMessage(focus), {
    type: "input",
    input: {
      kind: "terminalFocus",
      event: {
        key: "focus",
        focused: true,
        buffer: new Uint8Array(),
      },
    },
  });
});

Deno.test("remote terminal client sends input and emits terminal data", () => {
  const transport = new FakeRemoteTerminalTransport();
  const client = createRemoteTerminalClient(transport);
  const data: Array<string | Uint8Array> = [];
  client.on("data", (value) => {
    data.push(value);
  });

  client.sendKeyPress({
    key: "return",
    meta: false,
    ctrl: false,
    shift: false,
    buffer: new Uint8Array([13]),
  });
  client.resize({ columns: 120, rows: 36 });
  transport.receive(JSON.stringify({ type: "data", data: "hello" }));

  assertEquals(decodeRemoteTerminalClientMessage(transport.sent[0]!), {
    type: "input",
    input: {
      kind: "keyPress",
      event: {
        key: "return",
        meta: false,
        ctrl: false,
        shift: false,
        buffer: new Uint8Array([13]),
      },
    },
  });
  assertEquals(decodeRemoteTerminalClientMessage(transport.sent[1]!), {
    type: "resize",
    size: { columns: 120, rows: 36 },
  });
  assertEquals(data, ["hello"]);
  assertEquals(client.inspectClient(), {
    open: true,
    dataMessages: 1,
    inputMessages: 1,
    resizeMessages: 1,
  });
});

Deno.test("remote terminal input encoder preserves key paste and mouse buffers", () => {
  assertEquals(
    encodeRemoteTerminalInput({
      kind: "keyPress",
      event: { key: "up", meta: false, ctrl: false, shift: false, buffer: new Uint8Array() },
    }),
    new TextEncoder().encode("\x1b[A"),
  );
  assertEquals(
    encodeRemoteTerminalInput(
      {
        kind: "keyPress",
        event: {
          key: "up",
          meta: false,
          ctrl: false,
          shift: false,
          buffer: new TextEncoder().encode("\x1b[A"),
        },
      },
      { applicationCursorKeys: true },
    ),
    new TextEncoder().encode("\x1bOA"),
  );
  assertEquals(
    encodeRemoteTerminalInput({
      kind: "paste",
      event: { key: "paste", text: "paste", buffer: new Uint8Array() },
    }),
    new TextEncoder().encode("paste"),
  );
  assertEquals(
    encodeRemoteTerminalInput(
      {
        kind: "paste",
        event: { key: "paste", text: "paste", buffer: new Uint8Array() },
      },
      { bracketedPaste: true },
    ),
    new TextEncoder().encode("\x1b[200~paste\x1b[201~"),
  );
  assertEquals(
    encodeRemoteTerminalInput(
      {
        kind: "terminalFocus",
        event: { key: "focus", focused: true, buffer: new Uint8Array() },
      },
      { focusReporting: true },
    ),
    new TextEncoder().encode("\x1b[I"),
  );
  assertEquals(
    encodeRemoteTerminalInput(
      {
        kind: "terminalFocus",
        event: { key: "focus", focused: false, buffer: new Uint8Array() },
      },
      { focusReporting: true },
    ),
    new TextEncoder().encode("\x1b[O"),
  );
  assertEquals(
    encodeRemoteTerminalInput(
      {
        kind: "terminalFocus",
        event: { key: "focus", focused: true, buffer: new TextEncoder().encode("\x1b[I") },
      },
      { focusReporting: false },
    ),
    undefined,
  );
  assertEquals(
    encodeRemoteTerminalInput({
      kind: "mousePress",
      event: {
        key: "mouse",
        buffer: new Uint8Array([1, 2, 3]),
        x: 1,
        y: 2,
        movementX: 0,
        movementY: 0,
        meta: false,
        ctrl: false,
        shift: false,
        drag: false,
        release: false,
        button: 0,
      },
    }),
    new Uint8Array([1, 2, 3]),
  );
});

Deno.test("remote terminal bridge routes client messages to backend handles", async () => {
  const transport = new FakeRemoteTerminalTransport();
  const session = new FakeTerminalSessionHandle();
  const bridge = createRemoteTerminalBridge(transport, session);

  transport.receive(encodeRemoteTerminalMessage({
    type: "input",
    input: {
      kind: "keyPress",
      event: { key: "a", meta: false, ctrl: false, shift: false, buffer: new Uint8Array() },
    },
  }));
  await tick();
  assertEquals(session.writes, ["a"]);

  transport.receive(encodeRemoteTerminalMessage({ type: "resize", size: { columns: 100, rows: 30 } }));
  await tick();
  assertEquals(session.columns, 100);
  assertEquals(session.rows, 30);
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent.at(-1)!), {
    type: "resize",
    size: { columns: 100, rows: 30 },
  });

  transport.receive(encodeRemoteTerminalMessage({ type: "ping", id: "p1" }));
  await tick();
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent.at(-1)!), { type: "pong", id: "p1" });

  session.output.appendText("stdout", "ready", 1);
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent.at(-1)!), { type: "data", data: "[out] ready\n" });
  bridge.sendData(new Uint8Array([7, 8]));
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent.at(-1)!), {
    type: "binary",
    data: new Uint8Array([7, 8]),
  });

  transport.receive("{");
  await tick();
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent.at(-1)!).type, "error");
  assertEquals(bridge.inspectBridge(), {
    open: true,
    dataMessages: 2,
    inputMessages: 1,
    resizeMessages: 1,
    errorMessages: 1,
  });

  const sentBeforeClose = transport.sent.length;
  bridge.close("done");
  assertEquals(transport.sent.length, sentBeforeClose + 1);
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent.at(-1)!), { type: "close", reason: "done" });
});

Deno.test("negotiated remote terminal gates traffic then routes the full default capability set", async () => {
  const [clientTransport, serverTransport] = linkedRemoteTerminalTransports();
  const session = new FakeTerminalSessionHandle();
  const bridge = createNegotiatedRemoteTerminalBridge(serverTransport, session);
  const client = createNegotiatedRemoteTerminalClient(clientTransport);
  const data: Array<string | Uint8Array> = [];
  const pongs: string[] = [];
  client.on("data", (value) => {
    data.push(value);
  });
  client.on("pong", (id) => {
    pongs.push(id);
  });

  const expectedCapabilities = [
    "terminal.binary",
    "terminal.input",
    "terminal.output",
    "terminal.ping",
    "terminal.resize",
  ];
  assertEquals(client.inspectClient().handshake.state, "ready");
  assertEquals(client.inspectClient().handshake.negotiated?.capabilities, expectedCapabilities);
  assertEquals(bridge.inspectBridge().handshake.state, "ready");
  assertEquals(bridge.inspectBridge().handshake.negotiated?.capabilities, expectedCapabilities);

  client.sendKeyPress({
    key: "a",
    meta: false,
    ctrl: false,
    shift: false,
    buffer: new Uint8Array(),
  });
  client.resize({ columns: 132, rows: 41 });
  client.ping("heartbeat-1");
  await tick();
  assertEquals(session.writes, ["a"]);
  assertEquals([session.columns, session.rows], [132, 41]);
  assertEquals(pongs, ["heartbeat-1"]);

  bridge.sendData("ready");
  bridge.sendData(new Uint8Array([7, 8]));
  assertEquals(data, ["ready", new Uint8Array([7, 8])]);
  assertEquals(client.inspectClient().dataMessages, 2);
  assertEquals(bridge.inspectBridge().dataMessages, 2);

  client.close(undefined, "done");
  client.close(undefined, "again");
  assertEquals(clientTransport.closeCalls, 1);
  assertEquals(bridge.inspectBridge().open, false);
});

Deno.test("negotiated bridge rejects application traffic before hello without touching the session", async () => {
  const transport = new FakeRemoteTerminalTransport();
  const session = new FakeTerminalSessionHandle();
  const bridge = createNegotiatedRemoteTerminalBridge(transport, session);

  transport.receive(encodeRemoteTerminalMessage({
    type: "input",
    input: {
      kind: "keyPress",
      event: { key: "x", meta: false, ctrl: false, shift: false, buffer: new Uint8Array() },
    },
  }));
  await tick();

  assertEquals(session.writes, []);
  assertEquals(bridge.inspectBridge().inputMessages, 0);
  assertEquals(bridge.inspectBridge().handshake.rejection?.code, "traffic-before-ready");
  const rejection = decodeRemoteHandshakeMessage(transport.sent[0]!);
  assert(rejection.type === "remote.handshake.reject");
  assertEquals(rejection.rejection.code, "traffic-before-ready");
  assertEquals(transport.closeCalls, 1);
});

Deno.test("negotiated bridge sends incompatible-major rejection before closure", () => {
  const transport = new FakeRemoteTerminalTransport();
  const session = new FakeTerminalSessionHandle();
  const bridge = createNegotiatedRemoteTerminalBridge(transport, session);
  const incompatibleHello = {
    type: "remote.handshake.hello" as const,
    schemaVersion: 1 as const,
    protocol: { major: 2, minor: 0 },
    capabilities: {
      mandatory: ["terminal.input", "terminal.output"],
      optional: ["terminal.binary", "terminal.ping", "terminal.resize"],
    },
  };

  transport.receive(encodeRemoteHandshakeMessage(incompatibleHello));

  const rejection = decodeRemoteHandshakeMessage(transport.sent[0]!);
  assertEquals(rejection.type, "remote.handshake.reject");
  assert(rejection.type === "remote.handshake.reject");
  assertEquals(rejection.rejection.code, "incompatible-major");
  assertEquals(rejection.rejection.peerProtocol, { major: 2, minor: 0 });
  assertEquals(bridge.inspectBridge().open, false);
  assertEquals(transport.closeCalls, 1);
});

Deno.test("negotiated client refuses sends and rejects server data before acknowledgement", () => {
  const transport = new FakeRemoteTerminalTransport();
  const client = createNegotiatedRemoteTerminalClient(transport);
  const data: string[] = [];
  client.on("data", (value) => {
    if (typeof value === "string") data.push(value);
  });

  const notReady = assertThrows(
    () =>
      client.sendKeyPress({
        key: "a",
        meta: false,
        ctrl: false,
        shift: false,
        buffer: new Uint8Array(),
      }),
    RemoteTerminalNegotiationError,
  );
  assertEquals(notReady.code, "not-ready");
  assertEquals(transport.sent.length, 1);

  transport.receive(JSON.stringify({ type: "data", data: "too early" }));
  assertEquals(data, []);
  assertEquals(client.inspectClient().inputMessages, 0);
  assertEquals(client.inspectClient().handshake.rejection?.code, "traffic-before-ready");
  const rejection = decodeRemoteHandshakeMessage(transport.sent.at(-1)!);
  assert(rejection.type === "remote.handshake.reject");
  assertEquals(rejection.rejection.code, "traffic-before-ready");
  assertEquals(transport.closeCalls, 1);
});

Deno.test("negotiated client waits for transport open and never queues application traffic ahead of hello", () => {
  const transport = new DelayedOpenRemoteTerminalTransport();
  const client = createNegotiatedRemoteTerminalClient(transport);
  assertEquals(client.inspectClient().handshake.state, "idle");
  assertEquals(transport.sent, []);
  assertEquals(
    assertThrows(
      () =>
        client.sendKeyPress({
          key: "a",
          meta: false,
          ctrl: false,
          shift: false,
          buffer: new Uint8Array(),
        }),
      RemoteTerminalNegotiationError,
    ).code,
    "not-ready",
  );
  assertEquals(transport.sent, []);

  transport.open();
  transport.open();
  assertEquals(transport.sent.length, 1);
  assertEquals(decodeRemoteHandshakeMessage(transport.sent[0]!).type, "remote.handshake.hello");
  assertEquals(client.inspectClient().handshake.state, "hello-sent");

  const closedTransport = new DelayedOpenRemoteTerminalTransport();
  const closedClient = createNegotiatedRemoteTerminalClient(closedTransport);
  closedClient.close();
  closedTransport.open();
  assertEquals(closedTransport.sent, []);
  assertEquals(closedTransport.closeCalls, 1);
  assertEquals(closedTransport.openRemoveCalls, 1);
});

Deno.test("negotiated client rejects hostile proxy wire values without invoking their getters", () => {
  const transport = new FakeRemoteTerminalTransport();
  const client = createNegotiatedRemoteTerminalClient(transport);
  let getterCalls = 0;
  const hostileWire = new Proxy(new Uint8Array(), {
    get() {
      getterCalls += 1;
      throw new Error("wire getter must not run");
    },
  });

  transport.receive(hostileWire);

  assertEquals(getterCalls, 0);
  assertEquals(client.inspectClient().open, false);
  assertEquals(client.inspectClient().handshake.rejection?.code, "malformed-handshake");
  assertEquals(transport.closeCalls, 1);
});

Deno.test("negotiated endpoints clean up synchronous registration reentrancy without starting afterward", () => {
  const clientTransport = new SynchronousMessageRegistrationTransport(
    JSON.stringify({ type: "data", data: "before registration returns" }),
  );
  const client = createNegotiatedRemoteTerminalClient(clientTransport);
  assertEquals(client.inspectClient().open, false);
  assertEquals(client.inspectClient().handshake.rejection?.code, "traffic-before-ready");
  assertEquals(clientTransport.synchronousRemoveCalls, 1);
  assertEquals(clientTransport.sent.length, 1);
  assertEquals(decodeRemoteHandshakeMessage(clientTransport.sent[0]!).type, "remote.handshake.reject");

  const bridgeTransport = new SynchronousMessageRegistrationTransport(encodeRemoteTerminalMessage({
    type: "resize",
    size: { columns: 90, rows: 28 },
  }));
  const session = new FakeTerminalSessionHandle();
  const bridge = createNegotiatedRemoteTerminalBridge(bridgeTransport, session);
  assertEquals(bridge.inspectBridge().open, false);
  assertEquals(bridge.inspectBridge().handshake.rejection?.code, "traffic-before-ready");
  assertEquals(bridgeTransport.synchronousRemoveCalls, 1);
  assertEquals([session.columns, session.rows], [80, 24]);
});

Deno.test("negotiated optional capability omission is deterministic and locally enforced", () => {
  const transport = new FakeRemoteTerminalTransport();
  const client = createNegotiatedRemoteTerminalClient(transport, {
    manifest: {
      protocol: { major: 1, minor: 3 },
      mandatory: ["terminal.input", "terminal.output"],
      optional: [],
    },
  });
  transport.receive(encodeRemoteHandshakeMessage({
    type: "remote.handshake.ack",
    schemaVersion: 1,
    protocol: { major: 1, minor: 2 },
    capabilities: ["terminal.output", "terminal.input"],
  }));

  assertEquals(client.inspectClient().handshake.negotiated, {
    protocol: { major: 1, minor: 2 },
    capabilities: ["terminal.input", "terminal.output"],
  });
  const resizeError = assertThrows(
    () => client.resize({ columns: 100, rows: 30 }),
    RemoteTerminalNegotiationError,
  );
  assertEquals(resizeError.code, "capability-not-negotiated");
  assertEquals(resizeError.capability, "terminal.resize");
  assertEquals(client.inspectClient().resizeMessages, 0);
  assertEquals(transport.sent.length, 1);
});

Deno.test("negotiated client rejects oversized reordered stale handshakes before application parsing", () => {
  const transport = new FakeRemoteTerminalTransport();
  const client = createNegotiatedRemoteTerminalClient(transport);
  transport.receive(defaultRemoteTerminalAck());
  const stale = JSON.stringify({
    padding: "x".repeat(20_000),
    type: "remote.handshake.ack",
    schemaVersion: 1,
    protocol: { major: 1, minor: 0 },
    capabilities: ["terminal.input", "terminal.output"],
  });

  transport.receive(stale);

  assertEquals(client.inspectClient().open, false);
  assertEquals(client.inspectClient().handshake.rejection, {
    code: "invalid-negotiation",
    message: "remote terminal text message exceeds the wire bound",
    localProtocol: { major: 1, minor: 0 },
  });
  assertEquals(transport.closeCalls, 1);
});

Deno.test("negotiated client preserves arbitrary post-ready binary that resembles a handshake", () => {
  const transport = new FakeRemoteTerminalTransport();
  const client = createNegotiatedRemoteTerminalClient(transport);
  const data: Array<string | Uint8Array> = [];
  client.on("data", (value) => {
    data.push(value);
  });
  transport.receive(defaultRemoteTerminalAck());
  const binary = new TextEncoder().encode(JSON.stringify({
    type: "remote.handshake.ack",
    padding: "x".repeat(20_000),
    schemaVersion: 1,
    protocol: { major: 1, minor: 0 },
    capabilities: ["terminal.input", "terminal.output"],
  }));

  transport.receive(binary);

  assertEquals(data, [binary]);
  assertEquals(client.inspectClient().open, true);
  assertEquals(transport.closeCalls, 0);
});

Deno.test("duplicate negotiated acknowledgement closes once under listener reentrancy", () => {
  const transport = new FakeRemoteTerminalTransport();
  const client = createNegotiatedRemoteTerminalClient(transport);
  const ack = encodeRemoteHandshakeMessage({
    type: "remote.handshake.ack",
    schemaVersion: 1,
    protocol: { major: 1, minor: 0 },
    capabilities: [
      "terminal.binary",
      "terminal.input",
      "terminal.output",
      "terminal.ping",
      "terminal.resize",
    ],
  });
  let rejectionEvents = 0;
  let closeEvents = 0;
  client.on("rejection", () => {
    rejectionEvents += 1;
    client.close(undefined, "listener-close");
  });
  client.on("close", () => {
    closeEvents += 1;
    client.close(undefined, "close-listener-reentry");
  });

  transport.receive(ack);
  transport.receive(ack);

  assertEquals(client.inspectClient().handshake.rejection?.code, "duplicate-handshake");
  assertEquals(rejectionEvents, 1);
  assertEquals(closeEvents, 1);
  assertEquals(transport.closeCalls, 1);
  assertEquals(transport.removeCalls, 3);
  client.close();
  assertEquals(transport.closeCalls, 1);
});

Deno.test("negotiated bridge queues output until ack and catches up only after ready", () => {
  const transport = new FakeRemoteTerminalTransport();
  const session = new FakeTerminalSessionHandle();
  const bridge = createNegotiatedRemoteTerminalBridge(transport, session);
  session.output.appendText("stdout", "waiting", 1);
  assertEquals(transport.sent, []);
  assertEquals(
    assertThrows(() => bridge.sendData("also waiting"), RemoteTerminalNegotiationError).code,
    "not-ready",
  );

  transport.receive(defaultRemoteTerminalHello());

  assertEquals(decodeRemoteHandshakeMessage(transport.sent[0]!).type, "remote.handshake.ack");
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent[1]!), { type: "data", data: "[out] waiting\n" });
  assertEquals(bridge.inspectBridge().dataMessages, 1);
});

Deno.test("negotiated bridge snapshots data options before mutation and preserves output ordering", () => {
  const transport = new FakeRemoteTerminalTransport();
  const session = new FakeTerminalSessionHandle();
  const options = { killOnClose: false, sourcePrefix: true };
  const bridge = createNegotiatedRemoteTerminalBridge(transport, session, options);
  let getterCalls = 0;
  Object.defineProperties(options, {
    killOnClose: {
      configurable: true,
      get() {
        getterCalls += 1;
        throw new Error("late killOnClose getter must not run");
      },
    },
    sourcePrefix: {
      configurable: true,
      get() {
        getterCalls += 1;
        throw new Error("late sourcePrefix getter must not run");
      },
    },
  });
  transport.receive(defaultRemoteTerminalHello());

  session.output.appendText("stdout", "preserved", 1);
  bridge.close("done");

  assertEquals(getterCalls, 0);
  assertEquals(decodeRemoteTerminalServerMessage(transport.sent[1]!), {
    type: "data",
    data: "[out] preserved\n",
  });
  assertEquals(session.killCalls, 0);
  assertEquals(transport.closeCalls, 1);
});

Deno.test("negotiated bridge rejects accessor options without executing them", () => {
  const transport = new FakeRemoteTerminalTransport();
  const session = new FakeTerminalSessionHandle();
  let getterCalls = 0;
  const options = Object.defineProperty({}, "killOnClose", {
    get() {
      getterCalls += 1;
      throw new Error("option getter must not run");
    },
  });

  const failure = assertThrows(
    () => createNegotiatedRemoteTerminalBridge(transport, session, options),
    RemoteTerminalNegotiationError,
  );
  assertEquals(failure.code, "invalid-options");
  assertEquals(getterCalls, 0);
  assertEquals(transport.sendCalls, 0);
  assertEquals(transport.closeCalls, 0);
});

Deno.test("negotiated bridge closes transport even when kill returns a hostile thenable", () => {
  const transport = new FakeRemoteTerminalTransport();
  const session = new FakeTerminalSessionHandle();
  let thenGetterCalls = 0;
  session.killResult = {
    get then() {
      thenGetterCalls += 1;
      throw new Error("hostile then getter");
    },
  };
  const bridge = createNegotiatedRemoteTerminalBridge(transport, session, { killOnClose: true });

  bridge.close("done");

  assertEquals(bridge.inspectBridge().open, false);
  assertEquals(transport.closeCalls, 1);
  assertEquals(session.killCalls, 1);
  assertEquals(thenGetterCalls, 1);
});

Deno.test("negotiated handshake send failure rejects and disposes transport listeners once", () => {
  const transport = new FakeRemoteTerminalTransport();
  transport.throwOnSend = true;
  const client = createNegotiatedRemoteTerminalClient(transport);

  assertEquals(client.inspectClient().open, false);
  assertEquals(client.inspectClient().handshake.rejection?.code, "send-failed");
  assertEquals(transport.sendCalls, 1);
  assertEquals(transport.closeCalls, 1);
  assertEquals(transport.removeCalls, 3);
  client.close();
  assertEquals(transport.closeCalls, 1);
  assertEquals(transport.removeCalls, 3);
});

Deno.test("negotiated handshake send failure emits one error event", () => {
  const transport = new DelayedOpenRemoteTerminalTransport();
  transport.throwOnSend = true;
  const client = createNegotiatedRemoteTerminalClient(transport);
  let errorEvents = 0;
  client.on("error", () => {
    errorEvents += 1;
  });

  transport.open();

  assertEquals(errorEvents, 1);
  assertEquals(client.inspectClient().handshake.rejection?.code, "send-failed");
  assertEquals(transport.closeCalls, 1);
});

class FakeRemoteTerminalTransport implements RemoteTerminalTransport {
  readonly sent: Array<string | Uint8Array> = [];
  closeCalls = 0;
  removeCalls = 0;
  sendCalls = 0;
  throwOnSend = false;
  #messageListeners: Array<(message: string | Uint8Array) => void> = [];
  #closeListeners: Array<(reason?: string) => void> = [];
  #errorListeners: Array<(error: unknown) => void> = [];

  send(message: string | Uint8Array): void {
    this.sendCalls += 1;
    if (this.throwOnSend) throw new Error("fake send failure");
    this.sent.push(message);
  }

  close(_code?: number, reason?: string): void {
    this.closeCalls += 1;
    for (const listener of [...this.#closeListeners]) listener(reason);
  }

  onMessage(listener: (message: string | Uint8Array) => void): () => void {
    this.#messageListeners.push(listener);
    return () => {
      const index = this.#messageListeners.indexOf(listener);
      if (index >= 0) this.#messageListeners.splice(index, 1);
      this.removeCalls += 1;
    };
  }

  onClose(listener: (reason?: string) => void): () => void {
    this.#closeListeners.push(listener);
    return () => {
      const index = this.#closeListeners.indexOf(listener);
      if (index >= 0) this.#closeListeners.splice(index, 1);
      this.removeCalls += 1;
    };
  }

  onError(listener: (error: unknown) => void): () => void {
    this.#errorListeners.push(listener);
    return () => {
      const index = this.#errorListeners.indexOf(listener);
      if (index >= 0) this.#errorListeners.splice(index, 1);
      this.removeCalls += 1;
    };
  }

  receive(message: string | Uint8Array): void {
    for (const listener of [...this.#messageListeners]) listener(message);
  }

  fail(error: unknown): void {
    for (const listener of [...this.#errorListeners]) listener(error);
  }
}

class DelayedOpenRemoteTerminalTransport extends FakeRemoteTerminalTransport {
  openRemoveCalls = 0;
  #openListeners: Array<() => void> = [];

  onOpen(listener: () => void): () => void {
    this.#openListeners.push(listener);
    return () => {
      removeListener(this.#openListeners, listener);
      this.openRemoveCalls += 1;
    };
  }

  open(): void {
    for (const listener of [...this.#openListeners]) listener();
  }
}

class SynchronousMessageRegistrationTransport extends FakeRemoteTerminalTransport {
  synchronousRemoveCalls = 0;

  constructor(readonly initialMessage: string | Uint8Array) {
    super();
  }

  override onMessage(listener: (message: string | Uint8Array) => void): () => void {
    listener(this.initialMessage);
    return () => {
      this.synchronousRemoveCalls += 1;
    };
  }
}

class LinkedRemoteTerminalTransport implements RemoteTerminalTransport {
  readonly sent: Array<string | Uint8Array> = [];
  closeCalls = 0;
  #peer?: LinkedRemoteTerminalTransport;
  #closed = false;
  #messageListeners: Array<(message: string | Uint8Array) => void> = [];
  #closeListeners: Array<(reason?: string) => void> = [];
  #errorListeners: Array<(error: unknown) => void> = [];

  connect(peer: LinkedRemoteTerminalTransport): void {
    this.#peer = peer;
  }

  send(message: string | Uint8Array): void {
    if (this.#closed) throw new Error("linked transport is closed");
    this.sent.push(message);
    const peer = this.#peer;
    if (peer) peer.#receive(message);
  }

  close(_code?: number, reason?: string): void {
    if (this.#closed) return;
    this.closeCalls += 1;
    this.#closed = true;
    const peer = this.#peer;
    if (peer) peer.#remoteClose(reason);
  }

  onMessage(listener: (message: string | Uint8Array) => void): () => void {
    this.#messageListeners.push(listener);
    return () => removeListener(this.#messageListeners, listener);
  }

  onClose(listener: (reason?: string) => void): () => void {
    this.#closeListeners.push(listener);
    return () => removeListener(this.#closeListeners, listener);
  }

  onError(listener: (error: unknown) => void): () => void {
    this.#errorListeners.push(listener);
    return () => removeListener(this.#errorListeners, listener);
  }

  #receive(message: string | Uint8Array): void {
    if (this.#closed) return;
    for (const listener of [...this.#messageListeners]) listener(message);
  }

  #remoteClose(reason?: string): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const listener of [...this.#closeListeners]) listener(reason);
  }
}

class FakeTerminalSessionHandle implements TerminalSessionHandle {
  readonly id = "terminal";
  readonly backendId = "fake";
  readonly command: ProcessSessionCommand = { command: "demo" };
  readonly output = new TerminalOutputController();
  readonly closed = Promise.resolve({ status: "exited" } as ProcessSessionInspection);
  readonly writes: string[] = [];
  killCalls = 0;
  killResult: unknown = Promise.resolve(true);
  columns = 80;
  rows = 24;

  write(data: string | Uint8Array): Promise<boolean> {
    this.writes.push(typeof data === "string" ? data : new TextDecoder().decode(data));
    return Promise.resolve(true);
  }

  resize(columns: number, rows: number): Promise<boolean> {
    this.columns = columns;
    this.rows = rows;
    return Promise.resolve(true);
  }

  kill(): Promise<boolean> {
    this.killCalls += 1;
    return this.killResult as Promise<boolean>;
  }

  inspect() {
    const status: ProcessSessionStatus = "running";
    return {
      id: this.id,
      backendId: this.backendId,
      commandLine: "demo",
      status,
      running: true,
      columns: this.columns,
      rows: this.rows,
      resizeSupported: true,
    };
  }

  dispose(): Promise<void> {
    this.output.dispose();
    return Promise.resolve();
  }
}

function linkedRemoteTerminalTransports(): [LinkedRemoteTerminalTransport, LinkedRemoteTerminalTransport] {
  const left = new LinkedRemoteTerminalTransport();
  const right = new LinkedRemoteTerminalTransport();
  left.connect(right);
  right.connect(left);
  return [left, right];
}

function defaultRemoteTerminalHello(): string {
  return encodeRemoteHandshakeMessage({
    type: "remote.handshake.hello",
    schemaVersion: 1,
    protocol: { major: 1, minor: 0 },
    capabilities: {
      mandatory: ["terminal.input", "terminal.output"],
      optional: ["terminal.binary", "terminal.ping", "terminal.resize"],
    },
  });
}

function defaultRemoteTerminalAck(): string {
  return encodeRemoteHandshakeMessage({
    type: "remote.handshake.ack",
    schemaVersion: 1,
    protocol: { major: 1, minor: 0 },
    capabilities: [
      "terminal.binary",
      "terminal.input",
      "terminal.output",
      "terminal.ping",
      "terminal.resize",
    ],
  });
}

function removeListener<T>(listeners: T[], listener: T): void {
  const index = listeners.indexOf(listener);
  if (index >= 0) listeners.splice(index, 1);
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
