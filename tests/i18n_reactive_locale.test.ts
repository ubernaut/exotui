// Copyright 2023 Im-Beast. MIT license.

// LOC-006: one locale switch is one coherent transaction — the whole world
// (context, formatters, messages, revision) swaps in a single signal update
// with tracked namespaces preloaded before commit, and widget state is
// untouched.

import { assert, assertEquals } from "./deps.ts";
import { createReactiveLocaleService, Effect, FormController, type MessageBundleChunk } from "../mod.ts";

const CHUNKS: Record<string, MessageBundleChunk> = {
  "app de": { namespace: "app", locale: "de", version: "1.0", messages: { save: "Speichern" } },
  "app en": { namespace: "app", locale: "en", version: "1.0", messages: { save: "Save" } },
};

function service(
  loader: (
    namespace: string,
    locale: string,
  ) => MessageBundleChunk | undefined | Promise<MessageBundleChunk | undefined> = (namespace, locale) =>
    CHUNKS[`${namespace} ${locale}`],
) {
  return createReactiveLocaleService({ requested: ["en"], supported: ["en", "de"], loader });
}

Deno.test("a switch swaps the whole world in exactly one observable update", async () => {
  const locale = service();
  await locale.trackNamespace("app");
  assertEquals(locale.messages.resolve("app", "save").value, "Save");

  let observed = 0;
  let coherent = true;
  const effect = new Effect(() => {
    const world = locale.world.value;
    // Every observation must be internally consistent: revision 1 implies
    // the German context AND the German messages together.
    if (world.revision === 1) {
      if (world.context.resolve().resolved !== "de") coherent = false;
      if (world.messages.resolve("app", "save").value !== "Speichern") coherent = false;
    }
    observed += 1;
  });
  await Promise.resolve(); // dependency tracking settles

  const report = await locale.switchLocale({ requested: ["de"], supported: ["en", "de"] });
  await Promise.resolve();
  assertEquals(report, { previous: "en", resolved: "de", revision: 1, namespacesLoaded: ["app"] });
  assertEquals(locale.messages.resolve("app", "save").value, "Speichern");
  assert(coherent, "the effect saw a half-switched world");
  assertEquals(observed, 2); // the tracking run plus exactly one swap
  effect.dispose();
});

Deno.test("widget state survives; a switch during a switch is refused", async () => {
  // A deferred loader keeps the first transaction genuinely in flight.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => release = resolve);
  const locale = service(async (namespace, localeTag) => {
    await gate;
    return CHUNKS[`${namespace} ${localeTag}`];
  });
  release(); // initial trackNamespace load may proceed
  await locale.trackNamespace("app");

  const form = new FormController<{ name: string }>([{ name: "name", initialValue: "collin" }]);
  form.setValue("name", "cos");
  const focusToken = { focused: "name-input", selection: { start: 1, end: 2 } };

  const first = locale.switchLocale({ requested: ["de"], supported: ["en", "de"] });
  const second = await locale.switchLocale({ requested: ["en"], supported: ["en", "de"] });
  assertEquals(second, undefined); // refused while the first is in flight
  const report = await first;
  assertEquals(report?.resolved, "de");

  assertEquals(form.values.peek().name, "cos");
  assertEquals(focusToken, { focused: "name-input", selection: { start: 1, end: 2 } });
  assertEquals(locale.inspect(), { resolved: "de", revision: 1, namespaces: ["app"] });
});
