import { assert, assertEquals } from "./deps.ts";
import { ExomuxTerminalModeTracker } from "../terminal_modes.ts";
import { TerminalScreenController } from "@ubernaut/exotui/terminal";
import { terminalMouseRoutingFromPrivateModes } from "@ubernaut/exotui";

Deno.test("mode tracker records sticky private modes and drops the ones turned off", () => {
  const tracker = new ExomuxTerminalModeTracker();
  tracker.write("\x1b[?1049h\x1b[?1h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?2004h");
  assertEquals(tracker.inspect().modes, [1, 1000, 1002, 1006, 1049, 2004]);

  tracker.write("\x1b[?1002l\x1b[?2004l");
  assertEquals(tracker.inspect().modes, [1, 1000, 1006, 1049]);

  // Modes with no lasting effect on a fresh view are not carried.
  tracker.write("\x1b[?2031h\x1b[?12h");
  assertEquals(tracker.inspect().modes.includes(2031), false);
  assertEquals(tracker.inspect().modes.includes(12), false);

  // Cursor visibility is tracked separately from the mode set.
  assertEquals(tracker.inspect().cursorVisible, true);
  tracker.write("\x1b[?25l");
  assertEquals(tracker.inspect().cursorVisible, false);
  assertEquals(tracker.inspect().modes.includes(25), false);
});

Deno.test("mode tracker handles multi-parameter sets, chunk splits, and full resets", () => {
  const tracker = new ExomuxTerminalModeTracker();
  tracker.write("\x1b[?1000;1002;1006h");
  assertEquals(tracker.inspect().modes, [1000, 1002, 1006]);

  // A sequence split across chunks must not be lost.
  const split = new ExomuxTerminalModeTracker();
  const stream = "\x1b[?1049h\x1b[?1006h\x1b[?2004h";
  for (let index = 0; index < stream.length; index += 3) {
    split.write(stream.slice(index, index + 3));
  }
  assertEquals(split.inspect().modes, [1006, 1049, 2004]);

  // Byte-at-a-time is the worst case and must still work.
  const bytewise = new ExomuxTerminalModeTracker();
  for (const char of stream) bytewise.write(char);
  assertEquals(bytewise.inspect().modes, [1006, 1049, 2004]);

  // RIS clears everything the program had established.
  split.write("\x1bc");
  assertEquals(split.inspect().modes, []);
  assertEquals(split.inspect().cursorVisible, true);
});

Deno.test("mode tracker preamble restores mouse routing a rotated replay would lose", () => {
  const tracker = new ExomuxTerminalModeTracker();
  // What tmux emits once at startup, followed by the churn that evicts it.
  tracker.write("\x1b[?1049h\x1b[?1h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?2004h");
  tracker.write("busy output ".repeat(5_000));

  const tail = "only the tail survived\r\n";
  const without = new TerminalScreenController({ columns: 80, rows: 24 });
  without.write(tail);
  assertEquals(
    terminalMouseRoutingFromPrivateModes(without.inspect().privateModes),
    { mouseTracking: "none", sgrMouse: false },
  );
  assertEquals(without.inspect().alternate, false);

  const withPreamble = new TerminalScreenController({ columns: 80, rows: 24 });
  withPreamble.write(tracker.preamble() + tail);
  assertEquals(
    terminalMouseRoutingFromPrivateModes(withPreamble.inspect().privateModes),
    { mouseTracking: "button", sgrMouse: true },
  );
  assertEquals(withPreamble.inspect().alternate, true);

  // Alternate screen is asserted last so entering it cannot clobber the rest.
  const preamble = tracker.preamble();
  assert(preamble.indexOf("\x1b[?1049h") > preamble.indexOf("\x1b[?1006h"));

  // Replaying the preamble twice is idempotent.
  withPreamble.write(tracker.preamble());
  assertEquals(
    terminalMouseRoutingFromPrivateModes(withPreamble.inspect().privateModes),
    { mouseTracking: "button", sgrMouse: true },
  );
});

Deno.test("mode tracker emits nothing for a plain shell session", () => {
  const tracker = new ExomuxTerminalModeTracker();
  tracker.write("$ ls\r\nfile-a  file-b\r\n$ ");
  assertEquals(tracker.inspect().modes, []);
  assertEquals(tracker.preamble(), "");
});

Deno.test("mode tracker preserves kitty keyboard protocol, modifyOtherKeys, and mode 2027 across rotated replays", () => {
  const tracker = new ExomuxTerminalModeTracker();
  // Matches the startup sequence emitted by Charmbracelet/Ultraviolet CLIs (e.g. agy).
  tracker.write("\x1b[?2004h\x1b[?2027h\x1b[>4;2m\x1b[>5u");
  assertEquals(tracker.inspect().modes, [2004, 2027]);

  const screen = new TerminalScreenController({ columns: 80, rows: 24 });
  screen.write(tracker.preamble());
  assertEquals(screen.keyboardProtocol, { kittyFlags: 5, modifyOtherKeys: 2 });
  assertEquals(screen.inspect().privateModes.includes(2004), true);
  assertEquals(screen.inspect().privateModes.includes(2027), true);

  // Replaying the preamble twice stays idempotent (uses `CSI = flags;1 u`, not push).
  screen.write(tracker.preamble());
  assertEquals(screen.keyboardProtocol, { kittyFlags: 5, modifyOtherKeys: 2 });

  // Alternate screen tracks its own kitty keyboard stack separately from main.
  tracker.write("\x1b[?1049h\x1b[>1u");
  const altScreen = new TerminalScreenController({ columns: 80, rows: 24 });
  altScreen.write(tracker.preamble());
  assertEquals(altScreen.inspect().alternate, true);
  assertEquals(altScreen.keyboardProtocol, { kittyFlags: 1, modifyOtherKeys: 2 });

  // Exiting alternate restores main's kitty keyboard flags.
  tracker.write("\x1b[?1049l");
  const mainScreen = new TerminalScreenController({ columns: 80, rows: 24 });
  mainScreen.write(tracker.preamble());
  assertEquals(mainScreen.inspect().alternate, false);
  assertEquals(mainScreen.keyboardProtocol, { kittyFlags: 5, modifyOtherKeys: 2 });
});

Deno.test("mode tracker preserves DECSCUSR cursor shape across rotated replays and resets on RIS", () => {
  const tracker = new ExomuxTerminalModeTracker();
  tracker.write("\x1b[6 q");
  assertEquals(tracker.inspect().cursorStyleCode, 6);
  const screen = new TerminalScreenController({ columns: 80, rows: 24 });
  screen.write(tracker.preamble());
  assertEquals(screen.inspect().cursorStyle, { shape: "bar", blinking: false });

  tracker.write("\x1b[4 q");
  const underlineScreen = new TerminalScreenController({ columns: 80, rows: 24 });
  underlineScreen.write(tracker.preamble());
  assertEquals(underlineScreen.inspect().cursorStyle, { shape: "underline", blinking: false });

  tracker.write("\x1bc");
  assertEquals(tracker.inspect().cursorStyleCode, 0);
  assertEquals(tracker.preamble(), "");
});
