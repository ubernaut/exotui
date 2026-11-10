// Copyright 2023 Im-Beast. MIT license.

// REM-005: frame delivery is a BOUNDED window, and a stalled client costs
// constant memory. Every sent frame carries a sequence number and is
// encoded (REM-004) against the previously sent frame — the base the
// client will hold when it applies it. The send window caps in-flight
// frames; once full, new frames COALESCE into a single pending-latest
// slot (screen state is idempotent, newest wins), so a stalled client
// holds the host at window + pending + last-acked frames, never a queue.
// Acks slide the window and release the coalesced frame as a delta
// against the newest valid base; an explicit resync clears the chain and
// the next frame goes out full.

import {
  type CellFrame,
  encodeCellFrame,
  encodeCellFrameDelta,
  type EncodedFrame,
  type FrameCodecVersion,
  snapshotCellFrame,
} from "./frame_codec.ts";

/** One sequenced outbound frame. */
export interface SequencedFrame {
  readonly sequence: number;
  readonly payload: EncodedFrame;
}

/** Flow-controller options. */
export interface FrameFlowOptions {
  /** Max unacknowledged frames in flight (default 4, integer 1–64). */
  readonly windowSize?: number;
  /** Default 2 locally; choose from the ready handshake before sending network traffic. */
  readonly codecVersion?: FrameCodecVersion;
}

/** The per-client frame flow controller. */
export class FrameFlowController {
  readonly #windowSize: number;
  readonly #codecVersion: FrameCodecVersion;
  readonly #inFlight = new Map<number, CellFrame>();
  #lastSent?: CellFrame;
  #lastAcked?: CellFrame;
  #pendingLatest?: CellFrame;
  #coalescedDrops = 0;
  #sequence = 0;
  #needsFull = true;

  constructor(options: FrameFlowOptions = {}) {
    const windowSize = options.windowSize ?? 4;
    const codecVersion = options.codecVersion ?? 2;
    if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > 64) {
      throw new RangeError("frame flow windowSize must be an integer from 1 to 64");
    }
    if (codecVersion !== 1 && codecVersion !== 2) throw new RangeError("unsupported frame flow codecVersion");
    this.#windowSize = windowSize;
    this.#codecVersion = codecVersion;
  }

  /**
   * Offers the newest frame. Returns the sequenced payload to send, or
   * undefined when the window is full — the frame then waits in the
   * single coalescing slot, replacing any earlier waiter.
   */
  offer(frame: CellFrame): SequencedFrame | undefined {
    frame = snapshotCellFrame(frame);
    // Reject legacy-unrepresentable input even when it would only enter the pending slot.
    if (this.#codecVersion === 1) encodeCellFrame(frame, { version: 1 });
    if (this.#inFlight.size >= this.#windowSize) {
      if (this.#pendingLatest) this.#coalescedDrops += 1;
      this.#pendingLatest = frame; // newest wins; memory stays constant
      return undefined;
    }
    return this.#send(frame);
  }

  /**
   * Acknowledges every frame at or below `sequence`. Returns the released
   * coalesced frame's payload when the ack made room.
   */
  ack(sequence: number): SequencedFrame | undefined {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > this.#sequence) {
      throw new RangeError("frame acknowledgement is outside the sent sequence range");
    }
    for (const [inFlightSequence, frame] of [...this.#inFlight]) {
      if (inFlightSequence <= sequence) {
        this.#inFlight.delete(inFlightSequence);
        this.#lastAcked = frame;
      }
    }
    if (this.#pendingLatest && this.#inFlight.size < this.#windowSize) {
      const released = this.#pendingLatest;
      this.#pendingLatest = undefined;
      return this.#send(released);
    }
    return undefined;
  }

  /** The client requested resync: drop the chain, next frame goes full. */
  resync(): void {
    this.#inFlight.clear();
    this.#lastSent = undefined;
    this.#lastAcked = undefined;
    this.#pendingLatest = undefined;
    this.#needsFull = true;
  }

  inspect(): {
    inFlight: number;
    pending: boolean;
    coalescedDrops: number;
    lastAckedHeld: boolean;
  } {
    return {
      inFlight: this.#inFlight.size,
      pending: this.#pendingLatest !== undefined,
      coalescedDrops: this.#coalescedDrops,
      lastAckedHeld: this.#lastAcked !== undefined,
    };
  }

  #send(frame: CellFrame): SequencedFrame {
    const payload = this.#needsFull || !this.#lastSent
      ? encodeCellFrame(frame, { version: this.#codecVersion })
      : encodeCellFrameDelta(this.#lastSent, frame, { version: this.#codecVersion });
    this.#needsFull = false;
    this.#lastSent = frame;
    this.#sequence += 1;
    this.#inFlight.set(this.#sequence, frame);
    return { sequence: this.#sequence, payload };
  }
}

/** Creates a frame flow controller for one client. */
export function createFrameFlowController(options: FrameFlowOptions = {}): FrameFlowController {
  return new FrameFlowController(options);
}
