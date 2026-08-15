// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals, assertStringIncludes } from "./deps.ts";
import {
  applyExomuxCursorConfig,
  applyExomuxShaders,
  clampExomuxShaderParam,
  defaultExomuxShaderConfig,
  ensureExomuxGhosttyInclude,
  EXOMUX_SHADER_PARAMS,
  exomuxGhosttyConfigPath,
  exomuxGhosttyUserConfigPath,
  exomuxPincushionSource,
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

Deno.test("Pincushion source warp fixes the center and pulls edge midpoints to the screen edge", () => {
  const near = (a: number, b: number, eps = 1e-9) => assert(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
  for (const magnitude of [0.025, 0.1, 0.5]) {
    // The center is a fixed point at any magnitude.
    const center = exomuxPincushionSource(0.5, 0.5, magnitude);
    near(center.u, 0.5);
    near(center.v, 0.5);
    // Edge midpoints (r2 = 1) map to exactly the source edge — tangent, no margin.
    near(exomuxPincushionSource(1, 0.5, magnitude).u, 1);
    near(exomuxPincushionSource(0, 0.5, magnitude).u, 0);
    near(exomuxPincushionSource(0.5, 0, magnitude).v, 0);
    near(exomuxPincushionSource(0.5, 1, magnitude).v, 1);
  }
  // Zero magnitude is the identity.
  const identity = exomuxPincushionSource(0.3, 0.8, 0);
  near(identity.u, 0.3);
  near(identity.v, 0.8);
});

Deno.test("Cursor config toggles mouse-hide-while-typing for the block cursor", async () => {
  const dir = await Deno.makeTempDir({ prefix: "exomux-cursor-" });
  try {
    const on = await applyExomuxCursorConfig(dir, true);
    assertStringIncludes(await Deno.readTextFile(on), "mouse-hide-while-typing = true");
    const off = await applyExomuxCursorConfig(dir, false);
    assert(!(await Deno.readTextFile(off)).includes("mouse-hide-while-typing = true"));
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => undefined);
  }
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

Deno.test("VHS distortion registers with five independent intensities (UX-010)", async () => {
  const { EXOMUX_SHADER_PARAMS, generateExomuxShader, normalizeExomuxShaderConfig, exomuxShaderEffectLabel } =
    await import("../ghostty.ts");
  assertEquals(exomuxShaderEffectLabel("vhs"), "VHS distortion");
  assertEquals(
    EXOMUX_SHADER_PARAMS.vhs.map((param) => param.id),
    ["tracking", "chromaBleed", "staticSnow", "jitterWave", "lumaNoise"],
  );

  // Chosen values bake into the generated GLSL as constants.
  const glsl = generateExomuxShader("vhs", {
    tracking: 0.6,
    chromaBleed: 0.4,
    staticSnow: 0.1,
    jitterWave: 0.3,
    lumaNoise: 0.55,
  });
  assertStringIncludes(glsl, "float tracking = 0.6;");
  assertStringIncludes(glsl, "float chromaBleed = 0.4;");
  assertStringIncludes(glsl, "float staticSnow = 0.1;");
  assertStringIncludes(glsl, "float jitterWave = 0.3;");
  assertStringIncludes(glsl, "float lumaNoise = 0.55;");
  assertStringIncludes(glsl, "mainImage");

  // The config round-trips vhs and clamps junk.
  const config = normalizeExomuxShaderConfig({
    effects: { vhs: { enabled: true, params: { tracking: 99, chromaBleed: "junk" } } },
  });
  assertEquals(config.effects.vhs.enabled, true);
  assertEquals(config.effects.vhs.params.tracking, 1);
  assertEquals(config.effects.vhs.params.chromaBleed, 0.1);
});

Deno.test("custom shader entries persist, order, and reach the Ghostty config (UX-009 model)", async () => {
  const { applyExomuxShaders, normalizeExomuxShaderConfig } = await import("../ghostty.ts");
  const config = normalizeExomuxShaderConfig({
    effects: { vhs: { enabled: true, params: {} } },
    customShaders: [
      { path: "/home/user/glow.glsl", enabled: true },
      { path: "/home/user/off.glsl", enabled: false },
      { path: "   ", enabled: true }, // blank paths are dropped
      { path: "/home/user/last.glsl", enabled: true },
    ],
  });
  assertEquals(config.customShaders.map((entry) => entry.path), [
    "/home/user/glow.glsl",
    "/home/user/off.glsl",
    "/home/user/last.glsl",
  ]);

  const dir = Deno.makeTempDirSync({ prefix: "exomux-shader-" });
  try {
    const result = await applyExomuxShaders(dir, config);
    const written = Deno.readTextFileSync(result.configPath);
    const shaderLines = written.split("\n").filter((line) => line.startsWith("custom-shader ="));
    // Built-ins first, then enabled customs in list order; disabled ones stay out.
    assertEquals(shaderLines.length, 3);
    assertStringIncludes(shaderLines[0]!, "exomux-vhs.glsl");
    assertStringIncludes(shaderLines[1]!, "/home/user/glow.glsl");
    assertStringIncludes(shaderLines[2]!, "/home/user/last.glsl");
    // The generated VHS shader exists on disk.
    assertStringIncludes(Deno.readTextFileSync(result.shaderPaths[0]!), "VHS distortion");
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("Ghostty reload walks the ancestor chain and signals SIGUSR2", async () => {
  const { findExomuxGhosttyAncestor, reloadExomuxGhosttyConfig } = await import("../ghostty.ts");
  // exomux(100) <- shell(80) <- exomux host? no: shell(80) <- ghostty(42) <- init(1)
  const parents = new Map([[100, 80], [80, 42], [42, 1]]);
  const names = new Map([[80, "bash"], [42, "ghostty"]]);
  const probes = {
    pid: 100,
    readPpid: (pid: number) => Promise.resolve(parents.get(pid)),
    readComm: (pid: number) => Promise.resolve(names.get(pid)),
  };
  assertEquals(await findExomuxGhosttyAncestor(probes), 42);

  const killed: number[] = [];
  assertEquals(await reloadExomuxGhosttyConfig({ ...probes, kill: (pid) => killed.push(pid) }), true);
  assertEquals(killed, [42]);

  // No Ghostty in the chain (ssh session): quietly false, nothing signalled.
  const sshNames = new Map([[80, "bash"], [42, "sshd"]]);
  const sshProbes = { ...probes, readComm: (pid: number) => Promise.resolve(sshNames.get(pid)) };
  assertEquals(await reloadExomuxGhosttyConfig({ ...sshProbes, kill: (pid) => killed.push(pid) }), false);
  assertEquals(killed, [42]);

  // A kill failure (missing permission) degrades to false instead of throwing.
  assertEquals(
    await reloadExomuxGhosttyConfig({
      ...probes,
      kill: () => {
        throw new Error("denied");
      },
    }),
    false,
  );
});
