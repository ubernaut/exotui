// Copyright 2023 Im-Beast. MIT license.

// OBS-001: the OTel-shaped boundary defaults to a true no-op — no side
// effects from importing or calling — and providers install/uninstall
// explicitly with call sites never branching on presence.

import { assert, assertEquals } from "./deps.ts";
import {
  installObservabilityProvider,
  NOOP_OBSERVABILITY,
  observabilityInstalled,
  observabilityLogger,
  observabilityMeter,
  type ObservabilityProvider,
  observabilityTracer,
} from "../mod.ts";

Deno.test("the default is a frozen no-op: calls cost nothing and change nothing", () => {
  assert(!observabilityInstalled());
  const span = observabilityTracer().startSpan("frame", { renderer: "terminal" });
  span.setAttribute("cells", 1024);
  span.addEvent("diff");
  span.setStatus("ok");
  span.end();
  observabilityMeter().counter("frames", "1").add(1);
  observabilityMeter().histogram("frame_ms", "ms").record(16.6);
  observabilityMeter().gauge("queue_depth").set(3);
  observabilityLogger().emit({ severity: "info", event: "started" });
  assert(Object.isFrozen(NOOP_OBSERVABILITY));
  assert(!observabilityInstalled()); // still nothing installed
});

Deno.test("providers install and uninstall; instrumentation never branches", () => {
  const events: string[] = [];
  const provider: ObservabilityProvider = {
    tracer: {
      startSpan: (name) => ({
        setAttribute: (key, value) => events.push(`attr ${name}.${key}=${value}`),
        addEvent: (event) => events.push(`event ${name}.${event}`),
        setStatus: (status) => events.push(`status ${name}=${status}`),
        end: () => events.push(`end ${name}`),
      }),
    },
    meter: {
      counter: (name) => ({ add: (value) => events.push(`count ${name}+${value}`) }),
      histogram: (name) => ({ record: (value) => events.push(`hist ${name}=${value}`) }),
      gauge: (name) => ({ set: (value) => events.push(`gauge ${name}=${value}`) }),
    },
    logger: { emit: (record) => events.push(`log ${record.severity}:${record.event}`) },
  };

  const uninstall = installObservabilityProvider(provider);
  assert(observabilityInstalled());
  const span = observabilityTracer().startSpan("action");
  span.setAttribute("id", "save");
  span.end();
  observabilityMeter().counter("errors").add(2);
  observabilityLogger().emit({ severity: "warn", event: "slow-frame" });
  assertEquals(events, ["attr action.id=save", "end action", "count errors+2", "log warn:slow-frame"]);

  uninstall();
  assert(!observabilityInstalled());
  observabilityTracer().startSpan("after").end(); // back to the no-op
  assertEquals(events.length, 4);
});
