// Copyright 2023 Im-Beast. MIT license.

// DAT-008: streams as resources. An AsyncIterable or a push subscription
// feeds a bounded AsyncChannel, so a slow consumer gets exactly the
// configured policy — true backpressure under "block" (the iterable pull
// awaits the send), or drop-oldest/drop-newest/conflate loss policies for
// push producers that cannot pause. A source that fails reconnects through
// the declared hook up to its budget; dispose() aborts the producer's
// signal, runs its cleanup, and closes the channel — cancellation closes
// the producer, not just the consumer.

import { AsyncChannel } from "./async_channel.ts";
import type { AsyncChannelOverflowPolicy } from "./async_channel.ts";

/** A push source: emits values, returns its cleanup. */
export type PushSource<T> = (emit: (value: T) => void, signal: AbortSignal) => (() => void) | void;

/** A pull source: opens a fresh iterable per (re)connect. */
export type PullSource<T> = (signal: AbortSignal) => AsyncIterable<T>;

/** Options for a stream resource. */
export interface StreamResourceOptions {
  readonly capacity?: number;
  readonly overflowPolicy?: AsyncChannelOverflowPolicy;
  /** Reconnect attempts after a source failure (default 0 = none). */
  readonly maxReconnects?: number;
  readonly onReconnect?: (attempt: number, error: unknown) => void;
}

/** The consuming side of a stream resource. */
export class StreamResource<T> {
  readonly #channel: AsyncChannel<T>;
  readonly #controller = new AbortController();
  #cleanup: (() => void) | undefined;
  #reconnects = 0;
  #connected = false;

  constructor(channel: AsyncChannel<T>) {
    this.#channel = channel;
  }

  /** The bounded value stream. */
  values(): AsyncIterable<T> {
    return this.#channel;
  }

  /** Cancels: aborts the producer, runs its cleanup, closes the channel. */
  dispose(): void {
    this.#controller.abort();
    this.#cleanup?.();
    this.#cleanup = undefined;
    this.#connected = false;
    this.#channel.close();
  }

  inspect(): { readonly connected: boolean; readonly reconnects: number } {
    return { connected: this.#connected, reconnects: this.#reconnects };
  }

  /** @internal wiring used by the factory functions below. */
  wire(state: { cleanup?: () => void; connected: boolean; reconnects?: number }): AbortSignal {
    this.#cleanup = state.cleanup;
    this.#connected = state.connected;
    if (state.reconnects !== undefined) this.#reconnects = state.reconnects;
    return this.#controller.signal;
  }
}

/** Consumes a push subscription as a bounded resource. */
export function consumePushStream<T>(source: PushSource<T>, options: StreamResourceOptions = {}): StreamResource<T> {
  const channel = new AsyncChannel<T>({
    capacity: options.capacity ?? 16,
    overflowPolicy: options.overflowPolicy ?? "drop-oldest",
  });
  const resource = new StreamResource(channel);
  const signal = resource.wire({ connected: true });
  const cleanup = source((value) => {
    if (signal.aborted) return;
    // Push producers cannot pause; the channel policy absorbs overflow.
    channel.send(value).catch(() => {});
  }, signal);
  resource.wire({ cleanup: cleanup ?? undefined, connected: true });
  return resource;
}

/** Consumes an AsyncIterable source (with reconnects) as a bounded resource. */
export function consumeIterableStream<T>(
  source: PullSource<T>,
  options: StreamResourceOptions = {},
): StreamResource<T> {
  const channel = new AsyncChannel<T>({
    capacity: options.capacity ?? 16,
    overflowPolicy: options.overflowPolicy ?? "block",
  });
  const resource = new StreamResource(channel);
  const signal = resource.wire({ connected: true });

  const pump = async (): Promise<void> => {
    let attempt = 0;
    while (!signal.aborted) {
      try {
        for await (const value of source(signal)) {
          if (signal.aborted) return;
          // Under "block" this await IS the backpressure: a slow consumer
          // pauses the pull loop, which pauses the upstream iterable.
          await channel.send(value);
        }
        return; // graceful end
      } catch (error) {
        if (signal.aborted) return;
        attempt += 1;
        if (attempt > (options.maxReconnects ?? 0)) throw error;
        resource.wire({ connected: true, reconnects: attempt });
        options.onReconnect?.(attempt, error);
      }
    }
  };
  pump().catch(() => {}).finally(() => {
    resource.wire({ connected: false });
    channel.close();
  });
  return resource;
}
