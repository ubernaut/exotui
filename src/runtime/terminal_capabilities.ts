// Copyright 2023 Im-Beast. MIT license.
import { detectTerminalMultiplexer } from "./terminal_values.ts";

/** Color fidelity available for terminal output. */
export type TerminalColorDepth = "none" | "ansi16" | "ansi256" | "truecolor";

/** Mouse input protocol that should be enabled for the current terminal. */
export type TerminalMouseProtocol = "none" | "x10" | "vt200" | "sgr";

/** Text rendering strategy selected from terminal capabilities. */
export type TerminalTextMode = "ascii" | "unicode";

/** Terminal multiplexer detected from environment variables. */
export type TerminalMultiplexer = "none" | "tmux" | "screen" | "zellij";

/** Severity for terminal portability diagnostics. */
export type TerminalDiagnosticSeverity = "info" | "warning";

/** Stable identifier for one terminal capability flag. */
export type TerminalCapabilityId =
  | "interactive"
  | "unicode"
  | "widthMode2027"
  | "synchronizedUpdates"
  | "kittyGraphics"
  | "sixel"
  | "hyperlinks"
  | "mouse"
  | "sgrMouse"
  | "bracketedPaste"
  | "focusEvents"
  | "alternateScreen"
  | "cursorShape";

/** Optional terminal capabilities that affect input, output, and renderer setup. */
export interface TerminalCapabilities {
  interactive: boolean;
  colorDepth: TerminalColorDepth;
  unicode: boolean;
  /** Mode 2027 grapheme-cluster width negotiation is likely available. */
  widthMode2027: boolean;
  /** DEC 2026 synchronized updates are likely available. */
  synchronizedUpdates: boolean;
  /** DETECTION ONLY: no graphics renderer is implied or shipped. */
  kittyGraphics: boolean;
  /** DETECTION ONLY: no graphics renderer is implied or shipped. */
  sixel: boolean;
  hyperlinks: boolean;
  mouse: boolean;
  sgrMouse: boolean;
  bracketedPaste: boolean;
  focusEvents: boolean;
  alternateScreen: boolean;
  cursorShape: boolean;
}

/** Terminal environment metadata used for portability diagnostics. */
export interface TerminalEnvironment {
  term: string;
  termProgram: string;
  colorTerm: string;
  locale: string;
  isTty: boolean;
  interactive: boolean;
  multiplexer: TerminalMultiplexer;
  remote: boolean;
  colorDepth: TerminalColorDepth;
  truecolor: boolean;
  noColor: boolean;
  forceColor?: string;
  unicodeLocale: boolean;
}

/** Human-readable terminal diagnostic for setup panes, logs, and support reports. */
export interface TerminalDiagnostic {
  id: string;
  severity: TerminalDiagnosticSeverity;
  message: string;
  suggestion?: string;
}

/** Display metadata for one terminal capability. */
export interface TerminalCapabilityEntry {
  id: TerminalCapabilityId;
  label: string;
  available: boolean;
  description: string;
}

/** Aggregate terminal capability probe result for diagnostics and settings panes. */
export interface TerminalCapabilitySummary {
  total: number;
  available: number;
  missing: number;
  colorDepth: TerminalColorDepth;
  entries: TerminalCapabilityEntry[];
}

/** Options for terminal detection. Values are injectable for deterministic tests and non-Deno runtimes. */
export interface TerminalCapabilityDetectionOptions {
  env?: Record<string, string | undefined> | ((name: string) => string | undefined);
  isTty?: boolean;
  noColor?: boolean;
  forceColor?: boolean | string;
  platform?: string;
}

/** Preferences for deriving terminal behavior from detected capabilities. */
export interface TerminalPlanOptions {
  preferUnicode?: boolean;
  preferMouse?: boolean;
  preferAlternateScreen?: boolean;
  preferBracketedPaste?: boolean;
  preferFocusEvents?: boolean;
  preferHyperlinks?: boolean;
  minimumColorDepth?: TerminalColorDepth;
}

/** Deterministic terminal behavior plan for apps, demos, and input readers. */
export interface TerminalPlan {
  capabilities: TerminalCapabilities;
  colorDepth: TerminalColorDepth;
  textMode: TerminalTextMode;
  mouseProtocol: TerminalMouseProtocol;
  alternateScreen: boolean;
  bracketedPaste: boolean;
  focusEvents: boolean;
  hyperlinks: boolean;
  cursorShape: boolean;
  reasons: string[];
}

/** Options for building a complete terminal portability report. */
export interface TerminalPortabilityReportOptions {
  detection?: TerminalCapabilityDetectionOptions;
  plan?: TerminalPlanOptions;
}

/** Complete terminal capability, environment, plan, and diagnostic report. */
export interface TerminalPortabilityReport {
  environment: TerminalEnvironment;
  capabilities: TerminalCapabilities;
  plan: TerminalPlan;
  diagnostics: TerminalDiagnostic[];
}

const TERMINAL_CAPABILITY_METADATA: Record<
  TerminalCapabilityId,
  Omit<TerminalCapabilityEntry, "id" | "available">
> = {
  interactive: {
    label: "Interactive TTY",
    description: "Stdout is attached to an interactive terminal.",
  },
  unicode: {
    label: "Unicode",
    description: "Terminal environment is suitable for box drawing, glyphs, and wide text.",
  },
  hyperlinks: {
    label: "OSC 8 Hyperlinks",
    description: "Terminal is likely to support clickable OSC 8 hyperlinks.",
  },
  widthMode2027: {
    label: "Mode 2027 Width",
    description: "Terminal likely negotiates grapheme-cluster width handling (mode 2027).",
  },
  synchronizedUpdates: {
    label: "Synchronized Updates",
    description: "Terminal likely supports DEC 2026 begin/end synchronized update guards.",
  },
  kittyGraphics: {
    label: "Kitty Graphics (detected)",
    description: "Protocol detection only — no graphics renderer is implied or shipped for it.",
  },
  sixel: {
    label: "Sixel Graphics (detected)",
    description: "Protocol detection only — no graphics renderer is implied or shipped for it.",
  },
  mouse: {
    label: "Mouse Input",
    description: "Terminal can report mouse presses or scroll events.",
  },
  sgrMouse: {
    label: "SGR Mouse",
    description: "Terminal can report extended SGR mouse coordinates.",
  },
  bracketedPaste: {
    label: "Bracketed Paste",
    description: "Terminal can distinguish pasted text from typed keys.",
  },
  focusEvents: {
    label: "Focus Events",
    description: "Terminal can report focus-in and focus-out transitions.",
  },
  alternateScreen: {
    label: "Alternate Screen",
    description: "Terminal can enter a full-screen app buffer.",
  },
  cursorShape: {
    label: "Cursor Shape",
    description: "Terminal can change cursor style for modes such as insert or normal.",
  },
};

const TERMINAL_CAPABILITY_IDS = Object.keys(TERMINAL_CAPABILITY_METADATA) as TerminalCapabilityId[];

const COLOR_DEPTH_RANK: Record<TerminalColorDepth, number> = {
  none: 0,
  ansi16: 1,
  ansi256: 2,
  truecolor: 3,
};

/** Detects terminal capabilities from environment variables and TTY status. */
export function detectTerminalCapabilities(
  options: TerminalCapabilityDetectionOptions = {},
): TerminalCapabilities {
  const environment = detectTerminalEnvironment(options);
  const env = createEnvReader(options.env);
  const unicode = environment.interactive && environment.unicodeLocale;
  const modern = isModernTerminal(environment.term, environment.termProgram, env);

  return {
    interactive: environment.interactive,
    colorDepth: environment.colorDepth,
    unicode,
    widthMode2027: environment.interactive && supportsMode2027(environment.term, environment.termProgram),
    synchronizedUpdates: environment.interactive &&
      supportsSynchronizedUpdates(environment.term, environment.termProgram),
    kittyGraphics: environment.interactive && supportsKittyGraphics(environment.term, environment.termProgram),
    sixel: environment.interactive && supportsSixel(environment.term, environment.termProgram),
    hyperlinks: environment.interactive && supportsHyperlinks(environment.term, environment.termProgram, env),
    mouse: environment.interactive && !isLinuxConsole(environment.term),
    sgrMouse: environment.interactive && modern,
    bracketedPaste: environment.interactive && modern,
    focusEvents: environment.interactive && modern,
    alternateScreen: environment.interactive,
    cursorShape: environment.interactive && modern,
  };
}

/** Detects terminal environment metadata used to explain portability decisions. */
export function detectTerminalEnvironment(
  options: TerminalCapabilityDetectionOptions = {},
): TerminalEnvironment {
  const env = createEnvReader(options.env);
  const term = env("TERM") ?? "";
  const termProgram = env("TERM_PROGRAM") ?? "";
  const colorTerm = env("COLORTERM") ?? "";
  const locale = terminalLocale(env);
  const isTty = options.isTty ?? safeIsTerminal();
  const noColor = options.noColor ?? Boolean(env("NO_COLOR"));
  const forceColor = options.forceColor ?? env("FORCE_COLOR");
  const interactive = isTty && !isDumbTerminal(term);
  const colorDepth = detectColorDepth({ term, colorTerm, noColor, forceColor, interactive });

  return {
    term,
    termProgram,
    colorTerm,
    locale,
    isTty,
    interactive,
    multiplexer: detectTerminalMultiplexer(term, env),
    remote: isRemoteTerminal(env),
    colorDepth,
    truecolor: colorDepth === "truecolor",
    noColor,
    forceColor: forceColor === undefined ? undefined : String(forceColor),
    unicodeLocale: supportsUnicode(env, options.platform),
  };
}

/** Converts raw terminal capability booleans into labeled display entries. */
export function terminalCapabilityEntries(capabilities: TerminalCapabilities): TerminalCapabilityEntry[] {
  const entries = new Array<TerminalCapabilityEntry>(TERMINAL_CAPABILITY_IDS.length);
  for (let index = 0; index < TERMINAL_CAPABILITY_IDS.length; index += 1) {
    const id = TERMINAL_CAPABILITY_IDS[index]!;
    entries[index] = {
      id,
      ...TERMINAL_CAPABILITY_METADATA[id],
      available: capabilities[id],
    };
  }
  return entries;
}

/** Summarizes terminal capability availability counts and color depth. */
export function summarizeTerminalCapabilities(
  capabilities: TerminalCapabilities = detectTerminalCapabilities(),
): TerminalCapabilitySummary {
  const entries = terminalCapabilityEntries(capabilities);
  let available = 0;
  for (const entry of entries) {
    if (entry.available) available += 1;
  }
  return {
    total: entries.length,
    available,
    missing: entries.length - available,
    colorDepth: capabilities.colorDepth,
    entries,
  };
}

/** Formats terminal capabilities as concise CLI/status text. */
export function formatTerminalCapabilities(
  capabilities: TerminalCapabilities = detectTerminalCapabilities(),
): string {
  const summary = summarizeTerminalCapabilities(capabilities);
  const rows = new Array<string>(summary.entries.length + 1);
  rows[0] = `Terminal capabilities: ${summary.available}/${summary.total} available, ${summary.colorDepth} color`;
  for (let index = 0; index < summary.entries.length; index += 1) {
    const entry = summary.entries[index]!;
    rows[index + 1] = `${entry.available ? "ok" : "missing"} ${entry.label}`;
  }
  return rows.join("\n");
}

/** Returns setup diagnostics for terminal, SSH, tmux/screen, Unicode, and color behavior. */
export function terminalEnvironmentDiagnostics(
  environment: TerminalEnvironment = detectTerminalEnvironment(),
): TerminalDiagnostic[] {
  const diagnostics: TerminalDiagnostic[] = [];

  if (!environment.interactive) {
    diagnostics.push({
      id: "non-interactive",
      severity: "warning",
      message: "Stdout is not an interactive terminal, so full-screen TUI escape setup should be skipped.",
      suggestion: "Run from a TTY for interactive demos, or use report/web tasks for CI and noninteractive logs.",
    });
  }

  if (!environment.unicodeLocale) {
    diagnostics.push({
      id: "non-utf8-locale",
      severity: "warning",
      message: "The locale does not advertise UTF-8, so box drawing and wide glyph rendering may degrade.",
      suggestion: "Use a UTF-8 locale such as LANG=en_US.UTF-8 or set preferUnicode=false in the terminal plan.",
    });
  }

  if (environment.noColor) {
    diagnostics.push({
      id: "no-color",
      severity: "info",
      message: "NO_COLOR is set, so color output is intentionally disabled unless FORCE_COLOR overrides it.",
    });
  }

  if (environment.colorDepth === "none" && environment.interactive && !environment.noColor) {
    diagnostics.push({
      id: "color-depth-none",
      severity: "warning",
      message: "No terminal color depth was detected for an interactive session.",
      suggestion: "Use TERM=xterm-256color or FORCE_COLOR=2/3 when the terminal is known to support richer color.",
    });
  }

  if (environment.multiplexer === "tmux") {
    if (environment.truecolor) {
      diagnostics.push({
        id: "tmux-truecolor",
        severity: "info",
        message: "tmux is active and 24-bit color appears available.",
      });
    } else {
      diagnostics.push({
        id: "tmux-truecolor-missing",
        severity: "warning",
        message: "tmux is active but 24-bit color was not detected.",
        suggestion:
          'Use `set -g default-terminal "tmux-256color"` and `set -as terminal-overrides ",*:Tc"` in tmux.conf, then reload tmux.',
      });
    }
  } else if (environment.multiplexer === "screen" && environment.colorDepth !== "truecolor") {
    diagnostics.push({
      id: "screen-color-limited",
      severity: "info",
      message: "GNU screen is active and may limit color or mouse reporting depending on terminfo.",
    });
  }

  if (environment.remote) {
    diagnostics.push({
      id: "remote-session",
      severity: "info",
      message: "An SSH-style remote session was detected.",
      suggestion: "Forward TERM, COLORTERM, and locale values consistently when terminal color or Unicode degrades.",
    });
  }

  return diagnostics;
}

/** Formats terminal environment metadata and diagnostics as concise CLI/status text. */
export function formatTerminalEnvironment(
  environment: TerminalEnvironment = detectTerminalEnvironment(),
): string {
  const diagnostics = terminalEnvironmentDiagnostics(environment);
  const lines = [
    "Terminal environment:",
    `term     ${environment.term || "(unset)"}`,
    `program  ${environment.termProgram || "(unset)"}`,
    `color    ${environment.colorDepth}${environment.colorTerm ? ` (${environment.colorTerm})` : ""}`,
    `tty      ${environment.isTty ? "yes" : "no"}`,
    `mux      ${environment.multiplexer}`,
    `remote   ${environment.remote ? "yes" : "no"}`,
    `locale   ${environment.locale || "(unset)"}`,
    "Diagnostics:",
  ];
  if (diagnostics.length === 0) {
    lines.push("none");
  } else {
    for (const diagnostic of diagnostics) {
      lines.push(
        `${diagnostic.severity} ${diagnostic.id}: ${diagnostic.message}${
          diagnostic.suggestion ? ` ${diagnostic.suggestion}` : ""
        }`,
      );
    }
  }
  return lines.join("\n");
}

/** Builds a deterministic terminal behavior plan from capabilities and app preferences. */
export function createTerminalPlan(
  capabilities: TerminalCapabilities = detectTerminalCapabilities(),
  options: TerminalPlanOptions = {},
): TerminalPlan {
  const reasons: string[] = [];
  const minimumColorDepth = options.minimumColorDepth ?? "ansi16";
  const colorDepth = chooseColorDepth(capabilities.colorDepth, minimumColorDepth);
  if (colorDepth !== capabilities.colorDepth) {
    reasons.push(`Color output was reduced to ${colorDepth} to satisfy the configured minimum.`);
  } else {
    reasons.push(`Using ${colorDepth} color output from terminal detection.`);
  }

  const textMode = (options.preferUnicode ?? true) && capabilities.unicode ? "unicode" : "ascii";
  reasons.push(
    textMode === "unicode"
      ? "Unicode output is available and preferred."
      : "ASCII output selected because Unicode is unavailable or disabled.",
  );

  const mouseProtocol = selectMouseProtocol(capabilities, options.preferMouse ?? true);
  reasons.push(
    mouseProtocol === "none"
      ? "Mouse input disabled because it is unavailable or not preferred."
      : `Mouse input should use the ${mouseProtocol} protocol.`,
  );

  const alternateScreen = Boolean((options.preferAlternateScreen ?? true) && capabilities.alternateScreen);
  const bracketedPaste = Boolean((options.preferBracketedPaste ?? true) && capabilities.bracketedPaste);
  const focusEvents = Boolean((options.preferFocusEvents ?? true) && capabilities.focusEvents);
  const hyperlinks = Boolean((options.preferHyperlinks ?? true) && capabilities.hyperlinks);

  return {
    capabilities,
    colorDepth,
    textMode,
    mouseProtocol,
    alternateScreen,
    bracketedPaste,
    focusEvents,
    hyperlinks,
    cursorShape: capabilities.cursorShape,
    reasons,
  };
}

/** Formats a terminal behavior plan as concise CLI/status text. */
export function formatTerminalPlan(plan: TerminalPlan): string {
  return [
    "Terminal plan:",
    `color    ${plan.colorDepth}`,
    `text     ${plan.textMode}`,
    `mouse    ${plan.mouseProtocol}`,
    `screen   ${plan.alternateScreen ? "alternate" : "inline"}`,
    `paste    ${plan.bracketedPaste ? "bracketed" : "plain"}`,
    `focus    ${plan.focusEvents ? "events" : "plain"}`,
    `links    ${plan.hyperlinks ? "osc8" : "plain"}`,
  ].join("\n");
}

/** Builds a complete terminal portability report from one detection snapshot. */
export function createTerminalPortabilityReport(
  options: TerminalPortabilityReportOptions = {},
): TerminalPortabilityReport {
  const environment = detectTerminalEnvironment(options.detection);
  const capabilities = detectTerminalCapabilities(options.detection);
  const plan = createTerminalPlan(capabilities, options.plan);
  return {
    environment,
    capabilities,
    plan,
    diagnostics: terminalEnvironmentDiagnostics(environment),
  };
}

/** Formats a complete terminal portability report for support dumps and diagnostics panes. */
export function formatTerminalPortabilityReport(
  report: TerminalPortabilityReport = createTerminalPortabilityReport(),
): string {
  return [
    formatTerminalEnvironment(report.environment),
    "",
    formatTerminalCapabilities(report.capabilities),
    "",
    formatTerminalPlan(report.plan),
  ].join("\n");
}

function createEnvReader(
  env: TerminalCapabilityDetectionOptions["env"],
): (name: string) => string | undefined {
  if (typeof env === "function") return env;
  if (env) return (name) => env[name];
  return (name) => {
    try {
      return Deno.env.get(name);
    } catch {
      return undefined;
    }
  };
}

function safeIsTerminal(): boolean {
  try {
    return Deno.stdout.isTerminal();
  } catch {
    return false;
  }
}

function detectColorDepth(options: {
  term: string;
  colorTerm: string;
  noColor: boolean;
  forceColor: boolean | string | undefined;
  interactive: boolean;
}): TerminalColorDepth {
  if (!options.interactive && !options.forceColor) return "none";
  if (options.noColor && !options.forceColor) return "none";
  if (options.forceColor === "0" || options.forceColor === "false") return "none";
  if (options.forceColor === "3" || options.forceColor === "truecolor") return "truecolor";
  if (options.forceColor === "2" || options.forceColor === "256") return "ansi256";
  if (options.forceColor) return "ansi16";
  if (/truecolor|24bit/i.test(options.colorTerm)) return "truecolor";
  if (/-direct$/i.test(options.term) || /truecolor|24bit/i.test(options.term)) return "truecolor";
  if (/-256(color)?$/i.test(options.term) || /256color/i.test(options.term)) return "ansi256";
  return options.interactive ? "ansi16" : "none";
}

function supportsUnicode(env: (name: string) => string | undefined, platform: string = Deno.build.os): boolean {
  if (platform === "windows") {
    return Boolean(env("WT_SESSION") || env("TERMINAL_EMULATOR") || env("TERM_PROGRAM"));
  }
  return /utf-?8/i.test(terminalLocale(env));
}

function terminalLocale(env: (name: string) => string | undefined): string {
  let locale = "";
  const lcAll = env("LC_ALL");
  if (lcAll) locale = lcAll;
  const lcCtype = env("LC_CTYPE");
  if (lcCtype) locale = locale ? `${locale} ${lcCtype}` : lcCtype;
  const lang = env("LANG");
  if (lang) locale = locale ? `${locale} ${lang}` : lang;
  return locale;
}

function supportsHyperlinks(
  term: string,
  termProgram: string,
  env: (name: string) => string | undefined,
): boolean {
  if (env("DOMTERM")) return true;
  if (env("WT_SESSION")) return true;
  if (/iTerm\.app|WezTerm|vscode|Hyper/i.test(termProgram)) return true;
  return /xterm-kitty|wezterm|foot|alacritty/i.test(term);
}

function isModernTerminal(
  term: string,
  termProgram: string,
  env: (name: string) => string | undefined,
): boolean {
  if (env("WT_SESSION") || env("VTE_VERSION")) return true;
  if (/iTerm\.app|Apple_Terminal|WezTerm|vscode|Hyper/i.test(termProgram)) return true;
  return /xterm|screen|tmux|rxvt|kitty|wezterm|alacritty|foot/i.test(term);
}

// The four audited detections are conservative allow-lists: a terminal
// absent from the list reports false and the feature fails closed.
// Graphics entries are DETECTION ONLY — no renderer is implied.
function supportsMode2027(term: string, termProgram: string): boolean {
  if (/ghostty|WezTerm|contour/i.test(termProgram)) return true;
  return /xterm-kitty|contour|foot|ghostty/i.test(term);
}

function supportsSynchronizedUpdates(term: string, termProgram: string): boolean {
  if (/ghostty|WezTerm|iTerm\.app|contour/i.test(termProgram)) return true;
  return /xterm-kitty|wezterm|foot|contour|alacritty|ghostty/i.test(term);
}

function supportsKittyGraphics(term: string, termProgram: string): boolean {
  if (/ghostty|WezTerm/i.test(termProgram)) return true;
  return /xterm-kitty|ghostty|wezterm/i.test(term);
}

function supportsSixel(term: string, termProgram: string): boolean {
  if (/WezTerm|mlterm|contour/i.test(termProgram)) return true;
  return /wezterm|foot|mlterm|contour|xterm-sixel|yaft/i.test(term);
}

function isDumbTerminal(term: string): boolean {
  return term === "" || term === "dumb";
}

function isLinuxConsole(term: string): boolean {
  return /^linux$/i.test(term);
}

function isRemoteTerminal(env: (name: string) => string | undefined): boolean {
  return Boolean(env("SSH_TTY") || env("SSH_CONNECTION") || env("SSH_CLIENT"));
}

function chooseColorDepth(
  detected: TerminalColorDepth,
  minimum: TerminalColorDepth,
): TerminalColorDepth {
  return COLOR_DEPTH_RANK[detected] >= COLOR_DEPTH_RANK[minimum] ? detected : "none";
}

function selectMouseProtocol(
  capabilities: TerminalCapabilities,
  preferMouse: boolean,
): TerminalMouseProtocol {
  if (!preferMouse || !capabilities.mouse) return "none";
  if (capabilities.sgrMouse) return "sgr";
  return "vt200";
}
