// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects, assertThrows } from "./deps.ts";
import { MermaidResourceScope, resourceLimits } from "../src/content/mermaid_resources.ts";

async function until(predicate: () => boolean): Promise<void> {
  const end = performance.now() + 3000;
  while (!predicate()) {
    if (performance.now() > end) throw new Error("Resource fixture did not reach its observed state.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

Deno.test("Mermaid resource budgets reject invalid capabilities and preserve explicit optional defaults", () => {
  for (const limits of [{ maxBytes: 0 }, { maxTotalBytes: Infinity }, { maxRequests: 4097 }, { maxConcurrent: -1 }]) {
    assertThrows(() => resourceLimits(limits), RangeError);
  }
  assertEquals(resourceLimits({ maxBytes: undefined }), resourceLimits());
});

Deno.test("Mermaid assets stream decoded bodies without compression, cookies or hop-by-hop headers", async () => {
  const original = new TextEncoder().encode("compressed image bytes ".repeat(10));
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, () =>
    new Response(
      new Blob([original]).stream().pipeThrough(new CompressionStream("gzip")),
      {
        headers: {
          "content-encoding": "gzip",
          "content-type": "image/svg+xml",
          "set-cookie": "fixture=private",
          "access-control-allow-origin": "*",
        },
      },
    ));
  const scope = new MermaidResourceScope(resourceLimits(), new AbortController().signal, () => true, () => {});
  try {
    const result = await scope.load(new URL(`http://127.0.0.1:${server.addr.port}/image`));
    assertEquals(result.body, original);
    assertEquals(result.headers["content-encoding"], undefined);
    assertEquals(result.headers["set-cookie"], undefined);
    assertEquals(result.headers["access-control-allow-origin"], "*");
    assertEquals(scope.inspect().bytes, original.length);
    assertEquals(scope.inspect().active, 0);
    assertEquals(scope.inspect().pending, 0);
  } finally {
    await scope.dispose();
    await server.shutdown();
  }
});

Deno.test("Mermaid per-asset and aggregate quotas bound accepted decoded bytes and stop further work", async () => {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, () => new Response(new Uint8Array(64)));
  const url = new URL(`http://127.0.0.1:${server.addr.port}/image`);
  const denied: string[] = [];
  const single = new MermaidResourceScope(
    resourceLimits({ maxBytes: 32 }),
    new AbortController().signal,
    () => true,
    (url) => denied.push(url.href),
  );
  const total = new MermaidResourceScope(
    resourceLimits({ maxBytes: 128, maxTotalBytes: 100 }),
    new AbortController().signal,
    () => true,
    () => {},
  );
  try {
    await assertRejects(() => single.load(url), RangeError, "resource byte budget");
    assertEquals(single.inspect().bytes, 0);
    assertEquals(denied, [url.href]);
    await total.load(url);
    await assertRejects(() => total.load(url), RangeError, "total resource byte budget");
    assertEquals(total.inspect().bytes, 64);
    const requests = total.inspect().requests;
    await assertRejects(() => total.load(url), RangeError, "total resource byte budget");
    assertEquals(total.inspect().requests, requests);
  } finally {
    await single.dispose();
    await total.dispose();
    await server.shutdown();
  }
});

Deno.test("Mermaid resource request quotas count redirects and never fetch denied or excess destinations", async () => {
  let requests = 0;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (request) => {
    requests++;
    const index = Number(new URL(request.url).pathname.slice(1));
    return index < 3
      ? new Response(null, { status: 302, headers: { location: `/${index + 1}` } })
      : new Response("image");
  });
  const url = new URL(`http://127.0.0.1:${server.addr.port}/0`);
  const scope = new MermaidResourceScope(
    resourceLimits({ maxRequests: 2 }),
    new AbortController().signal,
    () => true,
    () => {},
  );
  const denied = new MermaidResourceScope(
    resourceLimits(),
    new AbortController().signal,
    (url) => url.pathname === "/0",
    () => {},
  );
  try {
    await assertRejects(() => scope.load(url), RangeError, "request budget");
    assertEquals(requests, 2);
    assertEquals(scope.inspect().requests, 2);
    await assertRejects(() => denied.load(url), Error, "redirect denied");
    assertEquals(requests, 3);
  } finally {
    await scope.dispose();
    await denied.dispose();
    await server.shutdown();
  }
});

Deno.test("Mermaid resource cancellation closes actual body readers and skips bounded queued downloads", async () => {
  let requests = 0;
  let cancelled = 0;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, () => {
    requests++;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1));
        },
        cancel() {
          cancelled++;
        },
      }),
    );
  });
  const url = new URL(`http://127.0.0.1:${server.addr.port}/image`);
  const abort = new AbortController();
  const scope = new MermaidResourceScope(
    resourceLimits({ maxConcurrent: 2, maxRequests: 6 }),
    abort.signal,
    () => true,
    () => {},
  );
  const jobs = Array.from({ length: 6 }, () => scope.load(url));
  const settled = Promise.allSettled(jobs);
  try {
    await until(() => requests === 2 && scope.inspect().bytes === 2);
    assertEquals(scope.inspect().active, 2);
    assertEquals(scope.inspect().pending, 6);
    // AbortSignal reasons need not be Error objects; retain the caller's reason.
    abort.abort("fixture cancelled");
    await scope.dispose();
    assert((await settled).every((result) => result.status === "rejected" && result.reason === "fixture cancelled"));
    assert(scope.inspect().diagnostics.some((message) => message.startsWith("fixture cancelled ")));
    assertEquals(scope.inspect().active, 0);
    assertEquals(scope.inspect().pending, 0);
    assertEquals(requests, 2, "Cancelled queued jobs must not open HTTP requests.");
    await until(() => cancelled === 2);
    await scope.dispose();
  } finally {
    await scope.dispose();
    await server.shutdown();
  }
});
