// The environment a child of an exomux terminal sees.
//
// The reproduction: the daemon ran under Ghostty, its PTY children inherited
// GHOSTTY_RESOURCES_DIR and TERM=xterm-ghostty, and tode — which decides
// whether a terminal draws kitty graphics from exactly those variables —
// painted images into an emulator that does not draw them.

import { assert, assertEquals } from "./deps.ts";
import { exomuxChildEnvironment } from "../terminal_env.ts";

const GHOSTTY_HOST = {
  HOME: "/home/cos",
  PATH: "/usr/bin",
  TERM: "xterm-ghostty",
  TERM_PROGRAM: "ghostty",
  TERM_PROGRAM_VERSION: "1.2.0",
  GHOSTTY_RESOURCES_DIR: "/usr/share/ghostty",
  GHOSTTY_SHELL_FEATURES: "cursor,title",
  COLORTERM: "truecolor",
};

Deno.test("a child sees exomux's identity, not the daemon's host terminal", () => {
  const env = exomuxChildEnvironment({ inherited: GHOSTTY_HOST });
  assertEquals(env.TERM, "xterm-256color");
  assertEquals(env.TERM_PROGRAM, "exomux");
  assertEquals(env.GHOSTTY_RESOURCES_DIR, undefined);
  assertEquals(env.GHOSTTY_SHELL_FEATURES, undefined);
  assertEquals(env.TERM_PROGRAM_VERSION, undefined);
  // The rest of the environment is untouched.
  assertEquals(env.HOME, "/home/cos");
  assertEquals(env.PATH, "/usr/bin");
});

Deno.test("tode's own detection reads the sanitised environment as text-only", () => {
  // tode: TERM_PROGRAM === "ghostty" || GHOSTTY_RESOURCES_DIR || KITTY_WINDOW_ID
  //       || TERM.includes("kitty")
  const env = exomuxChildEnvironment({
    inherited: { ...GHOSTTY_HOST, KITTY_WINDOW_ID: "3", TERM: "xterm-kitty" },
  });
  const detectsGraphics = env.TERM_PROGRAM === "ghostty" || Boolean(env.GHOSTTY_RESOURCES_DIR) ||
    Boolean(env.KITTY_WINDOW_ID) || (env.TERM ?? "").includes("kitty");
  assertEquals(detectsGraphics, false);
});

Deno.test("a nested exomux is not inside the outer daemon's tmux", () => {
  const env = exomuxChildEnvironment({
    inherited: { ...GHOSTTY_HOST, TMUX: "/tmp/tmux-1000/default,42,0", TMUX_PANE: "%0" },
  });
  assertEquals(env.TMUX, undefined);
  assertEquals(env.TMUX_PANE, undefined);
});

Deno.test("the spawn request's own env wins over the sanitiser", () => {
  // A caller that explicitly asks for a variable — even one the sanitiser
  // strips — is stating intent, and silently overriding a stated request is
  // worse than honouring an odd one.
  const env = exomuxChildEnvironment({
    inherited: GHOSTTY_HOST,
    requested: { TERM: "dumb", GHOSTTY_RESOURCES_DIR: "/custom" },
  });
  assertEquals(env.TERM, "dumb");
  assertEquals(env.GHOSTTY_RESOURCES_DIR, "/custom");
});

Deno.test("colour capability is stated, since the emulator really has it", () => {
  const env = exomuxChildEnvironment({ inherited: { HOME: "/home/cos" } });
  assertEquals(env.COLORTERM, "truecolor");
  assert(env.TERM!.startsWith("xterm"), "an xterm-family TERM keeps ncurses on known terminfo");
});
