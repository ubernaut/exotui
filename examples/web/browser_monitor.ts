// The browser monitor, as a module.
//
// Extracted from the standalone page so the desktop can mount the same monitor
// in a window: one implementation of "what a browser can honestly measure",
// two hosts. The terminal monitor's compose, feeds and tiles do the drawing;
// this file owns only the browser sources — the microphone through an
// AnalyserNode and the JS heap where the browser reports one.

import { resolveVisualizationTheme, type VizFrame } from "../../src/viz/mod.ts";
import { composeScreen } from "../showcases/exomonitor/compose.ts";
import { createFeedStreams, feedById, type FeedStreams } from "../showcases/exomonitor/feeds.ts";
import { planFeeds } from "../showcases/exomonitor/tiles.ts";
import { type MonitorPalette, nextTheme, themeById } from "../showcases/exomonitor/theme.ts";
import type { Snapshot } from "../showcases/exomonitor/sampler.ts";

const BANDS = 28;
const WAVEFORM = 256;

/** The JS heap, where the browser exposes one (Chromium reports it, others do not). */
interface HeapReport {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}
function heapReport(): HeapReport | undefined {
  const memory = (performance as { memory?: HeapReport }).memory;
  return memory && memory.jsHeapSizeLimit > 0 ? memory : undefined;
}

export type MicrophoneState = "waiting" | "live" | "refused";

export interface BrowserMonitorOptions {
  /** Draw the monitor's own header row when the frame is tall enough. On for the standalone page, off inside a window whose title bar already says what it is. */
  readonly header?: boolean;
  readonly themeId?: string;
}

/** The browser monitor: sources, streams, theme, and a compose call. */
export interface BrowserMonitor {
  /** Reads the live sources into the streams; call once per animation frame. */
  sample(now: number): void;
  /** Composes the dashboard at a size; pure given what sample() gathered. */
  render(width: number, height: number): VizFrame;
  /** Asks for the microphone. Browsers require a user gesture, so call from one. */
  enableMicrophone(): Promise<void>;
  cycleTheme(): void;
  microphone(): MicrophoneState;
  statusLine(): string;
}

export function createBrowserMonitor(options: BrowserMonitorOptions = {}): BrowserMonitor {
  const wantHeader = options.header ?? true;
  let palette: MonitorPalette = themeById(options.themeId ?? "midnight");
  let theme = resolveVisualizationTheme(palette.tokens);
  const streams: FeedStreams = createFeedStreams();

  let analyser: AnalyserNode | undefined;
  let micState: MicrophoneState = "waiting";
  const frequencyBuffer = new Uint8Array(1024);
  const waveformBuffer = new Uint8Array(2048);

  async function enableMicrophone(): Promise<void> {
    if (analyser || micState === "refused") return;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(media);
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      micState = "live";
    } catch {
      micState = "refused";
    }
  }

  /** Log-spaced bands, because a linear cut of an FFT is all bass. */
  function spectrumBands(): number[] {
    analyser!.getByteFrequencyData(frequencyBuffer);
    const usable = frequencyBuffer.length;
    const bands: number[] = [];
    for (let band = 0; band < BANDS; band += 1) {
      const from = Math.floor(Math.pow(usable, band / BANDS));
      const to = Math.max(from + 1, Math.floor(Math.pow(usable, (band + 1) / BANDS)));
      let peak = 0;
      for (let bin = from; bin < to && bin < usable; bin += 1) {
        if (frequencyBuffer[bin]! > peak) peak = frequencyBuffer[bin]!;
      }
      bands.push(peak / 255);
    }
    return bands;
  }

  function waveformPoints(): number[] {
    analyser!.getByteTimeDomainData(waveformBuffer);
    const step = waveformBuffer.length / WAVEFORM;
    const points: number[] = [];
    for (let point = 0; point < WAVEFORM; point += 1) {
      points.push((waveformBuffer[Math.floor(point * step)]! - 128) / 128);
    }
    return points;
  }

  /** What the browser can honestly serve right now. */
  function activeFeeds() {
    const wanted = ["mic:spectrum", "mic:waveform", ...(heapReport() ? ["memory:used"] : [])];
    return wanted.map((id) => feedById(id)!).filter(Boolean);
  }

  /** Entry counts for the planner; the snapshot itself carries no readings. */
  function planningSnapshot(): Snapshot {
    const heap = heapReport();
    return {
      cpu: 0,
      cores: [],
      network: [],
      temperatures: [],
      ...(heap
        ? {
          memory: {
            usedBytes: heap.usedJSHeapSize,
            totalBytes: heap.jsHeapSizeLimit,
            swapUsedBytes: 0,
            swapTotalBytes: 0,
          },
        }
        : {}),
    };
  }

  // Samples at the pace the source moves: the spectrum at animation rate, the
  // heap once a second — the same split the terminal monitor makes.
  let lastAudioPush = 0;
  let lastHeapPush = 0;
  function sample(now: number): void {
    if (analyser && now - lastAudioPush >= 33) {
      lastAudioPush = now;
      streams.get("mic:spectrum")?.push(spectrumBands() as never, now);
      streams.get("mic:waveform")?.push(waveformPoints() as never, now);
    }
    const heap = heapReport();
    if (heap && now - lastHeapPush >= 1000) {
      lastHeapPush = now;
      const used = heap.jsHeapSizeLimit > 0 ? heap.usedJSHeapSize / heap.jsHeapSizeLimit : 0;
      streams.get("memory:used")?.push(used as never, now);
      streams.get("memory:breakdown")?.push([used, 0] as never, now);
    }
  }

  function statusLine(): string {
    const mic = micState === "live" ? "mic live" : micState === "refused" ? "mic refused" : "click for mic";
    return `${mic} · t theme`;
  }

  function render(width: number, height: number): VizFrame {
    const header = wantHeader && height >= 14 ? 1 : 0;
    const status = height >= 8 ? 1 : 0;
    const layout = planFeeds(
      { column: 0, row: header, width, height: Math.max(0, height - header - status) },
      activeFeeds(),
      { snapshot: planningSnapshot(), bands: BANDS, waveform: WAVEFORM },
    );
    return composeScreen({
      width,
      height,
      layout,
      streams,
      theme,
      accent: palette.tokens.accent ?? [127, 214, 255],
      ...(header ? { header: `exomonitor · browser · ${palette.label}` } : {}),
      ...(status ? { status: statusLine() } : {}),
    });
  }

  return {
    sample,
    render,
    enableMicrophone,
    cycleTheme() {
      palette = nextTheme(palette.id);
      theme = resolveVisualizationTheme(palette.tokens);
    },
    microphone: () => micState,
    statusLine,
  };
}
