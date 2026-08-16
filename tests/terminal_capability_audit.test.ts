// Copyright 2023 Im-Beast. MIT license.

// 036 R1 audit: width mode, color depth, synchronized updates,
// hyperlinks, focus/bracketed-paste, Kitty/Sixel detection, and
// terminal/multiplexer identity — detection stays distinct from
// shipping a renderer.

import { assert, assertEquals } from "./deps.ts";
import { detectTerminalCapabilities, detectTerminalEnvironment, terminalCapabilityEntries } from "../mod.ts";

function detect(vars: Record<string, string>) {
  return detectTerminalCapabilities({ env: vars, isTty: true });
}

Deno.test("every audited capability is a named field with a labeled entry", () => {
  const capabilities = detect({ TERM: "xterm-kitty", LANG: "en_US.UTF-8" });
  const entries = terminalCapabilityEntries(capabilities);
  for (
    const id of [
      "unicode",
      "widthMode2027",
      "synchronizedUpdates",
      "kittyGraphics",
      "sixel",
      "hyperlinks",
      "bracketedPaste",
      "focusEvents",
    ]
  ) {
    assert(entries.some((entry) => entry.id === id), `missing audited entry: ${id}`);
  }
});

Deno.test("detections are conservative allow-lists that fail closed", () => {
  const kitty = detect({ TERM: "xterm-kitty", LANG: "en_US.UTF-8" });
  assert(kitty.widthMode2027 && kitty.synchronizedUpdates && kitty.kittyGraphics);
  assert(!kitty.sixel, "kitty does not do sixel");

  const foot = detect({ TERM: "foot", LANG: "en_US.UTF-8" });
  assert(foot.sixel && foot.synchronizedUpdates && !foot.kittyGraphics);

  const plain = detect({ TERM: "xterm-256color", LANG: "en_US.UTF-8" });
  assert(!plain.widthMode2027 && !plain.synchronizedUpdates && !plain.kittyGraphics && !plain.sixel);

  const dumb = detectTerminalCapabilities({ env: { TERM: "dumb" }, isTty: false });
  assert(!dumb.synchronizedUpdates && !dumb.kittyGraphics && !dumb.sixel && !dumb.widthMode2027);
});

Deno.test("color depth still ranks none through truecolor", () => {
  assertEquals(detect({ TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_US.UTF-8" }).colorDepth, "truecolor");
  assertEquals(detect({ TERM: "xterm-256color", LANG: "en_US.UTF-8" }).colorDepth, "ansi256");
});

Deno.test("multiplexer identity includes zellij alongside tmux and screen", () => {
  assertEquals(
    detectTerminalEnvironment({ env: { TERM: "xterm-256color", ZELLIJ: "0" }, isTty: true }).multiplexer,
    "zellij",
  );
  assertEquals(
    detectTerminalEnvironment({ env: { TERM: "tmux-256color", TMUX: "/tmp/x" }, isTty: true }).multiplexer,
    "tmux",
  );
  assertEquals(detectTerminalEnvironment({ env: { TERM: "xterm" }, isTty: true }).multiplexer, "none");
});

Deno.test("graphics detection explicitly disclaims a shipped renderer", () => {
  const entries = terminalCapabilityEntries(detect({ TERM: "xterm-kitty", LANG: "en_US.UTF-8" }));
  for (const id of ["kittyGraphics", "sixel"]) {
    const entry = entries.find((candidate) => candidate.id === id)!;
    assert(entry.description.includes("no graphics renderer is implied"), `${id} must disclaim shipping`);
    assert(entry.label.includes("detected"));
  }
});
