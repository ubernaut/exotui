// The environment a child of an exomux terminal should see.
//
// The daemon inherits its environment from whatever launched it — a Ghostty
// window, usually — and PTY children inherit the daemon's. So a program inside
// an exomux terminal saw GHOSTTY_RESOURCES_DIR and TERM=xterm-ghostty and
// reasonably concluded it could use everything Ghostty speaks. tode did
// exactly that and sent kitty graphics; exomux's emulator does not draw
// images, and before it learned to consume APC strings it printed the
// transmission as a wall of base64.
//
// The identity a child should see is exomux's own. Capability-by-environment
// is a hint system, and the only honest hint is the terminal the child is
// actually talking to.

/**
 * Environment variables that name a specific terminal emulator.
 *
 * Removed rather than blanked where possible; the spawn path materialises the
 * full environment, so removal genuinely removes. TERM and TERM_PROGRAM are
 * replaced instead, because a child with no TERM at all is worse off than one
 * with the right one.
 */
const HOST_TERMINAL_IDENTITY = [
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
  // A terminal identity of its own kind: children of an exomux terminal are
  // not in the tmux the daemon may have been started under.
  "TMUX",
  "TMUX_PANE",
] as const;

export interface ExomuxChildEnvironmentOptions {
  /** The environment the daemon itself runs in. */
  readonly inherited: Readonly<Record<string, string>>;
  /** Per-session overrides from the spawn request. The caller always wins. */
  readonly requested?: Readonly<Record<string, string>>;
  /** exomux's version, for TERM_PROGRAM_VERSION. */
  readonly version?: string;
}

/**
 * Builds the full environment for a PTY child.
 *
 * Full rather than a patch: the PTY backend passes an env object through to
 * the child as its entire environment only when one is provided, so removal
 * has to happen by materialising everything and leaving the offenders out.
 */
export function exomuxChildEnvironment(options: ExomuxChildEnvironmentOptions): Record<string, string> {
  const env: Record<string, string> = { ...options.inherited };
  for (const name of HOST_TERMINAL_IDENTITY) delete env[name];
  // What exomux's emulator honestly is: an xterm-family screen with 256-colour
  // and truecolor SGR, no images. `xterm-ghostty` inherited from the host
  // terminal points ncurses at terminfo for a terminal this is not.
  env.TERM = "xterm-256color";
  env.TERM_PROGRAM = "exomux";
  if (options.version) env.TERM_PROGRAM_VERSION = options.version;
  else delete env.TERM_PROGRAM_VERSION;
  env.COLORTERM = "truecolor";
  for (const [name, value] of Object.entries(options.requested ?? {})) env[name] = value;
  return env;
}
