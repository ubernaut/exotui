// Copyright 2023 Im-Beast. MIT license.

/**
 * QAL-008: regenerates the public-API baseline with a migration report.
 *
 *   deno run -A scripts/update_public_api_baseline.ts
 *
 * Prints added/removed exports per entrypoint versus the previous
 * baseline — the migration report a public API change must review —
 * then writes the new baseline.
 */

const ENTRYPOINTS = ["mod.ts", "mod.app.ts", "mod.remote.ts", "mod.testing.ts"];

const baselinePath = new URL("../budgets/public_api.json", import.meta.url);
let previous: Record<string, string[]> = {};
try {
  previous = JSON.parse(await Deno.readTextFile(baselinePath));
} catch {
  console.log("(no previous baseline)");
}

const next: Record<string, string[]> = {};
for (const entrypoint of ENTRYPOINTS) {
  const module = await import(new URL(`../${entrypoint}`, import.meta.url).href);
  next[entrypoint] = Object.keys(module).sort();
  const before = new Set(previous[entrypoint] ?? []);
  const after = new Set(next[entrypoint]);
  const added = next[entrypoint]!.filter((name) => !before.has(name));
  const removed = [...before].filter((name) => !after.has(name));
  if (added.length === 0 && removed.length === 0) {
    console.log(`${entrypoint}: ${next[entrypoint]!.length} exports — unchanged`);
  } else {
    console.log(`${entrypoint}: MIGRATION REPORT`);
    for (const name of added) console.log(`  + ${name}`);
    for (const name of removed) console.log(`  - ${name} (breaking: downstream migration required)`);
  }
}
await Deno.writeTextFile(baselinePath, JSON.stringify(next, null, 2) + "\n");
console.log("baseline written");
