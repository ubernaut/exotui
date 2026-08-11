// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import {
  defaultExomuxConfig,
  type ExomuxConfig,
  exomuxConfigFilePath,
  exomuxConfigImagesDirectory,
  loadExomuxConfig,
  normalizeExomuxConfig,
  persistExomuxBackgroundImage,
  resetExomuxConfig,
  writeExomuxConfig,
} from "../config.ts";
import {
  createExomuxConfigWriter,
  EXOMUX_HELP_TEXT,
  exomuxConfigToPreferences,
  parseExomuxShowcaseArgs,
} from "../main.ts";
import { withExomuxBackgroundString } from "../model.ts";

Deno.test("Exomux config normalizes junk to safe defaults", () => {
  const defaults = defaultExomuxConfig();
  assertEquals(defaults.themeId, "midnight");
  assertEquals(defaults.backgroundId, "metaballs");
  assertEquals(defaults.globalSettings.opacity, 0.85);
  // Unknown ids and out-of-range values fall back rather than persisting.
  const normalized = normalizeExomuxConfig({
    themeId: "not-a-theme",
    backgroundId: "not-a-background",
    globalSettings: { opacity: 0.123 },
    backgroundSettings: { image: { path: "/x.png" }, bogus: { nope: 1 } },
    extra: "ignored",
  });
  assertEquals(normalized.themeId, "midnight");
  assertEquals(normalized.backgroundId, "metaballs");
  assertEquals(normalized.globalSettings.opacity, 0.85);
  assertEquals(normalized.backgroundSettings.image?.path, "/x.png");
});

Deno.test("Exomux config round-trips through the filesystem and reset restores defaults", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-config-" });
  const path = exomuxConfigFilePath(directory);
  try {
    // A missing file reads as defaults; a corrupt one does too.
    assertEquals(await loadExomuxConfig(path), defaultExomuxConfig());
    await Deno.writeTextFile(path, "{ not valid json");
    assertEquals(await loadExomuxConfig(path), defaultExomuxConfig());

    const config: ExomuxConfig = {
      schemaVersion: 1,
      themeId: "t2",
      backgroundId: "image",
      globalSettings: { ...defaultExomuxConfig().globalSettings, opacity: 0.55 },
      backgroundSettings: withExomuxBackgroundString({}, "image", "path", "/wall.png"),
      shaders: defaultExomuxConfig().shaders,
    };
    await writeExomuxConfig(path, config);
    const reloaded = await loadExomuxConfig(path);
    assertEquals(reloaded.themeId, "t2");
    assertEquals(reloaded.backgroundId, "image");
    assertEquals(reloaded.globalSettings.opacity, 0.55);
    assertEquals(reloaded.backgroundSettings.image?.path, "/wall.png");

    const afterReset = await resetExomuxConfig(path);
    assertEquals(afterReset, defaultExomuxConfig());
    assertEquals(await loadExomuxConfig(path), defaultExomuxConfig());
  } finally {
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux copies a chosen wallpaper into the config images directory", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-image-copy-" });
  try {
    const source = `${directory}/source/pic.png`;
    await Deno.mkdir(`${directory}/source`, { recursive: true });
    await Deno.writeFile(source, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]));

    const stored = await persistExomuxBackgroundImage(directory, source);
    assertEquals(stored, `${exomuxConfigImagesDirectory(directory)}/pic.png`);
    // The copy survives the original being deleted.
    await Deno.remove(source);
    assert(await Deno.stat(stored).then(() => true).catch(() => false), "the copied wallpaper must persist");
    // A file already inside the images directory is returned unchanged.
    assertEquals(await persistExomuxBackgroundImage(directory, stored), stored);
  } finally {
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux preference writer persists changes and copies the wallpaper", async () => {
  const directory = await Deno.makeTempDir({ prefix: "exomux-pref-writer-" });
  const path = exomuxConfigFilePath(directory);
  try {
    const source = `${directory}/original.png`;
    await Deno.writeFile(source, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 1, 1, 1]));
    const writer = createExomuxConfigWriter(directory, path, defaultExomuxConfig());

    writer.writePreferences({
      themeId: "amber",
      backgroundId: "image",
      globalSettings: { ...defaultExomuxConfig().globalSettings, opacity: 0.7 },
      backgroundSettings: withExomuxBackgroundString({}, "image", "path", source),
    });
    // Debounced + best-effort; give the coalesced write time to land.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await Deno.stat(path).then(() => true).catch(() => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const reloaded = await loadExomuxConfig(path);
    assertEquals(reloaded.themeId, "amber");
    assertEquals(reloaded.globalSettings.opacity, 0.7);
    // The stored path points at the copied wallpaper, not the original.
    assertEquals(reloaded.backgroundSettings.image?.path, `${exomuxConfigImagesDirectory(directory)}/original.png`);

    // A shader write merges without wiping the preferences just written.
    writer.writeShaders({ enabled: true, effect: "pincushion", params: { magnitude: 0.4 } });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const c = await loadExomuxConfig(path);
      if (c.shaders.enabled) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const merged = await loadExomuxConfig(path);
    assertEquals(merged.shaders.enabled, true);
    assertEquals(merged.shaders.effect, "pincushion");
    assertEquals(merged.themeId, "amber", "the shader write must not wipe preferences");
  } finally {
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
  }
});

Deno.test("Exomux CLI parses help, reset, and config-dir flags", () => {
  assertEquals(parseExomuxShowcaseArgs(["--help"]).showHelp, true);
  assertEquals(parseExomuxShowcaseArgs(["-h"]).showHelp, true);
  assertEquals(parseExomuxShowcaseArgs(["--reset-config"]).resetConfig, true);
  assertEquals(parseExomuxShowcaseArgs(["--config-dir=/tmp/exo"]).configDirectory, "/tmp/exo");
  assertEquals(parseExomuxShowcaseArgs([]).showHelp, false);
  assertEquals(parseExomuxShowcaseArgs([]).resetConfig, false);

  // The help text lists every flag and points at the config location.
  for (const flag of ["-a", "-n", "--list-sessions", "--reset-config", "--config-dir", "-h, --help"]) {
    assert(EXOMUX_HELP_TEXT.includes(flag), `help must mention ${flag}`);
  }
  assert(EXOMUX_HELP_TEXT.includes("~/.config/exomux"));
});

Deno.test("Exomux config preferences round-trip through the preference subset", () => {
  const config = normalizeExomuxConfig({ themeId: "t2", backgroundId: "matrix" });
  const preferences = exomuxConfigToPreferences(config);
  assertEquals(preferences.themeId, "t2");
  assertEquals(preferences.backgroundId, "matrix");
  assertEquals(preferences.globalSettings, config.globalSettings);
  assertEquals(preferences.backgroundSettings, config.backgroundSettings);
});
