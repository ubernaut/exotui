// Copyright 2023 Im-Beast. MIT license.

// SEC-010: verification happens before parsing and mismatch NEVER falls
// back to unsigned content silently.

import { assert, assertEquals } from "./deps.ts";
import { createContentIntegrityGate } from "../mod.ts";

const BYTES = new TextEncoder().encode('{"theme":"night"}');
// deno-fmt-ignore
const BYTES_SHA = "8e7cf1c9d983dbecd6bceabbba24d95bfaadbcbafcaf25691f6ca0a552b13b32";

async function realSha(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("matching digest hands back the bytes as verified", async () => {
  const gate = createContentIntegrityGate();
  const sha = await realSha(BYTES);
  const result = await gate.verify(BYTES, { sha256: sha });
  assert(result.kind === "verified");
  assertEquals(result.sha256, sha);
  assertEquals(new TextDecoder().decode(result.bytes), '{"theme":"night"}');
});

Deno.test("mismatch is typed and carries the divergence — no bytes escape", async () => {
  const gate = createContentIntegrityGate();
  const result = await gate.verify(BYTES, { sha256: "ab".repeat(32) });
  assert(result.kind === "mismatch");
  assertEquals(result.field, "sha256");
  assertEquals(result.expected, "ab".repeat(32));
  assert(!("bytes" in result)); // structurally absent, not just empty
});

Deno.test("signatures use the host verifier; missing verifier fails closed", async () => {
  const seen: string[] = [];
  const gate = createContentIntegrityGate({
    verifier: (_bytes, signature) => {
      seen.push(signature);
      return signature === "good-sig";
    },
  });
  const sha = await realSha(BYTES);
  assertEquals((await gate.verify(BYTES, { sha256: sha, signature: "good-sig" })).kind, "verified");
  const bad = await gate.verify(BYTES, { signature: "forged" });
  assert(bad.kind === "mismatch" && bad.field === "signature");
  assertEquals(seen, ["good-sig", "forged"]);

  const unarmed = createContentIntegrityGate();
  const noVerifier = await unarmed.verify(BYTES, { signature: "good-sig" });
  assert(noVerifier.kind === "mismatch" && noVerifier.actual === "no verifier installed");
});

Deno.test("no expectation is a failure, and unsigned acceptance is explicit and branded", async () => {
  const gate = createContentIntegrityGate();
  assertEquals((await gate.verify(BYTES, {})).kind, "no-expectation");
  const accepted = gate.acceptUnverified(BYTES, "local dev theme, user opted out");
  assertEquals(accepted.kind, "unverified"); // downstream loaders can refuse the brand
  let threw = false;
  try {
    gate.acceptUnverified(BYTES, "  ");
  } catch {
    threw = true;
  }
  assert(threw);
});
