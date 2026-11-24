// Copyright 2023 Im-Beast. MIT license.

/**
 * Environment variables that identify a specific outer host terminal emulator
 * or multiplexer. Stripped when spawning embedded PTY children so children do
 * not assume outer-host capabilities (such as Ghostty/Kitty/WezTerm extensions
 * or an enclosing tmux server) that the embedded emulator does not expose.
 */
export const HOST_TERMINAL_IDENTITY_ENV_VARS: readonly string[] = Object.freeze([
  "GHOSTTY_RESOURCES_DIR",
  "GHOSTTY_BIN_DIR",
  "GHOSTTY_SHELL_FEATURES",
  "GHOSTTY_SHELL_INTEGRATION_NO_SUDO",
  "KITTY_WINDOW_ID",
  "KITTY_PID",
  "KITTY_PUBLIC_KEY",
  "KITTY_LISTEN_ON",
  "KITTY_INSTALLATION_DIR",
  "KITTY_SHELL_INTEGRATION",
  "WEZTERM_EXECUTABLE",
  "WEZTERM_EXECUTABLE_DIR",
  "WEZTERM_PANE",
  "WEZTERM_UNIX_SOCKET",
  "WEZTERM_CONFIG_FILE",
  "WEZTERM_CONFIG_DIR",
  "ITERM_SESSION_ID",
  "ITERM_PROFILE",
  "ITERM2_SQUELCH_MARK",
  "ALACRITTY_SOCKET",
  "ALACRITTY_LOG",
  "ALACRITTY_WINDOW_ID",
  "KONSOLE_VERSION",
  "KONSOLE_DBUS_SERVICE",
  "KONSOLE_DBUS_SESSION",
  "KONSOLE_DBUS_WINDOW",
  "VTE_VERSION",
  "TERM_PROGRAM_VERSION",
  "TMUX",
  "TMUX_PANE",
]);

/** Options for materializing a sanitized embedded-PTY child environment. */
export interface TerminalChildEnvironmentOptions {
  /** Inherited host process environment. */
  readonly inherited: Readonly<Record<string, string>>;
  /** Per-session overrides from the spawn request; explicit caller keys always win. */
  readonly requested?: Readonly<Record<string, string>>;
  /** Advertised `TERM` value. Defaults to `"xterm-256color"`. */
  readonly term?: string;
  /** Advertised `TERM_PROGRAM` identity. Defaults to `"exotui"`. */
  readonly program?: string;
  /** Optional `TERM_PROGRAM_VERSION` value. */
  readonly version?: string;
}

/**
 * Builds a complete, sanitized environment map for an embedded PTY child:
 * strips outer-host terminal identity variables, sets truthful `TERM`,
 * `TERM_PROGRAM`, `COLORTERM=truecolor`, and `FORCE_HYPERLINK` defaults, and
 * layers explicit `requested` overrides on top.
 */
export function terminalChildEnvironment(options: TerminalChildEnvironmentOptions): Record<string, string> {
  const env: Record<string, string> = { ...options.inherited };
  for (const name of HOST_TERMINAL_IDENTITY_ENV_VARS) delete env[name];
  env.TERM = options.term ?? "xterm-256color";
  env.TERM_PROGRAM = options.program ?? "exotui";
  if (options.version) env.TERM_PROGRAM_VERSION = options.version;
  else delete env.TERM_PROGRAM_VERSION;
  env.COLORTERM = "truecolor";
  env.FORCE_HYPERLINK ??= "1";
  for (const [name, value] of Object.entries(options.requested ?? {})) env[name] = value;
  return env;
}
