// Copyright 2023 Im-Beast. MIT license.

// GLSL post-processing shaders for the interface, when Exomux runs inside
// Ghostty. Ghostty applies Shadertoy-style fragment shaders (`custom-shader`
// in its config) over the whole terminal surface, so a CRT effect covers the
// entire Exomux desktop. Exomux generates the shader source with the chosen
// parameters baked in, writes it beside its own config, and points a managed
// Ghostty config include at it. Ghostty picks the shader up on its next config
// reload — nothing here can force that, so the caller surfaces the reload step.

/** Whether Exomux is running inside a Ghostty terminal, from the environment. */
export function isRunningInGhostty(env: (key: string) => string | undefined = readEnv): boolean {
  if ((env("TERM_PROGRAM") ?? "").toLowerCase() === "ghostty") return true;
  // Ghostty exports these for its own child processes.
  return Boolean(env("GHOSTTY_RESOURCES_DIR") || env("GHOSTTY_BIN_DIR"));
}

function readEnv(key: string): string | undefined {
  try {
    return Deno.env.get(key);
  } catch {
    return undefined;
  }
}

/** The CRT shaders Exomux ships, in menu order. */
export const EXOMUX_SHADER_EFFECTS = ["scanline", "pincushion"] as const;
export type ExomuxShaderEffect = (typeof EXOMUX_SHADER_EFFECTS)[number];

/** A configurable shader parameter with its range, for building sliders. */
export interface ExomuxShaderParam {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

/** The tunable parameters of each shader effect. */
export const EXOMUX_SHADER_PARAMS: Readonly<Record<ExomuxShaderEffect, readonly ExomuxShaderParam[]>> = Object.freeze({
  scanline: Object.freeze([
    { id: "scanlineIntensity", label: "Scanline depth", min: 0, max: 1, step: 0.05, default: 0.3 },
    { id: "flickerIntensity", label: "Flicker", min: 0, max: 1, step: 0.05, default: 0.15 },
    { id: "pulseIntensity", label: "Pulse", min: 0, max: 1, step: 0.05, default: 0.2 },
  ]),
  pincushion: Object.freeze([
    { id: "magnitude", label: "Distortion", min: 0, max: 1, step: 0.05, default: 0.25 },
  ]),
});

/** The persisted shader configuration. */
export interface ExomuxShaderConfig {
  readonly enabled: boolean;
  readonly effect: ExomuxShaderEffect;
  /** Parameter id → value; missing entries fall back to each param's default. */
  readonly params: Readonly<Record<string, number>>;
}

/** Safe defaults: shaders off, scanline selected, each param at its default. */
export function defaultExomuxShaderConfig(): ExomuxShaderConfig {
  return Object.freeze({ enabled: false, effect: "scanline", params: exomuxShaderDefaults("scanline") });
}

/** The default parameter map for one effect. */
export function exomuxShaderDefaults(effect: ExomuxShaderEffect): Readonly<Record<string, number>> {
  const params: Record<string, number> = {};
  for (const param of EXOMUX_SHADER_PARAMS[effect]) params[param.id] = param.default;
  return Object.freeze(params);
}

/** Clamps and rounds a parameter to its declared range and step. */
export function clampExomuxShaderParam(param: ExomuxShaderParam, value: number): number {
  if (!Number.isFinite(value)) return param.default;
  const clamped = Math.min(param.max, Math.max(param.min, value));
  const stepped = Math.round(clamped / param.step) * param.step;
  return Math.round(stepped * 1000) / 1000;
}

/** Strictly normalizes any parsed value into a valid shader config. */
export function normalizeExomuxShaderConfig(value: unknown): ExomuxShaderConfig {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const effect = EXOMUX_SHADER_EFFECTS.includes(record.effect as ExomuxShaderEffect)
    ? record.effect as ExomuxShaderEffect
    : "scanline";
  const source = record.params && typeof record.params === "object" && !Array.isArray(record.params)
    ? record.params as Record<string, unknown>
    : {};
  const params: Record<string, number> = {};
  for (const param of EXOMUX_SHADER_PARAMS[effect]) {
    params[param.id] = clampExomuxShaderParam(param, Number(source[param.id] ?? param.default));
  }
  return Object.freeze({ enabled: record.enabled === true, effect, params: Object.freeze(params) });
}

/** Resolves one parameter's current value, falling back to its default. */
export function exomuxShaderParamValue(config: ExomuxShaderConfig, param: ExomuxShaderParam): number {
  const value = config.params[param.id];
  return value === undefined ? param.default : value;
}

function glslFloat(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? `${rounded}.0` : `${rounded}`;
}

/**
 * Generates the Shadertoy-style GLSL for one shader configuration, with the
 * chosen parameters baked in as constants. Ghostty binds `iChannel0` to the
 * terminal, `iResolution` to its size, and `iTime` to elapsed seconds.
 */
export function generateExomuxShader(config: ExomuxShaderConfig): string {
  const value = (id: string) => {
    const param = EXOMUX_SHADER_PARAMS[config.effect].find((entry) => entry.id === id)!;
    return glslFloat(exomuxShaderParamValue(config, param));
  };
  if (config.effect === "pincushion") {
    return [
      "// Exomux CRT pincushion distortion",
      "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
      "  vec2 uv = fragCoord / iResolution.xy;",
      "  vec2 centered = uv * 2.0 - 1.0;",
      `  float magnitude = ${value("magnitude")};`,
      "  float r2 = dot(centered, centered);",
      "  centered *= 1.0 + magnitude * r2;",
      "  vec2 warped = centered * 0.5 + 0.5;",
      "  if (warped.x < 0.0 || warped.x > 1.0 || warped.y < 0.0 || warped.y > 1.0) {",
      "    fragColor = vec4(0.0, 0.0, 0.0, 1.0);",
      "    return;",
      "  }",
      "  fragColor = texture(iChannel0, warped);",
      "}",
      "",
    ].join("\n");
  }
  return [
    "// Exomux CRT pulsating scanlines",
    "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
    "  vec2 uv = fragCoord / iResolution.xy;",
    "  vec4 color = texture(iChannel0, uv);",
    `  float scanlineIntensity = ${value("scanlineIntensity")};`,
    `  float flickerIntensity = ${value("flickerIntensity")};`,
    `  float pulseIntensity = ${value("pulseIntensity")};`,
    "  float scan = sin(fragCoord.y * 3.14159 * 0.5);",
    "  float scanline = 1.0 - scanlineIntensity * (0.5 - 0.5 * scan);",
    "  float flicker = 1.0 - flickerIntensity * (0.5 + 0.5 * sin(iTime * 60.0));",
    "  float pulse = 1.0 - pulseIntensity * (0.5 - 0.5 * sin(iTime * 3.0));",
    "  color.rgb *= scanline * flicker * pulse;",
    "  fragColor = color;",
    "}",
    "",
  ].join("\n");
}

/** Where Exomux keeps generated shaders and its managed Ghostty config. */
export function exomuxShaderDirectory(configDirectory: string): string {
  return joinPath(configDirectory, "shaders");
}

/** The Ghostty config snippet Exomux owns; users `config-file` include it. */
export function exomuxGhosttyConfigPath(configDirectory: string): string {
  return joinPath(exomuxShaderDirectory(configDirectory), "ghostty.conf");
}

/** The result of applying shader settings to disk. */
export interface ExomuxShaderApplyResult {
  /** The generated shader path, or undefined when shaders are disabled. */
  readonly shaderPath?: string;
  /** The managed Ghostty config include the user points Ghostty at. */
  readonly configPath: string;
}

/**
 * Writes the generated shader and a managed Ghostty config that enables it (or
 * clears it when disabled). Ghostty applies it on its next config reload; this
 * cannot force that, so the caller tells the user to reload Ghostty's config.
 */
export async function applyExomuxShaders(
  configDirectory: string,
  config: ExomuxShaderConfig,
): Promise<ExomuxShaderApplyResult> {
  const directory = exomuxShaderDirectory(configDirectory);
  await Deno.mkdir(directory, { recursive: true });
  const configPath = exomuxGhosttyConfigPath(configDirectory);
  if (!config.enabled) {
    await Deno.writeTextFile(configPath, "# Exomux shaders disabled\n");
    return { configPath };
  }
  const shaderPath = joinPath(directory, `exomux-${config.effect}.glsl`);
  await Deno.writeTextFile(shaderPath, generateExomuxShader(config));
  await Deno.writeTextFile(
    configPath,
    `# Managed by Exomux — enable with: config-file = ${configPath}\ncustom-shader = ${shaderPath}\ncustom-shader-animation = true\n`,
  );
  return { shaderPath, configPath };
}

function joinPath(parent: string, child: string): string {
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/g, "")}${separator}${child.replace(/^[\\/]+/g, "")}`;
}
