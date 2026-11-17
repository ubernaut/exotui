// Copyright 2023 Im-Beast. MIT license.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { assert, assertEquals } from "./deps.ts";
import { MERMAID_FLOW_SHAPES } from "./fixtures/mermaid_standard/flow_features.ts";
import { runtimeHost } from "../src/runtime/host.ts";

Deno.test("flow feature inventory matches every general-purpose shape/alias in the pinned official engine", async () => {
  const metadata = runtimeHost.runtime === "bun"
    ? createRequire(import.meta.url).resolve("mermaid/package.json")
    : (await import("node:module")).findPackageJSON("mermaid", import.meta.url);
  assert(metadata, "Pinned Mermaid package metadata unavailable");
  const packageInfo = JSON.parse(Deno.readTextFileSync(metadata));
  assertEquals(packageInfo.version, "12.1.0");
  // The installed release's declaration is an authoritative literal tuple, not
  // a network request or the renderer's own catalogue describing itself.
  const declaration = Deno.readTextFileSync(
    resolve(dirname(metadata), "dist/rendering-util/rendering-elements/shapes.d.ts"),
  );
  const start = declaration.indexOf("export declare const shapesDefs:");
  const end = declaration.indexOf("}];", start);
  assert(start >= 0 && end > start, "Official registry tuple missing");
  const expected = declaration.slice(start, end).split(/}, \{/).map((block) => {
    const name = block.match(/readonly shortName: "([^"]+)"/)?.[1];
    assert(name, "Shape registry block missing its name");
    const source = block.match(/readonly aliases: \[([^\]]*)\]/)?.[1] ?? "";
    return [
      name,
      [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]!).filter((alias) => alias !== name),
    ] as const;
  });
  assertEquals(MERMAID_FLOW_SHAPES, expected);
  assertEquals(MERMAID_FLOW_SHAPES.length, 53);
  const aliases = MERMAID_FLOW_SHAPES.flatMap(([, aliases]) => aliases);
  assertEquals(aliases.length, 87);
  assertEquals(new Set(aliases).size, 87);
});
