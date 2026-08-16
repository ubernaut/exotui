// Copyright 2023 Im-Beast. MIT license.

// ASY-009: task-local context follows awaited work, layers immutably, and
// never leaks into sibling tasks.

import { assert, assertEquals } from "./deps.ts";
import { createTaskContext } from "../mod.ts";

Deno.test("context follows awaits and nested runs layer immutably", async () => {
  const context = createTaskContext();
  assertEquals(context.current(), {});

  await context.run({ trace: "t1", locale: "en" }, async () => {
    await Promise.resolve();
    assertEquals(context.get("trace"), "t1");
    await context.run({ locale: "de" }, async () => {
      await Promise.resolve();
      // Inner layer overrides locale, inherits trace.
      assertEquals(context.current(), { trace: "t1", locale: "de" });
      assert(Object.isFrozen(context.current()));
    });
    // The outer layer is restored after the inner run.
    assertEquals(context.get("locale"), "en");
  });
  assertEquals(context.current(), {}); // nothing survives outside
});

Deno.test("sibling tasks each keep their own context", async () => {
  const context = createTaskContext();
  const observed: string[] = [];
  const task = (trace: string, delayTicks: number) =>
    context.run({ trace }, async () => {
      for (let tick = 0; tick < delayTicks; tick += 1) await Promise.resolve();
      observed.push(`${trace}=${context.get("trace")}`);
    });

  await Promise.all([task("alpha", 3), task("beta", 1), task("gamma", 2)]);
  assertEquals(observed.sort(), ["alpha=alpha", "beta=beta", "gamma=gamma"]);
  assertEquals(context.current(), {}); // and nothing leaked out
});
