// Copyright 2023 Im-Beast. MIT license.

// PKG-008: release channels are DECLARED DATA with hard tag rules.
// Stable, beta, canary, and compatibility-test channels each carry a
// machine-readable support window and a version-suffix contract; the
// tag registry refuses a prerelease publish whose base version already
// has a stable tag (a prerelease can never overwrite or shadow stable),
// refuses republishing any existing tag (tags are immutable), and every
// upgrade resolution names the channel it selected and why.

/** The channels. */
export type ReleaseChannel = "stable" | "beta" | "canary" | "compat-test";

/** One channel's machine-readable declaration. */
export interface ChannelDeclaration {
  readonly name: ReleaseChannel;
  readonly supportWindowDays: number;
  /** Required version suffix pattern ("" = exact semver only). */
  readonly suffix: string;
}

/** The declared channel set. */
export const RELEASE_CHANNELS: readonly ChannelDeclaration[] = [
  { name: "stable", supportWindowDays: 365, suffix: "" },
  { name: "beta", supportWindowDays: 90, suffix: "-beta." },
  { name: "canary", supportWindowDays: 14, suffix: "-canary." },
  { name: "compat-test", supportWindowDays: 7, suffix: "-compat." },
];

/** A publish outcome. */
export type PublishResult =
  | { readonly ok: true; readonly tag: string }
  | { readonly ok: false; readonly reason: string };

/** An upgrade diagnostic — always names the channel. */
export interface UpgradeDiagnostic {
  readonly channel: ReleaseChannel;
  readonly from: string;
  readonly selected?: string;
  readonly reason: string;
}

function baseVersion(version: string): string {
  return version.split("-", 1)[0]!;
}

function channelFor(version: string): ReleaseChannel | undefined {
  if (/^\d+\.\d+\.\d+$/.test(version)) return "stable";
  for (const channel of RELEASE_CHANNELS) {
    if (channel.suffix !== "" && version.includes(channel.suffix)) return channel.name;
  }
  return undefined;
}

/** The tag registry with channel rules. */
export class ReleaseTagRegistry {
  readonly #tags = new Map<string, ReleaseChannel>();

  /** Publishes one version tag under channel rules. */
  publish(channel: ReleaseChannel, version: string): PublishResult {
    const detected = channelFor(version);
    if (detected === undefined) return { ok: false, reason: `version "${version}" fits no channel suffix` };
    if (detected !== channel) {
      return { ok: false, reason: `version "${version}" belongs to channel "${detected}", not "${channel}"` };
    }
    if (this.#tags.has(version)) {
      return { ok: false, reason: `tag "${version}" already exists — tags are immutable` };
    }
    // A prerelease may never shadow an existing stable base version.
    if (channel !== "stable" && this.#tags.get(baseVersion(version)) === "stable") {
      return {
        ok: false,
        reason: `prerelease "${version}" cannot be published over stable "${baseVersion(version)}"`,
      };
    }
    this.#tags.set(version, channel);
    return { ok: true, tag: version };
  }

  /** Resolves the newest tag on one channel; diagnostic names the channel. */
  resolveUpgrade(from: string, channel: ReleaseChannel): UpgradeDiagnostic {
    const candidates = [...this.#tags.entries()]
      .filter(([, tagChannel]) => tagChannel === channel)
      .map(([version]) => version)
      .sort((a, b) => {
        const pa = baseVersion(a).split(".").map(Number);
        const pb = baseVersion(b).split(".").map(Number);
        for (let index = 0; index < 3; index += 1) {
          if ((pa[index] ?? 0) !== (pb[index] ?? 0)) return (pa[index] ?? 0) - (pb[index] ?? 0);
        }
        return a.localeCompare(b);
      });
    const selected = candidates[candidates.length - 1];
    if (!selected) {
      return { channel, from, reason: `no releases exist on channel "${channel}"` };
    }
    if (selected === from) {
      return { channel, from, selected, reason: `already at the newest "${channel}" release` };
    }
    return { channel, from, selected, reason: `channel "${channel}" offers ${selected}` };
  }

  tags(): readonly { version: string; channel: ReleaseChannel }[] {
    return [...this.#tags.entries()].map(([version, channel]) => ({ version, channel }));
  }
}

/** Creates a release tag registry. */
export function createReleaseTagRegistry(): ReleaseTagRegistry {
  return new ReleaseTagRegistry();
}
