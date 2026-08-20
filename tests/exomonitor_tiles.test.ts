// Feeds as tile sources: the part that knows about this machine.
//
// The tiling itself is tested in exotui, where it lives. What is left here is
// the adapter — that entry counts come from the running system rather than the
// catalogue, and that a feed's stated preference reaches the planner.

import { assert, assertEquals } from "./deps.ts";
import { planFeeds } from "../examples/showcases/exomonitor/tiles.ts";
import { createFeedStreams, entriesOfFeed, feedById, FEEDS } from "../examples/showcases/exomonitor/feeds.ts";
import { fitVisualizations } from "../src/viz/mod.ts";
import type { Snapshot } from "../examples/showcases/exomonitor/sampler.ts";

function machine(cores: number, sensors = 1): Snapshot {
  return {
    cpu: 0.5,
    cores: Array.from({ length: cores }, () => 0.5),
    network: [],
    temperatures: Array.from({ length: sensors }, (_, index) => ({ label: `s${index}`, celsius: 50 })),
  };
}

function feeds(...ids: string[]) {
  return ids.map((id) => feedById(id)!);
}

Deno.test("entry counts come from the machine, not from the catalogue", () => {
  const big = machine(88);
  assertEquals(entriesOfFeed(feedById("cpu:cores")!, big), 88);
  assertEquals(entriesOfFeed(feedById("cpu:overall")!, big), 1);
  assertEquals(entriesOfFeed(feedById("audio:spectrum")!, big, 28), 28);
  assertEquals(entriesOfFeed(feedById("audio:waveform")!, big, 28, 256), 256);
  assertEquals(entriesOfFeed(feedById("temperature:sensors")!, machine(4, 6)), 6);
});

Deno.test("the same feed on two machines reaches the planner as different data", () => {
  const area = { column: 0, row: 0, width: 60, height: 20 };
  const few = planFeeds(area, feeds("cpu:cores"), { snapshot: machine(4) }).tiles[0]!;
  const many = planFeeds(area, feeds("cpu:cores"), { snapshot: machine(88) }).tiles[0]!;
  assertEquals(few.source.shape.extent, [4]);
  assertEquals(many.source.shape.extent, [88]);
  const scoreOf = (tile: typeof few, id: string) => tile.fits.find((fit) => fit.id === id)!.score;
  assert(scoreOf(few, "bars") > scoreOf(many, "bars"), "eighty-eight bars are worse off than four");
});

Deno.test("a feed's preference reaches the planner and a pin still beats it", () => {
  const area = { column: 0, row: 0, width: 60, height: 20 };
  // A spectrum's x-axis is frequency, not time — knowledge about the subject
  // that the shape-based ranking cannot have, which is what `prefer` is for.
  const spectrum = planFeeds(area, feeds("audio:spectrum"), { snapshot: machine(4), bands: 28 }).tiles[0]!;
  assertEquals(spectrum.visualization, "scope");
  assert(spectrum.fits[0]!.id !== "scope", "the preference is doing the work, not the ranking");

  const pinned = planFeeds(area, feeds("audio:spectrum"), {
    snapshot: machine(4),
    bands: 28,
    overrides: new Map([["audio:spectrum", "bars"]]),
  }).tiles[0]!;
  assertEquals(pinned.visualization, "bars");

  // Per-core load states no preference, and the ranking picks the btop chart.
  const cores = planFeeds(area, feeds("cpu:cores"), { snapshot: machine(88) }).tiles[0]!;
  assertEquals(cores.visualization, "overlay");
});

Deno.test("an eighteen by four terminal still reports every reading", () => {
  // The size the maintainer asked for: no room for a chart, so every tile is a
  // label and a number.
  const layout = planFeeds(
    { column: 0, row: 0, width: 18, height: 4 },
    feeds("cpu:overall", "memory:used", "gpu:overall", "vram:used"),
    { snapshot: machine(8) },
  );
  assertEquals(layout.tiles.length, 4);
  assertEquals(layout.omitted.length, 0);
  for (const tile of layout.tiles) {
    assertEquals(tile.framed, false);
    assert(tile.rect.width >= 7, `a tile ${tile.rect.width} wide cannot hold "cpu 20%"`);
  }
});

Deno.test("every feed in the catalogue has a stream, a short label and a drawable kind", () => {
  const streams = createFeedStreams();
  for (const feed of FEEDS) {
    assert(feed.short.length > 0 && feed.short.length <= 5, `${feed.id} short label: ${feed.short}`);
    const stream = streams.get(feed.id);
    assert(stream, `${feed.id} has no stream`);
    assertEquals(stream.kind, feed.kind, `${feed.id} stream carries the wrong kind`);
    assert(
      fitVisualizations({ kind: feed.kind, extent: [4] }, { width: 40, height: 12 }).length > 0,
      `${feed.id} (${feed.kind}) has nothing that can draw it`,
    );
  }
});

Deno.test("the microphone is its own source, not a mode of the audio one", () => {
  // Both at once is the interesting case — what is playing against what the
  // room hears — and a flag that swaps one for the other cannot show it.
  const playing = FEEDS.filter((feed) => feed.source === "audio");
  const room = FEEDS.filter((feed) => feed.source === "mic");
  assert(playing.length > 0 && room.length > 0);
  for (const feed of room) {
    assertEquals(feed.live, true, `${feed.id} should be redrawn by its own data`);
    assert(!playing.some((other) => other.id === feed.id), "the two sources share no feed");
  }
  // And a machine with a recorder but no speaker output, or the reverse, gets
  // whichever it has: availability is per source.
  const withoutSystem = FEEDS.filter((feed) => feed.source !== "audio");
  assert(withoutSystem.some((feed) => feed.source === "mic"));
});

Deno.test("microphone feeds carry their live entry counts like the audio ones", () => {
  const snapshot = machine(4);
  assertEquals(entriesOfFeed(feedById("mic:spectrum")!, snapshot, 28, 256), 28);
  assertEquals(entriesOfFeed(feedById("mic:waveform")!, snapshot, 28, 256), 256);
  // A stream exists for each, and something can draw it at a plausible size.
  const streams = createFeedStreams();
  for (const id of ["mic:spectrum", "mic:waveform"]) {
    const feed = feedById(id)!;
    assert(streams.get(id), `${id} has no stream`);
    assert(fitVisualizations({ kind: feed.kind, extent: [28] }, { width: 40, height: 12 }).length > 0);
  }
});
