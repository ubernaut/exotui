// Copyright 2023 Im-Beast. MIT license.

// NAV-008: unsaved-change blockers composed in front of navigation. Each
// blocker inspects the pending navigation and answers with an inspectable
// reason; blockers resolve in registration order and the FIRST blocking
// reason wins, carried to a confirmation callback (the host wires it to its
// modal stack). Forced teardown never awaits UI: `check(..., {force: true})`
// collects the reasons for the record and proceeds without invoking the
// confirmer at all.

/** One blocker's verdict. */
export interface NavigationBlockReason {
  /** Stable identifier of the blocker (e.g. "settings-form"). */
  readonly source: string;
  readonly reason: string;
}

/** A blocker: returns a reason to block, or undefined to allow. */
export type NavigationBlocker = (navigation: {
  readonly to: string;
  readonly from?: string;
}) => NavigationBlockReason | undefined;

/** Confirmation hook — the host presents its modal and resolves the choice. */
export type NavigationConfirmer = (
  reason: NavigationBlockReason,
  all: readonly NavigationBlockReason[],
) => Promise<boolean>;

/** Outcome of one navigation check. */
export interface NavigationBlockOutcome {
  readonly kind: "clear" | "confirmed" | "blocked" | "forced";
  /** Every blocking reason, in stable registration order. */
  readonly reasons: readonly NavigationBlockReason[];
}

/** The composable blocker registry. */
export class NavigationBlockerRegistry {
  #blockers: Array<{ readonly blocker: NavigationBlocker }> = [];

  /** Registers a blocker; returns its disposer. */
  register(blocker: NavigationBlocker): () => void {
    const entry = { blocker };
    this.#blockers.push(entry);
    return () => {
      this.#blockers = this.#blockers.filter((candidate) => candidate !== entry);
    };
  }

  /** Collects blocking reasons in stable order, without any UI. */
  reasons(to: string, from?: string): readonly NavigationBlockReason[] {
    const reasons: NavigationBlockReason[] = [];
    for (const { blocker } of this.#blockers) {
      const reason = blocker({ to, from });
      if (reason) reasons.push(reason);
    }
    return reasons;
  }

  /**
   * Checks a navigation. Clear → proceed. Blocked → the first reason goes to
   * the confirmer (host modal); confirmation proceeds, refusal blocks.
   * `force` records the reasons and proceeds without awaiting any UI.
   */
  async check(
    to: string,
    options: {
      readonly from?: string;
      readonly confirm?: NavigationConfirmer;
      readonly force?: boolean;
    } = {},
  ): Promise<NavigationBlockOutcome> {
    const reasons = this.reasons(to, options.from);
    if (reasons.length === 0) return { kind: "clear", reasons };
    if (options.force) return { kind: "forced", reasons };
    if (!options.confirm) return { kind: "blocked", reasons };
    const confirmed = await options.confirm(reasons[0]!, reasons);
    return { kind: confirmed ? "confirmed" : "blocked", reasons };
  }

  get blockerCount(): number {
    return this.#blockers.length;
  }
}

/** Creates a blocker registry. */
export function createNavigationBlockerRegistry(): NavigationBlockerRegistry {
  return new NavigationBlockerRegistry();
}
