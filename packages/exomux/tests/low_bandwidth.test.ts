// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { AnsiCanvasSink, type AnsiFlushTelemetry, type CanvasRenderStats, stripStyles } from "@ubernaut/exotui";
import { createTestTerminalApp } from "@ubernaut/exotui/testing";
import { createExomuxController, EXOMUX_SESSIONS_WINDOW_ID } from "../controller.ts";
import { createExomuxTerminalOptions, type ExomuxAppMountRef } from "../app.ts";
import {
  cycleExomuxGlobalSetting,
  defaultExomuxGlobalSettings,
  defaultExomuxWindowSettings,
  EXOMUX_GLOBAL_SETTING_SPECS,
  exomuxEffectiveGlobalSettings,
  exomuxResolvedOpacity,
  exomuxWindowId,
  normalizeExomuxGlobalSettings,
} from "../model.ts";
import { EXOMUX_LOW_BANDWIDTH_BADGE, exomuxLowBandwidthBadgeRect, exomuxShelfBounds } from "../desktop_layout.ts";
import { FakeExomuxClient, session } from "./fakes.ts";

function flushSample(patch: Partial<AnsiFlushTelemetry> = {}): AnsiFlushTelemetry {
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

Deno.test("Exomux lowBandwidth setting normalizes, cycles auto/on/off, and overrides visual settings non-destructively", () => {
  const defaults = defaultExomuxGlobalSettings();
  assertEquals(defaults.lowBandwidth, "auto");
  assert(EXOMUX_GLOBAL_SETTING_SPECS.some((spec) => spec.id === "lowBandwidth"));

  const on = cycleExomuxGlobalSetting(defaults, "lowBandwidth", 1);
  assertEquals(on.lowBandwidth, "on");
  const off = cycleExomuxGlobalSetting(on, "lowBandwidth", 1);
  assertEquals(off.lowBandwidth, "off");
  const back = cycleExomuxGlobalSetting(off, "lowBandwidth", 1);
  assertEquals(back.lowBandwidth, "auto");

  assertEquals(normalizeExomuxGlobalSettings({ lowBandwidth: "turbo" }).lowBandwidth, "auto");
  assertEquals(normalizeExomuxGlobalSettings({ lowBandwidth: "on" }).lowBandwidth, "on");

  const custom = {
    ...defaults,
    opacity: 0.5,
    overgrowInactive: true,
    animationSpeed: "fast" as const,
    blockCursor: true,
    borderStyle: "thin" as const,
  };
  const effective = exomuxEffectiveGlobalSettings(custom, true);
  assertEquals(effective.opacity, 1);
  assertEquals(effective.overgrowInactive, false);
  assertEquals(effective.animationSpeed, "off");
  assertEquals(effective.blockCursor, false);
  assertEquals(effective.borderStyle, "ascii");
  // Saved user preferences remain untouched.
  assertEquals(custom.opacity, 0.5);
  assertEquals(custom.borderStyle, "thin");
  const windowSettings = { ...defaultExomuxWindowSettings(), opacity: 0.5 };
  assertEquals(exomuxResolvedOpacity(custom, windowSettings, true), 1);
  assertEquals(exomuxResolvedOpacity(custom, windowSettings, false), 0.5);
});

Deno.test("Exomux lowBandwidth badge layout reserves space beside quit only when active and wide enough", () => {
  const wide = { column: 0, row: 0, width: 80, height: 24 };
  assertEquals(exomuxLowBandwidthBadgeRect(wide, false), undefined);
  const badge = exomuxLowBandwidthBadgeRect(wide, true);
  assert(badge);
  assertEquals(badge.width, EXOMUX_LOW_BANDWIDTH_BADGE.length);
  const shelf = exomuxShelfBounds(wide, badge.width + 1);
  assert(shelf.column + shelf.width <= badge.column, "taskbar shelf stops before [LOW-BW] badge");

  assertEquals(exomuxLowBandwidthBadgeRect({ column: 0, row: 0, width: 30, height: 24 }, true), undefined);
});

Deno.test("Exomux lowBandwidth mode flattens visuals, lowers FPS, compresses wire ANSI, and preserves saved settings", async () => {
  const initial = session("lb-1", "shell", 0);
  const client = new FakeExomuxClient([initial], {
    "lb-1": [{ sessionId: "lb-1", sequence: 1, data: "hello low bandwidth\r\n" }],
  });
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  controller.globalSettings.value = {
    ...controller.globalSettings.peek(),
    opacity: 0.5,
    borderStyle: "thin",
    animationSpeed: "normal",
    lowBandwidth: "off",
  };
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 80, rows: 24 } });

  try {
    const mounted = mount.current!;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "close", id: EXOMUX_SESSIONS_WINDOW_ID }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    assertEquals(mounted.lowBandwidthActive.peek(), false);
    assertEquals(mounted.app.tui.refreshRate, 1000 / 60);
    const normalRow0 = stripStyles(harness.canvas.frameBuffer[0]!.map((c) => typeof c === "string" ? c : "").join(""));
    assertEquals(normalRow0.includes(EXOMUX_LOW_BANDWIDTH_BADGE), false);

    // Measure serialized wire bytes of normal frame vs low-bandwidth frame through a real AnsiCanvasSink.
    const measureWireBytes = (colorDepth: "truecolor" | "256", repeatCompression: boolean): number => {
      let bytes = 0;
      const sink = new AnsiCanvasSink({
        stdout: {
          writeSync(data) {
            bytes += data.byteLength;
            return data.byteLength;
          },
        },
        colorDepth,
        repeatCompression,
      });
      const ranges = harness.canvas.frameBuffer.map((values, row) => ({ row, startColumn: 0, values }));
      sink.flushRanges(ranges, {} as CanvasRenderStats);
      return bytes;
    };
    const normalBytes = measureWireBytes("truecolor", false);

    // Toggle low-bandwidth mode ON.
    controller.globalSettings.value = { ...controller.globalSettings.peek(), lowBandwidth: "on" };
    await harness.pilot.settle();

    assertEquals(mounted.lowBandwidthActive.peek(), true);
    assertEquals(mounted.lowBandwidthProfile().reason, "manual");
    assertEquals(mounted.app.tui.refreshRate, 1000 / 12);

    // Saved settings stay intact while effective visuals switch to ASCII borders, opaque windows, and [LOW-BW] badge.
    assertEquals(controller.globalSettings.peek().opacity, 0.5);
    assertEquals(controller.globalSettings.peek().borderStyle, "thin");
    const lowRow0 = stripStyles(harness.canvas.frameBuffer[0]!.map((c) => typeof c === "string" ? c : "").join(""));
    assertStringIncludes(lowRow0, EXOMUX_LOW_BANDWIDTH_BADGE);

    const lowBwBytes = measureWireBytes("256", true);
    assert(
      lowBwBytes < normalBytes * 0.45,
      `expected >55% real Exomux desktop wire reduction (normal=${normalBytes}B, lowBw=${lowBwBytes}B)`,
    );

    // Toggle back OFF: everything restores cleanly.
    controller.globalSettings.value = { ...controller.globalSettings.peek(), lowBandwidth: "off" };
    await harness.pilot.settle();
    assertEquals(mounted.lowBandwidthActive.peek(), false);
    assertEquals(mounted.app.tui.refreshRate, 1000 / 60);
    const restoredRow0 = stripStyles(
      harness.canvas.frameBuffer[0]!.map((c) => typeof c === "string" ? c : "").join(""),
    );
    assertEquals(restoredRow0.includes(EXOMUX_LOW_BANDWIDTH_BADGE), false);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux auto lowBandwidth reacts to startup RTT, live backpressure, and child mode 1003", async () => {
  const initial = session("lb-auto", "shell", 0);
  const client = new FakeExomuxClient([initial]);
  const controller = await createExomuxController({ client, initialSessions: [initial] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount, {
    probeRttMs: 3,
    remoteEnv: { ssh: false, mosh: false },
  });
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 80, rows: 24 } });

  try {
    const mounted = mount.current!;
    assert(mounted);
    await mounted.whenIdle();
    const hostWrites: string[] = [];
    const stdout = mounted.app.tui.canvas.stdout as { writeSync?: (b: Uint8Array) => number };
    const originalWrite = stdout.writeSync?.bind(stdout);
    stdout.writeSync = (bytes: Uint8Array) => {
      hostWrites.push(new TextDecoder().decode(bytes));
      return originalWrite ? originalWrite(bytes) : bytes.length;
    };

    assertEquals(mounted.lowBandwidthActive.peek(), false);

    // Degraded flush telemetry triggers auto low-bandwidth mode and steps down host DECSET 1003 -> 1003l.
    assertEquals(mounted.recordFlushTelemetry(flushSample({ degradedFlushes: 1, droppedBytes: 256 }), 1_000), true);
    assertEquals(mounted.lowBandwidthActive.peek(), true);
    assertEquals(mounted.lowBandwidthProfile().reason, "backpressure");
    assert(hostWrites.some((w) => w.includes("\x1b[?1003l")), "low-bandwidth steps down host any-motion tracking");

    // If the focused child itself requests DECSET 1003, host 1003 re-enables for that child.
    hostWrites.length = 0;
    client.emitOutput({ sessionId: "lb-auto", sequence: 1, data: "\x1b[?1003h" });
    await mounted.whenIdle();
    assert(hostWrites.some((w) => w.includes("\x1b[?1003h")), "child-requested DECSET 1003 still passes through");

    // When child disables 1003, host drops back to button-drag only.
    hostWrites.length = 0;
    client.emitOutput({ sessionId: "lb-auto", sequence: 2, data: "\x1b[?1003l" });
    await mounted.whenIdle();
    assert(hostWrites.some((w) => w.includes("\x1b[?1003l")), "disabling child 1003 restores low-bandwidth 1002 mode");

    // Clean recovery after hysteresis disengages backpressure automatically.
    assertEquals(mounted.recordFlushTelemetry(flushSample(), 2_000), false);
    assertEquals(mounted.recordFlushTelemetry(flushSample(), 35_000), true);
    assertEquals(mounted.lowBandwidthActive.peek(), false);
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});

Deno.test("Exomux skips desktop repaints for minimized hidden terminal output until restored", async () => {
  const first = session("vis-1", "visible", 0);
  const second = session("hid-2", "hidden", 1);
  const client = new FakeExomuxClient([first, second]);
  const controller = await createExomuxController({ client, initialSessions: [first, second] });
  const mount: ExomuxAppMountRef = {};
  const { tuiOptions: _tuiOptions, ...headlessOptions } = createExomuxTerminalOptions(controller, mount);
  const harness = await createTestTerminalApp({ ...headlessOptions, size: { columns: 80, rows: 24 } });

  try {
    const mounted = mount.current!;
    assert(mounted);
    await mounted.whenIdle();
    controller.windowHost.execute({ kind: "minimize", id: exomuxWindowId("hid-2") }, mounted.bodyRect.peek());
    await harness.pilot.settle();

    // Capture render revision while hid-2 is minimized.
    const before = mounted.renderRevisionValue();
    client.emitOutput({ sessionId: "hid-2", sequence: 2, data: "noisy background compile output\r\n" });
    await mounted.whenIdle();
    // Hidden session output must not invalidate the visible desktop frame.
    const runtime = controller.runtime("hid-2")!;
    assertStringIncludes(runtime.screen.textRows()[0] ?? "", "noisy background compile output");
    // terminalRenderRevision did not bump; only session sequence/runtime revision inside fragments reflects state if polled.
    assertEquals(
      before.split("|").slice(0, -14).join("|"),
      mounted.renderRevisionValue().split("|").slice(0, -14).join("|"),
      "minimized session output should not bump terminalRenderRevision",
    );
  } finally {
    harness.destroy();
    await controller.dispose();
  }
});
