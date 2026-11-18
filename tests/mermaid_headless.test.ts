// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects } from "./deps.ts";
import { createHeadlessMermaidRenderer } from "../mod.mermaid_headless.ts";
import { MERMAID_ICON_DATA } from "./fixtures/mermaid_standard/icons.ts";

// Controlled browser runtime for TRANSPORT/lifecycle tests only. The separate
// real-engine conformance task covers every upstream grammar/diagram family.
const transportBundle = new TextEncoder().encode(`
export async function createMermaidStandardRenderer() {
  const iconData = new Map();
  const iconLoaders = new Map();
  return {
    registerIconPacks:async(packs)=>{for(const pack of packs){if(pack.icons)iconData.set(pack.name,pack.icons);else iconLoaders.set(pack.name,pack.loader);}},
    diagramTypes:async()=>["transport-fixture"],
    parse:async(source)=>{if(source === "invalid") throw new SyntaxError("fixture invalid");return "transport-fixture";},
    compile:async(source,options)=>{
      if(source === "hang") await new Promise(()=>{});
      if(source === "delay") await new Promise(resolve=>setTimeout(resolve,100));
      if(source.startsWith("icon:")) {
        const name=source.slice(5);
        let data=iconData.get(name);
        if(!data){const loader=iconLoaders.get(name);if(loader){data=await loader();iconData.set(name,data);}}
        return {source,diagramType:"transport-fixture",version:"fixture",svg:"<svg/>",
          scene:{width:120,height:60,title:"",description:"",diagnostics:[data ? JSON.stringify(data) : "missing"],items:[]}};
      }
      let loaded;
      if(source === "resource") loaded=await new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=options.config.imageURL;});
      return {source,diagramType:"transport-fixture",version:"fixture",svg:"<svg/>",
        scene:{width:120,height:60,title:"",description:"",diagnostics:source === "resource" ? [loaded ? "loaded" : "blocked"] : [],items:[]}};
    }
  };
}`);

const executablePath = Deno.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium";
let available = false;
try {
  available = Deno.statSync(executablePath).isFile;
} catch { /* Optional host capability. */ }
const options = { executablePath, chromiumSandbox: false, browserBundle: transportBundle };

async function waitForResource(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 3000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error("Compiler resource did not reach its observed state.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

Deno.test("headless Mermaid rejects invalid host capabilities before starting external processes", async () => {
  for (
    const invalid of [
      { timeoutMs: 0 },
      { timeoutMs: Infinity },
      { maxPending: 0 },
      {
        viewport: { width: 0, height: 100 },
      },
      { browserBundle: new Uint8Array() },
      { resources: { maxBytes: 0 } },
      { resources: { maxConcurrent: 33 } },
      { images: { maxSourcePixels: 0 } },
      { images: { maxTotalRasterPixels: 8_388_609 } },
      { fonts: { limits: { timeoutMs: 0 } } },
      { fonts: { limits: { maxLayoutPasses: 17 } } },
      { fonts: { faces: [{ family: "proof", data: new Uint8Array() }] } },
    ]
  ) {
    await assertRejects(() => createHeadlessMermaidRenderer({ ...options, ...invalid }), RangeError);
  }
  const abort = new AbortController();
  abort.abort();
  await assertRejects(() => createHeadlessMermaidRenderer({ ...options, signal: abort.signal }), DOMException);
});

Deno.test({
  name: "headless icon transport is lazy, isolated, snapshotted and restored after owned-page cancellation",
  ignore: !available,
  fn: async () => {
    const first = await createHeadlessMermaidRenderer(options);
    let second: Awaited<ReturnType<typeof createHeadlessMermaidRenderer>> | undefined;
    try {
      second = await createHeadlessMermaidRenderer(options);
      let calls = 0;
      const data = structuredClone(MERMAID_ICON_DATA);
      await first.registerIconPacks([{
        name: "shared",
        loader: () => {
          calls++;
          return Promise.resolve(data);
        },
      }]);
      assertEquals(calls, 0);
      assertEquals((await first.compile("unrelated")).scene?.diagnostics, []);
      assertEquals(calls, 0);
      assertEquals((await second.compile("icon:shared")).scene?.diagnostics, ["missing"]);
      assertEquals((await first.compile("icon:shared")).scene?.diagnostics, [JSON.stringify(MERMAID_ICON_DATA)]);
      data.icons.signal!.body = "caller mutated lazy result";
      assertEquals((await first.compile("icon:shared")).scene?.diagnostics, [JSON.stringify(MERMAID_ICON_DATA)]);
      assertEquals(calls, 1);
      await first.registerIconPacks([{
        name: "shared",
        loader: () => {
          throw new Error("Replacing a loader must not revoke Mermaid's sticky cache.");
        },
      }]);
      assertEquals((await first.compile("icon:shared")).scene?.diagnostics, [JSON.stringify(MERMAID_ICON_DATA)]);
      const waiting = new AbortController();
      let owned: AbortSignal | undefined;
      let started!: () => void;
      const loading = new Promise<void>((done) => started = done);
      await first.registerIconPacks([{
        name: "cancel",
        loader: ({ signal }) => {
          owned = signal;
          started();
          return new Promise(() => {});
        },
      }]);
      const active = first.compile("icon:cancel", { signal: waiting.signal });
      await loading;
      waiting.abort(new DOMException("cancel icon capability", "AbortError"));
      await assertRejects(() => active, DOMException, "cancel icon capability");
      assert(owned?.aborted, "The real host icon loader must observe operation cancellation.");
      assertEquals((await first.compile("icon:shared")).scene?.diagnostics, [JSON.stringify(MERMAID_ICON_DATA)]);
      assertEquals(calls, 1, "Recovery must restore cached effective packs rather than invoke a replacement loader.");
      const replacement = structuredClone(MERMAID_ICON_DATA);
      replacement.icons.signal!.body = "explicit replacement";
      const register = first.registerIconPacks([{ name: "shared", icons: replacement }]);
      replacement.icons.signal!.body = "caller mutation after queueing";
      await register;
      const installed = JSON.parse((await first.compile("icon:shared")).scene!.diagnostics[0]!);
      assertEquals(installed.icons.signal.body, "explicit replacement");
      assertEquals(first.inspect().pending, 0);
      assertEquals(first.inspect().pages, 1);
    } finally {
      await first.dispose();
      await second?.dispose();
    }
    await assertRejects(() => first.registerIconPacks([{ name: "late", icons: MERMAID_ICON_DATA }]), Error, "disposed");
  },
});

Deno.test({
  name: "headless transport keeps globals isolated and recovers after parse errors, queued and in-flight aborts",
  ignore: !available,
  fn: async () => {
    const globalDocument = "document" in globalThis;
    const renderer = await createHeadlessMermaidRenderer({ ...options, maxPending: 2 });
    try {
      assertEquals(await renderer.diagramTypes(), ["transport-fixture"]);
      await assertRejects(() => renderer.compile(" "), SyntaxError, "empty");
      await assertRejects(() => renderer.compile("x".repeat(128_001)), RangeError, "128,000");
      assertEquals(renderer.inspect().pending, 0);
      await assertRejects(() => renderer.parse("invalid"), Error, "fixture invalid");
      assertEquals(await renderer.parse("valid"), "transport-fixture");
      const inFlight = new AbortController();
      const queued = new AbortController();
      const first = renderer.compile("hang", { signal: inFlight.signal });
      const second = renderer.compile("queued", { signal: queued.signal });
      await assertRejects(() => renderer.compile("overflow"), RangeError, "queue budget");
      queued.abort(new DOMException("queued cancel", "AbortError"));
      await assertRejects(() => second, DOMException, "queued cancel");
      inFlight.abort(new DOMException("active cancel", "AbortError"));
      await assertRejects(() => first, DOMException, "active cancel");
      assertEquals((await renderer.compile("recovered")).source, "recovered");
      assertEquals(renderer.inspect().pages, 1);
      assertEquals(globalDocument, "document" in globalThis);
    } finally {
      await renderer.dispose();
    }
    assertEquals(renderer.inspect().closed, true);
    assertEquals(renderer.inspect().pages, 0);
    await renderer.dispose();
    await assertRejects(() => renderer.compile("late"), Error, "disposed");
  },
});

Deno.test({
  name: "headless transport releases startup failures and disposal cancels active and queued work",
  ignore: !available,
  fn: async () => {
    const brokenBundle = new TextEncoder().encode(
      'export async function createMermaidStandardRenderer(){throw new Error("startup fixture failure");}',
    );
    await assertRejects(
      () => createHeadlessMermaidRenderer({ ...options, browserBundle: brokenBundle }),
      Error,
      "startup fixture failure",
    );
    const renderer = await createHeadlessMermaidRenderer(options);
    const active = renderer.compile("hang");
    const queued = renderer.compile("queued");
    const activeRejection = assertRejects(() => active, Error, "disposed");
    const queuedRejection = assertRejects(() => queued, Error, "disposed");
    await renderer.dispose();
    await Promise.all([activeRejection, queuedRejection]);
    // Queue reservations can settle after a promptly rejected queued request.
    await Promise.resolve();
    assertEquals(renderer.inspect().pages, 0);
    assertEquals(renderer.inspect().pending, 0);
    await renderer.dispose();
  },
});

Deno.test({
  name: "headless transport interrupts timed-out evaluation and recreates a usable DOM page",
  ignore: !available,
  fn: async () => {
    const renderer = await createHeadlessMermaidRenderer({ ...options, timeoutMs: 1000 });
    try {
      await assertRejects(() => renderer.compile("hang"), DOMException, "timed out");
      assertEquals((await renderer.compile("recovered")).source, "recovered");
      assertEquals(renderer.inspect().pending, 0);
    } finally {
      await renderer.dispose();
    }
  },
});

Deno.test({
  name: "headless network resources fail closed unless approved by the host",
  ignore: !available,
  fn: async () => {
    let requests = 0;
    let redirects = 0;
    const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, (request) => {
      if (new URL(request.url).pathname === "/redirect.svg") {
        redirects++;
        return new Response(null, { status: 302, headers: { location: "/image.svg" } });
      }
      requests++;
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>',
        { headers: { "content-type": "image/svg+xml" } },
      );
    });
    const url = `http://127.0.0.1:${server.addr.port}/image.svg`;
    try {
      const denied = await createHeadlessMermaidRenderer(options);
      try {
        assertEquals((await denied.compile("resource", { config: { imageURL: url } })).scene?.diagnostics, ["blocked"]);
        assertEquals(requests, 0);
        assert(denied.inspect().blockedResources.includes(url));
      } finally {
        await denied.dispose();
      }
      const allowed = await createHeadlessMermaidRenderer({
        ...options,
        allowResource: (candidate) => candidate.href === url,
      });
      try {
        assertEquals((await allowed.compile("resource", { config: { imageURL: url } })).scene?.diagnostics, ["loaded"]);
        assertEquals(requests, 1);
        assertEquals(allowed.inspect().blockedResources, []);
      } finally {
        await allowed.dispose();
      }
      const brokenPolicy = await createHeadlessMermaidRenderer({
        ...options,
        allowResource: () => {
          throw new Error("Host policy failure");
        },
      });
      try {
        assertEquals((await brokenPolicy.compile("resource", { config: { imageURL: url } })).scene?.diagnostics, [
          "blocked",
        ]);
        assertEquals(requests, 1);
        assert(brokenPolicy.inspect().blockedResources.includes(url));
      } finally {
        await brokenPolicy.dispose();
      }
      const redirectURL = `http://127.0.0.1:${server.addr.port}/redirect.svg`;
      const denyRedirect = await createHeadlessMermaidRenderer({
        ...options,
        allowResource: (candidate) => candidate.href === redirectURL,
      });
      try {
        assertEquals(
          (await denyRedirect.compile("resource", { config: { imageURL: redirectURL } })).scene?.diagnostics,
          ["blocked"],
        );
        assertEquals(redirects, 1);
        assertEquals(requests, 1, "Unapproved redirect destination must never be fetched.");
        assert(denyRedirect.inspect().blockedResources.includes(url));
      } finally {
        await denyRedirect.dispose();
      }
      const allowRedirect = await createHeadlessMermaidRenderer({
        ...options,
        allowResource: (candidate) => candidate.href === redirectURL || candidate.href === url,
      });
      try {
        assertEquals(
          (await allowRedirect.compile("resource", { config: { imageURL: redirectURL } })).scene?.diagnostics,
          ["loaded"],
        );
        assertEquals(redirects, 2);
        assertEquals(requests, 2);
      } finally {
        await allowRedirect.dispose();
      }
    } finally {
      await server.shutdown();
    }
  },
});

Deno.test({
  name: "headless approved-resource quotas are enforced before a private browser can decode oversized assets",
  ignore: !available,
  fn: async () => {
    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen() {} },
      () => new Response("x".repeat(1024), { headers: { "content-type": "image/svg+xml" } }),
    );
    const url = `http://127.0.0.1:${server.addr.port}/oversized.svg`;
    const limits = { maxBytes: 64 };
    const renderer = await createHeadlessMermaidRenderer({
      ...options,
      allowResource: () => true,
      resources: limits,
    });
    try {
      limits.maxBytes = 4096;
      assertEquals((await renderer.compile("resource", { config: { imageURL: url } })).scene?.diagnostics, ["blocked"]);
      const resources = renderer.inspect().resources;
      assertEquals(resources.active, 0);
      assertEquals(resources.pending, 0);
      assert(resources.bytes <= 64);
      assert(resources.diagnostics.some((message) => message.includes("byte budget")));
      assert(renderer.inspect().blockedResources.includes(url));
    } finally {
      await renderer.dispose();
      await server.shutdown();
    }
  },
});

Deno.test({
  name: "headless abort, timeout and disposal cancel actual owned resource readers before returning",
  ignore: !available,
  fn: async () => {
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
        { headers: { "content-type": "image/svg+xml" } },
      );
    });
    const url = `http://127.0.0.1:${server.addr.port}/pending.svg`;
    try {
      for (const [index, mode] of ["abort", "timeout", "dispose"].entries()) {
        const renderer = await createHeadlessMermaidRenderer({
          ...options,
          timeoutMs: mode === "timeout" ? 1000 : 30000,
          allowResource: () => true,
        });
        try {
          const abort = new AbortController();
          const job = renderer.compile("resource", { config: { imageURL: url }, signal: abort.signal });
          const rejection = assertRejects(
            () => job,
            Error,
            mode === "abort" ? "fixture cancelled" : mode === "timeout" ? "timed out" : "disposed",
          );
          await waitForResource(() => requests === index + 1 && renderer.inspect().resources.active === 1);
          if (mode === "abort") abort.abort(new DOMException("fixture cancelled", "AbortError"));
          if (mode === "dispose") await renderer.dispose();
          await rejection;
          assertEquals(renderer.inspect().resources.active, 0);
          assertEquals(renderer.inspect().resources.pending, 0);
          await waitForResource(() => cancelled === index + 1);
          if (mode !== "dispose") assertEquals((await renderer.compile("recovered")).source, "recovered");
        } finally {
          await renderer.dispose();
        }
      }
    } finally {
      await server.shutdown();
    }
  },
});
