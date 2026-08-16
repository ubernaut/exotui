// Copyright 2023 Im-Beast. MIT license.

// TERM-009: terminal queries are CORRELATED requests, not free-floating
// hopes. The broker emits the query bytes (DECRQSS, XTGETTCAP, device
// attributes, OSC colors, cell metrics), holds one FIFO of outstanding
// requests per kind, and consumes an incoming token ONLY when it matches
// an outstanding request of its kind — the oldest one, which it resolves
// exactly once. Unsolicited input (no outstanding request, or a second
// reply after resolution) is never consumed and flows on to the
// application untouched. Deadlines expire on the caller's clock and
// reject their owning request alone.

import type { TerminalToken } from "./terminal_parser.ts";

/** Query kinds the broker speaks. */
export type TerminalQueryKind =
  | "decrqss"
  | "xtgettcap"
  | "device-attributes"
  | "osc-color"
  | "cell-metrics";

/** One issued query: the bytes to write plus its pending promise. */
export interface IssuedQuery {
  readonly id: number;
  readonly bytes: string;
  readonly reply: Promise<string>;
}

interface PendingQuery {
  readonly id: number;
  readonly deadline: number;
  resolve(reply: string): void;
  reject(error: Error): void;
}

function queryBytes(kind: TerminalQueryKind, parameter: string): string {
  switch (kind) {
    case "decrqss":
      return `\x1bP$q${parameter}\x1b\\`;
    case "xtgettcap":
      return `\x1bP+q${parameter}\x1b\\`;
    case "device-attributes":
      return "\x1b[c";
    case "osc-color":
      return `\x1b]${parameter};?\x07`;
    case "cell-metrics":
      return "\x1b[16t";
  }
}

/** Does a token answer this query kind? Returns the reply payload. */
function matchReply(kind: TerminalQueryKind, token: TerminalToken): string | undefined {
  switch (kind) {
    case "decrqss":
      if (token.kind === "dcs" && /^[01]\$r/.test(token.data)) return token.data;
      return undefined;
    case "xtgettcap":
      if (token.kind === "dcs" && /^[01]\+r/.test(token.data)) return token.data;
      return undefined;
    case "device-attributes":
      if (token.kind === "csi" && token.prefix === "?" && token.final === "c") return token.params;
      return undefined;
    case "osc-color":
      if (token.kind === "osc" && /^(4;|1[01];)/.test(token.data) && token.data.includes("rgb:")) return token.data;
      return undefined;
    case "cell-metrics":
      if (token.kind === "csi" && token.prefix === "" && token.final === "t" && token.params.startsWith("6;")) {
        return token.params;
      }
      return undefined;
  }
}

/** The query broker. */
export class TerminalQueryBroker {
  readonly #pending = new Map<TerminalQueryKind, PendingQuery[]>();
  readonly #defaultDeadlineMs: number;
  #counter = 0;

  constructor(options: { readonly deadlineMs?: number } = {}) {
    this.#defaultDeadlineMs = options.deadlineMs ?? 1000;
  }

  /** Issues one query; write `bytes` to the terminal, await `reply`. */
  request(kind: TerminalQueryKind, parameter: string, nowMs: number, deadlineMs?: number): IssuedQuery {
    const id = ++this.#counter;
    let resolve!: (reply: string) => void;
    let reject!: (error: Error) => void;
    const reply = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const queue = this.#pending.get(kind) ?? [];
    queue.push({ id, deadline: nowMs + (deadlineMs ?? this.#defaultDeadlineMs), resolve, reject });
    this.#pending.set(kind, queue);
    return { id, bytes: queryBytes(kind, parameter), reply };
  }

  /**
   * Offers one incoming token. Returns true when it answered the OLDEST
   * outstanding request of its kind (consumed); false leaves it for the
   * application — unsolicited input is never swallowed.
   */
  consume(token: TerminalToken): boolean {
    for (const [kind, queue] of this.#pending) {
      if (queue.length === 0) continue;
      const payload = matchReply(kind, token);
      if (payload === undefined) continue;
      const owner = queue.shift()!;
      owner.resolve(payload);
      return true;
    }
    return false;
  }

  /** Rejects overdue requests on the caller's clock. */
  expire(nowMs: number): number {
    let expired = 0;
    for (const [kind, queue] of this.#pending) {
      const keep: PendingQuery[] = [];
      for (const pending of queue) {
        if (nowMs >= pending.deadline) {
          pending.reject(new Error(`${kind} query ${pending.id} missed its deadline`));
          expired += 1;
        } else keep.push(pending);
      }
      this.#pending.set(kind, keep);
    }
    return expired;
  }

  inspect(): Readonly<Record<string, number>> {
    return Object.fromEntries([...this.#pending].map(([kind, queue]) => [kind, queue.length]));
  }
}

/** Creates a terminal query broker. */
export function createTerminalQueryBroker(options: { readonly deadlineMs?: number } = {}): TerminalQueryBroker {
  return new TerminalQueryBroker(options);
}
