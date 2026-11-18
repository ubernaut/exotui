// Copyright 2026 ubernaut. MIT license.
import { fileURLToPath } from "node:url";
import type { Plugin } from "esbuild";

/** Native runtime hosts are never installed in browser bundles. */
export const browserRuntimeHostStub: Plugin = {
  name: "exotui-browser-runtime-host",
  setup(build) {
    build.onResolve({ filter: /\/runtime\/host\.ts$|^\.\/host\.ts$/ }, (args) => {
      if (!args.path.endsWith("/runtime/host.ts") && !args.resolveDir.endsWith("/runtime")) return;
      return { path: "runtime-host", namespace: "exotui-browser" };
    });
    build.onLoad({ filter: /.*/, namespace: "exotui-browser" }, () => ({
      contents: "export const runtimeHost = undefined;",
    }));
  },
};

/** Bundle an optional browser entry with Bun's installed npm dependencies. */
export async function bundleBrowserForBun(entry: URL, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [fileURLToPath(entry)],
    platform: "browser",
    format: "esm",
    target: "es2022",
    bundle: true,
    minify: true,
    write: false,
    plugins: [browserRuntimeHostStub],
  });
  signal?.throwIfAborted();
  if (result.outputFiles.length !== 1) throw new Error("Expected one self-contained browser module.");
  return new Uint8Array(result.outputFiles[0]!.contents);
}
