// Copyright 2023 Im-Beast. MIT license.

// LOC-003: MessageFormat 2 — selectors with plural categories and exact
// keys, local variables, stable parts, and custom functions that fail at
// compile time when unregistered.

import { assert, assertEquals, assertThrows } from "./deps.ts";
import { compileMessageFormat, createMessageFormatFunctionRegistry, createUnicodeLocaleContext } from "../mod.ts";

const en = createUnicodeLocaleContext({ requested: ["en"], supported: ["en"] });

Deno.test("simple messages interpolate variables and literals with escapes", () => {
  const message = compileMessageFormat("Hello, {$name}! Score: {|42|}. Brace: \\{literal\\}", en);
  assertEquals(message.format({ name: "cos" }), "Hello, cos! Score: 42. Brace: {literal}");
  assertEquals(message.formatToParts({ name: "cos" })[1], { type: "value", value: "cos", source: "name" });
});

Deno.test("matchers select by exact key first, then plural category, then star", () => {
  const message = compileMessageFormat(
    `.input {$count :number}
.match $count
0   {{No items}}
one {{One item}}
*   {{{$count} items}}`,
    en,
  );
  assertEquals(message.format({ count: 0 }), "No items"); // exact beats plural
  assertEquals(message.format({ count: 1 }), "One item"); // plural category "one"
  assertEquals(message.format({ count: 5 }), "5 items"); // star fallback
});

Deno.test("local variables derive values and annotations carry through", () => {
  const message = compileMessageFormat(
    `.input {$rate :number style=percent}
.local $label = {$rate :string}
{{Completion: {$rate} ({$label})}}`,
    en,
  );
  const text = message.format({ rate: 0.5 });
  assert(text.startsWith("Completion: 50%"), text);
});

Deno.test("unregistered functions fail at compile time; custom ones register safely", () => {
  assertThrows(
    () => compileMessageFormat("Value: {$x :sparkle}", en),
    Error,
    "unknown function :sparkle",
  );

  const registry = createMessageFormatFunctionRegistry();
  registry.register("upper", (input) => {
    const text = String(input ?? "").toUpperCase();
    return { value: text, formatted: text, selectionKeys: [text] };
  });
  const message = compileMessageFormat("Shout: {$word :upper}", en, registry);
  assertEquals(message.format({ word: "quiet" }), "Shout: QUIET");

  // Built-ins cannot be replaced, and match without a star fallback rejects.
  assertThrows(() => registry.register("number", () => ({ value: 0, formatted: "", selectionKeys: [] })));
  assertThrows(
    () =>
      compileMessageFormat(
        `.input {$n :number}
.match $n
one {{x}}`,
        en,
      ),
    Error,
    "fallback",
  );
});

Deno.test("multi-selector matches weigh selectors left to right", () => {
  const message = compileMessageFormat(
    `.input {$photos :number}
.input {$people :number}
.match $photos $people
one one {{One photo of one person}}
one *   {{One photo of {$people} people}}
*   one {{{$photos} photos of one person}}
*   *   {{{$photos} photos of {$people} people}}`,
    en,
  );
  assertEquals(message.format({ photos: 1, people: 1 }), "One photo of one person");
  assertEquals(message.format({ photos: 1, people: 3 }), "One photo of 3 people");
  assertEquals(message.format({ photos: 4, people: 1 }), "4 photos of one person");
  assertEquals(message.format({ photos: 4, people: 4 }), "4 photos of 4 people");
});
