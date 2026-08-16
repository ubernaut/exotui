// Copyright 2023 Im-Beast. MIT license.

/**
 * PKG-004: regenerates the machine-readable example registry.
 *
 *   deno run -A scripts/update_example_registry.ts
 */

import { buildExampleRegistry } from "../src/tooling/example_registry.ts";

const examplesDir = new URL("../examples/", import.meta.url);
const examples: { path: string; source: string }[] = [];
for await (const entry of Deno.readDir(examplesDir)) {
  if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
  examples.push({
    path: `examples/${entry.name}`,
    source: await Deno.readTextFile(new URL(entry.name, examplesDir)),
  });
}
const registry = buildExampleRegistry(examples);
await Deno.writeTextFile(
  new URL("../budgets/example_registry.json", import.meta.url),
  JSON.stringify(registry, null, 2) + "\n",
);
console.log(`registry written: ${registry.entries.length} examples`);
