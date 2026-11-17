// Copyright 2023 Im-Beast. MIT license.
/** Real CSS Font Loading/upstream layout proof in isolated browser and Deno hosts; never serves the internal site. */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { type Browser, chromium } from "playwright";
import { createHeadlessMermaidRenderer, type HeadlessMermaidRenderer } from "../mod.mermaid_headless.ts";
import { renderMermaidNativeFrame } from "../mod.mermaid.ts";
import { runtimeHost } from "../src/runtime/host.ts";
import { bundleBrowserForBun } from "../src/runtime/bun_browser_bundle.ts";

const root = new URL("..", import.meta.url).pathname;
const assertionModule = runtimeHost.runtime === "bun" ? "../tests/bun_assert.ts" : "../tests/deps.ts";
const assertions: typeof import("../tests/deps.ts") = await import(assertionModule);
const assert: typeof assertions.assert = assertions.assert;
const { assertEquals, assertRejects } = assertions;
const findPackageJSON = runtimeHost.runtime === "deno" ? (await import("node:module")).findPackageJSON : undefined;
const mermaid = findPackageJSON?.("mermaid", import.meta.url);
const katex = runtimeHost.runtime === "bun"
  ? createRequire(import.meta.resolve("mermaid")).resolve("katex/package.json")
  : findPackageJSON?.("katex", mermaid);
if (!katex) throw new Error("The pinned Mermaid installation has no KaTeX font fixture.");
// Existing dependency asset, covered by KaTeX's SIL Open Font License. No font/browser download.
const font = await runtimeHost.readFile(resolve(dirname(katex), "dist/fonts/KaTeX_Typewriter-Regular.woff2"));
const executablePath = runtimeHost.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium";
const bundle = runtimeHost.runtime === "bun"
  ? await bundleBrowserForBun(new URL("../mod.mermaid.ts", import.meta.url))
  : await (async () => {
    const bundled = await new runtimeHost.Command(runtimeHost.execPath(), {
      env: { DENO_NO_PACKAGE_JSON: "1" },
      args: [
        "bundle",
        "--platform=browser",
        "--minify",
        "--conditions=browser,import",
        "--config",
        `${root}/deno.jsonc`,
        "--frozen",
        `${root}/mod.mermaid.ts`,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!bundled.success) throw new Error(new TextDecoder().decode(bundled.stderr));
    return new Uint8Array(bundled.stdout);
  })();
const gates = new Map<
  string,
  { requested: Promise<void>; announce: () => void; body: Promise<void>; release: () => void }
>();
for (const name of ["active", "late", "svg", "abort", "timeout", "passes", "dispose"]) {
  let announce!: () => void;
  let release!: () => void;
  const requested = new Promise<void>((done) => announce = done);
  const body = new Promise<void>((done) => release = done);
  gates.set(name, { requested, announce, body, release });
}
const server = runtimeHost.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (request) => {
  const path = new URL(request.url).pathname;
  if (path === "/engine.js") return new Response(bundle, { headers: { "content-type": "text/javascript" } });
  const gate = gates.get(path.slice(1));
  if (gate) {
    gate.announce();
    await gate.body;
    return new Response(new Uint8Array(font), { headers: { "content-type": "font/woff2" } });
  }
  return new Response("<!doctype html><title>Private font conformance</title>", {
    headers: { "content-type": "text/html" },
  });
});
let browser: Browser | undefined;
let headless: HeadlessMermaidRenderer | undefined;
let separate: HeadlessMermaidRenderer | undefined;
const source = "flowchart LR\nA[iiiiiWWWWWiiiii] --> B[Font readiness]";
const config = { theme: "base", themeVariables: { fontFamily: "ExotUIFontProof" } };
// Upstream paint-server IDs deliberately differ per render; retain all geometry/style data.
const canonical = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value).replace(/exotui-mermaid-standard-\d+/g, "exotui-mermaid-standard-ID"));
try {
  browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  await page.exposeFunction("fontRequested", async (name: string) => {
    const gate = gates.get(name)!;
    await gate.requested;
  });
  await page.exposeFunction("releaseFont", (name: string) => gates.get(name)!.release());
  await page.goto(`http://127.0.0.1:${server.addr.port}/`);
  const browserProof = await page.evaluate(async ({ source, config, data }) => {
    const module = await import("/engine.js") as typeof import("../mod.mermaid.ts");
    const host = globalThis as unknown as {
      fontRequested: (name: string) => Promise<void>;
      releaseFont: (name: string) => Promise<void>;
    };
    const require = (condition: unknown, message: string) => {
      if (!condition) throw new Error(message);
    };
    const canonical = (value: unknown): string =>
      JSON.stringify(value).replace(/exotui-mermaid-standard-\d+/g, "exotui-mermaid-standard-ID");
    const dimensions = (
      diagram: Awaited<ReturnType<typeof renderer.compile>>,
    ) => [diagram.scene!.width, diagram.scene!.height];
    const renderer = await module.createMermaidStandardRenderer();
    const fallback = await renderer.compile(source, { config });
    let fontCases = 0;
    const requested = (name: string) =>
      Promise.race([
        host.fontRequested(name),
        new Promise<never>((_done, reject) =>
          setTimeout(() => reject(new Error(`Font was not requested: ${name}`)), 5000)
        ),
      ]);
    const compileBlocked = async (name: string, eager: boolean) => {
      const face = new FontFace("ExotUIFontProof", `url("/${name}")`);
      document.fonts.add(face);
      const loading = eager ? face.load() : face.loaded;
      if (eager) await requested(name);
      let settled = false;
      const pending = renderer.compile(source, { config }).finally(() => settled = true);
      await requested(name);
      await new Promise((done) => setTimeout(done, 60));
      require(!settled, "Compiler returned fallback geometry before its font was ready.");
      await host.releaseFont(name);
      await loading;
      const actual = await pending;
      const stable = await renderer.compile(source, { config });
      require(
        JSON.stringify(dimensions(actual)) === JSON.stringify(dimensions(stable)),
        "Font-loaded shapes still use fallback layout.",
      );
      const different = actual.scene!.items.findIndex((item, index) =>
        canonical(item) !== canonical(stable.scene!.items[index])
      );
      require(
        different === -1,
        `Font-loaded labels/paint differ from a fresh stable compilation: ${
          JSON.stringify({
            name,
            different,
            actual: actual.scene!.items[different],
            stable: stable.scene!.items[different],
          })
        }`,
      );
      require(
        JSON.stringify(dimensions(actual)) !== JSON.stringify(dimensions(fallback)),
        "Fixture cannot distinguish loaded font from fallback.",
      );
      document.fonts.delete(face);
      fontCases++;
      return actual;
    };
    await compileBlocked("active", true);
    const loaded = await compileBlocked("late", false);
    const svgFace = new FontFace("ExotUIFontProof", 'url("/svg")');
    document.fonts.add(svgFace);
    let svgSettled = false;
    const svgOnly = renderer.compile(source, { config, scene: false }).finally(() => svgSettled = true);
    await requested("svg");
    await new Promise((done) => setTimeout(done, 60));
    require(!svgSettled, "SVG-only compilation bypassed font readiness.");
    await host.releaseFont("svg");
    const svgResult = await svgOnly;
    const viewBox = new DOMParser().parseFromString(svgResult.svg, "image/svg+xml").documentElement.getAttribute(
      "viewBox",
    )!.split(/\s+/).map(Number);
    require(
      !svgResult.scene && JSON.stringify(viewBox.slice(2)) === JSON.stringify(dimensions(loaded)),
      "SVG-only layout retained fallback metrics.",
    );
    document.fonts.delete(svgFace);
    fontCases++;
    for (const name of ["abort", "timeout", "dispose"] as const) {
      const face = new FontFace("ExotUIFontProof", `url("/${name}")`);
      document.fonts.add(face);
      const loading = face.load();
      await requested(name);
      const current = await module.createMermaidStandardRenderer({
        fonts: { limits: { timeoutMs: name === "timeout" ? 20 : 30_000 } },
      });
      const abort = new AbortController();
      const pending = current.compile(source, { config, signal: abort.signal });
      if (name === "abort") abort.abort(new DOMException("cancel font wait", "AbortError"));
      if (name === "dispose") current.dispose();
      const error = await pending.then(() => null, (error: Error) => error);
      require(
        error?.name === (name === "timeout" ? "TimeoutError" : "AbortError"),
        `Wrong readiness failure: ${error}`,
      );
      require(document.fonts.has(face) && face.status === "loading", "Cancellation/disposal revoked a borrowed font.");
      require(!document.querySelector('div[style*="-100000px"]'), "Failed font wait leaked a measuring container.");
      await host.releaseFont(name);
      await loading;
      if (name !== "dispose") await current.compile(source, { config });
      current.dispose();
      document.fonts.delete(face);
      fontCases++;
    }
    const late = new FontFace("ExotUIFontProof", 'url("/passes")');
    document.fonts.add(late);
    const bounded = await module.createMermaidStandardRenderer({ fonts: { limits: { maxLayoutPasses: 1 } } });
    const unstable = bounded.compile(source, { config }).then(() => null, (error: Error) => error);
    await requested("passes");
    await host.releaseFont("passes");
    const error = await unstable;
    require(error?.name === "RangeError", "Relayout budget must reject, not return fallback-sized geometry.");
    bounded.dispose();
    document.fonts.delete(late);
    fontCases++;
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const owned = await module.createMermaidStandardRenderer({
      fonts: { faces: [{ family: "ExotUIFontProof", data: bytes }] },
    });
    bytes.fill(0);
    const borrowed = new FontFace("BorrowedProof", Uint8Array.from(atob(data), (char) => char.charCodeAt(0)).buffer);
    await borrowed.load();
    document.fonts.add(borrowed);
    const actual = await owned.compile(source, { config });
    require(
      JSON.stringify(dimensions(actual)) === JSON.stringify(dimensions(loaded)),
      "Owned font bytes were not snapshotted or loaded before upstream layout.",
    );
    require(document.fonts.size === 2, "Owned font was not registered.");
    owned.dispose();
    require(
      document.fonts.size === 1 && document.fonts.has(borrowed),
      "Disposal removed another host's font or retained its own.",
    );
    document.fonts.delete(borrowed);
    fontCases++;
    const observed = await module.createMermaidStandardRenderer({ fonts: { limits: { maxObservedFonts: 1 } } });
    const extra = new FontFace("ExtraProof", Uint8Array.from(atob(data), (char) => char.charCodeAt(0)).buffer);
    await extra.load();
    document.fonts.add(borrowed);
    document.fonts.add(extra);
    const exceeded = await observed.compile(source).then(() => null, (error: Error) => error);
    require(exceeded?.name === "RangeError", "Borrowed font observation was not bounded.");
    require(document.fonts.size === 2, "Observation failure revoked borrowed registrations.");
    observed.dispose();
    document.fonts.delete(borrowed);
    document.fonts.delete(extra);
    fontCases++;
    const invalid = await module.createMermaidStandardRenderer({
      fonts: { faces: [{ family: "BrokenProof", data: new Uint8Array([1, 2, 3]) }] },
    });
    await invalid.compile(source).then(() => {
      throw new Error("Invalid font silently fell back.");
    }, () => {});
    require(document.fonts.size === 0, "Invalid font leaked into document.fonts.");
    invalid.dispose();
    fontCases++;
    renderer.dispose();
    require(!document.querySelector('div[style*="-100000px"]'), "Font conformance left measuring DOM behind.");
    return {
      cases: fontCases,
      fallback: dimensions(fallback),
      loaded: dimensions(loaded),
      items: JSON.parse(canonical(loaded.scene!.items)),
    };
  }, { source, config, data: Buffer.from(font).toString("base64") });
  console.log(
    `ok browser:font-readiness ${
      JSON.stringify({ cases: browserProof.cases, fallback: browserProof.fallback, loaded: browserProof.loaded })
    }`,
  );
  const options = {
    executablePath,
    chromiumSandbox: false,
    browserBundle: bundle,
  };
  const supplied = new Uint8Array(font);
  headless = await createHeadlessMermaidRenderer({
    ...options,
    fonts: { faces: [{ family: "ExotUIFontProof", data: supplied }] },
  });
  supplied.fill(0);
  const actual = await headless.compile(source, { config });
  assertEquals([actual.scene!.width, actual.scene!.height], browserProof.loaded);
  assertEquals(canonical(actual.scene!.items), browserProof.items);
  separate = await createHeadlessMermaidRenderer(options);
  const isolated = await separate.compile(source, { config });
  assertEquals([isolated.scene!.width, isolated.scene!.height], browserProof.fallback);
  await separate.dispose();
  separate = undefined;
  let announce!: () => void;
  const started = new Promise<void>((done) => announce = done);
  await headless.registerIconPacks([{
    name: "fontcancel",
    loader: () => {
      announce();
      return new Promise(() => {});
    },
  }]);
  const abort = new AbortController();
  const active = headless.compile('flowchart TB\nA@{icon: "fontcancel:signal", h: 96, label: "Await icon"}', {
    config,
    signal: abort.signal,
  });
  await Promise.race([
    started,
    active.then(() => {
      throw new Error("Font recovery fixture did not start its lazy icon.");
    }),
  ]);
  abort.abort(new DOMException("font page recovery", "AbortError"));
  await assertRejects(() => active, DOMException, "font page recovery");
  const recovered = await headless.compile(source, { config });
  assertEquals(canonical(recovered.scene), canonical(actual.scene));
  const portable = JSON.parse(JSON.stringify(actual.scene)) as NonNullable<typeof actual.scene>;
  const before = renderMermaidNativeFrame(portable);
  assert(actual.scene!.items.some((item) => item.kind === "text"));
  await headless.dispose();
  assertEquals(renderMermaidNativeFrame(portable), before);
  assertEquals(headless.inspect().pages, 0);
  console.log("ok headless:font-registration-isolation-recovery-portability");
} finally {
  for (const gate of gates.values()) gate.release();
  await headless?.dispose();
  await separate?.dispose();
  await browser?.close();
  await server.shutdown();
}
