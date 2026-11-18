// Copyright 2026 ExotUI contributors. MIT license.
import { assertEquals, assertRejects } from "./deps.ts";
import { parseZenUml } from "../src/content/mermaid_zenuml.ts";
import { ZENUML_VALIDATION_WORKER } from "../src/content/mermaid_zenuml_data.ts";
import { MERMAID_ZENUML_FIXTURES } from "./fixtures/mermaid_standard/zenuml.ts";

Deno.test("offline ZenUML worker retains the reviewed grammar payload and complete redistribution notices", async () => {
  const bytes = new TextEncoder().encode(ZENUML_VALIDATION_WORKER);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  assertEquals(hash, "b1a4d9f61e057d483dd479bbb2cccfe216b8d213035e66d55423e60d4b233802");
  assertEquals(bytes.length, 260856);
  assertEquals(ZENUML_VALIDATION_WORKER.includes("Copyright (c) 2022 Peng Xiao"), true);
  assertEquals(ZENUML_VALIDATION_WORKER.includes("Neither the name of the author"), true);
  assertEquals(ZENUML_VALIDATION_WORKER.includes("EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE"), true);
});

Deno.test("isolated official ZenUML grammar accepts all sixteen documented sources without a DOM", async () => {
  for (const fixture of MERMAID_ZENUML_FIXTURES) {
    assertEquals(await parseZenUml(fixture.source.replace(/^\s*zenuml/, "")), { pass: true });
  }
  // Upstream intentionally accepts this; lexer errors are not parser errors.
  assertEquals(await parseZenUml("\nA->\n"), { pass: true });
});

Deno.test("rejected ZenUML parses have independent diagnostics and recover without a retained error list", async () => {
  for (let i = 0; i < 12; i++) {
    const result = await parseZenUml("\nA.foo() {\n");
    assertEquals(result.pass, false);
    assertEquals(result.error?.line, 3);
    assertEquals(result.error?.column, 0);
    assertEquals(result.error?.msg.startsWith("mismatched input '<EOF>'"), true);
  }
  assertEquals(await parseZenUml("A.foo()"), { pass: true });
});

Deno.test("ZenUML validation aborts an owned worker and a subsequent request still works", async () => {
  const controller = new AbortController();
  const pending = parseZenUml("A.foo()", controller.signal);
  controller.abort(new DOMException("Stop private parser", "AbortError"));
  await assertRejects(() => pending, DOMException, "Stop private parser");
  await assertRejects(() => parseZenUml("A.foo()", controller.signal), DOMException, "Stop private parser");
  assertEquals(await parseZenUml("A.foo()"), { pass: true });
});

Deno.test("ZenUML validation preserves the source budget before starting a worker", async () => {
  await assertRejects(() => parseZenUml("a".repeat(128_001)), RangeError, "character budget");
  assertEquals(await parseZenUml("A.foo()"), { pass: true });
});
