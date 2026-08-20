// The composed screen, as text: what is drawn, and where it is not.

import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import { resolveVisualizationTheme } from "../src/viz/mod.ts";
import { composeScreen, summaryOf } from "../examples/showcases/exomonitor/compose.ts";
import { createFeedStreams, feedById, pushSnapshot } from "../examples/showcases/exomonitor/feeds.ts";
import { planFeeds } from "../examples/showcases/exomonitor/tiles.ts";
import type { Snapshot } from "../examples/showcases/exomonitor/sampler.ts";

const THEME = resolveVisualizationTheme({});

function snapshot(cores = 4): Snapshot {
  return {
    cpu: 0.42,
    cores: Array.from({ length: cores }, () => 0.42),
    memory: { usedBytes: 9e9, totalBytes: 10e9, swapUsedBytes: 0, swapTotalBytes: 8e9 },
    network: [{ name: "eth0", rxBytesPerSecond: 20_000, txBytesPerSecond: 20_000 }],
    temperatures: [{ label: "pkg", celsius: 55 }],
    hottest: { label: "pkg", celsius: 55 },
  };
}

const SNAPSHOT = snapshot();

function screen(width: number, height: number, ids: string[], filled = true) {
  const streams = createFeedStreams();
  if (filled) {
    const now = Date.now();
    for (let step = 0; step < 30; step += 1) pushSnapshot(streams, snapshot(), [], now - (30 - step) * 1000);
  }
  const feeds = ids.map((id) => feedById(id)!);
  const layout = planFeeds({ column: 0, row: 0, width, height: height - 1 }, feeds, { snapshot: SNAPSHOT });
  const frame = composeScreen({
    width,
    height,
    layout,
    streams,
    theme: THEME,
    accent: [127, 214, 255],
    status: "status",
  });
  const lines = frame.map((row) => row.map((cell) => cell.char).join(""));
  return { frame, lines, layout };
}

Deno.test("the frame is exactly the size asked for, every row the same width", () => {
  const { frame } = screen(80, 24, ["cpu:overall", "memory:used"]);
  assertEquals(frame.length, 24);
  for (const row of frame) assertEquals(row.length, 80);
});

Deno.test("a tile draws nothing outside its own rectangle", () => {
  const { frame, layout } = screen(80, 24, ["cpu:overall", "memory:used", "gpu:overall", "network:total"]);
  const owned = new Set<string>();
  for (const tile of layout.tiles) {
    for (let row = tile.rect.row; row < tile.rect.row + tile.rect.height; row += 1) {
      for (let column = tile.rect.column; column < tile.rect.column + tile.rect.width; column += 1) {
        owned.add(`${column},${row}`);
      }
    }
  }
  for (let row = 0; row < frame.length - 1; row += 1) {
    for (let column = 0; column < frame[row]!.length; column += 1) {
      const cell = frame[row]![column]!;
      if (cell.char === " ") continue;
      assert(owned.has(`${column},${row}`), `something drew at ${column},${row} where no tile lives: "${cell.char}"`);
    }
  }
});

Deno.test("a framed tile shows its title and its reading on the border", () => {
  const { lines } = screen(80, 24, ["cpu:overall", "memory:used"]);
  const titled = lines.find((line) => line.includes("CPU"))!;
  assertStringIncludes(titled, "╭");
  assertStringIncludes(titled, " CPU ");
  assertStringIncludes(titled, "42%");
});

Deno.test("an eighteen by four terminal reads as label and value, nothing else", () => {
  const { lines } = screen(18, 4, ["cpu:overall", "memory:used", "gpu:overall", "network:total"]);
  const text = lines.join("\n");
  assertStringIncludes(text, "cpu");
  assertStringIncludes(text, "42%");
  assertStringIncludes(text, "mem");
  assert(!text.includes("╭"), "no room for a border at this size");
});

Deno.test("a stream with no samples says it is waiting rather than drawing zero", () => {
  const { lines } = screen(60, 16, ["cpu:overall"], false);
  assertStringIncludes(lines.join("\n"), "…");
});

Deno.test("a two-entry vector reports both entries; a wide one reports its peak", () => {
  const streams = createFeedStreams();
  pushSnapshot(streams, snapshot(88), [], Date.now());
  assertEquals(summaryOf(feedById("network:updown")!, streams), "↓20K/s ↑20K/s");
  assertEquals(summaryOf(feedById("cpu:cores")!, streams), "88×42%");
  // Nine columns cannot hold the count as well, so the count is what goes.
  assertEquals(summaryOf(feedById("cpu:cores")!, streams, 5), "42%");
});

Deno.test("ground cells carry no background, so a host can composite behind us", () => {
  // exomux blends only cells whose background is unset — an explicit background
  // is opaque by definition (src/runtime/terminal_palette.ts). Painting the
  // theme's ground on every cell is what made window opacity do nothing.
  const { frame } = screen(60, 16, ["cpu:overall", "memory:used"]);
  const grounded = frame.flat().filter((cell) => cell.char === " " && cell.background !== undefined);
  assertEquals(grounded.length, 0, "a blank cell must hand its ground back to the terminal");
  const inked = frame.flat().filter((cell) => cell.char !== " ");
  assert(inked.length > 0, "something was still drawn");
  assert(
    inked.every((cell) => cell.background === undefined),
    "a glyph in the theme's own ground colour keeps no background either",
  );
});

Deno.test("--opaque paints the ground back on", () => {
  const streams = createFeedStreams();
  pushSnapshot(streams, snapshot(), [], Date.now());
  const layout = planFeeds({ column: 0, row: 0, width: 40, height: 10 }, [feedById("cpu:overall")!], {
    snapshot: SNAPSHOT,
  });
  const frame = composeScreen({
    width: 40,
    height: 10,
    layout,
    streams,
    theme: THEME,
    accent: [127, 214, 255],
    opaque: true,
  });
  assert(frame.flat().every((cell) => cell.background !== undefined), "every cell painted");
});

Deno.test("a rank-two reading reports its peak, not NaN", () => {
  const streams = createFeedStreams();
  // Left and right spectra: Math.max over arrays gives NaN, which is how
  // `2×NaN%` reached a title bar.
  streams.get("audio:channels")!.push([[0.2, 0.8, 0.4], [0.3, 0.55, 0.5]] as never, Date.now());
  const feed = feedById("audio:channels")!;
  assertEquals(summaryOf(feed, streams), "L80% R55%");
  // Too narrow for both: the peak across the whole reading.
  assertEquals(summaryOf(feed, streams, 6), "2×80%");
  assertEquals(summaryOf(feed, streams, 4), "80%");
});
