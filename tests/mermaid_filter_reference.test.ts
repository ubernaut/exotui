// Copyright 2026 ExotUI contributors. MIT license.
import { assertEquals } from "./deps.ts";
import { invalidFilterReferencePolicy } from "../src/content/mermaid_filter_dom.ts";

function host(options: {
  chain?: readonly number[];
  invert?: readonly number[];
  absent?: boolean;
  denied?: boolean;
  collision?: boolean;
  unsupported?: boolean;
} = {}) {
  let created = 0;
  let paints = 0;
  let pixels: readonly number[] = [];
  const context = {
    filter: "none",
    fillStyle: "",
    clearRect() {},
    fillRect() {
      paints++;
      pixels = this.filter === "none"
        ? [200, 100, 50, 255]
        : this.filter === "invert(1)"
        ? options.invert ?? [55, 155, 205, 255]
        : options.chain ?? [55, 155, 205, 255];
    },
    getImageData() {
      if (options.denied) throw new Error("Readback denied");
      return { data: new Uint8ClampedArray(pixels) };
    },
  };
  if (options.unsupported) {
    Object.defineProperty(context, "filter", { get: () => "none", set() {} });
  }
  const canvas = { width: 0, height: 0, getContext: () => options.absent ? null : context };
  const document = {
    createElement(name: string) {
      assertEquals(name, "canvas");
      created++;
      return canvas;
    },
    getElementById: () => options.collision ? {} : null,
  } as unknown as Document;
  return { document, canvas, counts: () => ({ created, paints }) };
}

Deno.test("invalid filter policy measures and caches the skip-function host without retaining canvas pixels", () => {
  const fixture = host();
  assertEquals(invalidFilterReferencePolicy(fixture.document), "skip-function");
  assertEquals(invalidFilterReferencePolicy(fixture.document), "skip-function");
  assertEquals(fixture.counts(), { created: 1, paints: 3 });
  assertEquals([fixture.canvas.width, fixture.canvas.height], [0, 0]);
});

Deno.test("invalid filter policy supports the normative discard-chain host independently", () => {
  const fixture = host({ chain: [200, 100, 50, 255] });
  assertEquals(invalidFilterReferencePolicy(fixture.document), "discard-chain");
  assertEquals(invalidFilterReferencePolicy(fixture.document), "discard-chain");
  assertEquals(fixture.counts(), { created: 1, paints: 3 });
  assertEquals([fixture.canvas.width, fixture.canvas.height], [0, 0]);
});

Deno.test("invalid filter policy diagnoses unavailable or unrecognized host paint instead of guessing", () => {
  for (
    const options of [
      { absent: true },
      { denied: true },
      { unsupported: true },
      { invert: [200, 100, 50, 255] },
      { chain: [0, 0, 0, 0] },
    ]
  ) {
    const fixture = host(options);
    assertEquals(invalidFilterReferencePolicy(fixture.document), "unavailable");
    assertEquals(invalidFilterReferencePolicy(fixture.document), "unavailable");
    assertEquals(fixture.counts().created, 1);
    assertEquals([fixture.canvas.width, fixture.canvas.height], [0, 0]);
  }
});

Deno.test("invalid filter policy never probes a borrowed host definition or loops on ID collision", () => {
  const fixture = host({ collision: true });
  assertEquals(invalidFilterReferencePolicy(fixture.document), "unavailable");
  assertEquals(invalidFilterReferencePolicy(fixture.document), "unavailable");
  assertEquals(fixture.counts(), { created: 1, paints: 0 });
  assertEquals([fixture.canvas.width, fixture.canvas.height], [0, 0]);
});
