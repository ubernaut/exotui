// What each category can show, and at what dimensionality.
//
// A source is a thing you monitor — CPU, memory, the network. A feed is one way
// of reading it, and the two are not the same question: overall CPU load is a
// single number over time, per-core load is an array of numbers over time, and
// they want different visualisations for the same reason they carry different
// amounts of information. Naming feeds separately is what lets a tile ask "what
// draws 88 numbers in 20 columns" instead of "what draws CPU".

import { type DataKind, type DataStream, matrixStream, scalarStream, vectorStream } from "../../../src/viz/mod.ts";
import type { Snapshot } from "./sampler.ts";

export const SOURCE_IDS = ["cpu", "memory", "gpu", "vram", "network", "temperature", "audio"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export type Unit = "percent" | "celsius" | "rate";

export interface Feed {
  readonly id: string;
  readonly source: SourceId;
  /** The category heading a settings page groups this under. */
  readonly sourceLabel: string;
  /** How this reading differs from the source's others: "overall", "per-core". */
  readonly label: string;
  /** What a tile puts in its title bar. */
  readonly title: string;
  /** The title a tile one row tall can afford: `cpu`, `mem`, `net`. */
  readonly short: string;
  readonly kind: DataKind;
  readonly unit: Unit;
  /** A fixed range where one exists; throughput has none and tracks its own. */
  readonly domain?: { readonly min: number; readonly max: number };
  /**
   * A mark per entry, for a vector feed short enough to report each of them.
   * Two network directions read as `↓1.2M/s ↑410K/s`; eighty-eight cores do not
   * read as anything and fall back to a peak.
   */
  readonly entryMarks?: readonly string[];
  /**
   * Updated far faster than the machine is sampled.
   *
   * Audio is the case: /proc is worth reading once a second and a spectrum is
   * worth sixty. A live feed's tile is redrawn on its own data rather than on
   * the sample tick, so one slow reading cannot hold up a fast one.
   */
  readonly live?: boolean;
  /**
   * The visualisation this feed is best shown as, where several fit.
   *
   * The registry ranks by what the data is — how many entries, how much room.
   * That an audio spectrum reads best as a trace and per-core load reads best
   * as a waterfall is knowledge about the subject, not about the shape, so it
   * lives here. A user's pin still wins, and a preference that does not fit is
   * ignored like any other.
   */
  readonly prefer?: string;
}

/**
 * Every feed, in the order a default configuration prefers them.
 *
 * The scalar feed of each source comes first: it is the one that survives a
 * terminal small enough to hold nothing else.
 */
export const FEEDS: readonly Feed[] = Object.freeze([
  {
    id: "cpu:overall",
    source: "cpu",
    sourceLabel: "CPU",
    label: "overall",
    title: "CPU",
    short: "cpu",
    kind: "0dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
  },
  {
    id: "cpu:cores",
    source: "cpu",
    sourceLabel: "CPU",
    label: "per-core",
    title: "CPU CORES",
    short: "cores",
    kind: "1dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
    // No preference: the ranking picks the overlay, which is the btop chart —
    // one braille trace per core over the window, each in its own colour. That
    // is both the richest view of this feed and the one people expect, so
    // stating a preference here would only be a way of getting it wrong later.
  },
  {
    id: "memory:used",
    source: "memory",
    sourceLabel: "Memory",
    label: "used",
    title: "MEMORY",
    short: "mem",
    kind: "0dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
  },
  {
    id: "memory:breakdown",
    source: "memory",
    sourceLabel: "Memory",
    label: "ram / swap",
    title: "RAM+SWAP",
    short: "mem",
    kind: "1dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
    entryMarks: ["r", "s"],
  },
  {
    id: "gpu:overall",
    source: "gpu",
    sourceLabel: "GPU",
    label: "utilisation",
    title: "GPU",
    short: "gpu",
    kind: "0dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
  },
  {
    id: "vram:used",
    source: "vram",
    sourceLabel: "VRAM",
    label: "used",
    title: "VRAM",
    short: "vram",
    kind: "0dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
  },
  {
    id: "network:total",
    source: "network",
    sourceLabel: "Network",
    label: "combined",
    title: "NETWORK",
    short: "net",
    kind: "0dt",
    unit: "rate",
  },
  {
    id: "network:updown",
    source: "network",
    sourceLabel: "Network",
    label: "down / up",
    title: "NET ↓↑",
    short: "net",
    kind: "1dt",
    unit: "rate",
    entryMarks: ["↓", "↑"],
  },
  {
    id: "temperature:hottest",
    source: "temperature",
    sourceLabel: "Temperature",
    label: "hottest",
    title: "TEMP",
    short: "temp",
    kind: "0dt",
    unit: "celsius",
    domain: { min: 20, max: 100 },
  },
  {
    id: "temperature:sensors",
    source: "temperature",
    sourceLabel: "Temperature",
    label: "every sensor",
    title: "SENSORS",
    short: "temp",
    kind: "1dt",
    unit: "celsius",
    domain: { min: 20, max: 100 },
  },
  {
    id: "audio:spectrum",
    source: "audio",
    sourceLabel: "Audio",
    label: "spectrum",
    title: "AUDIO",
    short: "aud",
    kind: "1dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
    live: true,
    prefer: "scope",
  },
  {
    id: "audio:channels",
    source: "audio",
    sourceLabel: "Audio",
    label: "left / right",
    title: "AUDIO L/R",
    short: "l/r",
    // A matrix over time — the stream keeps a little history like every other —
    // but drawn as one matrix: the comparison is between the channels, and
    // stacking time into it would ask the reader to hold three axes at once.
    // A visualisation accepting `2d` is handed the latest reading, which is
    // what dropping history means.
    kind: "2dt",
    unit: "percent",
    domain: { min: 0, max: 1 },
    live: true,
    prefer: "psychograph",
    entryMarks: ["L", "R"],
  },
  {
    id: "audio:waveform",
    source: "audio",
    sourceLabel: "Audio",
    label: "waveform",
    title: "SCOPE",
    short: "wave",
    kind: "1dt",
    unit: "percent",
    // Signed: a waveform swings both ways about zero, and a trace of it should
    // sit in the middle of the box rather than climbing from the floor.
    domain: { min: -1, max: 1 },
    live: true,
    prefer: "scope",
  },
]);

const BY_ID = new Map(FEEDS.map((feed) => [feed.id, feed]));

export function feedById(id: string): Feed | undefined {
  return BY_ID.get(id);
}

/** Feeds belonging to one source, in catalogue order. */
export function feedsOf(source: SourceId): Feed[] {
  return FEEDS.filter((feed) => feed.source === source);
}

/**
 * How many entries this feed is currently carrying.
 *
 * Live, not declared: the number of cores is a property of the machine and the
 * number of audio bands a property of the capture, and both decide which
 * visualisation can draw the feed. A scalar feed is always one.
 */
export function entriesOfFeed(feed: Feed, snapshot: Snapshot, bands = 0, waveform = 0, channels = 0): number {
  switch (feed.id) {
    case "cpu:cores":
      return Math.max(1, snapshot.cores.length);
    case "memory:breakdown":
      return 2;
    case "network:updown":
      return 2;
    case "temperature:sensors":
      return Math.max(1, snapshot.temperatures.length);
    case "audio:spectrum":
      return Math.max(1, bands);
    case "audio:channels":
      return Math.max(1, channels);
    case "audio:waveform":
      return Math.max(1, waveform);
    default:
      return 1;
  }
}

/** Labels for a feed's entries, where a renderer can show them. */
export function entryLabels(feed: Feed, snapshot: Snapshot): string[] {
  switch (feed.id) {
    case "cpu:cores":
      return snapshot.cores.map((_, index) => `c${index}`);
    case "memory:breakdown":
      return ["ram", "swap"];
    case "audio:channels":
      return ["left", "right"];
    case "network:updown":
      return ["down", "up"];
    case "temperature:sensors":
      return snapshot.temperatures.map((reading) => reading.label.slice(0, 8));
    default:
      return [];
  }
}

export type FeedStreams = ReadonlyMap<string, DataStream>;

export function createFeedStreams(capacity = 240): FeedStreams {
  const streams = new Map<string, DataStream>();
  for (const feed of FEEDS) {
    // A live feed fills its history sixty times faster, so the same capacity
    // would hold four seconds of it. Its own window is what a waterfall of it
    // should span, not the same number of readings.
    const size = feed.live ? capacity * 2 : capacity;
    const options = { capacity: size, label: feed.id, ...(feed.domain ? { domain: feed.domain } : {}) };
    const stream = feed.kind === "2dt"
      ? matrixStream({ ...options, capacity: 2 })
      : feed.kind === "1dt"
      ? vectorStream(options)
      : scalarStream(options);
    streams.set(feed.id, stream as DataStream);
  }
  return streams;
}

const KILO = 1024;

export function formatBytes(bytes: number): string {
  const units = ["B", "K", "M", "G", "T"];
  let value = bytes;
  let unit = 0;
  while (value >= KILO && unit < units.length - 1) {
    value /= KILO;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit]}`;
}

/** How a feed's numbers read as text, for readouts and tile subtitles. */
export function formatValue(feed: Feed, value: number): string {
  if (feed.unit === "percent") return `${Math.round(value * 100)}%`;
  if (feed.unit === "celsius") return `${Math.round(value)}°C`;
  return `${formatBytes(value)}/s`;
}

/**
 * Pushes one reading of everything into the streams that want it.
 *
 * Feeds a machine cannot supply are simply not pushed. A stream with no samples
 * draws as "waiting" rather than as zero, which is the difference between an
 * idle GPU and no GPU.
 */
export function pushSnapshot(
  streams: FeedStreams,
  snapshot: Snapshot,
  bands: readonly number[],
  now: number,
): void {
  const push = (id: string, value: number | readonly number[]) => {
    streams.get(id)?.push(value as never, now);
  };
  push("cpu:overall", snapshot.cpu);
  if (snapshot.cores.length > 0) push("cpu:cores", [...snapshot.cores]);
  if (snapshot.memory) {
    const { usedBytes, totalBytes, swapUsedBytes, swapTotalBytes } = snapshot.memory;
    push("memory:used", totalBytes > 0 ? usedBytes / totalBytes : 0);
    push("memory:breakdown", [
      totalBytes > 0 ? usedBytes / totalBytes : 0,
      swapTotalBytes > 0 ? swapUsedBytes / swapTotalBytes : 0,
    ]);
  }
  if (snapshot.gpu) {
    push("gpu:overall", snapshot.gpu.utilisation);
    const { vramUsedBytes, vramTotalBytes } = snapshot.gpu;
    push("vram:used", vramTotalBytes > 0 ? vramUsedBytes / vramTotalBytes : 0);
  }
  if (snapshot.network.length > 0) {
    const down = snapshot.network.reduce((sum, rate) => sum + rate.rxBytesPerSecond, 0);
    const up = snapshot.network.reduce((sum, rate) => sum + rate.txBytesPerSecond, 0);
    push("network:total", down + up);
    push("network:updown", [down, up]);
  }
  if (snapshot.hottest) push("temperature:hottest", snapshot.hottest.celsius);
  if (snapshot.temperatures.length > 0) {
    push("temperature:sensors", snapshot.temperatures.map((reading) => reading.celsius));
  }
  if (bands.length > 0) push("audio:spectrum", [...bands]);
}
