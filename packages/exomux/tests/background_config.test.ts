import { assert, assertEquals, assertRejects } from "./deps.ts";
import {
  cycleExomuxBackgroundSetting,
  defaultExomuxBackgroundSettings,
  EXOMUX_BACKGROUND_IDS,
  EXOMUX_BACKGROUND_SETTING_SPECS,
  exomuxBackgroundSettingsFor,
  normalizeButterchurnFavorites,
  normalizeExomuxBackgroundSettings,
  withExomuxBackgroundString,
} from "../model.ts";
import { exomuxBackgroundConfigLayout } from "../app.ts";
import {
  decodeExomuxImage,
  decodeExomuxJpeg,
  decodeExomuxPng,
  EXOMUX_IMAGE_EXTENSIONS,
  ExomuxImageField,
  isExomuxImageFile,
} from "../image_background.ts";
import { ExomuxButterchurnField } from "../butterchurn_background.ts";
import { EXOMUX_AUDIO_BANDS, EXOMUX_AUDIO_WAVEFORM, type ExomuxAudioSource } from "../audio.ts";

Deno.test("background settings: defaults, cycling and persistence round-trip", () => {
  // Every spec's first value is its default, so a fresh install needs no map.
  for (const id of EXOMUX_BACKGROUND_IDS) {
    const defaults = defaultExomuxBackgroundSettings(id);
    for (const spec of EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? []) {
      assertEquals(defaults[spec.id], spec.values[0]);
      // Every value formats to something visible.
      for (const value of spec.values) assert(spec.format(value).length > 0);
    }
  }

  // Cycling walks the value list and wraps; persistence keeps only valid values.
  let map = cycleExomuxBackgroundSetting({}, "butterchurn", "updateHz", 1);
  assertEquals(exomuxBackgroundSettingsFor(map, "butterchurn").updateHz, 120);
  map = cycleExomuxBackgroundSetting(map, "butterchurn", "updateHz", -2);
  assertEquals(exomuxBackgroundSettingsFor(map, "butterchurn").updateHz, 30);
  const restored = normalizeExomuxBackgroundSettings(JSON.parse(JSON.stringify(map)));
  assertEquals(exomuxBackgroundSettingsFor(restored, "butterchurn").updateHz, 30);

  // Junk is dropped wholesale rather than half-kept.
  assertEquals(normalizeExomuxBackgroundSettings(null), {});
  assertEquals(normalizeExomuxBackgroundSettings({ butterchurn: { updateHz: 999 } }), {});
  assertEquals(normalizeExomuxBackgroundSettings({ nonsense: { updateHz: 15 } }), {});

  // The image path is a free-form string setting, and survives the round trip.
  const withPath = withExomuxBackgroundString({}, "image", "path", "/tmp/x.png");
  assertEquals(normalizeExomuxBackgroundSettings(JSON.parse(JSON.stringify(withPath))).image?.path, "/tmp/x.png");
  // Unknown string keys do not.
  assertEquals(withExomuxBackgroundString({}, "image", "shell", "rm -rf"), {});
});

Deno.test("background settings: cycle time, update rate and audio mode are real knobs", () => {
  const bands = new Float32Array(EXOMUX_AUDIO_BANDS).fill(0.6);
  const waveform = new Float32Array(EXOMUX_AUDIO_WAVEFORM).map((_, i) => 0.6 * Math.sin(i / 9));
  const audio: ExomuxAudioSource = {
    frame: () => ({ level: 0.7, bass: 0.8, mid: 0.5, treble: 0.4, bands, waveform, beat: false, source: "synth" }),
    label: () => "scripted",
    close: () => {},
  };
  const BOUNDS = { column: 0, row: 0, width: 60, height: 20 };

  // A five-second cycle moves on where the default fifteen would still hold.
  const quick = new ExomuxButterchurnField({ gpu: false, audio, cycleSeconds: 5, presetIndex: 0 });
  let now = 0;
  const opening = quick.presetIndex;
  for (let frame = 0; frame < 60; frame += 1) {
    now += 125;
    quick.advance({ bounds: BOUNDS, now });
  }
  assert(quick.presetIndex !== opening, "a 5s cycle should have moved on within 7.5s");

  // Hold pins the opening preset for good.
  const held = new ExomuxButterchurnField({ gpu: false, audio, cycleSeconds: 0, presetIndex: 3 });
  now = 0;
  for (let frame = 0; frame < 200; frame += 1) {
    now += 125;
    held.advance({ bounds: BOUNDS, now });
  }
  assertEquals(held.presetIndex, 3, "Hold must never cycle");

  // A synth-mode field never spawns a recorder, so its label is immediate.
  const synth = new ExomuxButterchurnField({ gpu: false, cycleSeconds: 0, audioMode: "synth" });
  synth.advance({ bounds: BOUNDS, now: 0 });
  assertEquals(synth.audioLabel, "synth");
  synth.dispose();
});

Deno.test("background settings: butterchurn exposes a Favorites-only knob on both renderers", () => {
  for (const id of ["butterchurn", "butterchurn cpu"] as const) {
    const spec = (EXOMUX_BACKGROUND_SETTING_SPECS[id] ?? []).find((candidate) => candidate.id === "favoritesOnly");
    assert(spec, `${id} should offer a Favorites-only setting`);
    assertEquals(spec!.values, [false, true], "it is a boolean toggle defaulting to off");
  }
});

Deno.test("normalizeButterchurnFavorites keeps clean names and drops junk", () => {
  assertEquals(normalizeButterchurnFavorites(["a", "b"]), ["a", "b"]);
  // De-duplicates, preserving first-seen order.
  assertEquals(normalizeButterchurnFavorites(["a", "b", "a"]), ["a", "b"]);
  // Non-strings, empties, and non-arrays are rejected.
  assertEquals(normalizeButterchurnFavorites(["a", "", 3, null, "b"]), ["a", "b"]);
  assertEquals(normalizeButterchurnFavorites("nope"), []);
  assertEquals(normalizeButterchurnFavorites(undefined), []);
  // The result is frozen so callers cannot mutate the stored list.
  assert(Object.isFrozen(normalizeButterchurnFavorites(["a"])));
});

Deno.test("background config modal: layout scrolls the list and pins the options", () => {
  const bounds = { column: 0, row: 0, width: 120, height: 40 };
  const layout = exomuxBackgroundConfigLayout(bounds, 472, 300, 3);
  assert(layout.listRows.length > 5, "a large catalog should fill the list pane");
  assert(layout.listRows.some((row) => row.index === 300), "the selected row must be visible");
  assertEquals(layout.optionRows.length, 3);
  for (const row of layout.optionRows) {
    assert(row.row > layout.listRows[layout.listRows.length - 1]!.rect.row, "options sit below the list");
  }
  // No list: the modal shrinks instead of showing an empty pane.
  const bare = exomuxBackgroundConfigLayout(bounds, 0, 0, 1);
  assertEquals(bare.listRows.length, 0);
  assert(bare.rect.height < layout.rect.height);
});

Deno.test("background config modal: an explicit scrollTop scrolls the viewport off the selection", () => {
  const bounds = { column: 0, row: 0, width: 120, height: 40 };
  // Default (-1) follows the selection.
  const followed = exomuxBackgroundConfigLayout(bounds, 472, 300, 3);
  assert(followed.listRows.some((row) => row.index === 300), "the selection is visible when following");

  // An explicit top scrolls the window there, and the selection may be off-screen.
  const scrolled = exomuxBackgroundConfigLayout(bounds, 472, 300, 3, 10);
  assertEquals(scrolled.listRows[0]?.index, 10, "the window starts at the requested top");
  assert(!scrolled.listRows.some((row) => row.index === 300), "the selection can scroll out of view");

  // A too-large top is clamped so the last page never runs past the list.
  const clamped = exomuxBackgroundConfigLayout(bounds, 472, 0, 3, 100000);
  const visible = clamped.listRows.length;
  assertEquals(clamped.listRows[0]?.index, 472 - visible, "the top clamps to the final page");
  assertEquals(clamped.listRows[visible - 1]?.index, 471, "the last row is the final item");
});

/** Builds a tiny valid PNG in memory: 4x2, RGB, one red row and one blue row. */
async function tinyPng(): Promise<Uint8Array> {
  const width = 4;
  const height = 2;
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const at = row * (width * 3 + 1);
    raw[at] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      raw[at + 1 + x * 3] = row === 0 ? 255 : 0;
      raw[at + 1 + x * 3 + 2] = row === 0 ? 0 : 255;
    }
  }
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    // The decoder does not verify CRCs, so zeros suffice here.
    return out;
  };
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

Deno.test("image background: decodes a PNG and paints it as blocks", async () => {
  const png = await tinyPng();
  const image = await decodeExomuxPng(png);
  assertEquals([image.width, image.height], [4, 2]);
  assertEquals([image.pixels[0], image.pixels[1], image.pixels[2]], [255, 0, 0], "top-left is red");
  const bottomLeft = (image.width * 1 + 0) * 4;
  assertEquals([image.pixels[bottomLeft], image.pixels[bottomLeft + 2]], [0, 255], "bottom-left is blue");

  const field = new ExomuxImageField({ bytes: png });
  await field.ready;
  const bounds = { column: 0, row: 0, width: 40, height: 10 };
  assert(field.advance({ bounds, now: 0 }), "the first frame paints");
  const rows = field.rasterizeCells(bounds, undefined as never);
  let red = 0;
  let blue = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.foreground[0] > cell.foreground[2]) red += 1;
      else if (cell.foreground[2] > cell.foreground[0]) blue += 1;
    }
  }
  assert(red > 0 && blue > 0, "both halves of the picture should land on screen");
  // A static image stops reporting changes once painted.
  assertEquals(field.advance({ bounds, now: 125 }), false);
});

Deno.test("image background: garbage reports an error instead of throwing", async () => {
  const field = new ExomuxImageField({ bytes: new Uint8Array([1, 2, 3, 4]) });
  await field.ready;
  assert(field.error !== undefined);
  field.advance({ bounds: { column: 0, row: 0, width: 10, height: 4 }, now: 0 });
  assertEquals(
    field.rasterizeCells({ column: 0, row: 0, width: 10, height: 4 }, undefined as never).flat().filter(Boolean).length,
    0,
  );
});

Deno.test("image background: decodes a JPEG and dispatches PNG/JPEG by signature", async () => {
  assert(isExomuxImageFile("photo.JPG") && isExomuxImageFile("shot.jpeg") && isExomuxImageFile("art.png"));
  assert(!isExomuxImageFile("notes.txt") && !isExomuxImageFile("clip.gif"));
  assertEquals([...EXOMUX_IMAGE_EXTENSIONS], [".png", ".jpg", ".jpeg"]);

  const jpeg = await Deno.readFile(new URL("./fixtures/wallpaper.jpg", import.meta.url));
  assertEquals([jpeg[0], jpeg[1], jpeg[2]], [0xff, 0xd8, 0xff], "the fixture is a JPEG");
  const direct = decodeExomuxJpeg(jpeg);
  assertEquals([direct.width, direct.height], [8, 4]);
  // The signature dispatcher routes JPEG here and PNG to the PNG path.
  const dispatched = await decodeExomuxImage(jpeg);
  assertEquals([dispatched.width, dispatched.height], [8, 4]);
  await assertRejects(() => decodeExomuxImage(new Uint8Array([1, 2, 3, 4])), Error, "unsupported image format");

  const field = new ExomuxImageField({ bytes: jpeg });
  await field.ready;
  assertEquals(field.error, undefined, "a valid JPEG must decode without error");
  const bounds = { column: 0, row: 0, width: 40, height: 10 };
  assert(field.advance({ bounds, now: 0 }), "the first frame paints");
  let red = 0;
  let blue = 0;
  for (const row of field.rasterizeCells(bounds, undefined as never)) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.foreground[0] > cell.foreground[2]) red += 1;
      else if (cell.foreground[2] > cell.foreground[0]) blue += 1;
    }
  }
  assert(red > 0 && blue > 0, "both colour bands of the JPEG should land on screen");
});

Deno.test("shader config watcher delivers cross-process changes, once each", async () => {
  const { exomuxConfigFilePath, loadExomuxConfig, watchExomuxShaderConfig, writeExomuxConfig } = await import(
    "../config.ts"
  );
  const directory = await Deno.makeTempDir({ prefix: "exomux-shaderwatch-" });
  const path = exomuxConfigFilePath(directory);
  const base = await loadExomuxConfig(path); // creates defaults on first load

  const delivered: number[] = [];
  const watcher = watchExomuxShaderConfig(path, (shaders) => {
    delivered.push(shaders.effects.pincushion.params?.["magnitude"] ?? -1);
  }, { debounceMs: 20 });
  try {
    // Another process changes the pincushion distortion.
    const changed = {
      ...base,
      shaders: {
        ...base.shaders,
        effects: {
          ...base.shaders.effects,
          pincushion: {
            ...base.shaders.effects.pincushion,
            enabled: true,
            params: { magnitude: 0.125 },
          },
        },
      },
    };
    await writeExomuxConfig(path, changed);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assertEquals(delivered, [0.125]); // adopted, exactly once

    // An unrelated rewrite with IDENTICAL shaders stays silent.
    await writeExomuxConfig(path, { ...changed, themeId: changed.themeId });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assertEquals(delivered, [0.125]);
  } finally {
    watcher.close();
    await Deno.remove(directory, { recursive: true });
  }
});
