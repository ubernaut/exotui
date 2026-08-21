// exomonitor, in a browser tab.
//
// The same compose, feeds and tiles the terminal application uses — nothing
// here knows how to draw a chart. What is left is what a browser can honestly
// measure: the microphone through an AnalyserNode, and the JS heap where the
// browser reports one. Feeds a browser cannot supply are not pushed, and the
// dashboard says "waiting" rather than drawing a zero — the same contract the
// terminal monitor keeps on a machine with no GPU.

import { TextObject, type TextRectangle } from "../../src/canvas/text.ts";
import { Computed, Signal } from "../../src/signals/mod.ts";
import { createWebTui } from "../../src/web/host.ts";
import { resolveVisualizationTheme } from "../../src/viz/mod.ts";
import { composeScreen } from "../showcases/exomonitor/compose.ts";
import { createFeedStreams, feedById, type FeedStreams } from "../showcases/exomonitor/feeds.ts";
import { planFeeds } from "../showcases/exomonitor/tiles.ts";
import { type MonitorPalette, nextTheme, themeById } from "../showcases/exomonitor/theme.ts";
import type { Snapshot } from "../showcases/exomonitor/sampler.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app mount element.");

const host = createWebTui({
  root,
  sinkOptions: { cellWidth: 9, cellHeight: 18 },
});

const BANDS = 28;
const WAVEFORM = 256;

let palette: MonitorPalette = themeById("midnight");
let theme = resolveVisualizationTheme(palette.tokens);

const streams: FeedStreams = createFeedStreams();

/** The JS heap, where the browser exposes one (Chromium reports it, others do not). */
interface HeapReport {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}
function heapReport(): HeapReport | undefined {
  const memory = (performance as { memory?: HeapReport }).memory;
  return memory && memory.jsHeapSizeLimit > 0 ? memory : undefined;
}

// ---------------------------------------------------------------------------
// Microphone. Browsers require a user gesture before granting capture, so the
// dashboard starts with its audio tiles waiting and a banner that says why.

let analyser: AnalyserNode | undefined;
let micState: "waiting" | "live" | "refused" = "waiting";

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

const frequencyBuffer = new Uint8Array(1024);
const waveformBuffer = new Uint8Array(2048);

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

// ---------------------------------------------------------------------------
// The dashboard.

const columns = () => host.platform.size.peek().columns;
const rows = () => host.platform.size.peek().rows;

const lineSignals: Signal<string>[] = [];
function ensureLineSignals(): void {
  for (let row = lineSignals.length; row < rows(); row += 1) {
    const signal = new Signal("");
    const rowIndex = row;
    lineSignals.push(signal);
    new TextObject({
      canvas: host.canvas,
      rectangle: new Computed<TextRectangle>(() => ({ column: 0, row: rowIndex, width: columns() })),
      value: signal,
      overwriteRectangle: true,
      multiCodePointSupport: true,
      style: (text) => text,
      zIndex: 1,
    }).draw();
  }
}
ensureLineSignals();

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

function statusLine(): string {
  const mic = micState === "live" ? "mic live" : micState === "refused" ? "mic refused" : "click for mic";
  return `${mic} · t theme`;
}

function draw(): void {
  const width = columns();
  const height = rows();
  const header = height >= 14 ? 1 : 0;
  const status = height >= 8 ? 1 : 0;
  const layout = planFeeds(
    { column: 0, row: header, width, height: Math.max(0, height - header - status) },
    activeFeeds(),
    { snapshot: planningSnapshot(), bands: BANDS, waveform: WAVEFORM },
  );
  const frame = composeScreen({
    width,
    height,
    layout,
    streams,
    theme,
    accent: palette.tokens.accent ?? [127, 214, 255],
    ...(header ? { header: `exomonitor · browser · ${palette.label}` } : {}),
    ...(status ? { status: statusLine() } : {}),
  });
  for (let row = 0; row < height; row += 1) {
    let line = "";
    let current = "";
    for (const cell of frame[row] ?? []) {
      const style = `${cell.foreground?.join(",") ?? ""}|${cell.background?.join(",") ?? ""}`;
      if (style !== current) {
        current = style;
        line += "\x1b[0m";
        if (cell.foreground) line += `\x1b[38;2;${cell.foreground.join(";")}m`;
        if (cell.background) line += `\x1b[48;2;${cell.background.join(";")}m`;
      }
      line += cell.char;
    }
    if (lineSignals[row]) lineSignals[row]!.value = `${line}\x1b[0m`;
  }
  for (let row = height; row < lineSignals.length; row += 1) lineSignals[row]!.value = "";
}

// Samples at the pace the source moves: the spectrum at animation rate, the
// heap once a second — the same split the terminal monitor makes.
let lastAudioPush = 0;
let lastHeapPush = 0;
function tick(now: number): void {
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
  draw();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

host.platform.size.subscribe(() => {
  ensureLineSignals();
  draw();
});

host.element.addEventListener("pointerdown", () => {
  void enableMicrophone();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "t") {
    palette = nextTheme(palette.id);
    theme = resolveVisualizationTheme(palette.tokens);
    draw();
  }
});

host.start();
