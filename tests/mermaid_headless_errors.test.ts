// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects } from "./deps.ts";
import { createHeadlessMermaidRenderer } from "../mod.mermaid_headless.ts";
import { verifyMermaidFamilyGrammar } from "./fixtures/mermaid_standard/grammar.ts";

const executablePath = Deno.env.get("EXOTUI_CHROMIUM") ?? "/snap/bin/chromium";
let available = false;
try {
  available = Deno.statSync(executablePath).isFile;
} catch { /* Explicit optional host capability. */ }

Deno.test({
  name: "real headless Mermaid preserves every parser's negative diagnostic and next-request native recovery",
  ignore: !available,
  fn: async () => {
    const renderer = await createHeadlessMermaidRenderer({ executablePath, chromiumSandbox: false });
    try {
      const stats = await verifyMermaidFamilyGrammar(renderer);
      assertEquals(stats.registered, 38);
      assertEquals(stats.parseRejections, 38);
      assertEquals(stats.compileRejections, 38);
      assertEquals(stats.recoveries, 38);
      assert(stats.nativeCells > 0);
      assertEquals(renderer.inspect().pending, 0);
      assertEquals(renderer.inspect().pages, 1);
    } finally {
      await renderer.dispose();
    }
  },
});

const errorBundle = new TextEncoder().encode(`
let reads = 0;
function fail(source) {
  if (source === "cyclic") {
    const error = { name: "ParserError", message: "Expected a closing bracket on line 2." };
    error.result = { parent: error };
    throw error;
  }
  if (source === "accessor") {
    throw Object.defineProperties({}, {
      message: { enumerable: true, get() { reads++; throw new Error("message getter ran"); } },
      toString: { enumerable: true, get() { reads++; throw new Error("coercion getter ran"); } },
    });
  }
  if (source === "control") throw { name: "Parser\\u000aError", message: "diagram\\u001b[31m\\u009b0m\\u000d: invalid" };
  if (source === "revoked") {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    throw proxy;
  }
  if (source === "native") throw new DOMException("Host font decode failed.", "EncodingError");
  if (source === "large") throw { message: "x".repeat(1000000) + "UNBOUNDED-END-MARKER" };
}
export async function createMermaidStandardRenderer() {
  return {
    diagramTypes: async () => ["error-transport"],
    parse: async (source) => { fail(source); return "error-transport"; },
    compile: async (source) => {
      fail(source);
      return { source, diagramType: "error-transport", version: "fixture", svg: "<svg/>",
        scene: { width: 120, height: 60, items: [], diagnostics: [String(reads)] } };
    },
  };
}
`);

Deno.test({
  name:
    "headless error transport bounds data-only diagnostics without serializing cycles invoking getters or emitting controls",
  ignore: !available,
  fn: async () => {
    const renderer = await createHeadlessMermaidRenderer({
      executablePath,
      chromiumSandbox: false,
      browserBundle: errorBundle,
    });
    try {
      for (const method of ["parse", "compile"] as const) {
        await assertRejects(() => renderer[method]("cyclic"), Error, "Expected a closing bracket on line 2.");
        await assertRejects(() => renderer[method]("accessor"), Error, "Mermaid operation failed.");
        await assertRejects(() => renderer[method]("revoked"), Error, "Mermaid operation failed.");
        await assertRejects(() => renderer[method]("native"), Error, "EncodingError: Host font decode failed.");
        const control = await assertRejects(() => renderer[method]("control"), Error);
        assert(!control.message.includes(String.fromCharCode(27)));
        assert(!control.message.includes(String.fromCharCode(155)));
        assert(!control.message.includes(String.fromCharCode(13)));
        assert(control.message.includes("Parser\\u000aError"));
        assert(control.message.includes("\\u001b[31m\\u009b0m\\u000d"));
        const large = await assertRejects(() => renderer[method]("large"), Error);
        assert(large.message.includes("[truncated]"));
        assert(!large.message.includes("UNBOUNDED-END-MARKER"));
        assert(large.message.length < 10000);
        assertEquals((await renderer.compile("probe")).scene?.diagnostics, ["0"]);
        assertEquals(renderer.inspect().pending, 0);
      }
    } finally {
      await renderer.dispose();
    }
  },
});
