// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals } from "./deps.ts";
import {
  type AnsiFlushTelemetry,
  Canvas,
  createLowBandwidthController,
  detectRemoteTerminalEnvironment,
  RenderLoop,
  Tui,
} from "../mod.ts";
import { AnsiCanvasSink } from "../src/canvas/sink.ts";
import { TextObject } from "../src/canvas/text.ts";
import { Signal } from "../src/signals/mod.ts";

function telemetry(patch: Partial<AnsiFlushTelemetry> = {}): AnsiFlushTelemetry {
  return {
    frames: 10,
    bytes: 4096,
    writes: 10,
    wouldBlocks: 0,
    shortWrites: 0,
    stallMs: 0,
    maxStallMs: 0,
    degradedFlushes: 0,
    droppedBytes: 0,
    ...patch,
  };
}

Deno.test("detectRemoteTerminalEnvironment identifies SSH and Mosh hints cleanly", () => {
  const from = (map: Record<string, string>) => detectRemoteTerminalEnvironment((k) => map[k]);
  assertEquals(from({}), { ssh: false, mosh: false });
  assertEquals(from({ SSH_CONNECTION: "10.0.0.2 50000 10.0.0.1 22" }), { ssh: true, mosh: false });
  assertEquals(from({ SSH_TTY: "/dev/pts/3" }), { ssh: true, mosh: false });
  assertEquals(from({ MOSH_SERVER_NETWORK_TMOUT: "86400" }), { ssh: false, mosh: true });
});

Deno.test("LowBandwidthController honors manual on/off, RTT thresholds, fast LAN SSH, and Mosh", () => {
  // Fast local terminal stays crisp in auto.
  const local = createLowBandwidthController({ mode: "auto", probeRttMs: 3 });
  assertEquals(local.inspect().active, false);
  assertEquals(local.inspect().reason, "normal");
  assertEquals(local.inspect().colorDepth, "truecolor");
  assertEquals(local.inspect().repeatCompression, false);

  // Fast gigabit LAN SSH (RTT 4ms) stays full fidelity unless backpressure appears.
  const lanSsh = createLowBandwidthController({
    mode: "auto",
    remoteEnv: { ssh: true, mosh: false },
    probeRttMs: 4,
  });
  assertEquals(lanSsh.inspect().active, false);

  // Higher-latency SSH (RTT 25ms >= 20ms SSH threshold) engages automatically.
  const wanSsh = createLowBandwidthController({
    mode: "auto",
    remoteEnv: { ssh: true, mosh: false },
    probeRttMs: 25,
  });
  assertEquals(wanSsh.inspect().active, true);
  assertEquals(wanSsh.inspect().reason, "latency");
  assertEquals(wanSsh.inspect().colorDepth, "256");
  assertEquals(wanSsh.inspect().repeatCompression, true);
  assertEquals(wanSsh.inspect().forceOpaqueWindows, true);
  assertEquals(wanSsh.inspect().reduceMouseMotion, true);

  // High RTT even without SSH env engages automatically.
  const slowDirect = createLowBandwidthController({ mode: "auto", probeRttMs: 48 });
  assertEquals(slowDirect.inspect().active, true);
  assertEquals(slowDirect.inspect().reason, "latency");

  // Mosh engages immediately.
  const mosh = createLowBandwidthController({ mode: "auto", remoteEnv: { ssh: false, mosh: true } });
  assertEquals(mosh.inspect().active, true);
  assertEquals(mosh.inspect().reason, "remote-env");

  // Explicit "off" overrides even Mosh and high RTT; explicit "on" forces activation on local.
  assertEquals(mosh.setMode("off"), true);
  assertEquals(mosh.inspect().active, false);
  assertEquals(mosh.inspect().reason, "disabled");
  assertEquals(local.setMode("on"), true);
  assertEquals(local.inspect().active, true);
  assertEquals(local.inspect().reason, "manual");
});

Deno.test("LowBandwidthController engages on live sink backpressure and recovers with hysteresis", () => {
  const controller = createLowBandwidthController({
    mode: "auto",
    probeRttMs: 2,
    pressureWindowsToEngage: 2,
    recoveryCleanMs: 30_000,
  });
  assertEquals(controller.active, false);

  // One isolated stall spike does not flap mode on.
  assertEquals(controller.recordFlushTelemetry(telemetry({ stallMs: 22 }), 1_000), false);
  assertEquals(controller.active, false);

  // A second consecutive stalled window engages backpressure protection.
  assertEquals(controller.recordFlushTelemetry(telemetry({ stallMs: 18 }), 3_000), true);
  assertEquals(controller.inspect().active, true);
  assertEquals(controller.inspect().reason, "backpressure");

  // Clean windows start the recovery timer but do not disengage prematurely.
  assertEquals(controller.recordFlushTelemetry(telemetry(), 10_000), false);
  assertEquals(controller.active, true);
  assertEquals(controller.recordFlushTelemetry(telemetry(), 39_000), false);
  assertEquals(controller.active, true);

  // Once clean for recoveryCleanMs (10_000 -> 40_000), auto returns to normal.
  assertEquals(controller.recordFlushTelemetry(telemetry(), 40_000), true);
  assertEquals(controller.inspect().active, false);
  assertEquals(controller.inspect().reason, "normal");

  // A degraded flush engages immediately without waiting for a second window.
  assertEquals(controller.recordFlushTelemetry(telemetry({ degradedFlushes: 1, droppedBytes: 512 }), 42_000), true);
  assertEquals(controller.inspect().active, true);
  assertEquals(controller.inspect().reason, "backpressure");
});

Deno.test("RenderLoop.requestSoon pulls slow output cadence forward for input and deferNext backs off", () => {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { fireAt: number; callback: () => void }>();
  const fakeTimer = {
    now: () => now,
    setTimeout: (callback: () => void, delay: number) => {
      const id = nextId++;
      timers.set(id, { fireAt: now + delay, callback });
      return id;
    },
    clearTimeout: (handle: unknown) => {
      timers.delete(handle as number);
    },
  };

  let ticks = 0;
  const loop = new RenderLoop({
    intervalMs: 100,
    immediate: true,
    timer: fakeTimer,
    tick: () => {
      ticks += 1;
    },
  });

  loop.start();
  assertEquals(ticks, 1);
  assertEquals([...timers.values()][0]?.fireAt, 100);

  // Input arrives at t=10ms: requestSoon(16) pulls the next render from t=100 to t=26.
  now = 10;
  assertEquals(loop.requestSoon(16), true);
  assertEquals([...timers.values()][0]?.fireAt, 26);

  // Fire that early tick and verify deferNext(180) schedules the following tick at t=26+180=206.
  now = 26;
  const scheduled = [...timers.values()][0]!;
  timers.clear();
  loop.deferNext(180);
  scheduled.callback();
  assertEquals(ticks, 2);
  assertEquals([...timers.values()][0]?.fireAt, 206);
  loop.stop();
});

Deno.test("Tui backs off renderLoop after a degraded sink flush and supports setRefreshRate", () => {
  let budget = 5;
  const sink = new AnsiCanvasSink({
    stdout: {
      writeSync(data) {
        const take = Math.min(budget, data.length);
        budget -= take;
        return take;
      },
    },
  });
  const canvas = new Canvas({ sink, size: { columns: 10, rows: 1 } });
  const text = new TextObject({
    canvas,
    rectangle: new Signal({ column: 0, row: 0 }),
    value: new Signal("0123456789"),
    style: new Signal((value: string) => value),
    zIndex: new Signal(1),
  });
  text.draw();

  const tui = new Tui({
    canvas,
    refreshRate: 1000 / 60,
    stdout: { write: () => Promise.resolve(0), writeSync: () => 0 } as never,
    stdin: { setRaw: () => {}, read: () => Promise.resolve(null), isTerminal: () => false } as never,
  });
  try {
    tui.setRefreshRate(1000 / 12);
    assertEquals(tui.refreshRate, 1000 / 12);
    assertEquals(tui.renderLoop.intervalMs, 1000 / 12);

    canvas.render();
    assert(canvas.lastFlushDegraded, "saturated sink marks canvas.lastFlushDegraded for backoff");
  } finally {
    tui.destroy();
  }
});
