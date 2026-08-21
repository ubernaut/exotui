// The launch probe's reply parsing: asking the host what it can do beats
// recognising its name, and this is the part of the asking worth pinning.

import { assertEquals } from "./deps.ts";
import { parseHostProbeReplies } from "../main.ts";

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
