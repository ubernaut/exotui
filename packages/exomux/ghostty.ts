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

/** The shaders Exomux ships, in menu order. */
export const EXOMUX_SHADER_EFFECTS = ["scanline", "pincushion", "vhs"] as const;
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
    { id: "scanlineIntensity", label: "Scanline depth", min: 0, max: 1, step: 0.05, default: 0.25 },
    { id: "flickerIntensity", label: "Flicker", min: 0, max: 1, step: 0.05, default: 0.05 },
    { id: "pulseIntensity", label: "Pulse", min: 0, max: 1, step: 0.05, default: 0.05 },
  ]),
  pincushion: Object.freeze([
    // Finer 2.5% steps, since a subtle barrel curve is the useful range.
    { id: "magnitude", label: "Distortion", min: 0, max: 1, step: 0.025, default: 0.025 },
  ]),
  // Five independent VHS artifacts, mixable per-effect (UX-010).
  vhs: Object.freeze([
    { id: "tracking", label: "Tracking errors", min: 0, max: 1, step: 0.05, default: 0.2 },
    { id: "chromaBleed", label: "Color bleeding", min: 0, max: 1, step: 0.05, default: 0.25 },
    { id: "staticSnow", label: "Static and snow", min: 0, max: 1, step: 0.05, default: 0.15 },
    { id: "jitterWave", label: "Jitter and wavy lines", min: 0, max: 1, step: 0.05, default: 0.15 },
    { id: "lumaNoise", label: "Luma noise", min: 0, max: 1, step: 0.05, default: 0.2 },
  ]),
});

/** Display label for one built-in effect, shared by settings and the manager. */
export function exomuxShaderEffectLabel(effect: ExomuxShaderEffect): string {
  switch (effect) {
    case "scanline":
      return "CRT scanlines";
    case "pincushion":
      return "CRT pincushion";
    case "vhs":
      return "VHS distortion";
  }
}

/** One user-supplied Ghostty shader entry; order is the application order. */
export interface ExomuxCustomShaderEntry {
  readonly path: string;
  readonly enabled: boolean;
}

/** One effect's on/off state and its parameter values. */
export interface ExomuxShaderEffectConfig {
  readonly enabled: boolean;
  /** Parameter id → value; missing entries fall back to each param's default. */
  readonly params: Readonly<Record<string, number>>;
}

/** The persisted shader configuration: each effect is enabled independently. */
export interface ExomuxShaderConfig {
  readonly effects: Readonly<Record<ExomuxShaderEffect, ExomuxShaderEffectConfig>>;
  /** User GLSL files chained after the built-ins, in application order. */
  readonly customShaders: readonly ExomuxCustomShaderEntry[];
}

/** Safe defaults: every effect off, each param at its default, no customs. */
export function defaultExomuxShaderConfig(): ExomuxShaderConfig {
  const effects = {} as Record<ExomuxShaderEffect, ExomuxShaderEffectConfig>;
  for (const effect of EXOMUX_SHADER_EFFECTS) {
    effects[effect] = Object.freeze({ enabled: false, params: exomuxShaderDefaults(effect) });
  }
  return Object.freeze({ effects: Object.freeze(effects), customShaders: Object.freeze([]) });
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
  const customSource = Array.isArray(record.customShaders) ? record.customShaders : [];
  const customShaders: ExomuxCustomShaderEntry[] = [];
  for (const entry of customSource.slice(0, 32)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
    if (path.length === 0 || path.length > 1024) continue;
    customShaders.push(Object.freeze({ path, enabled: candidate.enabled === true }));
  }
  return Object.freeze({ effects: Object.freeze(effects), customShaders: Object.freeze(customShaders) });
}

/** Formats a shader parameter (0–1) as a percentage, keeping a needed decimal (e.g. 2.5%). */
export function exomuxFormatShaderValue(value: number): string {
  return `${+(value * 100).toFixed(1)}%`;
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
/**
 * Source UV the pincushion shader samples for a given output UV — the exact CPU
 * mirror of the GLSL in `generateExomuxShader`, including the edge-midpoint
 * overscan zoom. Exomux warps the mouse through this so, on Ghostty, the block
 * cursor and click/scroll targets land under the OS pointer despite the
 * distortion (the shader displays output pixel `o` using source texel
 * `exomuxPincushionSource(o)`).
 */
/** The pincushion `magnitude` a shader config currently uses (its default when unset). */
export function exomuxPincushionMagnitude(config: ExomuxShaderConfig): number {
  const param = EXOMUX_SHADER_PARAMS.pincushion.find((entry) => entry.id === "magnitude")!;
  return exomuxShaderParamValue(config, "pincushion", param);
}

export function exomuxPincushionSource(
  u: number,
  v: number,
  magnitude: number,
): { readonly u: number; readonly v: number } {
  const cx = u * 2 - 1;
  const cy = v * 2 - 1;
  const r2 = cx * cx + cy * cy;
  const scale = (1 + magnitude * r2) / (1 + magnitude);
  return { u: (cx * scale) * 0.5 + 0.5, v: (cy * scale) * 0.5 + 0.5 };
}

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
      "// Exomux CRT pincushion distortion (mirrored on the CPU by",
      "// exomuxPincushionSource — keep the math identical).",
      "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
      "  vec2 uv = fragCoord / iResolution.xy;",
      "  vec2 centered = uv * 2.0 - 1.0;",
      `  float magnitude = ${value("magnitude")};`,
      "  float r2 = dot(centered, centered);",
      "  // Pincushion pulls content inward; the / (1 + magnitude) overscan zoom",
      "  // pulls the edge midpoints (r2 = 1) back out to the screen edge so only",
      "  // the corners keep a gap.",
      "  centered *= (1.0 + magnitude * r2) / (1.0 + magnitude);",
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
  if (effect === "vhs") {
    return [
      "// Exomux VHS distortion: five independently mixable tape artifacts.",
      "// Note: jitter/tracking displace the display horizontally and are",
      "// time-varying, so no static pointer-transform can mirror them — keep",
      "// them modest if pointer accuracy matters (see plan/todo/034 UX-010).",
      "float vhsHash(vec2 p) {",
      "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);",
      "}",
      "",
      "void mainImage(out vec4 fragColor, in vec2 fragCoord) {",
      "  vec2 uv = fragCoord / iResolution.xy;",
      `  float tracking = ${value("tracking")};`,
      `  float chromaBleed = ${value("chromaBleed")};`,
      `  float staticSnow = ${value("staticSnow")};`,
      `  float jitterWave = ${value("jitterWave")};`,
      `  float lumaNoise = ${value("lumaNoise")};`,
      "  float t = iTime;",
      "",
      "  // Jitter and wavy lines: the frame's rows shift horizontally, strongest",
      "  // toward the top and bottom the way a worn transport wobbles.",
      "  float edge = pow(abs(uv.y * 2.0 - 1.0), 2.0);",
      "  float wave = sin(uv.y * 60.0 + t * 6.3) * 0.0035 + sin(uv.y * 13.0 - t * 2.1) * 0.002;",
      "  float rowJitter = (vhsHash(vec2(floor(uv.y * iResolution.y), floor(t * 24.0))) - 0.5) * 0.002;",
      "  uv.x += (wave * edge + rowJitter) * jitterWave * 4.0;",
      "",
      "  // Tracking errors: an occasional band tears sideways and fills with hash.",
      "  float bandPos = fract(vhsHash(vec2(floor(t * 1.7), 3.0)) + t * 0.11);",
      "  float band = 1.0 - smoothstep(0.0, 0.08 + 0.10 * tracking, abs(uv.y - bandPos));",
      "  float bandGate = step(1.0 - 0.6 * tracking, vhsHash(vec2(floor(t * 1.7), 7.0)));",
      "  float tear = band * bandGate;",
      "  uv.x += tear * (vhsHash(vec2(floor(uv.y * iResolution.y), floor(t * 30.0))) - 0.5) * 0.12 * tracking;",
      "",
      "  // Color bleeding: chroma channels separate and smear past edges.",
      "  float bleed = chromaBleed * 0.006;",
      "  float r = texture(iChannel0, uv + vec2(bleed, 0.0)).r;",
      "  float g = texture(iChannel0, uv).g;",
      "  float b = texture(iChannel0, uv - vec2(bleed, 0.0)).b;",
      "  vec3 color = vec3(r, g, b);",
      "  color.rb = mix(color.rb, vec2(",
      "    texture(iChannel0, uv + vec2(bleed * 2.5, 0.0)).r,",
      "    texture(iChannel0, uv - vec2(bleed * 2.5, 0.0)).b), 0.35 * chromaBleed);",
      "",
      "  // The torn band loses signal: darker, noisier, desaturated.",
      "  float bandNoise = vhsHash(uv * iResolution.xy + floor(t * 30.0));",
      "  color = mix(color, vec3(bandNoise) * 0.7, tear * 0.65);",
      "",
      "  // Static and snow: sparse white/black flecks over everything.",
      "  float fleck = vhsHash(uv * iResolution.xy + vec2(floor(t * 60.0), 11.0));",
      "  float snowGate = step(1.0 - 0.03 * staticSnow, fleck);",
      "  float snowShade = step(0.5, vhsHash(uv * iResolution.xy + vec2(floor(t * 60.0), 13.0)));",
      "  color = mix(color, vec3(snowShade), snowGate);",
      "",
      "  // Luma noise: sandy grain that lives in the dark areas.",
      "  float luma = dot(color, vec3(0.299, 0.587, 0.114));",
      "  float grain = (vhsHash(uv * iResolution.xy + vec2(floor(t * 48.0), 29.0)) - 0.5);",
      "  color += grain * lumaNoise * 0.22 * (1.0 - luma);",
      "",
      "  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);",
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
  const customs = config.customShaders.filter((entry) => entry.enabled);
  if (enabled.length === 0 && customs.length === 0) {
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
  // User shaders chain after the built-ins, in list order — Ghostty applies
  // custom-shader entries in sequence, so the order is part of the config.
  for (const entry of customs) {
    lines.push(`custom-shader = ${entry.path}`);
    shaderPaths.push(entry.path);
  }
  lines.push("custom-shader-animation = true");
  await Deno.writeTextFile(configPath, `${lines.join("\n")}\n`);
  return { configPath, shaderPaths };
}

function joinPath(parent: string, child: string): string {
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/g, "")}${separator}${child.replace(/^[\\/]+/g, "")}`;
}

/**
 * Writes a managed Ghostty config that hides the terminal's own pointer while
 * typing (or clears it when off), so the block cursor pairs with a hidden OS
 * pointer. Returns the config path; wiring the include is the caller's job.
 */
export async function applyExomuxCursorConfig(
  configDirectory: string,
  hideWhileTyping: boolean,
): Promise<string> {
  const directory = exomuxShaderDirectory(configDirectory);
  await Deno.mkdir(directory, { recursive: true });
  const path = joinPath(directory, "cursor.conf");
  await Deno.writeTextFile(
    path,
    hideWhileTyping
      ? "# Managed by Exomux for the block cursor.\nmouse-hide-while-typing = true\n"
      : "# Managed by Exomux — block cursor off.\n",
  );
  return path;
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
