#!/usr/bin/env -S deno run --allow-read --allow-env
// Prints a composed screen, in colour, at a size given on the command line.
//
// The monitor's job is to look right at sizes nobody can conveniently resize a
// terminal to. This renders the same frame the application draws, so a layout
// can be judged — and a regression seen — without a live terminal.
//
//   deno run --allow-read --allow-env scripts/preview.ts 120x36 [feed ...]

import { resolveVisualizationTheme } from "../../../src/viz/mod.ts";
import { composeScreen } from "./compose.ts";
import { createFeedStreams, feedById, FEEDS, pushSnapshot } from "./feeds.ts";
import { planFeeds } from "./tiles.ts";
import { themeById } from "./theme.ts";
import type { Snapshot } from "./sampler.ts";

const [size = "120x36", ...rest] = Deno.args;
const themeArg = rest.find((argument) => argument.startsWith("--theme="))?.slice("--theme=".length) ?? "midnight";
const coreArg = Number(rest.find((argument) => argument.startsWith("--cores="))?.slice("--cores=".length) ?? "16");
const wanted = rest.filter((argument) => !argument.startsWith("--"));
const [width, height] = size.split("x").map(Number) as [number, number];

const feeds = wanted.length > 0
  ? wanted.map((id) => feedById(id)!).filter(Boolean)
  : FEEDS.filter((feed) =>
    ["cpu:overall", "cpu:cores", "memory:used", "gpu:overall", "network:total", "temperature:hottest"].includes(feed.id)
  );

// A plausible machine: mostly idle with a couple of busy cores and traffic in
// bursts, because a chart of uniform noise flatters every renderer equally.
const streams = createFeedStreams();
const now = Date.now();
let phase = 0;
const wave = () => {
  phase += 0.37;
  return (Math.sin(phase) + 1) / 2;
};
for (let step = 0; step < 240; step += 1) {
  const at = now - (240 - step) * 1000;
  const busy = 0.15 + 0.7 * Math.abs(Math.sin(step / 23));
  const snapshot: Snapshot = {
    cpu: busy,
    cores: Array.from(
      { length: coreArg },
      (_, index) => Math.max(0, Math.min(1, busy * (index % 5 === 0 ? 1.3 : 0.3) + wave() * 0.1)),
    ),
    memory: {
      usedBytes: (0.5 + 0.2 * Math.sin(step / 31)) * 32e9,
      totalBytes: 32e9,
      swapUsedBytes: 1e9,
      swapTotalBytes: 8e9,
    },
    gpu: {
      name: "Preview GPU",
      utilisation: Math.abs(Math.sin(step / 17)),
      vramUsedBytes: 6e9,
      vramTotalBytes: 12e9,
      celsius: 61,
    },
    network: [{
      name: "eth0",
      rxBytesPerSecond: Math.abs(Math.sin(step / 11)) * 4e6,
      txBytesPerSecond: Math.abs(Math.cos(step / 13)) * 8e5,
    }],
    temperatures: [{ label: "pkg", celsius: 45 + 25 * Math.abs(Math.sin(step / 19)) }],
    hottest: { label: "pkg", celsius: 45 + 25 * Math.abs(Math.sin(step / 19)) },
  };
  pushSnapshot(streams, snapshot, [], at);
  streams.get("audio:spectrum")!.push(
    Array.from({ length: 28 }, (_, band) => Math.abs(Math.sin(step / 7 + band / 4)) * (1 - band / 40)) as never,
    at,
  );
  streams.get("audio:channels")!.push(
    [
      Array.from({ length: 28 }, (_, band) => Math.abs(Math.sin(step / 7 + band / 4)) * (1 - band / 40)),
      Array.from({ length: 28 }, (_, band) => Math.abs(Math.sin(step / 7 + band / 4 + 0.6)) * (1 - band / 44)),
    ] as never,
    at,
  );
  // The room, quieter and duller than what is playing — the comparison is the
  // reason both sources exist.
  streams.get("mic:spectrum")!.push(
    Array.from({ length: 28 }, (_, band) => Math.abs(Math.sin(step / 9 + band / 6)) * 0.45 * (1 - band / 34)) as never,
    at,
  );
  streams.get("mic:waveform")!.push(
    Array.from({ length: 256 }, (_, point) => Math.sin(point / 13 + step / 4) * 0.3) as never,
    at,
  );
  streams.get("audio:waveform")!.push(
    Array.from(
      { length: 256 },
      (_, point) => Math.sin(point / 9 + step / 3) * (0.4 + 0.5 * Math.abs(Math.sin(step / 21))),
    ) as never,
    at,
  );
}

const last: Snapshot = {
  cpu: 0.5,
  cores: Array.from({ length: coreArg }, () => 0.5),
  network: [],
  temperatures: [{ label: "pkg", celsius: 60 }],
};
const palette = themeById(themeArg);
const theme = resolveVisualizationTheme(palette.tokens);
const header = height >= 14 ? 1 : 0;
const status = height >= 8 ? 1 : 0;
const layout = planFeeds({ column: 0, row: header, width, height: Math.max(0, height - header - status) }, feeds, {
  snapshot: last,
  bands: 28,
  waveform: 256,
});
const frame = composeScreen({
  width,
  height,
  layout,
  streams,
  theme,
  accent: palette.tokens.accent ?? [127, 214, 255],
  ...(header ? { header: `exomonitor · Preview GPU · ${palette.label}` } : {}),
  ...(status ? { status: `${layout.tiles.length} tiles · m settings · t theme · q quit` } : {}),
});

const lines: string[] = [];
for (const row of frame) {
  let line = "";
  let current = "";
  for (const cell of row) {
    const style = `${cell.foreground?.join(",") ?? ""}|${cell.background?.join(",") ?? ""}`;
    if (style !== current) {
      current = style;
      line += "\x1b[0m";
      if (cell.foreground) line += `\x1b[38;2;${cell.foreground.join(";")}m`;
      if (cell.background) line += `\x1b[48;2;${cell.background.join(";")}m`;
    }
    line += cell.char;
  }
  lines.push(`${line}\x1b[0m`);
}
console.log(lines.join("\n"));
console.error(
  `${width}x${height} — ${
    layout.tiles.map((tile) =>
      `${tile.source.feed.short}:${tile.visualization}@${tile.chart.width}x${tile.chart.height}`
    )
      .join("  ")
  }`,
);
