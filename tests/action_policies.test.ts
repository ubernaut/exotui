// Copyright 2023 Im-Beast. MIT license.

// SEC-006: URL/path/command policies with normalized-target confirmation —
// confusable or control-bearing targets never reach a host API.

import { assert, assertEquals } from "./deps.ts";
import { createActionPolicyGate } from "../mod.ts";

function gate() {
  return createActionPolicyGate({
    schemes: ["https"],
    hosts: ["example.com", "deno.land"],
    pathPrefixes: ["/home/cos/projects"],
    commands: ["gh", "deno"],
  });
}

Deno.test("URLs check scheme and host and return the normalized target", () => {
  const policy = gate();
  const allowed = policy.url("https://docs.example.com/page?q=1");
  assertEquals(allowed, { kind: "allowed", normalized: "https://docs.example.com/page?q=1" });

  assertEquals(policy.url("http://example.com/").kind, "rejected"); // scheme
  assertEquals(policy.url("https://evil.net/").kind, "rejected"); // host
  assertEquals(policy.url("not a url").kind, "rejected");
  // A confusable host (Cyrillic е) rejects BEFORE any API could open it.
  const spoofed = policy.url("https://еxample.com/"); // Cyrillic е → punycode
  assert(spoofed.kind === "rejected" && spoofed.reason.includes("confusable-capable"));
});

Deno.test("paths normalize dot segments so ../ cannot escape a prefix", () => {
  const policy = gate();
  const inside = policy.path("/home/cos/projects/exotui/mod.ts");
  assertEquals(inside.kind, "allowed");
  const escape = policy.path("/home/cos/projects/../../../etc/passwd");
  assert(escape.kind === "rejected");
  assertEquals(escape.kind === "rejected" ? escape.normalized : "", "/etc/passwd"); // visible truth
  // Control characters reject outright.
  assertEquals(policy.path("/home/cos/projects/x\ty").kind, "rejected");
});

Deno.test("commands require the allowlist and clean names", () => {
  const policy = gate();
  assertEquals(policy.command("gh"), { kind: "allowed", normalized: "gh" });
  assertEquals(policy.command("rm").kind, "rejected");
  const spoofed = policy.command("ɡh"); // Latin small script g lookalike
  assert(spoofed.kind === "rejected" && spoofed.reason.includes("confusable"));
  // A bidi-control-bearing name (RLO) rejects with the hazard named.
  const bidi = policy.command("gh‮");
  assert(bidi.kind === "rejected" && bidi.reason.toLowerCase().includes("bidi"));
});
