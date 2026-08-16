// Copyright 2023 Im-Beast. MIT license.

// SEC-005: injection fixtures cannot change title, clipboard, input modes,
// or graphics under the default profile — and split chunks change nothing.

import { assert, assertEquals } from "./deps.ts";
import { createStreamingTerminalSanitizer } from "../mod.ts";

const INJECTIONS = [
  "\x1b]0;pwned title\x07", // window title
  "\x1b]2;pwned title\x1b\\", // window title (ST)
  "\x1b]52;c;cHduZWQ=\x07", // clipboard write
  "\x1b[?1049h", // alternate screen
  "\x1b[?2004h", // bracketed paste
  "\x1b[?1000h\x1b[?1006h", // mouse reporting
  "\x1bPq#0;2;0;0;0#0~~\x1b\\", // sixel graphics
  "\x1b_Ga=T\x1b\\", // kitty graphics APC
  "\x1bc", // full reset
  "\x1b(0", // charset switch
];

Deno.test("default profile passes SGR text and drops every injection whole", () => {
  const sanitizer = createStreamingTerminalSanitizer();
  const payload = `safe \x1b[1;32mgreen\x1b[0m${INJECTIONS.join("ok")} end`;
  const output = sanitizer.write(payload) + sanitizer.flush();
  assertEquals(output, `safe \x1b[1;32mgreen\x1b[0m${"ok".repeat(INJECTIONS.length - 1)} end`);
  // No injection survives in any form.
  assert(!output.includes("]0;") && !output.includes("52;c") && !output.includes("?10"));
  assert(!output.includes("\x1bP") && !output.includes("\x1b_") && !output.includes("\x1bc"));
  const dropped = sanitizer.dropped();
  assertEquals(dropped.osc, 3);
  assertEquals(dropped.csi, 4);
  assertEquals(dropped.dcs, 1);
  assertEquals(dropped.apc, 1);
  assertEquals(dropped.esc, 2);
});

Deno.test("split chunk boundaries cannot smuggle a sequence through", () => {
  const bytes = new TextEncoder().encode("a\x1b]52;c;cHduZWQ=\x07b\x1b[31mc");
  const whole = (() => {
    const sanitizer = createStreamingTerminalSanitizer();
    return sanitizer.write(bytes) + sanitizer.flush();
  })();
  assertEquals(whole, "ab\x1b[31mc");
  for (let split = 1; split < bytes.length; split += 1) {
    const sanitizer = createStreamingTerminalSanitizer();
    const output = sanitizer.write(bytes.slice(0, split)) + sanitizer.write(bytes.slice(split)) +
      sanitizer.flush();
    assertEquals(output, whole, `split at ${split} diverged`);
  }
});

Deno.test("profiles are cumulative allowlists", () => {
  const fixture = "x\x1b[3my\x1b[2Az\x1b]8;;https://a\x1b\\link\x1b]8;;\x1b\\\x1b]0;t\x07\tend";

  const plain = createStreamingTerminalSanitizer({ profile: "plain-text" });
  assertEquals(plain.write(fixture) + plain.flush(), "xyzlink\tend");

  const sgr = createStreamingTerminalSanitizer({ profile: "sgr" });
  assertEquals(sgr.write(fixture) + sgr.flush(), "x\x1b[3myzlink\tend");

  const links = createStreamingTerminalSanitizer({ profile: "links" });
  assertEquals(
    links.write(fixture) + links.flush(),
    "x\x1b[3myz\x1b]8;;https://a\x1b\\link\x1b]8;;\x1b\\\tend",
  );

  const cursor = createStreamingTerminalSanitizer({ profile: "cursor" });
  assertEquals(
    cursor.write(fixture) + cursor.flush(),
    "x\x1b[3my\x1b[2Az\x1b]8;;https://a\x1b\\link\x1b]8;;\x1b\\\tend",
  );
  // The title OSC died under every profile.
});

Deno.test("unterminated sequences and raw controls never leak on flush", () => {
  const sanitizer = createStreamingTerminalSanitizer();
  assertEquals(sanitizer.write("ok\x00\x08\x1b]0;half"), "ok");
  assertEquals(sanitizer.flush(), ""); // the dangling OSC is dropped, not surfaced
  assert(sanitizer.dropped().control >= 2);
});
