// Copyright 2023 Im-Beast. MIT license.

// C1 hot reload: candidates apply atomically, malformed sources reject with
// diagnostics and keep the last-known-good, and the file watcher offers
// settled changes through injectable IO (036 C1).

import { assert, assertEquals } from "./deps.ts";
import {
  MarkupHotReloadController,
  type MarkupHotReloadResult,
  validateMarkupHotReloadSource,
  watchMarkupHotReload,
} from "../mod.ts";

const GOOD = { markup: `<window id="main"><panel id="a">A</panel></window>`, css: `#main { width: 10; }` };

Deno.test("C1 hot reload applies good candidates and versions them", () => {
  const applied: number[] = [];
  const controller = new MarkupHotReloadController({
    initial: GOOD,
    onApply: (_source, version) => applied.push(version),
  });
  assertEquals(controller.current().version, 1);
  const result = controller.offer({ ...GOOD, css: `#main { width: 24; }` });
  assertEquals(result.status, "applied");
  assertEquals(result.diagnostics, []);
  assertEquals(controller.current().version, 2);
  assertEquals(controller.current().css, `#main { width: 24; }`);
  assertEquals(applied, [2]);
});

Deno.test("C1 hot reload rejects malformed sources and keeps last-known-good", () => {
  const controller = new MarkupHotReloadController({ initial: GOOD });
  const unclosed = controller.offer({ markup: `<window id="main"><panel>`, css: GOOD.css });
  assertEquals(unclosed.status, "rejected");
  assert(unclosed.diagnostics.some((d) => d.code === "unbalanced-tag"));
  const stray = controller.offer({ markup: `<window></window></panel>`, css: GOOD.css });
  assert(stray.diagnostics.some((d) => d.code === "stray-close"));
  const braces = controller.offer({ markup: GOOD.markup, css: `#main { width: 10;` });
  assert(braces.diagnostics.some((d) => d.code === "unbalanced-braces"));
  // Nothing was destroyed: the live sources and version are the originals.
  assertEquals(controller.current().version, 1);
  assertEquals(controller.current().markup, GOOD.markup);
  assertEquals(controller.inspect().rejected, 3);
  assertEquals(controller.inspect().applied, 0);
  // Warnings apply but are reported.
  const warned = controller.offer({ markup: GOOD.markup, css: `just words, no rules` });
  assertEquals(warned.status, "applied");
  assert(warned.diagnostics.some((d) => d.code === "no-rules" && d.severity === "warning"));
});

Deno.test("C1 hot reload validator handles void and self-closing tags", () => {
  assertEquals(validateMarkupHotReloadSource({ markup: `<window><br><input><panel/></window>`, css: "" }), []);
});

Deno.test("C1 hot reload watcher offers settled changes and surfaces read failures", async () => {
  const files = new Map<string, string>([
    ["/ui.html", GOOD.markup],
    ["/ui.css", GOOD.css],
  ]);
  let notify: (() => void) | undefined;
  const events: Array<{ paths: string[] }> = [];
  const io = {
    readTextFile: (path: string) => {
      const value = files.get(path);
      return value === undefined ? Promise.reject(new Error(`missing ${path}`)) : Promise.resolve(value);
    },
    watch: (_paths: readonly string[]) => ({
      async *[Symbol.asyncIterator]() {
        while (true) {
          if (events.length === 0) await new Promise<void>((resolve) => notify = resolve);
          const event = events.shift();
          if (!event) return;
          yield event;
        }
      },
    }),
  };
  const results: MarkupHotReloadResult[] = [];
  const controller = new MarkupHotReloadController({ initial: GOOD });
  const abort = new AbortController();
  const done = watchMarkupHotReload(controller, {
    markupPath: "/ui.html",
    cssPaths: ["/ui.css"],
    io,
    debounceMs: 0,
    signal: abort.signal,
    onResult: (result) => results.push(result),
  });

  const emit = async (event: { paths: string[] }) => {
    events.push(event);
    notify?.();
    notify = undefined;
    for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  };

  files.set("/ui.css", `#main { width: 30; }`);
  await emit({ paths: ["/ui.css"] });
  assertEquals(results.at(-1)?.status, "applied");
  assertEquals(controller.current().css, [`#main { width: 30; }`]);

  files.delete("/ui.css");
  await emit({ paths: ["/ui.css"] });
  assertEquals(results.at(-1)?.status, "rejected");
  assert(results.at(-1)!.diagnostics.some((d) => d.code === "read-failed"));
  assertEquals(controller.current().css, [`#main { width: 30; }`], "live sources survive a read failure");

  abort.abort();
  await emit({ paths: ["/ui.css"] });
  await done;
});
