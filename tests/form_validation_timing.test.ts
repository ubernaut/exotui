// Copyright 2023 Im-Beast. MIT license.

// FRM-005: per-field validation timing policies under a fake clock — the
// run journal observes exactly the configured schedule.

import { assertEquals } from "./deps.ts";
import { createFormValidationScheduler, FormController } from "../mod.ts";

interface Values extends Record<string, unknown> {
  name: string;
  email: string;
  bio: string;
  code: string;
}

function fixture() {
  const form = new FormController<Values>([
    { name: "name", initialValue: "" },
    { name: "email", initialValue: "" },
    { name: "bio", initialValue: "" },
    { name: "code", initialValue: "" },
  ]);
  const scheduler = createFormValidationScheduler(form, { idleMs: 300 });
  scheduler.policy("name", "change");
  scheduler.policy("email", "blur");
  scheduler.policy("bio", "idle");
  scheduler.policy("code", "manual");
  return { form, scheduler };
}

Deno.test("change validates every change; blur only on blur; manual only on demand", () => {
  const { scheduler } = fixture();
  scheduler.onChange("name", 10);
  scheduler.onChange("name", 20);
  scheduler.onChange("email", 30); // blur policy: no run
  scheduler.onBlur("email", 40);
  scheduler.onChange("code", 50); // manual policy: no run
  scheduler.onBlur("code", 60); // still nothing
  scheduler.validateNow("code", 70);

  assertEquals(scheduler.runs(), [
    { field: "name", trigger: "change", at: 10 },
    { field: "name", trigger: "change", at: 20 },
    { field: "email", trigger: "blur", at: 40 },
    { field: "code", trigger: "manual", at: 70 },
  ]);
});

Deno.test("idle fires once after the pause; each change resets the deadline", () => {
  const { scheduler } = fixture();
  scheduler.onChange("bio", 100);
  scheduler.advance(300); // 200ms in: not yet
  assertEquals(scheduler.runs(), []);
  scheduler.onChange("bio", 350); // deadline moves to 650
  scheduler.advance(500); // old deadline (400) must not fire
  assertEquals(scheduler.runs(), []);
  scheduler.advance(650);
  assertEquals(scheduler.runs(), [{ field: "bio", trigger: "idle", at: 650 }]);
  scheduler.advance(1000); // no re-fire
  assertEquals(scheduler.runs().length, 1);

  // Blur ends the pause with intent: the pending idle validates immediately.
  scheduler.onChange("bio", 1100);
  scheduler.onBlur("bio", 1150);
  assertEquals(scheduler.runs().at(-1), { field: "bio", trigger: "idle", at: 1150 });
  assertEquals(scheduler.inspect().pendingIdle, 0);
});

Deno.test("submit validates everything except manual fields and clears idle deadlines", () => {
  const { scheduler } = fixture();
  scheduler.onChange("bio", 10); // arms idle
  scheduler.onSubmit(50);
  const fields = scheduler.runs().map((run) => `${run.field}:${run.trigger}`).sort();
  assertEquals(fields, ["bio:submit", "email:submit", "name:submit"]);
  assertEquals(scheduler.inspect().pendingIdle, 0);
  scheduler.advance(1000); // the armed idle was cleared by submit
  assertEquals(scheduler.runs().length, 3);
});
