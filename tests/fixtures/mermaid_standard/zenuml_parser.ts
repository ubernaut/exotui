// Copyright 2026 ExotUI contributors. MIT license.
import { createMermaidStandardRenderer } from "../../../mod.mermaid.ts";
import { parseZenUml } from "../../../src/content/mermaid_zenuml.ts";
import { MERMAID_ZENUML_FIXTURES } from "./zenuml.ts";

/** Test-only access to the public SDK method, never its private parser state. */
export async function officialZenUmlParse() {
  const { default: core } = await import("@zenuml/core");
  return (core as unknown as {
    prototype: {
      parse(source: string): Promise<{
        pass: boolean;
        errorDetails: { line: number; column: number; msg: string }[];
      }>;
    };
  }).prototype.parse;
}

/** Compare the isolated exact grammar with actual SDK acceptance and first diagnostics. */
export async function verifyZenUmlGrammarParity() {
  const official = await officialZenUmlParse();
  const documented = MERMAID_ZENUML_FIXTURES.map((fixture) => fixture.source.replace(/^\s*zenuml/, ""));
  const probes = [
    "",
    "A->",
    "A->B: Message",
    "A.foo()",
    "A.foo() {",
    "A.foo() }",
    'A.foo("unterminated)',
    "A.foo() { B.bar()",
    "if(ok) { A.foo() } else { B.bar() }",
    "A.foo() {\n// comment\n}",
    "@return A->B: Message",
    "A.foo() {\nreturn value\n}",
    "A->B: 😀 世界",
    "A.foo()\n\u0000",
    "A.foo()\n§",
    "A.foo()\n\ud800",
    "A.foo()\n\udc00",
    "A.foo() {\nB.bar() } }",
    "par { A.foo() }",
    "try { A.foo() } catch (e) { B.bar() }",
    "title A diagram\nA->B: Message",
    "A->B: one\nB->C: two",
    "@Actor User\nUser->Service: Message",
    ...documented.map((source) => source + "\n}"),
    ...documented.map((source) => source + "\nA.foo() {"),
  ];
  let accepted = 0, rejected = 0;
  for (const source of [...documented, ...probes]) {
    const expected = await official(source), actual = await parseZenUml(source);
    if (actual.pass !== expected.pass || JSON.stringify(actual.error) !== JSON.stringify(expected.errorDetails[0])) {
      throw new Error(
        `ZenUML grammar parity failed for ${JSON.stringify(source.slice(0, 120))}: ${
          JSON.stringify({ expected, actual })
        }`,
      );
    }
    if (actual.pass) accepted++;
    else rejected++;
  }
  return { documented: documented.length, cases: documented.length + probes.length, accepted, rejected };
}

/** The browser driver independently observes SDK Errors and actual worker closure. */
export async function verifyZenUmlParserLifetime() {
  const renderer = await createMermaidStandardRenderer();
  let rejected = 0;
  try {
    for (let i = 0; i < 20; i++) {
      try {
        await renderer.parse("zenuml\nA.foo() {");
      } catch (error) {
        if (!String(error).includes("mismatched input '<EOF>'")) throw error;
        rejected++;
      }
    }
    if (rejected !== 20) throw new Error("A malformed request was accepted.");
    const recovered = await renderer.parse("zenuml\nA.foo()");
    // Successful validation alone is cached: neither failures nor parser ASTs.
    if (await renderer.parse("zenuml\nA.foo()") !== recovered) throw new Error("Valid parse cache changed acceptance.");
    return { rejected, recovered };
  } finally {
    renderer.dispose();
  }
}

let cancel: (() => void) | undefined;

/** The private driver pauses the real worker at startup, then cancels or disposes. */
export async function verifyZenUmlActiveCancellation(dispose: boolean) {
  const renderer = await createMermaidStandardRenderer(), controller = new AbortController();
  const reason = new DOMException("Cancel active ZenUML parser", "AbortError");
  cancel = () => dispose ? renderer.dispose() : controller.abort(reason);
  try {
    try {
      await renderer.parse(`zenuml\nA.cancellation${dispose ? "Dispose" : "Abort"}()`, { signal: controller.signal });
      throw new Error("Paused parser unexpectedly completed.");
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") throw error;
      if (!dispose && error !== reason) throw new Error("Caller abort reason was replaced.");
    }
    return { dispose, cancelled: true };
  } finally {
    cancel = undefined;
    renderer.dispose();
  }
}

/** Test-owned module state only; not an application global callback or source capability. */
export function cancelActiveZenUmlParser() {
  if (!cancel) throw new Error("No active test-owned parse to cancel.");
  cancel();
}

/** Separate from the paused-worker check so the driver can restore normal startup first. */
export async function verifyZenUmlRecovery() {
  const renderer = await createMermaidStandardRenderer();
  try {
    if (await renderer.parse("zenuml\nA.foo()") !== "zenuml") {
      throw new Error("Cancellation poisoned the shared runtime.");
    }
    return true;
  } finally {
    renderer.dispose();
  }
}

/** The driver independently counts workers for successful cache hits and eviction. */
export async function verifyZenUmlValidCacheBound() {
  const renderer = await createMermaidStandardRenderer();
  const source = (index: number) => `zenuml\nA.cache${index}()`;
  try {
    for (let i = 0; i < 11; i++) {
      if (await renderer.parse(source(i)) !== "zenuml") throw new Error("Cache source was not accepted.");
    }
    await renderer.parse(source(10));
    await renderer.parse(source(0));
    await renderer.parse(source(10));
    return { successfulEntries: 10, expectedWorkers: 12 };
  } finally {
    renderer.dispose();
  }
}

/** CDP holds a real worker at startup until the production thirty-second timeout. */
export async function verifyZenUmlTimeout() {
  const renderer = await createMermaidStandardRenderer();
  try {
    try {
      await renderer.parse("zenuml\nA.pausedTimeout()");
      throw new Error("Paused parser unexpectedly completed.");
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "TimeoutError") throw error;
      return { timedOut: true };
    }
  } finally {
    renderer.dispose();
  }
}

/** Forwarding spies in a private test realm preserve native methods and borrowed URLs. */
export async function verifyZenUmlUrlOwnership(denied: boolean) {
  const create = Object.getOwnPropertyDescriptor(URL, "createObjectURL")!;
  const revoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL")!;
  const borrowed = URL.createObjectURL(new Blob(["borrowed host data"]));
  const created: string[] = [], revoked: string[] = [];
  Object.defineProperty(URL, "createObjectURL", {
    ...create,
    value: (blob: Blob) => {
      const url = create.value.call(URL, blob);
      created.push(url);
      return url;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    ...revoke,
    value: (url: string) => {
      revoked.push(url);
      revoke.value.call(URL, url);
    },
  });
  try {
    if (denied) {
      try {
        await parseZenUml("A.foo()");
        throw new Error("Denied worker capability unexpectedly succeeded.");
      } catch (error) {
        // Chromium reports CSP blocking asynchronously with a plain Event;
        // other hosts can throw SecurityError during worker construction.
        if (
          !(error instanceof DOMException && error.name === "SecurityError") &&
          !(error instanceof Error && error.message ===
              "ZenUML validation worker could not start; check module-worker and blob: CSP permissions.")
        ) throw error;
      }
    } else {
      await parseZenUml("A.foo()");
      await parseZenUml("A.foo() {");
      const controller = new AbortController(), pending = parseZenUml("A.foo()", controller.signal);
      controller.abort(new DOMException("Owned URL abort", "AbortError"));
      try {
        await pending;
        throw new Error("Aborted parser unexpectedly succeeded.");
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "AbortError") throw error;
      }
    }
    if (created.length !== (denied ? 1 : 3) || JSON.stringify(created) !== JSON.stringify(revoked)) {
      throw new Error("Owned parser script URLs were not released exactly once.");
    }
    for (const url of created) {
      let released = false;
      try {
        await fetch(url);
      } catch {
        released = true;
      }
      if (!released) throw new Error("Revoked worker URL remains readable.");
    }
    if (await (await fetch(borrowed)).text() !== "borrowed host data") {
      throw new Error("Borrowed host URL was revoked.");
    }
    return { denied, created: created.length, revoked: revoked.length, borrowedPreserved: true };
  } finally {
    Object.defineProperty(URL, "createObjectURL", create);
    Object.defineProperty(URL, "revokeObjectURL", revoke);
    revoke.value.call(URL, borrowed);
  }
}
