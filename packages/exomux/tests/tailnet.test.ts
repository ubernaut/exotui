// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import {
  createTailscaleStatusSource,
  normalizeTailnetStatusJson,
  parseHttpResponseBytes,
  TailnetPoller,
  type TailnetStatusResult,
} from "../tailnet.ts";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

const AVAILABLE: TailnetStatusResult = { availability: "available", detail: "ok" };
const DEGRADED: TailnetStatusResult = { availability: "degraded", detail: "sad" };

function fixtureStatus(): Record<string, unknown> {
  return {
    Version: "1.66.4",
    BackendState: "Running",
    MagicDNSSuffix: "tail1234.ts.net",
    CurrentTailnet: { Name: "corp.example", MagicDNSEnabled: true },
    Self: {
      ID: "self-1",
      PublicKey: "nodekey:SELFSECRETMATERIAL",
      HostName: "orion",
      DNSName: "orion.tail1234.ts.net.",
      OS: "linux",
      Online: true,
      TailscaleIPs: ["100.64.0.1", "fd7a:115c:a1e0::1"],
      Relay: "fra",
      CurAddr: "203.0.113.7:41641",
      Tags: [],
    },
    Peer: {
      "peer-zeta": {
        ID: "4502",
        HostName: "zeta",
        DNSName: "zeta.tail1234.ts.net.",
        OS: "windows",
        Online: false,
        TailscaleIPs: ["100.64.0.3"],
        Relay: "",
        CurAddr: "",
        LastSeen: "2026-07-20T10:00:00Z",
      },
      "peer-bravo": {
        ID: "4503",
        HostName: "bravo",
        DNSName: "bravo.tail1234.ts.net.",
        OS: "linux",
        Online: true,
        TailscaleIPs: ["100.64.0.4", "fd7a:115c:a1e0::4"],
        Relay: "nyc",
        CurAddr: "",
        Tags: ["tag:server", "tag:prod"],
      },
      "peer-atlas": {
        ID: "4501",
        HostName: "atlas",
        DNSName: "atlas.tail1234.ts.net.",
        OS: "linux",
        Online: true,
        TailscaleIPs: ["100.64.0.2", "fd7a:115c:a1e0::2"],
        Relay: "fra",
        CurAddr: "198.51.100.4:41641",
      },
    },
  };
}

function jsonBytes(value: unknown): Uint8Array {
  return ENCODER.encode(JSON.stringify(value));
}

function httpBytes(text: string): Uint8Array {
  return ENCODER.encode(text);
}

async function drain(turns = 16): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

Deno.test("tailnet normalize maps a realistic status into ordered, split, and parsed devices", () => {
  const snapshot = normalizeTailnetStatusJson(fixtureStatus(), 1234);
  assert(snapshot);
  assertEquals(snapshot.backendState, "Running");
  assertEquals(snapshot.tailnetName, "corp.example");
  assertEquals(snapshot.magicDnsSuffix, "tail1234.ts.net");
  assertEquals(snapshot.selfId, "self-1");
  assertEquals(snapshot.capturedAt, 1234);
  assertEquals(snapshot.devices.map((device) => device.shortName), ["orion", "atlas", "bravo", "zeta"]);

  const self = snapshot.devices[0]!;
  assertEquals(self.self, true);
  assertEquals(self.id, "self-1");
  assertEquals(self.dnsName, "orion.tail1234.ts.net");
  assertEquals(self.ipv4, "100.64.0.1");
  assertEquals(self.ipv6, "fd7a:115c:a1e0::1");
  assertEquals(self.relayed, false);

  const atlas = snapshot.devices[1]!;
  assertEquals(atlas.id, "peer-atlas");
  assertEquals(atlas.self, false);
  assertEquals(atlas.relayed, false);
  assertEquals(atlas.tags, []);

  const bravo = snapshot.devices[2]!;
  assertEquals(bravo.relayed, true);
  assertEquals(bravo.tags, ["tag:server", "tag:prod"]);
  assertEquals(bravo.lastSeenAt, undefined);

  const zeta = snapshot.devices[3]!;
  assertEquals(zeta.online, false);
  assertEquals(zeta.ipv4, "100.64.0.3");
  assertEquals(zeta.ipv6, undefined);
  assertEquals(zeta.lastSeenAt, Date.parse("2026-07-20T10:00:00Z"));
});

Deno.test("tailnet normalize truncates hostile fields, drops wrong types, and omits key material", () => {
  const snapshot = normalizeTailnetStatusJson({
    BackendState: "Running",
    Self: {
      ID: "self",
      HostName: "me",
      DNSName: "me.example.ts.net.",
      OS: "linux",
      Online: true,
      PublicKey: "nodekey:SELFSECRETMATERIAL",
      NodeKey: "nodekey:SELFSECRETMATERIAL",
      KeyExpiry: "2027-01-01T00:00:00Z",
      TailscaleIPs: ["100.64.0.1"],
    },
    Peer: {
      hostile: {
        HostName: "h".repeat(1000),
        DNSName: `${"d".repeat(1000)}.`,
        OS: 42,
        Online: "yes",
        TailscaleIPs: ["999.1.1.1", "100.64.0.9", "not an ip", 17, "fd7a::9"],
        Relay: "den",
        CurAddr: 99,
        Tags: ["x".repeat(500), 5, ...Array.from({ length: 20 }, (_, index) => `tag:${index}`)],
        LastSeen: "not-a-date",
        NodeKey: "nodekey:PEERSECRETMATERIAL",
        PeerAPIURL: ["http://100.64.0.9:1"],
        Capabilities: ["https://tailscale.com/cap/PEERSECRETMATERIAL"],
        CapMap: { PEERSECRETMATERIAL: null },
      },
      nameless: { OS: "linux", Online: true, HostName: 42 },
    },
  }, 1);
  assert(snapshot);
  assertEquals(snapshot.devices.length, 2);
  assert(snapshot.devices.every((device) => device.id !== "nameless"));

  const hostile = snapshot.devices[1]!;
  assertEquals(hostile.id, "hostile");
  assertEquals(hostile.shortName, "h".repeat(63));
  assertEquals(hostile.dnsName, "d".repeat(253));
  assertEquals(hostile.os, "");
  assertEquals(hostile.online, false);
  assertEquals(hostile.ipv4, "100.64.0.9");
  assertEquals(hostile.ipv6, "fd7a::9");
  assertEquals(hostile.relayed, true);
  assertEquals(hostile.tags.length, 16);
  assertEquals(hostile.tags[0], "x".repeat(64));
  assertEquals(hostile.tags[1], "tag:0");
  assertEquals(hostile.lastSeenAt, undefined);

  const serialized = JSON.stringify(snapshot);
  assert(!serialized.includes("SECRETMATERIAL"));
  assert(!serialized.includes("PublicKey"));
  assert(!serialized.includes("NodeKey"));
  assert(!serialized.includes("KeyExpiry"));
  assert(!serialized.includes("PeerAPIURL"));
});

Deno.test("tailnet normalize caps the device list at 256 entries", () => {
  const peers: Record<string, unknown> = {};
  for (let index = 0; index < 300; index += 1) {
    peers[`peer-${index}`] = {
      HostName: `host-${String(index).padStart(3, "0")}`,
      DNSName: `host-${index}.example.ts.net.`,
      OS: "linux",
      Online: true,
      TailscaleIPs: ["100.64.1.1"],
    };
  }
  const snapshot = normalizeTailnetStatusJson({
    BackendState: "Running",
    Self: { ID: "self", HostName: "me", DNSName: "me.example.ts.net.", OS: "linux", Online: true },
    Peer: peers,
  }, 5);
  assert(snapshot);
  assertEquals(snapshot.devices.length, 256);
  assertEquals(snapshot.devices[0]!.self, true);
});

Deno.test("tailnet normalize rejects non-objects and a missing or mistyped BackendState", () => {
  assertEquals(normalizeTailnetStatusJson(undefined, 0), undefined);
  assertEquals(normalizeTailnetStatusJson(null, 0), undefined);
  assertEquals(normalizeTailnetStatusJson("Running", 0), undefined);
  assertEquals(normalizeTailnetStatusJson(42, 0), undefined);
  assertEquals(normalizeTailnetStatusJson([], 0), undefined);
  assertEquals(normalizeTailnetStatusJson({}, 0), undefined);
  assertEquals(normalizeTailnetStatusJson({ BackendState: 7 }, 0), undefined);
});

Deno.test("tailnet source prefers the LocalAPI and falls back to the CLI runner on failure", async () => {
  const body = jsonBytes(fixtureStatus());
  const viaLocal = createTailscaleStatusSource({
    localApi: () => Promise.resolve({ status: 200, body }),
    runCommand: () => Promise.reject(new Error("cli must not run")),
    now: () => 42,
  });
  const localResult = await viaLocal.fetchStatus();
  assertEquals(localResult.availability, "available");
  assertEquals(localResult.snapshot?.capturedAt, 42);
  assertEquals(localResult.snapshot?.devices.length, 4);
  assertEquals(viaLocal.inspect().lastTransport, "localapi");

  const commands: Array<{ command: string; args: readonly string[] }> = [];
  const viaCli = createTailscaleStatusSource({
    localApi: () => Promise.reject(new Error("connection refused")),
    runCommand: (command, args) => {
      commands.push({ command, args });
      return Promise.resolve({ code: 0, stdout: body });
    },
  });
  const cliResult = await viaCli.fetchStatus();
  assertEquals(cliResult.availability, "available");
  assertEquals(viaCli.inspect().lastTransport, "cli");
  assertEquals(viaCli.inspect().cliCommand, "tailscale");
  assertEquals(viaCli.inspect().socketPath, "/var/run/tailscale/tailscaled.sock");
  assertEquals(commands, [{ command: "tailscale", args: ["status", "--json"] }]);
});

Deno.test("tailnet source maps missing binary, NeedsLogin, and oversized output outcomes", async () => {
  const missing = createTailscaleStatusSource({
    localApi: () => Promise.reject(new Error("connection refused")),
    runCommand: () => Promise.reject(new Deno.errors.NotFound("no such file or directory")),
  });
  const missingResult = await missing.fetchStatus();
  assertEquals(missingResult.availability, "unavailable");
  assertEquals(missingResult.detail, "tailscale is not installed or tailscaled is not running");
  assertEquals(missingResult.snapshot, undefined);

  const needsLogin = createTailscaleStatusSource({
    localApi: () =>
      Promise.resolve({ status: 200, body: jsonBytes({ ...fixtureStatus(), BackendState: "NeedsLogin" }) }),
    runCommand: () => Promise.reject(new Error("cli must not run")),
  });
  const needsLoginResult = await needsLogin.fetchStatus();
  assertEquals(needsLoginResult.availability, "degraded");
  assert(needsLoginResult.detail.includes("NeedsLogin"));
  assert(needsLoginResult.detail.includes("tailscale up"));
  assert(needsLoginResult.snapshot !== undefined);
  assertEquals(needsLogin.inspect().lastTransport, "localapi");

  const oversized = createTailscaleStatusSource({
    maxBytes: 2048,
    localApi: () => Promise.reject(new Error("connection refused")),
    runCommand: () => Promise.resolve({ code: 0, stdout: new Uint8Array(4096) }),
  });
  const oversizedResult = await oversized.fetchStatus();
  assertEquals(oversizedResult.availability, "degraded");
  assertEquals(oversizedResult.snapshot, undefined);
  assert(oversizedResult.detail.length > 0);
  assert(oversizedResult.detail.length <= 200);
});

Deno.test("tailnet HTTP parser handles content-length, chunked, oversized, and malformed responses", () => {
  const plain = parseHttpResponseBytes(
    httpBytes('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 7\r\n\r\n{"a":1}'),
    1024,
  );
  assert(plain);
  assertEquals(plain.status, 200);
  assertEquals(DECODER.decode(plain.body), '{"a":1}');

  const chunkedText = 'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n{"a":\r\n2\r\n1}\r\n0\r\n\r\n';
  const chunked = parseHttpResponseBytes(httpBytes(chunkedText), 1024);
  assert(chunked);
  assertEquals(chunked.status, 200);
  assertEquals(DECODER.decode(chunked.body), '{"a":1}');

  const errorStatus = parseHttpResponseBytes(
    httpBytes("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 3\r\n\r\nerr"),
    1024,
  );
  assertEquals(errorStatus?.status, 502);

  assertEquals(parseHttpResponseBytes(httpBytes('HTTP/1.1 200 OK\r\nContent-Length: 7\r\n\r\n{"a":1}'), 6), undefined);
  assertEquals(parseHttpResponseBytes(httpBytes(chunkedText), 6), undefined);
  assertEquals(parseHttpResponseBytes(httpBytes("HTTPX 200\r\n\r\nbody"), 1024), undefined);
  assertEquals(
    parseHttpResponseBytes(httpBytes("HTTP/1.1 200 OK\r\nContent-Length: 99\r\n\r\nshort"), 1024),
    undefined,
  );
  assertEquals(
    parseHttpResponseBytes(httpBytes("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nZZ\r\nnope\r\n"), 1024),
    undefined,
  );
});

class FakeTimers {
  readonly pending: Array<{ id: number; callback: () => void; delayMs: number }> = [];
  #nextId = 1;

  readonly set = (callback: () => void, delayMs: number): number => {
    const id = this.#nextId;
    this.#nextId += 1;
    this.pending.push({ id, callback, delayMs });
    return id;
  };

  readonly clear = (id: number): void => {
    const index = this.pending.findIndex((timer) => timer.id === id);
    if (index >= 0) this.pending.splice(index, 1);
  };

  fire(): void {
    const timer = this.pending.shift();
    timer?.callback();
  }

  delays(): number[] {
    return this.pending.map((timer) => timer.delayMs);
  }
}

Deno.test("tailnet poller jitters, backs off on failure, resets, cancels, and guards overlap", async () => {
  const timers = new FakeTimers();
  const received: TailnetStatusResult[] = [];
  let outcome: () => Promise<TailnetStatusResult> = () => Promise.resolve(AVAILABLE);
  let fetches = 0;
  let randomValue = 0.5;
  const poller = new TailnetPoller({
    source: {
      fetchStatus: () => {
        fetches += 1;
        return outcome();
      },
    },
    onResult: (result) => received.push(result),
    intervalMs: 10_000,
    maxBackoffMs: 50_000,
    jitterRatio: 0.2,
    random: () => randomValue,
    setTimer: timers.set,
    clearTimer: timers.clear,
  });

  poller.setVisible(true);
  await drain();
  assertEquals(fetches, 1);
  assertEquals(received.length, 1);
  assertEquals(timers.delays(), [10_000]);

  outcome = () => Promise.resolve(DEGRADED);
  timers.fire();
  await drain();
  assertEquals(fetches, 2);
  assertEquals(timers.delays(), [20_000]);

  timers.fire();
  await drain();
  assertEquals(timers.delays(), [40_000]);

  outcome = () => Promise.reject(new Error("boom"));
  timers.fire();
  await drain();
  assertEquals(timers.delays(), [50_000]);
  assertEquals(received.at(-1)?.availability, "degraded");
  assert(received.at(-1)!.detail.includes("boom"));

  outcome = () => Promise.resolve(AVAILABLE);
  randomValue = 1;
  timers.fire();
  await drain();
  assertEquals(timers.delays(), [12_000]);

  poller.setVisible(false);
  assertEquals(timers.delays(), []);

  let release!: (result: TailnetStatusResult) => void;
  outcome = () => new Promise((resolve) => (release = resolve));
  const first = poller.refresh();
  const second = poller.refresh();
  await drain();
  assertEquals(fetches, 6);
  release(AVAILABLE);
  await Promise.all([first, second]);
  assertEquals(fetches, 6);
  assertEquals(timers.delays(), []);
  assertEquals(received.length, 6);

  poller.dispose();
  assertThrows(() => poller.setVisible(true), TypeError);
  poller.setVisible(false);
  await poller.refresh();
  assertEquals(fetches, 6);
  assertEquals(timers.delays(), []);
});

Deno.test("tailnet poller keeps an in-flight fetch from scheduling after it is hidden", async () => {
  const timers = new FakeTimers();
  const received: TailnetStatusResult[] = [];
  let release!: (result: TailnetStatusResult) => void;
  const poller = new TailnetPoller({
    source: { fetchStatus: () => new Promise<TailnetStatusResult>((resolve) => (release = resolve)) },
    onResult: (result) => received.push(result),
    intervalMs: 10_000,
    random: () => 0.5,
    setTimer: timers.set,
    clearTimer: timers.clear,
  });

  poller.setVisible(true);
  await drain();
  assertEquals(timers.delays(), []);
  poller.setVisible(false);
  release(AVAILABLE);
  await drain();
  assertEquals(received.length, 1);
  assertEquals(timers.delays(), []);
  poller.dispose();
});

Deno.test("tailnet disposal cancels and awaits an active status request without publishing after disposal", async () => {
  let released = false;
  let observed: AbortSignal | undefined;
  const received: TailnetStatusResult[] = [];
  const poller = new TailnetPoller({
    source: {
      fetchStatus: (signal) => {
        observed = signal;
        return new Promise<TailnetStatusResult>((_resolve, reject) => {
          signal!.addEventListener("abort", () => {
            released = true;
            reject(new DOMException("Status request cancelled", "AbortError"));
          }, { once: true });
        });
      },
    },
    onResult: (result) => received.push(result),
  });
  poller.setVisible(true);
  assert(observed && !observed.aborted);
  await poller.dispose();
  assert(observed.aborted);
  assert(released, "dispose must settle the owned in-flight status operation");
  assertEquals(received, [], "a disposed panel must not receive a late result");
});
