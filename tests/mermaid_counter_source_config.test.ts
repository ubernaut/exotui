// Copyright 2023 Im-Beast. MIT license.
import { assert, assertEquals, assertRejects, assertThrows } from "./deps.ts";
import {
  counterThemeDirective,
  preserveMermaidCounterSourceConfig,
} from "../src/content/mermaid_counter_source_config.ts";
import type { MermaidStandardRuntime } from "../mod.mermaid.ts";

Deno.test("preserved theme directives retain arbitrary CSS text without injecting grammar or extra settings", () => {
  const source = "---\nconfig:\n  theme: dark\n---\nflowchart LR\nA[Original]";
  const css = '.generated::before{content:"apostrophe\' }%% <tag> % \\ \u2028\u2029"}';
  const result = counterThemeDirective(source, "original", css);
  assert(result.startsWith(source + "\n%%{init:"));
  const json = result.slice(source.length + "\n%%{init:".length, -"}%%\n".length);
  assertEquals(JSON.parse(json), { themeCSS: css });
  assert(!/[<>'%\u2028\u2029]/.test(json));
  assertEquals(counterThemeDirective(source, css, css), source);
});

Deno.test("source configuration uses sanitized effective CSS rather than raw returned configuration", async () => {
  let parsed = 0;
  const runtime: MermaidStandardRuntime = {
    initialize() {},
    parse(source) {
      assertEquals(source, "original");
      parsed++;
      return Promise.resolve({ diagramType: "flowchart", config: { themeCSS: '.bad{content:counters(secret,"")}' } });
    },
    render() {
      throw new Error("No DOM in pure test.");
    },
    getRegisteredDiagramsMetadata: () => [],
    mermaidAPI: {
      getDiagramFromText: () => Promise.resolve({}),
      getConfig: () => ({ themeCSS: '.allowed{content:counters(probe,"")!important}' }),
    },
  };
  const result = await preserveMermaidCounterSourceConfig(
    runtime,
    "original",
    () => ({ valid: true, important: true }),
    new AbortController().signal,
  );
  assertEquals(parsed, 1);
  assert(result.includes("probe"));
  assert(!result.includes("secret"));
  const json = result.slice("original\n%%{init:".length, -"}%%\n".length);
  const css = JSON.parse(json).themeCSS;
  assert(css.includes("content:var(--exotui-preserved-counter-"));
  assert(css.includes("!important"));
});

Deno.test("custom runtimes without effective configuration retain exact source and existing behavior", async () => {
  const runtime: MermaidStandardRuntime = {
    initialize() {},
    parse() {
      throw new Error("Unsupported effective configuration must not be guessed.");
    },
    render() {
      throw new Error("No DOM in pure test.");
    },
    getRegisteredDiagramsMetadata: () => [],
  };
  assertEquals(
    await preserveMermaidCounterSourceConfig(
      runtime,
      "original",
      () => ({ valid: true, important: false }),
      new AbortController().signal,
    ),
    "original",
  );
});

Deno.test("source preflight preserves failures and aborts without reading or restoring rejected raw metadata", async () => {
  const controller = new AbortController();
  let result: false | { diagramType: string } = false;
  let abort = false;
  let reads = 0;
  const runtime: MermaidStandardRuntime = {
    initialize() {},
    parse() {
      if (abort) controller.abort();
      return Promise.resolve(result);
    },
    render() {
      throw new Error("No DOM in pure test.");
    },
    getRegisteredDiagramsMetadata: () => [],
    mermaidAPI: {
      getDiagramFromText: () => Promise.resolve({}),
      getConfig() {
        reads++;
        return {};
      },
    },
  };
  const validate = () => ({ valid: true, important: false });
  await assertRejects(
    () => preserveMermaidCounterSourceConfig(runtime, "bad", validate, controller.signal),
    SyntaxError,
  );
  assertEquals(reads, 0);
  result = { diagramType: "flowchart" };
  assertEquals(await preserveMermaidCounterSourceConfig(runtime, "valid", validate, controller.signal), "valid");
  assertEquals(reads, 1);
  abort = true;
  await assertRejects(
    () => preserveMermaidCounterSourceConfig(runtime, "abort", validate, controller.signal),
    DOMException,
  );
  assertEquals(reads, 1);
});

Deno.test("preserved source encoding has independent source, CSS and output budgets with fresh recovery", () => {
  assertThrows(() => counterThemeDirective("x".repeat(128_001), "", "changed"), RangeError);
  assertThrows(() => counterThemeDirective("source", "", "x".repeat(2_097_153)), RangeError);
  assertThrows(() => counterThemeDirective("source", "", "%".repeat(700_000)), RangeError);
  assertEquals(counterThemeDirective("source", "same", "same"), "source");
  assert(counterThemeDirective("source", "old", "new").includes('"themeCSS":"new"'));
});
