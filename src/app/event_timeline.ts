// Copyright 2023 Im-Beast. MIT license.

// WID-010: the event timeline is anchored by IDENTITY, not by index.
// Events insert in deterministic order — (timestamp, id) — so an
// out-of-order arrival lands in the same slot no matter when it shows
// up; the view is either live-tail (following the newest event) or
// PAUSED on an anchor event id, and because the anchor is an id, earlier
// events inserting above it shift indices without moving what the paused
// user sees. Rows interleave group headers, the group of the first
// visible row is exposed as the sticky header, and jump-to-event pauses
// on the target. The buffer is bounded, evicting oldest.

/** One timeline event. */
export interface TimelineEvent {
  readonly id: string;
  readonly atMs: number;
  readonly group: string;
  readonly text: string;
}

/** One rendered row. */
export type TimelineRow =
  | { readonly kind: "header"; readonly group: string }
  | { readonly kind: "event"; readonly event: TimelineEvent };

/** One windowed view. */
export interface TimelineView {
  readonly rows: readonly TimelineRow[];
  /** The group governing the first visible row. */
  readonly sticky?: string;
  readonly liveTail: boolean;
}

/** Controller options. */
export interface EventTimelineOptions {
  readonly maxEvents?: number;
}

/** The timeline controller. */
export class EventTimelineController {
  readonly #events: TimelineEvent[] = [];
  readonly #maxEvents: number;
  #anchor?: string; // undefined = live tail
  #evicted = 0;

  constructor(options: EventTimelineOptions = {}) {
    this.#maxEvents = Math.max(1, options.maxEvents ?? 10_000);
  }

  /** Inserts one event at its deterministic (atMs, id) position. */
  insert(event: TimelineEvent): number {
    let low = 0;
    let high = this.#events.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const probe = this.#events[mid]!;
      if (probe.atMs < event.atMs || (probe.atMs === event.atMs && probe.id < event.id)) low = mid + 1;
      else high = mid;
    }
    this.#events.splice(low, 0, event);
    if (this.#events.length > this.#maxEvents) {
      const [evicted] = this.#events.splice(0, 1);
      this.#evicted += 1;
      if (this.#anchor === evicted!.id) this.#anchor = this.#events[0]?.id;
    }
    return low;
  }

  /** Pauses live tail, anchored at one event. */
  pauseAt(eventId: string): boolean {
    if (!this.#events.some((event) => event.id === eventId)) return false;
    this.#anchor = eventId;
    return true;
  }

  resumeLiveTail(): void {
    this.#anchor = undefined;
  }

  /** Jumps to an event (pausing there). */
  jumpTo(eventId: string): boolean {
    return this.pauseAt(eventId);
  }

  liveTail(): boolean {
    return this.#anchor === undefined;
  }

  /** The windowed view: `rows` display rows ending at (or anchored to) the tail. */
  view(rowCount: number): TimelineView {
    const rows: TimelineRow[] = [];
    if (this.#events.length === 0) return { rows, liveTail: this.liveTail() };

    // Build the full row list with group headers at boundaries.
    const allRows: TimelineRow[] = [];
    let currentGroup: string | undefined;
    for (const event of this.#events) {
      if (event.group !== currentGroup) {
        currentGroup = event.group;
        allRows.push({ kind: "header", group: event.group });
      }
      allRows.push({ kind: "event", event });
    }

    let end: number;
    if (this.#anchor === undefined) {
      end = allRows.length; // live tail: newest at the bottom
    } else {
      const anchorRow = allRows.findIndex((row) => row.kind === "event" && row.event.id === this.#anchor);
      end = anchorRow < 0 ? allRows.length : anchorRow + 1;
    }
    const start = Math.max(0, end - rowCount);
    const visible = allRows.slice(start, end);

    // Sticky header: the group governing the first visible row.
    let sticky: string | undefined;
    for (let index = start; index >= 0; index -= 1) {
      const row = allRows[index];
      if (row?.kind === "header") {
        sticky = row.group;
        break;
      }
      if (row?.kind === "event") {
        sticky = row.event.group;
        break;
      }
    }
    return { rows: visible, sticky, liveTail: this.#anchor === undefined };
  }

  inspect(): { events: number; evicted: number; anchor?: string } {
    return { events: this.#events.length, evicted: this.#evicted, anchor: this.#anchor };
  }
}

/** Creates an event-timeline controller. */
export function createEventTimelineController(options: EventTimelineOptions = {}): EventTimelineController {
  return new EventTimelineController(options);
}
