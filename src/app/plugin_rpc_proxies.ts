// Copyright 2023 Im-Beast. MIT license.

// PLG-005: host-side typed proxies for isolated plugin contributions
// (commands, data sources, themes, widgets). Each proxy owns one
// contribution's channel: replies are schema-validated before a caller
// sees them, cancellation via AbortSignal rejects immediately and
// discards the late reply when it eventually lands, and every failure —
// malformed reply, transport fault, cancellation-orphaned reply — is
// recorded against THE CALLING CONTRIBUTION alone. Sibling contributions
// keep working; the registry reports per-contribution health instead of
// one shared broken state.

/** What kind of contribution a proxy fronts. */
export type ContributionKind = "command" | "data-source" | "theme" | "widget";

/** One contribution's identity. */
export interface ContributionRef {
  readonly kind: ContributionKind;
  readonly name: string;
}

/** The raw channel into the plugin's isolate. */
export type ContributionTransport = (method: string, args: unknown) => Promise<unknown>;

/** A failure scoped to one contribution. */
export interface ContributionFailure {
  readonly contribution: ContributionRef;
  readonly reason: string;
}

/** The error a failing invoke rejects with. */
export class ContributionRpcError extends Error {
  constructor(readonly contribution: ContributionRef, message: string) {
    super(`${contribution.kind} "${contribution.name}": ${message}`);
    this.name = "ContributionRpcError";
  }
}

/** One typed proxy. */
export class TypedContributionProxy<TArgs, TReply> {
  readonly contribution: ContributionRef;
  readonly #transport: ContributionTransport;
  readonly #validateReply: (reply: unknown) => string | undefined;
  readonly #failures: ContributionFailure[] = [];

  constructor(options: {
    readonly contribution: ContributionRef;
    readonly transport: ContributionTransport;
    /** Returns a message for malformed replies. */
    readonly validateReply: (reply: unknown) => string | undefined;
  }) {
    this.contribution = options.contribution;
    this.#transport = options.transport;
    this.#validateReply = options.validateReply;
  }

  /** Invokes the contribution; failures are scoped to it alone. */
  invoke(args: TArgs, options: { signal?: AbortSignal } = {}): Promise<TReply> {
    const { signal } = options;
    if (signal?.aborted) {
      return Promise.reject(this.#fail("cancelled before dispatch"));
    }
    return new Promise<TReply>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        reject(this.#fail("cancelled"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      this.#transport(`${this.contribution.kind}:${this.contribution.name}`, args)
        .then((reply) => {
          if (settled) {
            // Late reply after cancellation: recorded, never delivered.
            this.#record("late reply discarded after cancellation");
            return;
          }
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          const invalid = this.#validateReply(reply);
          if (invalid !== undefined) reject(this.#fail(`malformed reply: ${invalid}`));
          else resolve(reply as TReply);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          reject(this.#fail(`transport failed: ${String(error)}`));
        });
    });
  }

  /** This contribution's recorded failures. */
  failures(): readonly ContributionFailure[] {
    return [...this.#failures];
  }

  #fail(reason: string): ContributionRpcError {
    this.#record(reason);
    return new ContributionRpcError(this.contribution, reason);
  }

  #record(reason: string): void {
    if (this.#failures.length >= 64) this.#failures.shift();
    this.#failures.push({ contribution: this.contribution, reason });
  }
}

/** Registry of proxies with per-contribution health. */
export class ContributionProxyRegistry {
  readonly #proxies = new Map<string, TypedContributionProxy<unknown, unknown>>();

  register<TArgs, TReply>(proxy: TypedContributionProxy<TArgs, TReply>): void {
    const key = `${proxy.contribution.kind}:${proxy.contribution.name}`;
    this.#proxies.set(key, proxy as TypedContributionProxy<unknown, unknown>);
  }

  get(kind: ContributionKind, name: string): TypedContributionProxy<unknown, unknown> | undefined {
    return this.#proxies.get(`${kind}:${name}`);
  }

  /** Health per contribution — failures never bleed across entries. */
  health(): readonly { contribution: ContributionRef; failureCount: number }[] {
    return [...this.#proxies.values()].map((proxy) => ({
      contribution: proxy.contribution,
      failureCount: proxy.failures().length,
    }));
  }
}

/** Creates one typed contribution proxy. */
export function createContributionProxy<TArgs, TReply>(options: {
  readonly contribution: ContributionRef;
  readonly transport: ContributionTransport;
  readonly validateReply: (reply: unknown) => string | undefined;
}): TypedContributionProxy<TArgs, TReply> {
  return new TypedContributionProxy(options);
}

/** Creates a contribution-proxy registry. */
export function createContributionProxyRegistry(): ContributionProxyRegistry {
  return new ContributionProxyRegistry();
}
