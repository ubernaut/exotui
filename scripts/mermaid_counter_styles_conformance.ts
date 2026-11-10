// Copyright 2023 Im-Beast. MIT license.
/** Original Chromium counter text oracle; no live preview, counter-state mutation or AX-derived formatting. */
import * as esbuild from "esbuild";
import { chromium, type Page } from "playwright";
import { semanticAXTree } from "../tests/fixtures/mermaid_standard/semantic_ax.ts";

const build = await esbuild.build({
  entryPoints: [new URL("../tests/fixtures/mermaid_standard/counter_styles.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
});
esbuild.stop();
const server = Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen() {} },
  (request) =>
    new URL(request.url).pathname === "/oracle.js"
      ? new Response(new Uint8Array(build.outputFiles![0]!.contents), {
        headers: { "content-type": "text/javascript" },
      })
      : new Response("<!doctype html><title>Counter style oracle</title>", {
        headers: { "content-type": "text/html" },
      }),
);
let browser;
async function checkNativeContent(page: Page) {
  const count = await page.evaluate(async () => (await import("/oracle.js")).MERMAID_COUNTER_CONTENT_FIXTURES.length);
  const session = await page.context().newCDPSession(page);
  const plain = (tree: ReturnType<typeof semanticAXTree>): string =>
    tree.map((node): string => node.role === "StaticText" ? node.name ?? "" : plain(node.children ?? [])).join("");
  try {
    for (let index = 0; index < count; index++) {
      const original = await page.evaluate(
        async (index) => (await import("/oracle.js")).mountMermaidCounterContentOriginal(index),
        index,
      );
      const before = plain(semanticAXTree((await session.send("Accessibility.getFullAXTree")).nodes, original.id));
      if (before !== original.expected) {
        throw new Error(`Original counter source assertion differs: ${JSON.stringify({ original, before })}`);
      }
      const captured = await page.evaluate(async () =>
        (await import("/oracle.js")).captureMermaidCounterContentOriginal()
      );
      const after = (await session.send("Accessibility.getFullAXTree")).nodes;
      const restored = plain(semanticAXTree(after, original.id)),
        companion = plain(semanticAXTree(after, captured.companionId));
      console.log(JSON.stringify({ nativeCounter: index, ...captured, original: before, restored, companion }));
      if (
        captured.captured !== captured.expected || captured.semantic !== captured.expectedSemantic ||
        captured.diagnostics.length || restored !== before || companion !== before
      ) {
        throw new Error(`Native counter capture differs from original: ${original.id}`);
      }
    }
    const guards = await page.evaluate(async () => (await import("/oracle.js")).mermaidCounterContentMetadataGuards());
    console.log(JSON.stringify({ nativeCounterCases: count, counterMetadataGuards: guards }));
  } finally {
    await session.detach();
  }
}
async function checkContexts(page: Page, profile: "chromium-legacy" | "css-accounting") {
  const contexts = await page.evaluate(
    async (profile) =>
      (await import("/oracle.js")).mountMermaidCounterContextOracle(profile) as ReturnType<
        typeof import("../tests/fixtures/mermaid_standard/counter_contexts.ts").mountMermaidCounterContextOracle
      >,
    profile,
  );
  const session = await page.context().newCDPSession(page);
  const nodes = (await session.send("Accessibility.getFullAXTree")).nodes;
  await session.detach();
  const plain = (tree: ReturnType<typeof semanticAXTree>): string =>
    tree.map((node): string => node.role === "StaticText" ? node.name ?? "" : plain(node.children ?? [])).join("");
  const failures = contexts.flatMap((fixture) => {
    const original = plain(semanticAXTree(nodes, fixture.id));
    return original === fixture.expected ? [] : [{ ...fixture, original }];
  });
  const reversed = contexts.filter((fixture) => fixture.reversedSyntaxSupported !== undefined);
  if (reversed.some((fixture) => fixture.reversedSyntaxSupported !== (profile === "css-accounting"))) {
    throw new Error("Counter context profile does not match original engine syntax support.");
  }
  console.log(
    JSON.stringify({
      profile,
      counterContexts: contexts.length,
      reversedSyntaxSupported: profile === "css-accounting",
      originalContentSupplied: contexts.filter((f) => f.originalContent).length,
      failures,
    }),
  );
  await page.evaluate(async () => (await import("/oracle.js")).disposeMermaidCounterContextOracle());
  if (failures.length) throw new Error("Counter-state predictions differ from original Chromium AX text.");
  const guards = await page.evaluate(
    async (profile) => (await import("/oracle.js")).mermaidCounterContextGuards(profile),
    profile,
  );
  console.log(JSON.stringify({ profile, counterContextGuards: guards }));
}
try {
  browser = await chromium.launch({
    executablePath: Deno.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.addr.port}`, requests: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto(`${origin}/`);
  const fixtures = await page.evaluate(async () =>
    (await import("/oracle.js")).mountMermaidCounterStyleOracle() as ReturnType<
      typeof import("../tests/fixtures/mermaid_standard/counter_styles.ts").mountMermaidCounterStyleOracle
    >
  );
  const session = await page.context().newCDPSession(page);
  const nodes = (await session.send("Accessibility.getFullAXTree")).nodes;
  await session.detach();
  const plain = (tree: ReturnType<typeof semanticAXTree>): string =>
    tree.map((node): string => node.role === "StaticText" ? node.name ?? "" : plain(node.children ?? [])).join("");
  const failures = fixtures.flatMap((fixture) => {
    const original = plain(semanticAXTree(nodes, fixture.id));
    const matches = fixture.refused ? original.length > 4096 : original === fixture.expected;
    return matches ? [] : [{ ...fixture, original }];
  });
  console.log(
    JSON.stringify({
      examples: fixtures.length,
      matched: fixtures.filter((fixture) => !fixture.refused).length,
      oversizedRefusals: fixtures.filter((fixture) => fixture.refused).length,
      styles: new Set(
        fixtures.filter((fixture) => fixture.id.startsWith("counter-style-")).map((fixture) => fixture.name),
      ).size,
      contentCases: fixtures.filter((fixture) => fixture.id.startsWith("counter-content-")).length,
      unresolvedSerializationLosses: fixtures.filter((fixture) => fixture.serializationLoss),
      externalRequests: requests.length,
      failures,
    }),
  );
  if (failures.length) {
    throw new Error(`${failures.length} counter formats differ from independently mounted original Chromium text.`);
  }
  if (requests.length) throw new Error("Counter formatting attempted an external resource request.");
  await page.evaluate(async () => (await import("/oracle.js")).disposeMermaidCounterStyleOracle());
  await checkNativeContent(page);
  await checkContexts(page, "chromium-legacy");
  await browser.close();
  browser = await chromium.launch({
    executablePath: Deno.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-gpu", "--enable-blink-features=CSSListCounterAccounting,CSSCounterResetReversed"],
  });
  const enabledPage = await browser.newPage();
  await enabledPage.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    requests.push(route.request().url());
    return route.abort();
  });
  await enabledPage.goto(`${origin}/`);
  await checkContexts(enabledPage, "css-accounting");
  if (requests.length) throw new Error("Counter capture attempted an external resource request.");
} finally {
  await browser?.close();
  await server.shutdown();
}
