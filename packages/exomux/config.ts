// Copyright 2023 Im-Beast. MIT license.

// Durable user preferences, kept apart from ephemeral session/layout state.
//
// Themes, the chosen background, and every settings knob live in one JSON file
// under the XDG config directory (`~/.config/exomux/exomux.json`), so they
// survive reboots and host termination and are shared across every session.
// The active background image is copied beside it under `images/` so a chosen
// wallpaper keeps working even if the original file is later moved or deleted.

import {
  type ExomuxBackgroundId,
  exomuxBackgroundId,
  type ExomuxBackgroundSettingsMap,
  type ExomuxGlobalSettings,
  exomuxTheme,
  type ExomuxThemeId,
  normalizeExomuxBackgroundSettings,
  normalizeExomuxGlobalSettings,
} from "./model.ts";

/** Current on-disk config schema. */
export const EXOMUX_CONFIG_SCHEMA_VERSION = 1 as const;

/** The durable preference subset — everything the settings surfaces edit. */
export interface ExomuxConfig {
  readonly schemaVersion: typeof EXOMUX_CONFIG_SCHEMA_VERSION;
  readonly themeId: ExomuxThemeId;
  readonly backgroundId: ExomuxBackgroundId;
  readonly globalSettings: ExomuxGlobalSettings;
  readonly backgroundSettings: ExomuxBackgroundSettingsMap;
}

/** Safe factory defaults, also the target of `--reset-config`. */
export function defaultExomuxConfig(): ExomuxConfig {
  return normalizeExomuxConfig({});
}

/** Strictly normalizes any parsed value into a valid config, filling defaults. */
export function normalizeExomuxConfig(value: unknown): ExomuxConfig {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.freeze({
    schemaVersion: EXOMUX_CONFIG_SCHEMA_VERSION,
    themeId: exomuxTheme(record.themeId).id,
    backgroundId: exomuxBackgroundId(record.backgroundId),
    globalSettings: normalizeExomuxGlobalSettings(record.globalSettings),
    backgroundSettings: normalizeExomuxBackgroundSettings(record.backgroundSettings),
  });
}

/** `~/.config/exomux` (or `$XDG_CONFIG_HOME/exomux`, or `%APPDATA%\exomux`). */
export function defaultExomuxConfigDirectory(): string {
  let root: string | undefined;
  try {
    root = Deno.build.os === "windows"
      ? Deno.env.get("APPDATA") ?? Deno.env.get("USERPROFILE")
      : Deno.env.get("XDG_CONFIG_HOME") ??
        (Deno.env.get("HOME") ? joinPath(Deno.env.get("HOME")!, ".config") : undefined);
  } catch {
    root = undefined;
  }
  if (!root) throw new Error("No config directory is available (set HOME or XDG_CONFIG_HOME).");
  return joinPath(root, "exomux");
}

/** The config file path inside a config directory. */
export function exomuxConfigFilePath(directory: string): string {
  return joinPath(directory, "exomux.json");
}

/** The directory copied background images are kept in. */
export function exomuxConfigImagesDirectory(directory: string): string {
  return joinPath(directory, "images");
}

/** Reads and normalizes the config, returning defaults when it is absent or corrupt. */
export async function loadExomuxConfig(path: string): Promise<ExomuxConfig> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return defaultExomuxConfig();
    throw error;
  }
  try {
    return normalizeExomuxConfig(JSON.parse(text));
  } catch {
    // A corrupt file must not block launch; fall back to defaults.
    return defaultExomuxConfig();
  }
}

/** Atomically writes the config, creating the config directory if needed. */
export async function writeExomuxConfig(path: string, config: ExomuxConfig): Promise<void> {
  const directory = dirname(path);
  await Deno.mkdir(directory, { recursive: true });
  const temporary = `${path}.tmp-${crypto.randomUUID()}`;
  try {
    await Deno.writeTextFile(temporary, `${JSON.stringify(normalizeExomuxConfig(config), null, 2)}\n`);
    await Deno.rename(temporary, path);
  } finally {
    await Deno.remove(temporary).catch(() => undefined);
  }
}

/** Overwrites the config with safe defaults; returns what it wrote. */
export async function resetExomuxConfig(path: string): Promise<ExomuxConfig> {
  const defaults = defaultExomuxConfig();
  await writeExomuxConfig(path, defaults);
  return defaults;
}

/**
 * Copies a chosen background image into `<config>/images/` and returns the
 * copied path, so the wallpaper survives the original being moved or deleted.
 * A file already inside the images directory is returned unchanged. On any
 * failure the original path is returned — a wallpaper copy must never block
 * launch or a settings change.
 */
export async function persistExomuxBackgroundImage(
  configDirectory: string,
  sourcePath: string,
): Promise<string> {
  const imagesDirectory = exomuxConfigImagesDirectory(configDirectory);
  if (dirname(sourcePath) === imagesDirectory) return sourcePath;
  try {
    await Deno.mkdir(imagesDirectory, { recursive: true });
    const target = joinPath(imagesDirectory, basename(sourcePath));
    await Deno.copyFile(sourcePath, target);
    return target;
  } catch {
    return sourcePath;
  }
}

function joinPath(parent: string, child: string): string {
  const separator = Deno.build.os === "windows" ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/g, "")}${separator}${child.replace(/^[\\/]+/g, "")}`;
}

function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? "." : path.slice(0, index);
}

function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index < 0 ? path : path.slice(index + 1);
}
