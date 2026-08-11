// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import {
  applyExomuxShaders,
  clampExomuxShaderParam,
  defaultExomuxShaderConfig,
  EXOMUX_SHADER_PARAMS,
  exomuxGhosttyConfigPath,
  exomuxShaderDirectory,
  generateExomuxShader,
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

Deno.test("Shader config normalizes junk and clamps parameters", () => {
  const defaults = defaultExomuxShaderConfig();
  assertEquals(defaults.enabled, false);
  assertEquals(defaults.effect, "scanline");

  const normalized = normalizeExomuxShaderConfig({
    enabled: true,
    effect: "not-a-shader",
    params: { scanlineIntensity: 5, flickerIntensity: -1 },
  });
  // Unknown effect falls back; parameters clamp to their range.
  assertEquals(normalized.effect, "scanline");
  assertEquals(normalized.enabled, true);
  assertEquals(normalized.params.scanlineIntensity, 1);
  assertEquals(normalized.params.flickerIntensity, 0);

  const param = EXOMUX_SHADER_PARAMS.pincushion[0]!;
  assertEquals(clampExomuxShaderParam(param, 99), param.max);
  assertEquals(clampExomuxShaderParam(param, -5), param.min);
  assertEquals(clampExomuxShaderParam(param, Number.NaN), param.default);
});

Deno.test("Generated shaders are valid Shadertoy GLSL with baked-in parameters", () => {
  const scan = generateExomuxShader(
    normalizeExomuxShaderConfig({
      enabled: true,
      effect: "scanline",
      params: { scanlineIntensity: 0.5, flickerIntensity: 0.1, pulseIntensity: 0.3 },
    }),
  );
  assertStringIncludes(scan, "void mainImage(out vec4 fragColor, in vec2 fragCoord)");
  assertStringIncludes(scan, "texture(iChannel0");
  assertStringIncludes(scan, "float scanlineIntensity = 0.5;");
  assertStringIncludes(scan, "iTime");

  const pin = generateExomuxShader(
    normalizeExomuxShaderConfig({ enabled: true, effect: "pincushion", params: { magnitude: 0.4 } }),
  );
  assertStringIncludes(pin, "float magnitude = 0.4;");
  assertStringIncludes(pin, "texture(iChannel0, warped)");
});

Deno.test("Applying shaders writes the GLSL and a Ghostty config include", async () => {
  const configDir = await Deno.makeTempDir({ prefix: "exomux-shaders-" });
  try {
    const enabled = await applyExomuxShaders(
      configDir,
      normalizeExomuxShaderConfig({ enabled: true, effect: "scanline", params: {} }),
    );
    assert(enabled.shaderPath);
    assertEquals(enabled.configPath, exomuxGhosttyConfigPath(configDir));
    const shaderSource = await Deno.readTextFile(enabled.shaderPath!);
    assertStringIncludes(shaderSource, "mainImage");
    const ghosttyConf = await Deno.readTextFile(enabled.configPath);
    assertStringIncludes(ghosttyConf, `custom-shader = ${enabled.shaderPath}`);
    assertStringIncludes(ghosttyConf, "custom-shader-animation = true");
    assertStringIncludes(exomuxShaderDirectory(configDir), "shaders");

    // Disabling clears the custom-shader line.
    const disabled = await applyExomuxShaders(configDir, defaultExomuxShaderConfig());
    assertEquals(disabled.shaderPath, undefined);
    const cleared = await Deno.readTextFile(disabled.configPath);
    assert(!cleared.includes("custom-shader ="), "disabled config must not enable a shader");
  } finally {
    await Deno.remove(configDir, { recursive: true }).catch(() => undefined);
  }
});
