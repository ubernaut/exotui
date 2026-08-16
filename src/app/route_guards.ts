// Copyright 2023 Im-Beast. MIT license.

// NAV-004: navigation guards as an ordered pipeline in front of the router.
// Guards run in registration order — synchronous or asynchronous — and each
// answers allow, cancel, or redirect. A redirect re-runs the pipeline for
// the new target while the visited chain is tracked, so a cycle yields one
// structured redirect-loop outcome instead of spinning; starting a new run
// aborts the previous one's signal and discards its verdict, so obsolete
// guards can never commit a stale navigation. The pipeline decides only —
// the RouteManager remains the sole navigation owner.

/** A guard's verdict. */
export type RouteGuardResult =
  | { readonly kind: "allow" }
  | { readonly kind: "cancel"; readonly reason?: string }
  | { readonly kind: "redirect"; readonly to: string };

/** One guard; the signal aborts when a newer navigation supersedes this one. */
export type RouteGuard = (navigation: {
  readonly to: string;
  readonly from?: string;
  readonly signal: AbortSignal;
}) => RouteGuardResult | Promise<RouteGuardResult>;

/** The pipeline's final verdict for one navigation. */
export interface RouteGuardOutcome {
  readonly kind: "allowed" | "cancelled" | "aborted" | "redirect-loop";
  /** The destination that survived (after redirects, for "allowed"). */
  readonly to: string;
  /** Every target visited, in order — the redirect chain. */
  readonly chain: readonly string[];
  readonly reason?: string;
}

const MAX_REDIRECTS = 8;

/** Ordered guard pipeline with supersession and loop detection. */
export class RouteGuardPipeline {
  #guards: Array<{ readonly name: string; readonly guard: RouteGuard }> = [];
  #current: AbortController | undefined;
  #counter = 0;

  /** Registers a guard at the end of the order; returns its disposer. */
  register(guard: RouteGuard, options: { readonly name?: string } = {}): () => void {
    const entry = { name: options.name ?? `guard-${++this.#counter}`, guard };
    this.#guards.push(entry);
    return () => {
      this.#guards = this.#guards.filter((candidate) => candidate !== entry);
    };
  }

  /** Runs the pipeline; a newer run aborts and supersedes this one. */
  async run(to: string, from?: string): Promise<RouteGuardOutcome> {
    this.#current?.abort();
    const controller = new AbortController();
    this.#current = controller;

    const chain: string[] = [to];
    let target = to;
    outer: for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
      for (const { name, guard } of [...this.#guards]) {
        let result: RouteGuardResult;
        try {
          result = await guard({ to: target, from, signal: controller.signal });
        } catch (error) {
          if (controller.signal.aborted) return { kind: "aborted", to: target, chain };
          return {
            kind: "cancelled",
            to: target,
            chain,
            reason: `${name}: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        if (controller.signal.aborted) return { kind: "aborted", to: target, chain };
        if (result.kind === "cancel") {
          return { kind: "cancelled", to: target, chain, reason: result.reason ?? name };
        }
        if (result.kind === "redirect") {
          if (chain.includes(result.to)) {
            return {
              kind: "redirect-loop",
              to: result.to,
              chain: [...chain, result.to],
              reason: `${name} redirected into a visited target`,
            };
          }
          chain.push(result.to);
          target = result.to;
          continue outer; // the whole order re-runs against the new target
        }
      }
      return { kind: "allowed", to: target, chain };
    }
    return { kind: "redirect-loop", to: target, chain, reason: `more than ${MAX_REDIRECTS} redirects` };
  }

  get guardCount(): number {
    return this.#guards.length;
  }
}

/** Creates a guard pipeline. */
export function createRouteGuardPipeline(): RouteGuardPipeline {
  return new RouteGuardPipeline();
}
