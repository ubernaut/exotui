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

function fileExists(path: string): boolean {
  try {
    return Deno.statSync(path).isFile;
  } catch {
    return false;
  }
}

/** True when a `ghostty` executable is on PATH — i.e. installed on the system. */
export function isGhosttyInstalled(
  env: (key: string) => string | undefined = readEnv,
  os: string = Deno.build.os,
  exists: (path: string) => boolean = fileExists,
): boolean {
  const pathVar = env("PATH");
  if (!pathVar) return false;
  const listSeparator = os === "windows" ? ";" : ":";
  const dirSeparator = os === "windows" ? "\\" : "/";
  const names = os === "windows" ? ["ghostty.exe", "ghostty.com", "ghostty"] : ["ghostty"];
  for (const dir of pathVar.split(listSeparator)) {
    if (!dir) continue;
    const base = dir.replace(/[\\/]+$/, "");
    for (const name of names) {
      if (exists(`${base}${dirSeparator}${name}`)) return true;
    }
  }
  return false;
}

/**
 * True when Ghostty is relevant to this system: Exomux is running inside it, or a
 * `ghostty` binary is installed. Either way the interface shaders are offered and
 * the settings drive Ghostty's shader config — the installer keys off the same
 * "installed" signal, so the settings and the installer stay consistent.
 */
export function isGhosttyAvailable(env: (key: string) => string | undefined = readEnv): boolean {
  return isRunningInGhostty(env) || isGhosttyInstalled(env);
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

/** One effect's on/off state and its parameter values. */
export interface ExomuxShaderEffectConfig {
  readonly enabled: boolean;
  /** Parameter id → value; missing entries fall back to each param's default. */
  readonly params: Readonly<Record<string, number>>;
}

/** The persisted shader configuration: each effect is enabled independently. */
export interface ExomuxShaderConfig {
  readonly effects: Readonly<Record<ExomuxShaderEffect, ExomuxShaderEffectConfig>>;
}

/** Safe defaults: every effect off, each param at its default. */
export function defaultExomuxShaderConfig(): ExomuxShaderConfig {
  const effects = {} as Record<ExomuxShaderEffect, ExomuxShaderEffectConfig>;
  for (const effect of EXOMUX_SHADER_EFFECTS) {
    effects[effect] = Object.freeze({ enabled: false, params: exomuxShaderDefaults(effect) });
  }
  return Object.freeze({ effects: Object.freeze(effects) });
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

/** Normalizes one effect's params from an arbitrary source record. */
function normalizeEffectParams(effect: ExomuxShaderEffect, source: Record<string, unknown>): Record<string, number> {
  const params: Record<string, number> = {};
  for (const param of EXOMUX_SHADER_PARAMS[effect]) {
    params[param.id] = clampExomuxShaderParam(param, Number(source[param.id] ?? param.default));
  }
  return params;
}

/**
 * Strictly normalizes any parsed value into a valid shader config. Also migrates
 * the previous single-effect shape (`{ enabled, effect, params }`) into the
 * per-effect map so persisted configs upgrade in place.
 */
export function normalizeExomuxShaderConfig(value: unknown): ExomuxShaderConfig {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const legacyEffect = EXOMUX_SHADER_EFFECTS.includes(record.effect as ExomuxShaderEffect)
    ? record.effect as ExomuxShaderEffect
    : undefined;
  const legacyParams = record.params && typeof record.params === "object" && !Array.isArray(record.params)
    ? record.params as Record<string, unknown>
    : {};
  const sourceEffects = record.effects && typeof record.effects === "object" && !Array.isArray(record.effects)
    ? record.effects as Record<string, unknown>
    : {};
  const effects = {} as Record<ExomuxShaderEffect, ExomuxShaderEffectConfig>;
  for (const effect of EXOMUX_SHADER_EFFECTS) {
    const modern = sourceEffects[effect];
    const source = modern && typeof modern === "object" && !Array.isArray(modern)
      ? modern as Record<string, unknown>
      : legacyEffect === effect
      ? { enabled: record.enabled, params: legacyParams }
      : {};
    const paramSource = source.params && typeof source.params === "object" && !Array.isArray(source.params)
      ? source.params as Record<string, unknown>
      : {};
    effects[effect] = Object.freeze({
      enabled: source.enabled === true,
      params: Object.freeze(normalizeEffectParams(effect, paramSource)),
    });
  }
  return Object.freeze({ effects: Object.freeze(effects) });
}

/** Resolves one parameter's current value for an effect, falling back to its default. */
export function exomuxShaderParamValue(
  config: ExomuxShaderConfig,
  effect: ExomuxShaderEffect,
  param: ExomuxShaderParam,
): number {
  const value = config.effects[effect]?.params[param.id];
  return value === undefined ? param.default : value;
}

/** The effects currently enabled, in menu order. */
export function exomuxEnabledShaderEffects(config: ExomuxShaderConfig): ExomuxShaderEffect[] {
  return EXOMUX_SHADER_EFFECTS.filter((effect) => config.effects[effect]?.enabled);
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
export function generateExomuxShader(
  effect: ExomuxShaderEffect,
  params: Readonly<Record<string, number>> = {},
): string {
  const value = (id: string) => {
    const param = EXOMUX_SHADER_PARAMS[effect].find((entry) => entry.id === id)!;
    const current = params[id];
    return glslFloat(current === undefined ? param.default : current);
  };
  if (effect === "pincushion") {
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
  /** The generated shader paths, one per enabled effect (empty when all off). */
  readonly shaderPaths: readonly string[];
  /** The managed Ghostty config include the user points Ghostty at. */
  readonly configPath: string;
}

/**
 * Writes a generated shader for every enabled effect and a managed Ghostty config
 * that chains them with repeated `custom-shader` entries (or clears them when all
 * are off). Ghostty applies it on its next config reload; this cannot force that,
 * so the caller tells the user to reload Ghostty's config.
 */
export async function applyExomuxShaders(
  configDirectory: string,
  config: ExomuxShaderConfig,
): Promise<ExomuxShaderApplyResult> {
  const directory = exomuxShaderDirectory(configDirectory);
  await Deno.mkdir(directory, { recursive: true });
  const configPath = exomuxGhosttyConfigPath(configDirectory);
  const enabled = exomuxEnabledShaderEffects(config);
  if (enabled.length === 0) {
    await Deno.writeTextFile(configPath, "# Exomux shaders disabled\n");
    return { configPath, shaderPaths: [] };
  }
  const shaderPaths: string[] = [];
  const lines = [`# Managed by Exomux — enable with: config-file = ${configPath}`];
  for (const effect of enabled) {
    const shaderPath = joinPath(directory, `exomux-${effect}.glsl`);
    await Deno.writeTextFile(shaderPath, generateExomuxShader(effect, config.effects[effect].params));
    lines.push(`custom-shader = ${shaderPath}`);
    shaderPaths.push(shaderPath);
  }
  lines.push("custom-shader-animation = true");
  await Deno.writeTextFile(configPath, `${lines.join("\n")}\n`);
  return { configPath, shaderPaths };
}

function joinPath(parent: string, child: string): string {
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/g, "")}${separator}${child.replace(/^[\\/]+/g, "")}`;
}

/** The user's own Ghostty config path, where the managed include belongs. */
export function exomuxGhosttyUserConfigPath(
  env: (key: string) => string | undefined = Deno.env.get,
  os: string = Deno.build.os,
): string | undefined {
  const home = env("HOME");
  if (os === "darwin") {
    return home ? joinPath(home, "Library/Application Support/com.mitchellh.ghostty/config") : undefined;
  }
  const xdg = env("XDG_CONFIG_HOME");
  if (xdg) return joinPath(xdg, "ghostty/config");
  return home ? joinPath(home, ".config/ghostty/config") : undefined;
}

/**
 * Ensures the user's Ghostty config `config-file`-includes Exomux's managed
 * shader config, so enabling a shader takes effect on Ghostty's next reload
 * without a manual edit. Idempotent — the include is added once and existing
 * content is never rewritten — and best-effort: returns false (never throws) if
 * the config location is unknown or unwritable. Reversible: the user can delete
 * the one commented line it adds.
 */
export async function ensureExomuxGhosttyInclude(
  managedConfigPath: string,
  userConfigPath: string | undefined = exomuxGhosttyUserConfigPath(),
): Promise<boolean> {
  if (!userConfigPath) return false;
  let existing = "";
  try {
    existing = await Deno.readTextFile(userConfigPath);
  } catch {
    // No user config yet; we will create one holding just the include.
  }
  if (existing.includes(managedConfigPath)) return true;
  try {
    const parent = userConfigPath.replace(/[\\/][^\\/]*$/, "");
    if (parent && parent !== userConfigPath) await Deno.mkdir(parent, { recursive: true });
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await Deno.writeTextFile(
      userConfigPath,
      `${existing}${prefix}\n# Added by Exomux so its interface shaders load; safe to remove.\nconfig-file = ${managedConfigPath}\n`,
    );
    return true;
  } catch {
    return false;
  }
}
