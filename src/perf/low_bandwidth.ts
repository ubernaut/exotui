// Copyright 2023 Im-Beast. MIT license.
import type { AnsiColorDepth, AnsiFlushTelemetry } from "../canvas/sink.ts";

/** Three-position low-bandwidth policy mode (`auto`, `on`, `off`). */
export const LOW_BANDWIDTH_MODES = ["auto", "on", "off"] as const;

/** Allowed values for {@linkcode LOW_BANDWIDTH_MODES}. */
export type LowBandwidthMode = (typeof LOW_BANDWIDTH_MODES)[number];

/** Explanation for why low-bandwidth mode is currently active or inactive. */
export type LowBandwidthReason =
  | "manual"
  | "disabled"
  | "latency"
  | "remote-env"
  | "backpressure"
  | "normal";

/** Remote-session hints extracted from process environment variables. */
export interface RemoteTerminalEnvironmentSignals {
  /** True when standard SSH session variables (`SSH_CONNECTION`, `SSH_CLIENT`, `SSH_TTY`) are present. */
  readonly ssh: boolean;
  /** True when running inside a Mosh session (`MOSH_SERVER_NETWORK_TMOUT` or `MOSH_PREDICTION_DISPLAY`). */
  readonly mosh: boolean;
}

/**
 * Inspects an environment lookup for SSH or Mosh transport hints. Pure and
 * side-effect-free so callers can pass either `runtimeHost.env.get` or a fake
 * map in tests.
 */
export function detectRemoteTerminalEnvironment(
  getEnv: (name: string) => string | undefined,
): RemoteTerminalEnvironmentSignals {
  const has = (name: string): boolean => {
    const value = getEnv(name);
    return value !== undefined && value.length > 0;
  };
  return {
    ssh: has("SSH_CONNECTION") || has("SSH_CLIENT") || has("SSH_TTY"),
    mosh: has("MOSH_SERVER_NETWORK_TMOUT") || has("MOSH_PREDICTION_DISPLAY"),
  };
}

/** Effective rendering, input, and wire-encoding profile computed by {@linkcode LowBandwidthController}. */
export interface LowBandwidthProfile {
  /** Whether low-bandwidth mitigations are currently active. */
  readonly active: boolean;
  /** Configured three-position user mode. */
  readonly mode: LowBandwidthMode;
  /** Reason explaining the current active state. */
  readonly reason: LowBandwidthReason;
  /** Target output frame interval in milliseconds (`1000/60` normal, ~`83ms` low-bandwidth). */
  readonly frameIntervalMs: number;
  /** Maximum interactive input-to-render wakeup delay in milliseconds. */
  readonly inputLatencyFloorMs: number;
  /** Wire color depth recommended for {@linkcode AnsiCanvasSink}. */
  readonly colorDepth: AnsiColorDepth;
  /** Whether to enable ECMA-48 `REP` run-length compression on the sink. */
  readonly repeatCompression: boolean;
  /** Whether transition animations should be suppressed. */
  readonly disableAnimations: boolean;
  /** Whether animated desktop/backdrop effects and overgrowth should pause. */
  readonly disableBackgroundEffects: boolean;
  /** Whether translucent windows should flatten to opaque for span compaction. */
  readonly forceOpaqueWindows: boolean;
  /** Whether free-motion (`DECSET 1003`) mouse tracking should step down to drag-only (`1002`). */
  readonly reduceMouseMotion: boolean;
  /** Whether Kitty graphics passthrough image uploads should pause. */
  readonly pauseGraphicsPassthrough: boolean;
  /** Measured pre-launch RTT in milliseconds when available. */
  readonly probeRttMs?: number;
}

/** Tuning parameters for {@linkcode LowBandwidthController}. */
export interface LowBandwidthControllerOptions {
  /** Initial user mode (default `"auto"`). */
  readonly mode?: LowBandwidthMode;
  /** Remote environment signals captured at launch. */
  readonly remoteEnv?: RemoteTerminalEnvironmentSignals;
  /** Initial pre-launch probe round-trip time in milliseconds, when measured. */
  readonly probeRttMs?: number;
  /** RTT threshold (ms) at which `"auto"` engages on any terminal (default 40). */
  readonly rttThresholdMs?: number;
  /** Lower RTT threshold (ms) when `SSH_*` is also present (default 20). */
  readonly sshRttThresholdMs?: number;
  /** Stall duration (ms) in one telemetry window that counts as sink pressure (default 15). */
  readonly stallThresholdMs?: number;
  /** `WouldBlock` count in one telemetry window that counts as sink pressure (default 3). */
  readonly wouldBlockThreshold?: number;
  /** Consecutive pressured windows needed before backpressure engages (default 2). */
  readonly pressureWindowsToEngage?: number;
  /** Clean duration (ms) required before `"auto"` releases backpressure (default 30,000). */
  readonly recoveryCleanMs?: number;
  /** Normal frame interval in ms (default `1000 / 60`). */
  readonly normalFrameIntervalMs?: number;
  /** Low-bandwidth output frame interval in ms (default `1000 / 12`). */
  readonly lowBandwidthFrameIntervalMs?: number;
  /** Maximum input wakeup delay in ms while low-bandwidth is active (default 20). */
  readonly inputLatencyFloorMs?: number;
}

/**
 * Adaptive three-position (`auto` / `on` / `off`) low-bandwidth policy
 * controller. Combines pre-launch probe RTT, SSH/Mosh transport hints, and
 * live {@linkcode AnsiFlushTelemetry} backpressure with hysteresis so slow
 * links degrade smoothly without flapping.
 */
export class LowBandwidthController {
  #mode: LowBandwidthMode;
  #remoteEnv: RemoteTerminalEnvironmentSignals;
  #probeRttMs?: number;
  readonly #rttThresholdMs: number;
  readonly #sshRttThresholdMs: number;
  readonly #stallThresholdMs: number;
  readonly #wouldBlockThreshold: number;
  readonly #pressureWindowsToEngage: number;
  readonly #recoveryCleanMs: number;
  readonly #normalFrameIntervalMs: number;
  readonly #lowBandwidthFrameIntervalMs: number;
  readonly #inputLatencyFloorMs: number;

  #consecutivePressureWindows = 0;
  #backpressureActive = false;
  #cleanSinceMs?: number;

  constructor(options: LowBandwidthControllerOptions = {}) {
    this.#mode = options.mode ?? "auto";
    this.#remoteEnv = options.remoteEnv ?? { ssh: false, mosh: false };
    this.#probeRttMs = options.probeRttMs;
    this.#rttThresholdMs = Math.max(1, options.rttThresholdMs ?? 40);
    this.#sshRttThresholdMs = Math.max(1, options.sshRttThresholdMs ?? 20);
    this.#stallThresholdMs = Math.max(1, options.stallThresholdMs ?? 15);
    this.#wouldBlockThreshold = Math.max(1, options.wouldBlockThreshold ?? 3);
    this.#pressureWindowsToEngage = Math.max(1, Math.floor(options.pressureWindowsToEngage ?? 2));
    this.#recoveryCleanMs = Math.max(0, options.recoveryCleanMs ?? 30_000);
    this.#normalFrameIntervalMs = Math.max(1, options.normalFrameIntervalMs ?? 1000 / 60);
    this.#lowBandwidthFrameIntervalMs = Math.max(
      this.#normalFrameIntervalMs,
      options.lowBandwidthFrameIntervalMs ?? 1000 / 12,
    );
    this.#inputLatencyFloorMs = Math.max(1, options.inputLatencyFloorMs ?? 20);
  }

  /** Current configured user mode (`"auto"`, `"on"`, or `"off"`). */
  get mode(): LowBandwidthMode {
    return this.#mode;
  }

  /** Whether low-bandwidth mitigations are currently active. */
  get active(): boolean {
    return this.inspect().active;
  }

  /** Updates the three-position user mode; returns true if effective active state changed. */
  setMode(mode: LowBandwidthMode): boolean {
    const before = this.active;
    this.#mode = mode;
    if (mode !== "auto") {
      this.#consecutivePressureWindows = 0;
      this.#backpressureActive = false;
      this.#cleanSinceMs = undefined;
    }
    return this.active !== before;
  }

  /** Records a measured startup probe RTT; returns true if effective active state changed. */
  recordProbe(probe: { readonly rttMs?: number }): boolean {
    const before = this.active;
    if (probe.rttMs !== undefined && Number.isFinite(probe.rttMs) && probe.rttMs >= 0) {
      this.#probeRttMs = probe.rttMs;
    }
    return this.active !== before;
  }

  /**
   * Feeds one drained {@linkcode AnsiFlushTelemetry} sample into the adaptive
   * backpressure detector. Returns `true` when the effective active state flips.
   */
  recordFlushTelemetry(telemetry: AnsiFlushTelemetry, nowMs = performance.now()): boolean {
    const before = this.active;
    const degraded = telemetry.degradedFlushes > 0;
    const pressured = degraded ||
      telemetry.stallMs >= this.#stallThresholdMs ||
      telemetry.wouldBlocks >= this.#wouldBlockThreshold;

    if (pressured) {
      this.#cleanSinceMs = undefined;
      this.#consecutivePressureWindows += 1;
      if (degraded || this.#consecutivePressureWindows >= this.#pressureWindowsToEngage) {
        this.#backpressureActive = true;
      }
    } else if (telemetry.frames > 0 || telemetry.bytes > 0) {
      this.#consecutivePressureWindows = 0;
      if (this.#backpressureActive) {
        this.#cleanSinceMs ??= nowMs;
        if (nowMs - this.#cleanSinceMs >= this.#recoveryCleanMs) {
          this.#backpressureActive = false;
          this.#cleanSinceMs = undefined;
        }
      }
    }
    return this.active !== before;
  }

  /** Returns the complete effective low-bandwidth profile for the current state. */
  inspect(): LowBandwidthProfile {
    const { active, reason } = this.#evaluate();
    return {
      active,
      mode: this.#mode,
      reason,
      frameIntervalMs: active ? this.#lowBandwidthFrameIntervalMs : this.#normalFrameIntervalMs,
      inputLatencyFloorMs: this.#inputLatencyFloorMs,
      colorDepth: active ? "256" : "truecolor",
      repeatCompression: active,
      disableAnimations: active,
      disableBackgroundEffects: active,
      forceOpaqueWindows: active,
      reduceMouseMotion: active,
      pauseGraphicsPassthrough: active,
      ...(this.#probeRttMs !== undefined ? { probeRttMs: this.#probeRttMs } : {}),
    };
  }

  #evaluate(): { active: boolean; reason: LowBandwidthReason } {
    if (this.#mode === "on") return { active: true, reason: "manual" };
    if (this.#mode === "off") return { active: false, reason: "disabled" };
    if (this.#remoteEnv.mosh) return { active: true, reason: "remote-env" };
    if (this.#probeRttMs !== undefined) {
      const limit = this.#remoteEnv.ssh ? this.#sshRttThresholdMs : this.#rttThresholdMs;
      if (this.#probeRttMs >= limit) return { active: true, reason: "latency" };
    }
    if (this.#backpressureActive) return { active: true, reason: "backpressure" };
    return { active: false, reason: "normal" };
  }
}

/** Creates a {@linkcode LowBandwidthController}. */
export function createLowBandwidthController(
  options: LowBandwidthControllerOptions = {},
): LowBandwidthController {
  return new LowBandwidthController(options);
}
