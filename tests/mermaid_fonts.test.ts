// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects, assertThrows } from "./deps.ts";
import { MermaidFontScope, sameMermaidFontState, snapshotMermaidFonts } from "../src/content/mermaid_fonts.ts";
import { MermaidStandardRenderer, type MermaidStandardRuntime } from "../mod.mermaid.ts";

Deno.test("Mermaid font capabilities snapshot bytes/descriptors and reject unbounded work", () => {
  const face = { family: "Proof", data: new Uint8Array([1, 2]), descriptors: { weight: "700" } };
  const snapshot = snapshotMermaidFonts({ faces: [face] });
  face.data[0] = 99;
  face.descriptors.weight = "400";
  assertEquals(snapshot.faces[0]!.data, new Uint8Array([1, 2]));
  assertEquals(snapshot.faces[0]!.descriptors!.weight, "700");
  assert(Object.isFrozen(snapshot.faces));
  assertThrows(() => snapshotMermaidFonts({ faces: [face], limits: { maxBytes: 1 } }), RangeError);
  assertThrows(() => snapshotMermaidFonts({ faces: [face, face], limits: { maxFonts: 1 } }), RangeError);
  assertThrows(() => snapshotMermaidFonts({ faces: [face, face], limits: { maxTotalBytes: 3 } }), RangeError);
  assertThrows(() => snapshotMermaidFonts({ faces: [{ ...face, family: "\u0000" }] }), TypeError);
  assertThrows(() => snapshotMermaidFonts({ limits: { timeoutMs: 0 } }), RangeError);
  assertThrows(() => snapshotMermaidFonts({ limits: { maxLayoutPasses: 17 } }), RangeError);
});

Deno.test("Mermaid font readiness cancellation/timeout releases owned waiters without poisoning subsequent waits", async () => {
  const scope = new MermaidFontScope({ limits: { timeoutMs: 10 } });
  const caller = new AbortController();
  const pending = scope.wait(new Promise(() => {}), caller.signal);
  caller.abort(new DOMException("font cancellation", "AbortError"));
  await assertRejects(() => pending, DOMException, "font cancellation");
  await assertRejects(() => scope.wait(new Promise(() => {}), new AbortController().signal), DOMException, "timed out");
  assertEquals(await scope.wait(Promise.resolve("ready"), new AbortController().signal), "ready");
  scope.dispose();
  scope.dispose();
});

Deno.test("Mermaid font identity/status changes require relayout even when loading finishes inside render", () => {
  const first = {} as FontFace;
  const other = {} as FontFace;
  assert(sameMermaidFontState([[first, "loaded"]], [[first, "loaded"]]));
  assert(!sameMermaidFontState([[first, "unloaded"]], [[first, "loaded"]]));
  assert(!sameMermaidFontState([[first, "loaded"]], [[other, "loaded"]]));
  assert(!sameMermaidFontState([], [[first, "loaded"]]));
});

Deno.test("disposing a browser Mermaid compiler is idempotent and does not revoke another window's runtime", async () => {
  const runtime: MermaidStandardRuntime = {
    initialize() {},
    parse: () => Promise.resolve({ diagramType: "proof" }),
    render: () => Promise.reject(new Error("No DOM")),
    getRegisteredDiagramsMetadata: () => [{ id: "proof" }],
  };
  const first = new MermaidStandardRenderer(runtime);
  const other = new MermaidStandardRenderer(runtime);
  first.dispose();
  first.dispose();
  await assertRejects(() => first.parse("proof"), DOMException, "disposed");
  assertEquals(await other.parse("proof"), "proof");
});
