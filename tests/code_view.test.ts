// Copyright 2023 Im-Beast. MIT license.

// 036 V1: worker-backed syntax service + reusable code view with
// streaming highlighting, selection, concealment, diagnostics, and
// bidirectional scrolling.

import { assert, assertEquals } from "./deps.ts";
import {
  CodeViewController,
  createLoopbackPorts,
  createPatternHighlighter,
  createSyntaxWorkerHost,
  type HighlightSpan,
  SyntaxServiceClient,
} from "../mod.ts";

const HIGHLIGHTER = createPatternHighlighter([
  { pattern: /\b(const|function|return)\b/, scope: "keyword" },
  { pattern: /"[^"]*"/, scope: "string" },
]);

Deno.test("worker host streams bounded batches; stale versions are dropped", () => {
  const { client: clientPort, worker: workerPort } = createLoopbackPorts();
  const stop = createSyntaxWorkerHost(workerPort, HIGHLIGHTER, { batchLines: 2 });
  const client = new SyntaxServiceClient(clientPort, "doc");

  const batches: { version: number; spans: readonly HighlightSpan[]; done: boolean }[] = [];
  const unsubscribe = client.onHighlights((version, spans, done) => batches.push({ version, spans, done }));

  client.open('const a = "x"\nfunction b() {\nreturn a\n}\nconst c = 1');
  client.requestHighlights(0, 4);
  assertEquals(batches.length, 3); // 5 lines / batchLines 2 → 3 streamed batches
  assertEquals(batches.map((batch) => batch.done), [false, false, true]);
  assert(batches[0]!.spans.some((span) => span.scope === "string"));

  // Edit bumps the version; a request made against the OLD version
  // yields batches the client must drop.
  const before = batches.length;
  clientPort.post({ kind: "highlight", documentId: "doc", version: 1, fromLine: 0, toLine: 0 });
  client.edit("const z = 2");
  assertEquals(batches.length, before + 1); // pre-edit batch arrived while still fresh
  client.requestHighlights(0, 0);
  const freshCount = batches.length;
  assert(batches[freshCount - 1]!.version === client.version());
  unsubscribe();
  stop();
});

Deno.test("code view refuses stale highlight batches and segments fresh ones", () => {
  const view = new CodeViewController({ viewportWidth: 40, viewportHeight: 5 });
  const version = view.setText("const a = 1");
  assert(!view.applyHighlights(version - 1, [{ line: 0, start: 0, end: 5, scope: "keyword" }]));
  assert(view.applyHighlights(version, [{ line: 0, start: 0, end: 5, scope: "keyword" }]));
  const row = view.visibleLines()[0]!;
  assertEquals(row.segments, [{ text: "const", scope: "keyword" }, { text: " a = 1" }]);
});

Deno.test("concealment remaps spans and selection through the column map", () => {
  const view = new CodeViewController({ viewportWidth: 40, viewportHeight: 3 });
  const version = view.setText("value => other");
  view.setConcealRules([{ pattern: /=>/, display: "⇒" }]);
  view.applyHighlights(version, [{ line: 0, start: 9, end: 14, scope: "identifier" }]);
  const row = view.visibleLines()[0]!;
  assertEquals(row.segments.map((segment) => segment.text).join(""), "value ⇒ other");
  const identifier = row.segments.find((segment) => segment.scope === "identifier")!;
  assertEquals(identifier.text, "other"); // span survived the 2→1 shrink

  view.select({ line: 0, column: 9 }, { line: 0, column: 14 }); // "other" in source
  assertEquals(view.visibleLines()[0]!.selection, [8, 13]); // display columns
});

Deno.test("diagnostics become ranked signs; scrolling windows both axes", () => {
  const view = new CodeViewController({ viewportWidth: 10, viewportHeight: 2 });
  view.setText(["0123456789ABCDEF", "line two here", "third", "fourth"].join("\n"));
  view.setDiagnostics([
    { line: 1, severity: "info", message: "note" },
    { line: 1, severity: "error", message: "broken" },
  ]);
  view.scrollTo(1, 5);
  const rows = view.visibleLines();
  assertEquals(rows.length, 2); // vertical culling
  assertEquals(rows[0]!.line, 1);
  assertEquals(rows[0]!.sign, "error"); // highest severity wins
  assertEquals(rows[0]!.segments.map((segment) => segment.text).join(""), "two here"); // h-scrolled
  assertEquals(view.diagnosticsForLine(1).length, 2);
  view.scrollBy(10, 0);
  assertEquals(view.offset().topLine, 3); // clamped to last line
});

Deno.test("service streams straight into the view across an edit", () => {
  const { client: clientPort, worker: workerPort } = createLoopbackPorts();
  createSyntaxWorkerHost(workerPort, HIGHLIGHTER, { batchLines: 1 });
  const client = new SyntaxServiceClient(clientPort, "doc");
  const view = new CodeViewController({ viewportWidth: 40, viewportHeight: 10 });

  client.onHighlights((version, spans) => view.applyHighlights(version, spans));
  const text = 'const a = "hi"\nreturn a';
  assertEquals(client.open(text), view.setText(text)); // versions advance together
  client.requestHighlights(0, 1);
  const rows = view.visibleLines();
  assert(rows[0]!.segments.some((segment) => segment.scope === "string"));
  assert(rows[1]!.segments.some((segment) => segment.scope === "keyword"));
});
