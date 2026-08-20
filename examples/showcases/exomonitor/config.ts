// What the user chose, kept between runs.
//
// A menu whose choices vanish on restart is a toggle, not configuration. This
// is deliberately forgiving: an unreadable or half-written file falls back to
// defaults rather than stopping the monitor, because a config file is never a
// good reason to fail to show a CPU graph.

import { feedById, FEEDS } from "./feeds.ts";

export interface MonitorConfig {
  /** Feed ids the user wants shown. */
  readonly enabled: readonly string[];
  /** Feed id to a pinned visualisation id. */
  readonly overrides: Readonly<Record<string, string>>;
  readonly themeId: string;
}

/**
 * The scalar feed of each source, plus the spectrum.
 *
 * Scalars because they are the readings that fit anywhere. Audio because a
 * feature nobody finds is a feature nobody has, and a machine with no recorder
 * simply never offers it.
 */
export const DEFAULT_FEEDS: readonly string[] = Object.freeze([
  "cpu:overall",
  "memory:used",
  "gpu:overall",
  "vram:used",
  "network:total",
  "temperature:hottest",
  "audio:spectrum",
]);

export const DEFAULT_CONFIG: MonitorConfig = Object.freeze({
  enabled: DEFAULT_FEEDS,
  overrides: Object.freeze({}),
  themeId: "midnight",
});

/** Parses a stored config, keeping only what is still meaningful. */
export function parseConfig(json: string): MonitorConfig {
  try {
    const parsed = JSON.parse(json) as Partial<MonitorConfig>;
    const wanted = Array.isArray(parsed.enabled) ? parsed.enabled as string[] : [];
    // A feed that no longer exists is dropped rather than carried forever.
    const enabled = FEEDS.filter((feed) => wanted.includes(feed.id)).map((feed) => feed.id);
    const overrides: Record<string, string> = {};
    if (parsed.overrides && typeof parsed.overrides === "object") {
      for (const [id, visualization] of Object.entries(parsed.overrides)) {
        if (feedById(id) && typeof visualization === "string") overrides[id] = visualization;
      }
    }
    return {
      enabled: enabled.length > 0 ? enabled : [...DEFAULT_CONFIG.enabled],
      overrides,
      themeId: typeof parsed.themeId === "string" && parsed.themeId.length > 0
        ? parsed.themeId
        : DEFAULT_CONFIG.themeId,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function configPath(): string {
  const base = Deno.env.get("XDG_CONFIG_HOME") ?? `${Deno.env.get("HOME") ?? "."}/.config`;
  return `${base}/exomonitor/config.json`;
}

export async function loadConfig(path = configPath()): Promise<MonitorConfig> {
  try {
    return parseConfig(await Deno.readTextFile(path));
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Writes the config, via a temporary file and a rename.
 *
 * A monitor saves on every change, so a crash mid-write is a real possibility;
 * renaming means the file is either the old config or the new one, never half
 * of each.
 */
export async function saveConfig(config: MonitorConfig, path = configPath()): Promise<void> {
  try {
    const directory = path.slice(0, path.lastIndexOf("/"));
    await Deno.mkdir(directory, { recursive: true });
    const temporary = `${path}.tmp`;
    await Deno.writeTextFile(temporary, `${JSON.stringify(config, null, 2)}\n`);
    await Deno.rename(temporary, path);
  } catch {
    // Read-only home, no permission — the monitor keeps running either way.
  }
}
