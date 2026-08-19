// Copyright 2023 Im-Beast. MIT license.

/**
 * PKG-006: builds browser/npm-compatible ESM artifacts from the same
 * source, JSR remaining canonical (type declarations ship via JSR).
 *
 *   deno run -A scripts/build_esm_artifacts.ts
 *
 * Only the SUPPORTED subpaths are built: entrypoints proven free of
 * Deno-specific APIs. The manifest records each artifact's digest.
 */

/** The supported browser/npm subpaths. Everything else is Deno-only. */
export const SUPPORTED_ESM_ENTRYPOINTS = ["mod.remote.ts", "mod.theme.ts"] as const;

if (import.meta.main) {
  const root = new URL("..", import.meta.url);
  await Deno.mkdir(new URL("dist/", root), { recursive: true });
  const artifacts: { entrypoint: string; file: string; sha256: string; denoFree: boolean }[] = [];
  for (const entrypoint of SUPPORTED_ESM_ENTRYPOINTS) {
    const outName = entrypoint.replace(/^mod\./, "").replace(/\.ts$/, "") + ".mjs";
    const outPath = new URL(`dist/${outName}`, root);
    const bundle = new Deno.Command("deno", {
      args: ["bundle", entrypoint, "-o", outPath.pathname],
      cwd: root.pathname,
      stdout: "null",
      stderr: "piped",
    });
    const result = await bundle.output();
    if (!result.success) {
      throw new Error(`bundle failed for ${entrypoint}: ${new TextDecoder().decode(result.stderr)}`);
    }
    const bytes = await Deno.readFile(outPath);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const text = new TextDecoder().decode(bytes);
    artifacts.push({
      entrypoint,
      file: `dist/${outName}`,
      sha256,
      denoFree: !/\bDeno\.\w+/.test(text),
    });
  }
  await Deno.writeTextFile(
    new URL("dist/manifest.json", root),
    JSON.stringify(
      {
        canonical: "jsr:@ubernaut/exotui",
        declarations: "type declarations ship from the canonical JSR package",
        artifacts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`built ${artifacts.length} ESM artifacts`);
}
