// Copyright 2026 ubernaut. MIT license.
import { createBunHost } from "./bun_host.ts";
import type { RuntimeHost } from "./host_types.ts";

// Static initialization entrypoint for Bun's single-file compiler.
const globals = globalThis as typeof globalThis & { __exotuiRuntimeHost?: RuntimeHost };
globals.__exotuiRuntimeHost ??= createBunHost();
