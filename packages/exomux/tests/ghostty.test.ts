// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import {
  applyExomuxShaders,
  clampExomuxShaderParam,
  defaultExomuxShaderConfig,
  ensureExomuxGhosttyInclude,
  EXOMUX_SHADER_PARAMS,
  exomuxGhosttyConfigPath,
  exomuxGhosttyUserConfigPath,
  exomuxShaderDirectory,
  generateExomuxShader,
  isGhosttyAvailable,
  isGhosttyInstalled,
  isRunningInGhostty,
  normalizeExomuxShaderConfig,
} from "../ghostty.ts";

Deno.test("Ghostty detection reads the environment gracefully", () => {
  assert(!isRunningInGhostty(() => undefined));
  assert(isRunningInGhostty((key) => key === "TERM_PROGRAM" ? "ghostty" : undefined));
  assert(isRunningInGhostty((key) => key === "TERM_PROGRAM" ? "Ghostty" : undefined), "case-insensitive");
  assert(isRunningInGhostty((key) => key === "GHOSTTY_RESOURCES_DIR" ? "/opt/ghostty" : undefined));
  assert(!isRunningInGhostty((key) => key === "TERM_PROGRAM" ? "xterm" : undefined));
});

Deno.test("Ghostty is detected as installed on PATH, and availability combines both signals", () => {
  const env = (map: Record<string, string>) => (key: string) => map[key];
  const has = (paths: string[]) => (path: string) => paths.includes(path);

  // Found on a PATH directory (Linux).
  assert(isGhosttyInstalled(env({ PATH: "/usr/bin:/opt/ghostty/bin" }), "linux", has(["/opt/ghostty/bin/ghostty"])));
  // Not on any PATH directory.
  assert(!isGhosttyInstalled(env({ PATH: "/usr/bin:/bin" }), "linux", has(["/usr/bin/other"])));
  // No PATH at all.
  assert(!isGhosttyInstalled(env({}), "linux", () => true));
  // Windows looks for the .exe.
  assert(isGhosttyInstalled(env({ PATH: "C:\\tools" }), "windows", has(["C:\\tools\\ghostty.exe"])));

  // Available when running inside Ghostty even if the binary probe would fail.
  assert(isGhosttyAvailable((key) => (key === "TERM_PROGRAM" ? "ghostty" : undefined)));
});

Deno.test("Shader config normalizes junk, clamps parameters, and migrates the old shape", () => {
  const defaults = defaultExomuxShaderConfig();
  assertEquals(defaults.effects.scanline.enabled, false);
  assertEquals(defaults.effects.pincushion.enabled, false);

  // The previous single-effect shape migrates into the matching effect.
  const migrated = normalizeExomuxShaderConfig({
    enabled: true,
    effect: "scanline",
    params: { scanlineIntensity: 5, flickerIntensity: -1 },
  });
  assertEquals(migrated.effects.scanline.enabled, true);
  assertEquals(migrated.effects.pincushion.enabled, false);
  assertEquals(migrated.effects.scanline.params.scanlineIntensity, 1); // clamped
  assertEquals(migrated.effects.scanline.params.flickerIntensity, 0); // clamped

  // The new per-effect shape enables more than one at once.
  const both = normalizeExomuxShaderConfig({
    effects: {
      scanline: { enabled: true, params: { scanlineIntensity: 0.5 } },
      pincushion: { enabled: true, params: { magnitude: 0.4 } },
    },
  });
  assertEquals(both.effects.scanline.enabled, true);
  assertEquals(both.effects.pincushion.enabled, true);
  assertEquals(both.effects.pincushion.params.magnitude, 0.4);

  const param = EXOMUX_SHADER_PARAMS.pincushion[0]!;
  assertEquals(clampExomuxShaderParam(param, 99), param.max);
  assertEquals(clampExomuxShaderParam(param, -5), param.min);
  assertEquals(clampExomuxShaderParam(param, Number.NaN), param.default);
});

Deno.test("Generated shaders are valid Shadertoy GLSL with baked-in parameters", () => {
  const scan = generateExomuxShader("scanline", { scanlineIntensity: 0.5, flickerIntensity: 0.1, pulseIntensity: 0.3 });
  assertStringIncludes(scan, "void mainImage(out vec4 fragColor, in vec2 fragCoord)");
  assertStringIncludes(scan, "texture(iChannel0");
  assertStringIncludes(scan, "float scanlineIntensity = 0.5;");
  assertStringIncludes(scan, "iTime");

  const pin = generateExomuxShader("pincushion", { magnitude: 0.4 });
  assertStringIncludes(pin, "float magnitude = 0.4;");
  assertStringIncludes(pin, "texture(iChannel0, warped)");
});

Deno.test("Ghostty user config path follows XDG and platform conventions", () => {
  const env = (map: Record<string, string>) => (key: string) => map[key];
  assertEquals(
    exomuxGhosttyUserConfigPath(env({ XDG_CONFIG_HOME: "/x/cfg" }), "linux"),
    "/x/cfg/ghostty/config",
  );
  assertEquals(
    exomuxGhosttyUserConfigPath(env({ HOME: "/home/cos" }), "linux"),
    "/home/cos/.config/ghostty/config",
  );
  assertStringIncludes(
    exomuxGhosttyUserConfigPath(env({ HOME: "/Users/cos" }), "darwin")!,
    "Library/Application Support/com.mitchellh.ghostty/config",
  );
});

Deno.test("Ensuring the Ghostty include adds it once and preserves existing config", async () => {
  const dir = await Deno.makeTempDir({ prefix: "exomux-ghostty-" });
  try {
    const userConfig = `${dir}/config`;
    const managed = `${dir}/shaders/ghostty.conf`;
    await Deno.writeTextFile(userConfig, "theme = catppuccin\nfont-size = 13");

    assertEquals(await ensureExomuxGhosttyInclude(managed, userConfig), true);
    const first = await Deno.readTextFile(userConfig);
    assertStringIncludes(first, "theme = catppuccin"); // existing content preserved
    assertStringIncludes(first, `config-file = ${managed}`);

    // Idempotent: a second call does not add the include again.
    assertEquals(await ensureExomuxGhosttyInclude(managed, userConfig), true);
    const second = await Deno.readTextFile(userConfig);
    assertEquals(second.match(/config-file = /g)?.length, 1);

    // Creates the config (and its directory) when none exists.
    const fresh = `${dir}/nested/ghostty/config`;
    assertEquals(await ensureExomuxGhosttyInclude(managed, fresh), true);
    assertStringIncludes(await Deno.readTextFile(fresh), `config-file = ${managed}`);

    // An unwritable location is a no-op, not a throw (a file blocks the parent dir).
    await Deno.writeTextFile(`${dir}/blocker`, "");
    assertEquals(await ensureExomuxGhosttyInclude(managed, `${dir}/blocker/ghostty/config`), false);
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Applying shaders writes GLSL and chains every enabled effect in the config", async () => {
  const configDir = await Deno.makeTempDir({ prefix: "exomux-shaders-" });
  try {
    const both = await applyExomuxShaders(
      configDir,
      normalizeExomuxShaderConfig({
        effects: { scanline: { enabled: true, params: {} }, pincushion: { enabled: true, params: {} } },
      }),
    );
    assertEquals(both.shaderPaths.length, 2);
    assertEquals(both.configPath, exomuxGhosttyConfigPath(configDir));
    const ghosttyConf = await Deno.readTextFile(both.configPath);
    for (const shaderPath of both.shaderPaths) {
      assertStringIncludes(await Deno.readTextFile(shaderPath), "mainImage");
      assertStringIncludes(ghosttyConf, `custom-shader = ${shaderPath}`);
    }
    // Two effects → two chained custom-shader entries.
    assertEquals(ghosttyConf.match(/custom-shader = /g)?.length, 2);
    assertStringIncludes(ghosttyConf, "custom-shader-animation = true");
    assertStringIncludes(exomuxShaderDirectory(configDir), "shaders");

    // All effects off clears the custom-shader lines.
    const disabled = await applyExomuxShaders(configDir, defaultExomuxShaderConfig());
    assertEquals(disabled.shaderPaths.length, 0);
    const cleared = await Deno.readTextFile(disabled.configPath);
    assert(!cleared.includes("custom-shader ="), "disabled config must not enable a shader");
  } finally {
    await Deno.remove(configDir, { recursive: true }).catch(() => undefined);
  }
});
