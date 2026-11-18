// Copyright 2026 ubernaut. MIT license.
import type { RuntimeHost } from "./host_types.ts";

const globals = globalThis as typeof globalThis & { Deno?: unknown; Bun?: unknown; __exotuiRuntimeHost?: RuntimeHost };
// The variable specifier keeps native Node/Bun dependencies out of browser bundles.
const bunHostModule = "./bun_host.ts";

/** Operating-system services for the current Deno or Bun process. Undefined in browser hosts. */
export const runtimeHost: RuntimeHost = globals.__exotuiRuntimeHost ??
  (globals.Deno && !globals.Bun
    ? new Proxy(globals.Deno as object, {
      get(target, key) {
        return key === "runtime" ? "deno" : Reflect.get(target, key);
      },
      set(target, key, value) {
        return Reflect.set(target, key, value);
      },
    }) as RuntimeHost
    : globals.Bun
    ? (await import(bunHostModule)).createBunHost()
    : undefined as unknown as RuntimeHost);

export type * from "./host_types.ts";
