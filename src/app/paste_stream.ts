// Copyright 2023 Im-Beast. MIT license.

// INP-009: large pastes as one logical transaction under declared limits.
// A paste is opened against byte/line limits with an explicit overflow policy
// (reject or truncate), split into grapheme-safe chunks, and delivered at a
// caller-paced rate — the controller hands out at most `chunksPerTick` chunks
// per call, so a multi-megabyte paste never blocks a render tick, and
// cancellation drops the remainder without ever splitting a cluster.

import { isGraphemeBoundary, previousGraphemeBoundary } from "../unicode/grapheme.ts";

/** Declared limits for a paste transaction. */
export interface TerminalPasteLimits {
  /** Maximum UTF-8 payload bytes; overflow triggers the declared policy. */
  readonly maxBytes?: number;
  /** Maximum lines (CRLF/CR/LF all count); overflow triggers the policy. */
  readonly maxLines?: number;
  /** Target chunk size in UTF-8 bytes (default 4096). */
  readonly chunkBytes?: number;
  /** What happens past a limit: reject the whole paste, or truncate at a grapheme boundary. */
  readonly overflow?: "reject" | "truncate";
}

/** One logical paste transaction after policy application. */
export interface TerminalPasteTransaction {
  /** The payload after policy; empty when rejected. */
  readonly text: string;
  /** Grapheme-safe chunks that reassemble exactly into `text`. */
  readonly chunks: readonly string[];
  /** Bytes and lines of the ORIGINAL payload, for diagnostics. */
  readonly totalBytes: number;
  readonly totalLines: number;
  readonly policy: "within-limits" | "truncated" | "rejected";
}

const DEFAULT_CHUNK_BYTES = 4096;
const encoder = new TextEncoder();

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    if (char === 10) lines += 1;
    else if (char === 13) {
      lines += 1;
      if (text.charCodeAt(index + 1) === 10) index += 1;
    }
  }
  return lines;
}

/** Cuts text to at most `lines` lines, keeping the trailing newline out. */
function cutLines(text: string, lines: number): string {
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    if (char !== 10 && char !== 13) continue;
    seen += 1;
    if (seen >= lines) return text.slice(0, index);
    if (char === 13 && text.charCodeAt(index + 1) === 10) index += 1;
  }
  return text;
}

/** Cuts text to at most `bytes` UTF-8 bytes on a grapheme boundary. */
function cutBytes(text: string, bytes: number): string {
  if (encoder.encode(text).length <= bytes) return text;
  // UTF-8 length ≥ UTF-16 unit count, so `bytes` code units is a safe start.
  let end = Math.min(text.length, bytes);
  if (!isGraphemeBoundary(text, end)) end = previousGraphemeBoundary(text, end);
  while (end > 0 && encoder.encode(text.slice(0, end)).length > bytes) {
    end = previousGraphemeBoundary(text, end);
  }
  return text.slice(0, end);
}

/**
 * Opens one logical paste transaction: applies the declared limits, then
 * splits the surviving payload into grapheme-safe chunks.
 */
export function openTerminalPasteTransaction(
  text: string,
  limits: TerminalPasteLimits = {},
): TerminalPasteTransaction {
  const totalBytes = encoder.encode(text).length;
  const totalLines = countLines(text);
  const overflow = limits.overflow ?? "reject";
  const overBytes = limits.maxBytes !== undefined && totalBytes > limits.maxBytes;
  const overLines = limits.maxLines !== undefined && totalLines > limits.maxLines;

  if ((overBytes || overLines) && overflow === "reject") {
    return { text: "", chunks: [], totalBytes, totalLines, policy: "rejected" };
  }
  let kept = text;
  if (overLines) kept = cutLines(kept, limits.maxLines!);
  if (overBytes) kept = cutBytes(kept, limits.maxBytes!);
  const policy = kept === text ? "within-limits" : "truncated";
  return {
    text: kept,
    chunks: chunkGraphemeSafe(kept, limits.chunkBytes ?? DEFAULT_CHUNK_BYTES),
    totalBytes,
    totalLines,
    policy,
  };
}

function chunkGraphemeSafe(text: string, chunkBytes: number): readonly string[] {
  const target = Math.max(1, Math.floor(chunkBytes));
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + target);
    if (end < text.length) {
      if (!isGraphemeBoundary(text, end)) end = previousGraphemeBoundary(text, end);
      while (end > start && encoder.encode(text.slice(start, end)).length > target) {
        end = previousGraphemeBoundary(text, end);
      }
      // A single cluster larger than the target is delivered whole rather
      // than split; the budget is a target, cluster integrity is a contract.
      if (end <= start) {
        end = start + 1;
        while (end < text.length && !isGraphemeBoundary(text, end)) end += 1;
      }
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * Caller-paced delivery of one transaction. Each `next()` returns at most
 * `chunksPerTick` chunks; the caller invokes it once per render tick, so
 * delivery never blocks the loop, and `cancel()` drops the remainder while
 * reporting how much of the transaction was delivered.
 */
export class TerminalPasteStreamController {
  readonly #transaction: TerminalPasteTransaction;
  readonly #chunksPerTick: number;
  #delivered = 0;
  #cancelled = false;

  constructor(transaction: TerminalPasteTransaction, options: { readonly chunksPerTick?: number } = {}) {
    this.#transaction = transaction;
    this.#chunksPerTick = Math.max(1, Math.floor(options.chunksPerTick ?? 1));
  }

  /** The next batch of chunks; empty once done or cancelled. */
  next(): readonly string[] {
    if (this.#cancelled) return [];
    const batch = this.#transaction.chunks.slice(this.#delivered, this.#delivered + this.#chunksPerTick);
    this.#delivered += batch.length;
    return batch;
  }

  get done(): boolean {
    return this.#cancelled || this.#delivered >= this.#transaction.chunks.length;
  }

  get cancelled(): boolean {
    return this.#cancelled;
  }

  progress(): { readonly delivered: number; readonly total: number } {
    return { delivered: this.#delivered, total: this.#transaction.chunks.length };
  }

  cancel(): void {
    this.#cancelled = true;
  }
}

/** Opens a transaction and wraps it in a paced controller. */
export function streamTerminalPaste(
  text: string,
  limits: TerminalPasteLimits = {},
  options: { readonly chunksPerTick?: number } = {},
): { transaction: TerminalPasteTransaction; controller: TerminalPasteStreamController } {
  const transaction = openTerminalPasteTransaction(text, limits);
  return { transaction, controller: new TerminalPasteStreamController(transaction, options) };
}
