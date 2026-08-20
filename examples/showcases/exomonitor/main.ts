#!/usr/bin/env -S deno run -A
// exomonitor — a themeable, responsive system monitor built on @ubernaut/exotui.
//
// `-A` rather than a narrow set, and not by laziness: Deno refuses /proc reads
// to anything short of --allow-all — `--allow-read=/proc` is rejected too — and
// /proc is where a system monitor's readings live. Started narrower it shows
// whatever is left and says so in the status bar.

import { createAnsiStyle, handleInput, type Rectangle, Signal, Tui } from "../../../mod.ts";
import { resolveVisualizationTheme, type VisualizationTheme } from "../../../src/viz/mod.ts";
import { blockedPaths, detectAvailable, MonitorSampler, type Snapshot } from "./sampler.ts";
import { createMonitorView } from "./view.ts";
import { composeChart, composeScreen } from "./compose.ts";
import { createFeedStreams, entryLabels, type Feed, feedById, FEEDS, pushSnapshot } from "./feeds.ts";
import { type FeedLayout, type FeedTile, planFeeds } from "./tiles.ts";
import {
  activate,
  enabledFeeds,
  moveSelection,
  reconcile,
  type SettingsContext,
  type SettingsState,
  switchPage,
} from "./settings.ts";
import { DEFAULT_FEEDS, loadConfig, saveConfig } from "./config.ts";
import { type AudioCapture, startAudioCapture } from "./sources/audio.ts";
import { MONITOR_THEMES, type MonitorPalette, nextTheme, themeById } from "./theme.ts";

const SAMPLE_INTERVAL_MS = 1000;
/** Spectra per second, and therefore frames per second for the audio tile. */
const AUDIO_HZ = 60;
const AUDIO_BANDS = 28;

if (Deno.args.includes("--help")) {
  console.log(
    [
      "exomonitor — a themeable, responsive system monitor",
      "",
      `themes: ${MONITOR_THEMES.map((theme) => theme.id).join(", ")}  (EXOMONITOR_THEME, or press t)`,
      "audio:  what is playing, by default; --no-audio turns it off",
      "mic:    off until you ask for it — --mic at launch, or switch a Microphone",
      "        feed on in the settings menu, which starts the capture then",
      "keys:   m opens settings, t cycles the theme, q quits",
      "flags:  --opaque paints the theme background instead of letting the host show through",
    ].join("\n"),
  );
  Deno.exit(0);
}

const palette = new Signal<MonitorPalette>(themeById(Deno.env.get("EXOMONITOR_THEME") ?? "midnight"));
// Ground cells carry no background unless asked, so a host compositing behind
// this window — exomux's opacity, a terminal's own transparency — has something
// to blend. --opaque paints the theme's ground instead.
const opaque = Deno.args.includes("--opaque");

const tui = new Tui({
  // A style is still required: it is what puts a full-screen object under
  // everything, and without one nothing repaints a cell a chart has moved off.
  // Transparent unless --opaque, so that object clears rather than colours.
  style: opaque ? createAnsiStyle({ background: palette.peek().tokens.surface }) : createAnsiStyle({}),
  // Fast enough for the live audio tile. The rest of the screen is redrawn once
  // a second regardless; this is the ceiling on how quickly a change can reach
  // the terminal, not how often anything is recomposed.
  refreshRate: 1000 / AUDIO_HZ,
});
handleInput(tui);
// No handleKeyboardControls: every key this application answers is answered
// below, and two authorities for the same arrow key is how a modal starts
// moving focus behind itself.
tui.dispatch();
tui.run();
palette.subscribe((next) => {
  if (opaque) tui.style = createAnsiStyle({ background: next.tokens.surface! });
});

// ---- what this machine can supply -------------------------------------
const sources = await detectAvailable();
// What is playing, captured from the default sink's monitor. A machine with no
// recorder simply has no audio feeds.
const audio: AudioCapture | undefined = Deno.args.includes("--no-audio")
  ? undefined
  : await startAudioCapture({ kind: "system", bands: AUDIO_BANDS, updatesPerSecond: AUDIO_HZ });
if (audio) sources.push("audio");

/**
 * The microphone, which is a separate source rather than a mode.
 *
 * Both at once is the interesting case — what is playing against what the room
 * hears — and a flag that swaps one for the other cannot show it.
 *
 * It does not start on its own. Opening a microphone lights a recording
 * indicator and is the kind of thing a monitor should be asked to do rather
 * than assume, so the capture starts when `--mic` is passed or when a
 * Microphone feed is switched on, and stops when the last one is switched off.
 */
let mic: AudioCapture | undefined;
// Offered whenever a recorder exists at all, which the system capture proves.
// Without one, enabling a mic feed still tries, and marks the source
// unavailable if nothing can record.
let micOffered = audio !== undefined || Deno.args.includes("--mic");
if (micOffered) sources.push("mic");
let available: Feed[] = FEEDS.filter((feed) => sources.includes(feed.source));

// ---- state ------------------------------------------------------------
const sampler = new MonitorSampler();
const streams = createFeedStreams();
const snapshot = new Signal<Snapshot>({ cpu: 0, cores: [], network: [], temperatures: [] });
// Seeded at full length rather than empty: the tile's visualisation is chosen
// from how many entries the feed carries, and one entry picks a different chart
// than twenty-eight do. Starting empty means visibly swapping chart a second in.
let bands: readonly number[] = audio || micOffered ? new Array(AUDIO_BANDS).fill(0) : [];
let waveform: readonly number[] = audio || micOffered ? new Array(256).fill(0) : [];
let channelCount = audio ? 2 : 0;

const stored = await loadConfig();
if (themeById(stored.themeId).id === stored.themeId) palette.value = themeById(stored.themeId);
const wanted = new Set(stored.enabled);
let settings: SettingsState = reconcile({
  page: "sources",
  index: 0,
  enabled: wanted,
  overrides: new Map(Object.entries(stored.overrides)),
  themeId: palette.peek().id,
});
if (settings.enabled.size === 0) {
  // A machine with none of the stored feeds still has to show something.
  const fallback = available.filter((feed) => DEFAULT_FEEDS.includes(feed.id));
  settings = { ...settings, enabled: new Set((fallback.length > 0 ? fallback : available).map((feed) => feed.id)) };
}
// `--mic` is a request to see it, not just to permit it: without switching a
// feed on, the flag would open the device and draw nothing.
if (Deno.args.includes("--mic")) {
  settings = { ...settings, enabled: new Set([...settings.enabled, "mic:spectrum"]) };
}
let menuOpen = false;
let layout: FeedLayout = { tiles: [], omitted: [] };
let liveTiles: FeedTile[] = [];

const vizTheme = new Signal<VisualizationTheme>(resolveVisualizationTheme(palette.peek().tokens));
palette.subscribe((next) => {
  vizTheme.value = resolveVisualizationTheme(next.tokens);
});
const view = createMonitorView(tui, vizTheme, palette);

/**
 * The area the tiles get.
 *
 * A header and a status bar are the first things a short terminal cannot
 * afford: at four rows, every one of them is a reading.
 */
function tileArea(width: number, height: number): Rectangle {
  const header = height >= 14 ? 1 : 0;
  const status = height >= 8 ? 1 : 0;
  return { column: 0, row: header, width, height: Math.max(0, height - header - status) };
}

function plan(width: number, height: number): FeedLayout {
  return planFeeds(tileArea(width, height), enabledFeeds(settings, available), {
    snapshot: snapshot.peek(),
    bands: bands.length,
    waveform: waveform.length,
    channels: channelCount,
    overrides: settings.overrides,
  });
}

function statusLine(current: FeedLayout, width: number): string {
  const hidden = current.omitted.length > 0
    ? ` · no room: ${current.omitted.map((source) => source.feed.short).join(" ")}`
    : "";
  // A reading that is missing because permission was refused must say so. Deno
  // gates /proc behind --allow-all, and a monitor that quietly shows two tiles
  // instead of six looks like it decided, not like it was stopped.
  const refused = blockedPaths();
  const denied = refused.length > 0 ? ` · no access to ${refused[0]} — start with -A` : "";
  return `${current.tiles.length} tiles${hidden}${denied} · m settings · t theme · q quit`
    .slice(0, Math.max(0, width));
}

function screenModel(width: number, height: number) {
  const labels = new Map<string, readonly string[]>();
  for (const tile of layout.tiles) {
    const names = entryLabels(tile.source.feed, snapshot.peek());
    if (names.length > 0) labels.set(tile.source.feed.id, names);
  }
  return {
    labels,
    width,
    height,
    layout,
    streams,
    theme: vizTheme.peek(),
    accent: palette.peek().tokens.accent ?? [127, 214, 255],
    opaque,
    ...(height >= 14
      ? { header: `exomonitor · ${snapshot.peek().gpu?.name ?? "no GPU"} · ${palette.peek().label}` }
      : {}),
    ...(height >= 8 ? { status: statusLine(layout, width) } : {}),
  };
}

function draw(): void {
  const { width, height } = tui.rectangle.peek();
  layout = plan(width, height);
  liveTiles = layout.tiles.filter((tile) => tile.source.feed.live);
  view.present(composeScreen(screenModel(width, height)));
  drawLive();
}

/** Redraws only the live tiles, which is what runs at the audio rate. */
function drawLive(): void {
  if (liveTiles.length === 0) {
    view.presentLive([]);
    return;
  }
  const { width, height } = tui.rectangle.peek();
  const model = screenModel(width, height);
  view.presentLive(liveTiles.map((tile) => ({ rect: tile.chart, frame: composeChart(tile, model) })));
}

function settingsContext(): SettingsContext {
  const omitted = new Set(layout.omitted.map((source) => source.id));
  return {
    feeds: available,
    fitsFor: (id) => layout.tiles.find((tile) => tile.source.id === id)?.fits ?? [],
    themes: MONITOR_THEMES.map((theme) => ({ id: theme.id, label: theme.label })),
    omitted,
  };
}

function refreshSettings(): void {
  view.presentSettings(menuOpen ? settings : undefined, settingsContext());
}

function persist(): void {
  void saveConfig({
    enabled: [...settings.enabled],
    overrides: Object.fromEntries(settings.overrides),
    themeId: palette.peek().id,
  });
}

async function tick(): Promise<void> {
  const next = await sampler.sample();
  snapshot.value = next;
  // Audio is pushed by its own listener, at its own rate; passing it here too
  // would put the same spectrum in the stream twice a second.
  pushSnapshot(streams, next, [], Date.now());
  draw();
  if (menuOpen) refreshSettings();
}

// Every analysis, as it happens. Pushing on a timer instead would alias one rate
// against the other and drop frames the capture already produced.
audio?.onFrame((next) => {
  bands = next.bands;
  waveform = next.waveform;
  channelCount = next.channels.length;
  const at = Date.now();
  streams.get("audio:spectrum")?.push([...next.bands] as never, at);
  streams.get("audio:waveform")?.push([...next.waveform] as never, at);
  streams.get("audio:channels")?.push(next.channels.map((channel) => [...channel]) as never, at);
  drawLive();
});

function listenToMic(capture: AudioCapture): void {
  capture.onFrame((next) => {
    const at = Date.now();
    streams.get("mic:spectrum")?.push([...next.bands] as never, at);
    streams.get("mic:waveform")?.push([...next.waveform] as never, at);
    drawLive();
  });
}

/** Whether any Microphone feed is switched on. */
function micWanted(): boolean {
  for (const id of settings.enabled) if (feedById(id)?.source === "mic") return true;
  return false;
}

/**
 * Starts or stops the microphone to match what is switched on.
 *
 * Called after every settings change rather than once at launch, so switching a
 * Microphone feed on opens the device and switching the last one off closes it
 * again — a monitor holding a microphone open for a panel nobody is looking at
 * is a monitor nobody should run.
 */
async function syncMic(): Promise<void> {
  const wanted = micWanted();
  if (wanted && !mic) {
    mic = await startAudioCapture({ kind: "mic", bands: AUDIO_BANDS, updatesPerSecond: AUDIO_HZ });
    if (mic) listenToMic(mic);
    else {
      // Nothing on this machine can record. Say so on the Sources page rather
      // than leaving a feed switched on that will never produce a sample.
      micOffered = false;
      available = FEEDS.filter((feed) => sources.includes(feed.source) && feed.source !== "mic");
    }
    draw();
    return;
  }
  if (!wanted && mic) {
    mic.close();
    mic = undefined;
    draw();
  }
}

// A resize must re-tile immediately rather than waiting for the next sample, or
// a stretched terminal shows a stale grid for up to a second.
tui.rectangle.subscribe(() => {
  draw();
  if (menuOpen) refreshSettings();
});

tui.on("keyPress", (event) => {
  if (event.key === "q" || (event.key === "c" && event.ctrl)) {
    audio?.close();
    mic?.close();
    tui.destroy();
    Deno.exit(0);
  }

  if (menuOpen) {
    const context = settingsContext();
    if (event.key === "escape" || event.key === "m") {
      menuOpen = false;
      // Repaint what the modal was covering. Erasing a hidden component
      // repaints whatever is under it, and under it is a chart drawn once a
      // second — without this the screen keeps the modal's shape until the next
      // sample lands.
      draw();
    } else if (event.key === "up") {
      settings = moveSelection(settings, context, -1);
    } else if (event.key === "down") {
      settings = moveSelection(settings, context, 1);
    } else if (event.key === "left") {
      settings = switchPage(settings, context, -1);
    } else if (event.key === "right") {
      settings = switchPage(settings, context, 1);
    } else if (event.key === "space" || event.key === "return") {
      settings = activate(settings, context, 1);
      if (settings.themeId !== palette.peek().id) palette.value = themeById(settings.themeId);
      persist();
      void syncMic();
      draw();
    }
    refreshSettings();
    return;
  }

  if (event.key === "m") {
    menuOpen = true;
    refreshSettings();
    return;
  }
  if (event.key === "t") {
    palette.value = nextTheme(palette.peek().id);
    settings = { ...settings, themeId: palette.peek().id };
    persist();
    draw();
  }
});

await syncMic();
await tick();
setInterval(() => void tick(), SAMPLE_INTERVAL_MS);
