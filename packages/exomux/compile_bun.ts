// Copyright 2026 ubernaut. MIT license.

import type { BunPlugin } from "bun";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const packageDirectory = dirname(fileURLToPath(import.meta.url));

// Native bindings use a platform-dependent import. Resolve it during compilation
// so Bun embeds both their module and shared library in the executable.
const nativeGpu: BunPlugin = {
  name: "exomux-native-webgpu",
  setup(build) {
    build.onLoad({ filter: /[/\\]src[/\\]runtime[/\\]bun_webgpu\.ts$/ }, async ({ path }) => ({
      contents: (await Bun.file(path).text()).replace("import(moduleName)", 'import("bun-webgpu")'),
      loader: "ts",
    }));
    build.onLoad({ filter: /[/\\]src[/\\]three_ascii[/\\]renderer\.ts$/ }, async ({ path }) => ({
      contents: 'import embeddedEdges from "./assets/edgesASCII.png" with { type: "file" };\n' +
        'import embeddedFill from "./assets/fillASCII.png" with { type: "file" };\n' +
        (await Bun.file(path).text())
          .replace("import(moduleName)", 'import("pngjs")')
          .replace("import(bufferModuleName)", 'import("node:buffer")')
          .replace('new URL("./assets/edgesASCII.png", import.meta.url)', 'new URL(embeddedEdges, "file:///")')
          .replace('new URL("./assets/fillASCII.png", import.meta.url)', 'new URL(embeddedFill, "file:///")'),
      loader: "ts",
    }));
    build.onLoad({ filter: /[/\\]bun-webgpu[/\\]index\.js$/ }, async ({ path }) => ({
      contents: (await Bun.file(path).text()).replace(
        "import(`bun-webgpu-${process.platform}-${process.arch}/index.ts`)",
        `import("bun-webgpu-${process.platform}-${process.arch}/index.ts")`,
      ),
      loader: "js",
    }));
  },
};

/** Builds a standalone executable with the runtime adapter and native GPU resources embedded. */
export async function buildExomuxBun(options: { outfile: string; entrypoint?: string }): Promise<void> {
  const output = resolve(options.outfile);
  // Bun 1.3.9 copies an EOF-positioned temporary file incorrectly when the output
  // crosses filesystems. Build on the destination filesystem so its atomic rename
  // succeeds, including when a checkout on disk writes an executable to /tmp.
  await mkdir(dirname(output), { recursive: true });
  const originalDirectory = process.cwd();
  process.chdir(dirname(output));
  const result = await Bun.build({
    entrypoints: [options.entrypoint ?? resolve(packageDirectory, "bun_main.ts")],
    compile: { outfile: output, autoloadDotenv: false, autoloadBunfig: false },
    target: "bun",
    external: ["@sigma/pty-ffi"],
    plugins: [nativeGpu],
  }).finally(() => process.chdir(originalDirectory));
  if (!result.success) throw new AggregateError(result.logs, "Bun standalone compilation failed");
}

if (import.meta.main) {
  const outfile = process.argv[2] ?? resolve(packageDirectory, "exomux-bun");
  await buildExomuxBun({ outfile });
  console.log(`Compiled ${resolve(outfile)}`);
}
