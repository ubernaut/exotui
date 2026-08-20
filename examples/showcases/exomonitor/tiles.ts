// Feeds as tile sources.
//
// The tiling itself lives in @ubernaut/exotui/viz — none of it ever knew what a
// CPU was, which is why it belongs in the library rather than here. What is left
// is the adapter: how a feed describes its data to the planner, with the entry
// count taken from the running machine rather than from the catalogue.

import { planTiles, type TileLayout, type TileSource, type VizTile } from "../../../src/viz/mod.ts";
import type { Rectangle } from "../../../mod.ts";
import { entriesOfFeed, type Feed } from "./feeds.ts";
import type { Snapshot } from "./sampler.ts";

export interface FeedSource extends TileSource {
  readonly feed: Feed;
}

export type FeedTile = VizTile<FeedSource>;
export type FeedLayout = TileLayout<FeedSource>;

export interface PlanFeedsOptions {
  readonly snapshot: Snapshot;
  /** Live entry counts the snapshot does not carry. */
  readonly bands?: number;
  readonly waveform?: number;
  readonly channels?: number;
  /** A visualisation the user pinned, by feed id. */
  readonly overrides?: ReadonlyMap<string, string>;
}

/** Describes each feed's current data and hands the layout to the library. */
export function planFeeds(area: Rectangle, feeds: readonly Feed[], options: PlanFeedsOptions): FeedLayout {
  const sources: FeedSource[] = feeds.map((feed) => ({
    id: feed.id,
    feed,
    shape: {
      kind: feed.kind,
      // Live cardinality: this is what makes four cores and eighty-eight cores
      // different questions for one feed.
      extent: [entriesOfFeed(feed, options.snapshot, options.bands ?? 0, options.waveform ?? 0, options.channels ?? 0)],
    },
    ...(feed.prefer ? { prefer: feed.prefer } : {}),
  }));
  return planTiles(area, sources, options.overrides ? { overrides: options.overrides } : {});
}
