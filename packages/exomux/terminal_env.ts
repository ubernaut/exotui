// Copyright 2023 Im-Beast. MIT license.

// Child PTY environment sanitization is now a core exotui runtime module
// (`terminal_env.ts`). Exomux supplies its own `TERM_PROGRAM` identity while
// delegating host-identity stripping and capability defaults to core.

import { terminalChildEnvironment } from "@ubernaut/exotui/terminal";

export interface ExomuxChildEnvironmentOptions {
  /** The environment the daemon itself runs in. */
  readonly inherited: Readonly<Record<string, string>>;
  /** Per-session overrides from the spawn request. The caller always wins. */
  readonly requested?: Readonly<Record<string, string>>;
  /** exomux's version, for TERM_PROGRAM_VERSION. */
  readonly version?: string;
}

/**
 * Builds the full sanitized environment for an exomux PTY child, stripping
 * outer-host terminal identity variables and advertising `TERM_PROGRAM=exomux`.
 */
export function exomuxChildEnvironment(options: ExomuxChildEnvironmentOptions): Record<string, string> {
  return terminalChildEnvironment({
    inherited: options.inherited,
    requested: options.requested,
    program: "exomux",
    version: options.version,
  });
}
