// Copyright 2026 ubernaut. MIT license.

// The static host bootstrap embeds the Bun operating-system adapter in standalone builds.
import "../../src/runtime/bun_bootstrap.ts";
import { runtimeHost } from "@ubernaut/exotui/runtime";
import { runExomuxCli } from "./main.ts";

if (import.meta.main) {
  const code = await runExomuxCli(runtimeHost.args);
  if (code !== 0) runtimeHost.exit(code);
}
