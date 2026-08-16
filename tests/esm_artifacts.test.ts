// Copyright 2023 Im-Beast. MIT license.

// PKG-006: Deno, Node, bundler, and browser smoke projects import only
// supported subpaths.

import { assert, assertEquals } from "./deps.ts";
import { SUPPORTED_ESM_ENTRYPOINTS } from "../scripts/build_esm_artifacts.ts";

const root = new URL("..", import.meta.url);

async function run(args: string[], cwd = root.pathname): Promise<{ ok: boolean; output: string }> {
  const command = new Deno.Command(args[0]!, {
    args: args.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  return {
    ok: result.success,
    output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr),
  };
}

Deno.test("ESM artifacts build from source and pass all four smoke runtimes", async () => {
  // Build fresh from the same source.
  const built = await run(["deno", "run", "-A", "scripts/build_esm_artifacts.ts"]);
  assert(built.ok, built.output);
  const manifest = JSON.parse(await Deno.readTextFile(new URL("dist/manifest.json", root)));
  assertEquals(manifest.canonical, "jsr:@ubernaut/deno-tui"); // JSR stays canonical
  assertEquals(
    manifest.artifacts.map((artifact: { entrypoint: string }) => artifact.entrypoint),
    [...SUPPORTED_ESM_ENTRYPOINTS],
  ); // exactly the supported subpaths, nothing else

  for (const artifact of manifest.artifacts) {
    const fileUrl = new URL(artifact.file, root).href;

    // Deno smoke: the artifact imports and exposes real functions.
    const module = await import(fileUrl);
    assert(Object.keys(module).length > 10, `${artifact.file}: too few exports`);

    // Browser smoke (static): the bundle references no Deno API at all.
    assert(artifact.denoFree, `${artifact.file} references Deno APIs — not browser-safe`);

    // Bundler smoke: a bundler (deno bundle) can consume the artifact.
    const rebundled = await run([
      "deno",
      "bundle",
      new URL(artifact.file, root).pathname,
      "-o",
      new URL(`${artifact.file}.rebundle.mjs`, root).pathname,
    ]);
    assert(rebundled.ok, `${artifact.file}: bundler smoke failed\n${rebundled.output}`);

    // Node smoke: import under real Node when available.
    const nodeAvailable = (await run(["node", "--version"])).ok;
    if (nodeAvailable) {
      const nodeSmoke = await run([
        "node",
        "--input-type=module",
        "-e",
        `import(${
          JSON.stringify(fileUrl)
        }).then((m) => { if (Object.keys(m).length < 10) throw new Error("few exports"); console.log("node-ok"); })`,
      ]);
      assert(
        nodeSmoke.ok && nodeSmoke.output.includes("node-ok"),
        `${artifact.file}: node smoke failed\n${nodeSmoke.output}`,
      );
    }
  }

  // Deno-only entrypoints are NOT offered as artifacts.
  assert(!manifest.artifacts.some((artifact: { entrypoint: string }) => artifact.entrypoint === "mod.ts"));
});

Deno.test("artifact functions actually work cross-runtime (Deno leg)", async () => {
  const remote = await import(new URL("dist/remote.mjs", root).href);
  const frame = {
    columns: 2,
    rows: 1,
    cells: [{ char: "o", style: "a" }, { char: "k", style: "a" }],
  };
  const encoded = remote.encodeCellFrame(frame);
  assertEquals(encoded.kind, "full");
  const decoded = remote.decodeCellFrame(encoded);
  assert(decoded.ok);
  assertEquals(decoded.frame, frame);
});
