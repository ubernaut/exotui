// The launch probe's reply parsing: asking the host what it can do beats
// recognising its name, and this is the part of the asking worth pinning.

import { assertEquals } from "./deps.ts";
import { hostProbeComplete, parseHostProbeReplies } from "../main.ts";

Deno.test("a host that answers OK supports the protocol, whatever it is called", () => {
  const probe = parseHostProbeReplies("\x1b_Gi=4242424;OK\x1b\\\x1b[6;20;10t");
  assertEquals(probe.graphics, true);
  assertEquals(probe.cellPixels, { width: 10, height: 20 });
});

Deno.test("a host that parses the protocol without honouring it answers no", () => {
  // Some terminals reply with an error status instead of staying silent —
  // that is an answer, and the answer is no.
  const probe = parseHostProbeReplies("\x1b_Gi=4242424;ENOTSUPPORTED\x1b\\");
  assertEquals(probe.graphics, false);
});

Deno.test("silence decides nothing; the environment fallback decides instead", () => {
  assertEquals(parseHostProbeReplies("").graphics, undefined);
  assertEquals(parseHostProbeReplies("\x1b[6;20;10t").graphics, undefined, "a cell answer is not a graphics answer");
});

Deno.test("another image's reply is not mistaken for the probe's", () => {
  assertEquals(parseHostProbeReplies("\x1b_Gi=31;OK\x1b\\").graphics, undefined);
});

Deno.test("a zero cell size is silence, not a geometry", () => {
  assertEquals(parseHostProbeReplies("\x1b[6;0;0t").cellPixels, undefined);
});

Deno.test("the device attributes reply closes the probe on a host that answers nothing else", () => {
  assertEquals(hostProbeComplete(""), false);
  assertEquals(hostProbeComplete("\x1b[6;20;10t"), false, "one answer of two is not the end");
  assertEquals(hostProbeComplete("\x1b_Gi=4242424;OK\x1b\\\x1b[6;20;10t"), true);
  // tmux answers neither optional query; its DA1 reply is what ends the wait.
  assertEquals(hostProbeComplete("\x1b[?1;2;4c"), true);
  assertEquals(hostProbeComplete("\x1b[6;20;10t\x1b[?62;22c"), true);
});

Deno.test("the launch probe parses DECRQM replies for synchronized output and grapheme clustering", () => {
  // Ghostty: mode 2026 reset (2), mode 2027 already set (1) or permanently set (3).
  const ghostty = parseHostProbeReplies(
    "\x1b[?2026;2$y\x1b[?2027;1$y\x1b_Gi=4242424;OK\x1b\\\x1b[6;20;10t\x1b[?62;22c",
  );
  assertEquals(ghostty.synchronizedOutput, true);
  assertEquals(ghostty.graphemeClustering, "set");
  assertEquals(ghostty.graphics, true);
  assertEquals(ghostty.cellPixels, { width: 10, height: 20 });

  // A terminal that supports mode 2027 but defaults it off (2) asks exomux to enable it.
  const optIn = parseHostProbeReplies("\x1b[?2026;1$y\x1b[?2027;2$y\x1b[?62;22c");
  assertEquals(optIn.synchronizedOutput, true);
  assertEquals(optIn.graphemeClustering, "reset");

  // Unrecognized (0) or permanently reset (4) modes stay off.
  const legacy = parseHostProbeReplies("\x1b[?2026;0$y\x1b[?2027;4$y\x1b[?1;2c");
  assertEquals(legacy.synchronizedOutput, false);
  assertEquals(legacy.graphemeClustering, "unsupported");
});
