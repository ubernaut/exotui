// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals } from "./deps.ts";
import {
  formatAnsiFlushTelemetry,
  HOST_TERMINAL_IDENTITY_ENV_VARS,
  HOST_TERMINAL_PROBE_IMAGE_ID,
  HOST_TERMINAL_PROBE_SEQUENCE,
  hostTerminalProbeComplete,
  parseHostTerminalProbeReplies,
  sanitizeTerminalClipboardPaste,
  terminalChildEnvironment,
  TerminalModeTracker,
  TerminalScreenController,
} from "../mod.ts";

Deno.test("TerminalModeTracker reconstructs sticky modes, keyboard flags, and cursor shape across chunks", () => {
  const tracker = new TerminalModeTracker();
  const stream = "\x1b[?1h\x1b[?1004h\x1b[?2004h\x1b[?2027h\x1b[>4;2m\x1b[>5u\x1b[6 q\x1b[?25l";
  for (let i = 0; i < stream.length; i += 4) tracker.write(stream.slice(i, i + 4));

  assertEquals(tracker.inspect(), {
    modes: [1, 1004, 2004, 2027],
    cursorVisible: false,
    cursorStyleCode: 6,
  });

  const screen = new TerminalScreenController({ columns: 40, rows: 10 });
  screen.write(tracker.preamble());
  assertEquals(screen.applicationCursorKeys, true);
  assertEquals(screen.focusReporting, true);
  assertEquals(screen.keyboardProtocol, { kittyFlags: 5, modifyOtherKeys: 2 });
  assertEquals(screen.inspect().cursorVisible, false);
  assertEquals(screen.inspect().cursorStyle, { shape: "bar", blinking: false });

  tracker.write("\x1bc");
  assertEquals(tracker.preamble(), "");
});

Deno.test("terminalChildEnvironment strips outer host identity and applies truthful defaults", () => {
  assert(HOST_TERMINAL_IDENTITY_ENV_VARS.includes("GHOSTTY_RESOURCES_DIR"));
  assert(HOST_TERMINAL_IDENTITY_ENV_VARS.includes("TMUX"));

  const env = terminalChildEnvironment({
    inherited: {
      HOME: "/home/demo",
      TERM: "xterm-ghostty",
      TERM_PROGRAM: "ghostty",
      GHOSTTY_RESOURCES_DIR: "/usr/share/ghostty",
      KITTY_WINDOW_ID: "42",
      TMUX: "/tmp/tmux-1000/default,1,0",
    },
    version: "1.2.3",
  });

  assertEquals(env.HOME, "/home/demo");
  assertEquals(env.TERM, "xterm-256color");
  assertEquals(env.TERM_PROGRAM, "exotui");
  assertEquals(env.TERM_PROGRAM_VERSION, "1.2.3");
  assertEquals(env.COLORTERM, "truecolor");
  assertEquals(env.FORCE_HYPERLINK, "1");
  assertEquals(env.GHOSTTY_RESOURCES_DIR, undefined);
  assertEquals(env.KITTY_WINDOW_ID, undefined);
  assertEquals(env.TMUX, undefined);

  const overridden = terminalChildEnvironment({
    inherited: { FORCE_HYPERLINK: "0" },
    program: "custom-mux",
    term: "xterm-direct",
    requested: { CUSTOM_FLAG: "yes" },
  });
  assertEquals(overridden.TERM, "xterm-direct");
  assertEquals(overridden.TERM_PROGRAM, "custom-mux");
  assertEquals(overridden.FORCE_HYPERLINK, "0");
  assertEquals(overridden.CUSTOM_FLAG, "yes");
});

Deno.test("host terminal probe parses DECRQM, kitty graphics, cell geometry, and DA1 completion", () => {
  assert(HOST_TERMINAL_PROBE_SEQUENCE.includes(`i=${HOST_TERMINAL_PROBE_IMAGE_ID}`));
  assert(HOST_TERMINAL_PROBE_SEQUENCE.endsWith("\x1b[c"));

  const reply = `\x1b[?2026;2$y\x1b[?2027;1$y\x1b_Gi=${HOST_TERMINAL_PROBE_IMAGE_ID};OK\x1b\\\x1b[6;18;9t\x1b[?62;22c`;
  assertEquals(parseHostTerminalProbeReplies(reply), {
    synchronizedOutput: true,
    graphemeClustering: "set",
    graphics: true,
    cellPixels: { width: 9, height: 18 },
  });
  assertEquals(hostTerminalProbeComplete(reply), true);
  assertEquals(hostTerminalProbeComplete("\x1b[?1;2c"), true);
  assertEquals(hostTerminalProbeComplete("\x1b[6;18;9t"), false);
});

Deno.test("sanitizeTerminalClipboardPaste strips control bytes, normalizes CRLF, and enforces byte budgets", () => {
  assertEquals(sanitizeTerminalClipboardPaste("hello\r\nworld\x1b[201~!\x07\t\x7f"), "hello\nworld[201~!\t");
  assertEquals(sanitizeTerminalClipboardPaste("abcdef", 5), undefined);
  assertEquals(sanitizeTerminalClipboardPaste("abcde", 5), "abcde");
});

Deno.test("formatAnsiFlushTelemetry emits fixed greppable key=value diagnostics", () => {
  assertEquals(
    formatAnsiFlushTelemetry({
      frames: 4,
      bytes: 8192,
      writes: 6,
      wouldBlocks: 1,
      shortWrites: 2,
      stallMs: 12.34,
      maxStallMs: 9.86,
      degradedFlushes: 1,
      droppedBytes: 128,
    }),
    "frames=4 bytes=8192 writes=6 wouldblock=1 short=2 stall_ms=12.3 max_stall_ms=9.9 degraded=1 dropped_bytes=128",
  );
});

Deno.test("mod.web re-exports browser-safe terminal mode tracking, palette resolution, and flush formatting", async () => {
  const web = await import("../mod.web.ts");
  assertEquals(typeof web.TerminalModeTracker, "function");
  assertEquals(typeof web.resolveTerminalCellStyle, "function");
  assertEquals(typeof web.terminalPaletteRgb, "function");
  assertEquals(typeof web.formatAnsiFlushTelemetry, "function");
});
