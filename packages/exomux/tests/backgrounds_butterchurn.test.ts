import { assert, assertAlmostEquals, assertEquals } from "./deps.ts";
import {
  EXOMUX_BUTTERCHURN_GPU_PRESETS,
  EXOMUX_BUTTERCHURN_PRESETS,
  EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS,
  exomuxButterchurnDebugLines,
  ExomuxButterchurnField,
  exomuxButterchurnGpuErrorLines,
  exomuxPresetLooksBlank,
} from "../butterchurn_background.ts";
import { EXOMUX_BUTTERCHURN_CATALOG, type ExomuxButterchurnPresetSource } from "../butterchurn_catalog.ts";
import { EXOMUX_BUTTERCHURN_ROTATION } from "../butterchurn_rotation.ts";
import { ExomuxButterchurnPreset, MILKDROP_DEFAULTS } from "../butterchurn_preset.ts";
import { EXOMUX_AUDIO_BANDS, EXOMUX_AUDIO_WAVEFORM, type ExomuxAudioFrame, type ExomuxAudioSource } from "../audio.ts";
import { EXOMUX_BACKGROUND_IDS, type ExomuxBackgroundId, exomuxBackgroundId, exomuxTheme } from "../model.ts";
import { exomuxBackgroundOvergrows } from "../overgrowth.ts";
import {
  type ExomuxAnimatedBackground,
  type ExomuxDisposableBackground,
  releaseExomuxIdleBackgrounds,
} from "../background.ts";

const THEME = exomuxTheme("midnight");
const BOUNDS = { column: 4, row: 3, width: 60, height: 20 };
/** A window rect inside `BOUNDS`, for the click-routing tests. */
const WINDOW = { column: BOUNDS.column + 10, row: BOUNDS.row + 4, width: 24, height: 8 };

/** Every glyph the field is allowed to paint. */
const SHADES = new Set(["░", "▒", "▓", "█"]);

interface ScriptOptions {
  readonly level?: number;
  readonly beatEvery?: number;
}

/**
 * Deterministic stand-in for the microphone. Every test drives the field
 * through this so nothing spawns a recorder and frames are reproducible.
 */
function scriptedAudio(options: ScriptOptions = {}): ExomuxAudioSource {
  const level = options.level ?? 0.7;
  const bands = new Float32Array(EXOMUX_AUDIO_BANDS);
  const waveform = new Float32Array(EXOMUX_AUDIO_WAVEFORM);
  let frames = 0;
  return {
    frame(): ExomuxAudioFrame {
      frames += 1;
      const phase = frames * 0.125;
      const kick = Math.max(0, Math.sin(phase * Math.PI * 2));
      for (let band = 0; band < bands.length; band += 1) {
        bands[band] = level * Math.max(0, 0.5 + 0.4 * Math.sin(phase * (0.9 + band * 0.2) + band));
      }
      for (let index = 0; index < waveform.length; index += 1) {
        waveform[index] = level * Math.sin((index / waveform.length) * Math.PI * 6 + phase * 4);
      }
      const beatEvery = options.beatEvery ?? 0;
      return {
        level,
        bass: level * (0.5 + 0.4 * kick),
        mid: level * 0.6,
        treble: level * 0.5,
        bands,
        waveform,
        beat: beatEvery > 0 && frames % beatEvery === 0,
        source: "synth",
      };
    },
    label: () => "scripted",
    close: () => {},
  };
}

function run(
  field: ExomuxButterchurnField,
  frames: number,
  options: { readonly startAt?: number; readonly obstacles?: readonly typeof WINDOW[] } = {},
): number {
  let now = options.startAt ?? 0;
  const obstacles = options.obstacles ?? [];
  for (let frame = 0; frame < frames; frame += 1) {
    now += 125;
    field.advance({ bounds: BOUNDS, obstacles, solidObstacles: obstacles, now });
  }
  return now;
}

/** Total painted cells and the summed brightness of the rendered frame. */
function inkStats(field: ExomuxButterchurnField): { painted: number; brightness: number } {
  let painted = 0;
  let brightness = 0;
  for (const row of field.rasterizeCells(BOUNDS, THEME)) {
    for (const cell of row) {
      if (!cell) continue;
      painted += 1;
      brightness += cell.foreground[0] + cell.foreground[1] + cell.foreground[2];
    }
  }
  return { painted, brightness };
}

function frameText(field: ExomuxButterchurnField): string {
  return field.rasterizeCells(BOUNDS, THEME)
    .map((row) => row.map((cell) => (cell ? `${cell.char}${cell.foreground.join(",")}` : " ")).join("|"))
    .join("\n");
}

/** A preset source with everything defaulted, for pipeline tests. */
function source(overrides: Partial<ExomuxButterchurnPresetSource>): ExomuxButterchurnPresetSource {
  return {
    name: "test",
    baseVals: {},
    init: "",
    frame: "",
    pixel: "",
    warp: "",
    warpSamplers: [],
    comp: "",
    compSamplers: [],
    waves: [],
    shapes: [],
    ...overrides,
  };
}

// ── catalog ─────────────────────────────────────────────────────────────────

Deno.test("butterchurn: the vendored catalog is every upstream pack merged", () => {
  // base (107) + extra (186) is what the parent demo shows; image, md1, minimal
  // and nonMinimal bring the rest.
  assertEquals(EXOMUX_BUTTERCHURN_CATALOG.length, 472);
  const names = new Set(EXOMUX_BUTTERCHURN_CATALOG.map((preset) => preset.name));
  assertEquals(names.size, EXOMUX_BUTTERCHURN_CATALOG.length, "preset names identify entries, so they must be unique");

  // Case-insensitive ordering, matching the parent demo's own sort, so that
  // "next preset" walks the catalog in the same order upstream does.
  const sorted = [...EXOMUX_BUTTERCHURN_CATALOG].sort((left, right) => {
    const a = left.name.toLowerCase();
    const b = right.name.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  });
  assertEquals(EXOMUX_BUTTERCHURN_CATALOG.map((p) => p.name), sorted.map((p) => p.name));

  // Equations are what make presets differ; a catalog of bare parameters would
  // render 293 variations of the same picture.
  const withFrame = EXOMUX_BUTTERCHURN_CATALOG.filter((preset) => preset.frame.trim().length > 0);
  assert(withFrame.length > 400, `expected most presets to carry frame equations, got ${withFrame.length}`);
});

Deno.test("butterchurn: the field cycles the whole catalog", () => {
  // The curated rotation is no longer the filter. It was audited against a
  // renderer that could not compile a third of the catalog, and predates the
  // catalog growing to 472, so applying it would hide the presets just added.
  assertEquals(EXOMUX_BUTTERCHURN_PRESETS.length, EXOMUX_BUTTERCHURN_CATALOG.length);

  // It is still a valid list of names, and still worth regenerating.
  const catalog = new Set(EXOMUX_BUTTERCHURN_CATALOG.map((preset) => preset.name));
  for (const name of EXOMUX_BUTTERCHURN_ROTATION) {
    assert(catalog.has(name), `rotation names a preset the catalog does not have: ${name}`);
  }
  assertEquals(new Set(EXOMUX_BUTTERCHURN_ROTATION).size, EXOMUX_BUTTERCHURN_ROTATION.length, "no duplicates");
});

Deno.test("butterchurn: every preset in the catalog loads without throwing", () => {
  // A preset whose equations fail to compile still has to render as a static
  // parameter dump rather than take the desktop down.
  const audio = {
    bass: 1.2,
    mid: 1,
    treb: 0.8,
    bassAttack: 1.1,
    midAttack: 1,
    trebleAttack: 0.8,
    waveform: new Float32Array(64).map((_unused, index) => Math.sin(index * 0.3)),
  };
  let animated = 0;
  for (const entry of EXOMUX_BUTTERCHURN_CATALOG) {
    const preset = new ExomuxButterchurnPreset(entry, { random: () => 0.5 });
    preset.setSize(40, 12);
    preset.advance(audio, 1, 8, 8);
    if (preset.animated) animated += 1;
    for (const value of preset.mesh) assert(Number.isFinite(value), `${entry.name} produced a non-finite mesh`);
    for (let index = 0; index < preset.waveCount * 2; index += 1) {
      assert(Number.isFinite(preset.wave[index]!), `${entry.name} produced a non-finite wave vertex`);
    }
    assert(Number.isFinite(preset.values.decay), `${entry.name} produced a non-finite decay`);
  }
  // 288 of 293 carry frame equations that compile. Two have none at all, and
  // three have `is_beat` split across a newline in the upstream JSON — corrupt
  // source Butterchurn cannot parse either. Those five load as static parameter
  // dumps instead of failing. Pinned exactly so a parser regression that
  // silently drops presets shows up here.
  assertEquals(animated, 460, "the number of presets with usable frame equations changed");
});

// ── the MilkDrop pipeline ───────────────────────────────────────────────────

Deno.test("butterchurn: base values are restored before every frame", () => {
  // The catalog's most common idiom is `wave_r = wave_r + <oscillation>`. It
  // only oscillates because MilkDrop resets wave_r to its base value first;
  // without that it walks off to infinity within seconds.
  const preset = new ExomuxButterchurnPreset(
    source({ baseVals: { wave_r: 0.4 }, frame: "wave_r = wave_r + 0.1;" }),
    { random: () => 0.5 },
  );
  preset.setSize(40, 12);
  const audio = silentAudio();
  for (let frame = 0; frame < 20; frame += 1) preset.advance(audio, frame * 0.125, frame, 8);
  assertAlmostEquals(preset.values.waveR, 0.5, 1e-9, "wave_r must restart from its base value each frame");
});

Deno.test("butterchurn: user variables persist across frames but q variables reset", () => {
  const preset = new ExomuxButterchurnPreset(
    source({ init: "q1 = 5; carried = 100;", frame: "carried = carried + 1; q1 = q1 + 1; seen = q1;" }),
    { random: () => 0.5 },
  );
  preset.setSize(40, 12);
  const audio = silentAudio();
  for (let frame = 0; frame < 4; frame += 1) preset.advance(audio, frame * 0.125, frame, 8);
  // An accumulator the preset invented keeps counting...
  assertEquals(preset.variable("carried"), 104);
  // ...while q1 restarts from its post-init value every frame, so it only ever
  // reaches 6. This is the rule that makes q variables a frame-local channel.
  assertEquals(preset.variable("seen"), 6);
});

Deno.test("butterchurn: pixel equations run per vertex and reshape the warp mesh", () => {
  const flat = new ExomuxButterchurnPreset(source({ baseVals: { zoom: 1 } }), { random: () => 0.5 });
  flat.setSize(40, 12);
  flat.advance(silentAudio(), 0, 0, 8);

  // A zoom that varies with radius must bend the mesh, not translate it.
  const domed = new ExomuxButterchurnPreset(
    source({ baseVals: { zoom: 1 }, pixel: "zoom = 1 + 0.3 * rad;" }),
    { random: () => 0.5 },
  );
  domed.setSize(40, 12);
  domed.advance(silentAudio(), 0, 0, 8);

  const centre = (flat.meshHeight / 2) * (flat.meshWidth + 1) + flat.meshWidth / 2;
  assertAlmostEquals(flat.mesh[centre * 2]!, domed.mesh[centre * 2]!, 1e-6, "the centre has rad 0, so it cannot move");
  const corner = 0;
  assert(
    Math.abs(flat.mesh[corner * 2]! - domed.mesh[corner * 2]!) > 0.01,
    "a radius-dependent zoom must displace the corners",
  );
});

Deno.test("butterchurn: an identity preset leaves the warp mesh as the identity map", () => {
  // zoom 1, no rotation, translation, stretch or warp should sample each cell
  // from itself; anything else means the coordinate composition is wrong.
  const preset = new ExomuxButterchurnPreset(source({ baseVals: { warp: 0 } }), { random: () => 0.5 });
  preset.setSize(64, 16);
  preset.advance(silentAudio(), 0, 0, 8);
  const gridX = preset.meshWidth;
  const gridY = preset.meshHeight;
  for (let iy = 0; iy <= gridY; iy += 1) {
    for (let ix = 0; ix <= gridX; ix += 1) {
      const offset = (iy * (gridX + 1) + ix) * 2;
      assertAlmostEquals(preset.mesh[offset]!, ix / gridX, 1e-5, `u at ${ix},${iy}`);
      // Mesh row 0 is the top of the screen, matching how the renderer walks
      // cells, so v runs 0..1 downward.
      assertAlmostEquals(preset.mesh[offset + 1]!, iy / gridY, 1e-5, `v at ${ix},${iy}`);
    }
  }
});

Deno.test("butterchurn: defaults fill in the values a preset omits", () => {
  const preset = new ExomuxButterchurnPreset(source({ baseVals: { zoom: 1.5 } }), { random: () => 0.5 });
  preset.setSize(40, 12);
  preset.advance(silentAudio(), 0, 0, 8);
  assertEquals(preset.variable("zoom"), 1.5, "the preset's own value wins");
  assertEquals(preset.variable("decay"), MILKDROP_DEFAULTS.decay, "and everything else comes from MilkDrop's defaults");
  assertEquals(preset.variable("cx"), 0.5);
});

function silentAudio() {
  return {
    bass: 1,
    mid: 1,
    treb: 1,
    bassAttack: 1,
    midAttack: 1,
    trebleAttack: 1,
    waveform: new Float32Array(64),
  };
}

// ── the field ───────────────────────────────────────────────────────────────

Deno.test("butterchurn: registered as a desktop background that does not overgrow windows", () => {
  assert(EXOMUX_BACKGROUND_IDS.includes("butterchurn"), "the background must be selectable");
  assertEquals(exomuxBackgroundId("butterchurn"), "butterchurn");
  // A visualizer composed around the screen centre smears into noise when it is
  // tiled over window chrome, so it stays out of the reclaim set.
  assertEquals(exomuxBackgroundOvergrows("butterchurn"), false);
});

Deno.test("butterchurn: paints only the block shade ramp", () => {
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio() });
  run(field, 60);
  const chars = new Set<string>();
  for (const row of field.rasterizeCells(BOUNDS, THEME)) {
    for (const cell of row) {
      if (cell) chars.add(cell.char);
    }
  }
  assert(chars.size > 1, "a settled frame should use more than one shade");
  for (const char of chars) assert(SHADES.has(char), `unexpected glyph ${JSON.stringify(char)}`);
});

Deno.test("butterchurn: brightness tracks the microphone level", () => {
  const readings = [0.15, 0.5, 0.95].map((level) => {
    const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio({ level }), autoCycle: false });
    run(field, 90);
    return { level, ...inkStats(field) };
  });
  for (let index = 1; index < readings.length; index += 1) {
    const quieter = readings[index - 1]!;
    const louder = readings[index]!;
    assert(
      louder.brightness > quieter.brightness * 1.1,
      `level ${louder.level} should be brighter than ${quieter.level}: ${quieter.brightness} -> ${louder.brightness}`,
    );
  }
});

Deno.test("butterchurn: same audio and frame timeline replay identically", () => {
  const left = new ExomuxButterchurnField({
    gpu: false,
    audio: scriptedAudio({ beatEvery: 5 }),
    presetIndex: 3,
    seed: 9,
  });
  const right = new ExomuxButterchurnField({
    gpu: false,
    audio: scriptedAudio({ beatEvery: 5 }),
    presetIndex: 3,
    seed: 9,
  });
  run(left, 120);
  run(right, 120);
  assertEquals(frameText(left), frameText(right));

  const other = new ExomuxButterchurnField({
    gpu: false,
    audio: scriptedAudio({ beatEvery: 5 }),
    presetIndex: 11,
    seed: 9,
  });
  run(other, 120);
  assert(frameText(other) !== frameText(left), "a different preset should look different");
});

Deno.test("butterchurn: presets cycle on a timer and crossfade rather than snap", () => {
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), presetIndex: 0 });
  assertEquals(field.presetIndex, 0);
  assertEquals(field.presetName, EXOMUX_BUTTERCHURN_PRESETS[0]!.name);

  // The hold is 15 s; at 125 ms a frame that is 120 frames.
  run(field, 100);
  assertEquals(field.presetIndex, 0, "the first preset should still be holding");
  run(field, 40, { startAt: 100 * 125 });
  assert(field.presetIndex !== 0, "the field should have advanced off the opening preset");

  const held = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), presetIndex: 0, autoCycle: false });
  run(held, 400);
  assertEquals(held.presetIndex, 0, "auto-cycle off must leave the opening preset alone");

  // Selection wraps in both directions rather than throwing.
  const wrapping = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), autoCycle: false });
  wrapping.selectPreset(-1);
  assertEquals(wrapping.presetIndex, EXOMUX_BUTTERCHURN_PRESETS.length - 1);
  wrapping.selectPreset(EXOMUX_BUTTERCHURN_PRESETS.length + 2);
  assertEquals(wrapping.presetIndex, 2);
});

Deno.test("butterchurn: clicking a window is not claimed, so its chrome still works", () => {
  // The desktop only withholds clicks that land on a window's client area, so
  // a field claiming everything else eats title bars, borders and their
  // buttons — and with them dragging, resizing and closing windows.
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), presetIndex: 2, autoCycle: false });
  run(field, 10, { obstacles: [WINDOW] });

  const titleBar = { column: WINDOW.column + 3, row: WINDOW.row };
  const border = { column: WINDOW.column, row: WINDOW.row + WINDOW.height - 1 };
  const inside = { column: WINDOW.column + 2, row: WINDOW.row + 2 };
  for (const point of [titleBar, border, inside]) {
    assertEquals(field.pick(point.column, point.row), false, `claimed a click at ${point.column},${point.row}`);
  }
  assertEquals(field.presetIndex, 2, "and no click over a window changed the preset");

  // Bare desktop beside the window is still claimed.
  assertEquals(field.pick(BOUNDS.column, BOUNDS.row), true);
  assert(field.presetIndex !== 2, "a claimed click should have moved the preset on");
});

Deno.test("butterchurn: clicking the bare desktop skips to the next preset", () => {
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), presetIndex: 4, autoCycle: false });
  run(field, 20);
  assertEquals(field.presetIndex, 4);

  // The click is claimed, which is what stops the desktop treating it as a
  // plain background click, and it moves the preset on.
  const seen = [field.presetIndex];
  assertEquals(field.pick(10, 10), true);
  seen.push(field.presetIndex);
  assertEquals(field.pick(0, 0), true);
  seen.push(field.presetIndex);
  assertEquals(new Set(seen).size, 3, `clicks should each land somewhere new, got ${seen}`);

  // It works with auto-cycling off, which is the case where waiting is not an
  // option, and from the end of the catalog as readily as anywhere else.
  const last = new ExomuxButterchurnField({
    gpu: false,
    audio: scriptedAudio(),
    presetIndex: EXOMUX_BUTTERCHURN_PRESETS.length - 1,
    autoCycle: false,
  });
  last.pick(1, 1);
  assert(last.presetIndex !== EXOMUX_BUTTERCHURN_PRESETS.length - 1);
});

Deno.test("butterchurn: stepping back retraces what was shown, not the catalog", () => {
  // The play order is shuffled, so stepping back by catalog index would land on
  // a preset nobody has seen. Going back must undo the last step.
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), presetIndex: 3, autoCycle: false });
  const visited = [field.presetIndex];
  for (let step = 0; step < 5; step += 1) {
    field.stepPreset(1);
    visited.push(field.presetIndex);
  }
  for (let step = visited.length - 2; step >= 0; step -= 1) {
    field.stepPreset(-1);
    assertEquals(field.presetIndex, visited[step], `step back ${step} left the retraced order`);
  }
  // Already at the oldest entry, another step back stays put rather than wrapping
  // into presets that were never on screen.
  field.stepPreset(-1);
  assertEquals(field.presetIndex, visited[0]);
  assertEquals(field.presetCount, EXOMUX_BUTTERCHURN_PRESETS.length);
});

Deno.test("butterchurn: the order is shuffled but covers everything before repeating", () => {
  // Sequential order means the same handful of presets every session, and the
  // catalog is alphabetical so those neighbours are variations on each other.
  // Picking at random instead would repeat and starve in equal measure, so the
  // order is a permutation.
  const count = EXOMUX_BUTTERCHURN_PRESETS.length;
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), presetIndex: 0, autoCycle: false });
  const seen: number[] = [field.presetIndex];
  for (let step = 1; step < count; step += 1) {
    field.stepPreset(1);
    seen.push(field.presetIndex);
  }
  // The opening preset is chosen by the caller and sits outside the shuffle;
  // the permutation is what follows it.
  field.stepPreset(1);
  seen.push(field.presetIndex);
  assertEquals(new Set(seen.slice(1)).size, count, "a full pass should visit every preset exactly once");
  assert(
    seen.slice(1, 13).some((index, at) => index !== seen[1]! + at),
    "the order should not simply be the catalog's",
  );
  for (let step = 1; step < seen.length; step += 1) {
    assert(seen[step] !== seen[step - 1], "no preset should follow itself");
  }

  // A seeded field is reproducible, which is what keeps these tests meaningful.
  const same = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), presetIndex: 0, autoCycle: false });
  const repeat: number[] = [same.presetIndex];
  for (let step = 1; step < 20; step += 1) {
    same.stepPreset(1);
    repeat.push(same.presetIndex);
  }
  assertEquals(repeat, seen.slice(0, 20));
  const different = new ExomuxButterchurnField({
    gpu: false,
    audio: scriptedAudio(),
    presetIndex: 0,
    autoCycle: false,
    seed: 99,
  });
  const other: number[] = [different.presetIndex];
  for (let step = 1; step < 20; step += 1) {
    different.stepPreset(1);
    other.push(different.presetIndex);
  }
  assert(other.join() !== repeat.join(), "a different seed should shuffle differently");
});

Deno.test("butterchurn: a crossfade draws both presets before settling on the new one", () => {
  // Two presets that actually look different, found rather than assumed: the
  // catalog is regenerated from upstream packs, so fixed indices drift.
  const settled = (index: number) => {
    const field = new ExomuxButterchurnField({
      gpu: false,
      audio: scriptedAudio(),
      presetIndex: index,
      autoCycle: false,
      seed: 4,
    });
    run(field, 66);
    return frameText(field);
  };
  let from = -1;
  let to = -1;
  for (let index = 0; index < 40 && to < 0; index += 1) {
    const text = settled(index);
    if (!text.trim()) continue;
    if (from < 0) from = index;
    else if (text !== settled(from)) to = index;
  }
  assert(from >= 0 && to >= 0, "expected two presets that render differently");

  const blending = new ExomuxButterchurnField({
    gpu: false,
    audio: scriptedAudio(),
    presetIndex: from,
    autoCycle: false,
    seed: 4,
  });
  run(blending, 60);
  // Selected rather than stepped: the play order is shuffled, and this test is
  // about the crossfade, not about which preset comes next.
  blending.selectPreset(to);
  run(blending, 6, { startAt: 60 * 125 });
  assertEquals(blending.presetIndex, to);
  assert(frameText(blending) !== settled(to), "a blend in progress is not the destination preset alone");
});

Deno.test("butterchurn: the software fallback never saturates the desktop", () => {
  // The rotation is selected against the GPU renderer, which resolves nearly
  // the whole catalog. The software fallback resolves far fewer of them to an
  // image, so blanks here are expected rather than a defect. What must not
  // happen is a preset whose feedback loop runs away and floods the desktop,
  // because that is both unreadable and unrecoverable.
  let saturated = 0;
  let rendered = 0;
  const cells = BOUNDS.width * BOUNDS.height;
  for (let index = 0; index < EXOMUX_BUTTERCHURN_PRESETS.length; index += 1) {
    const field = new ExomuxButterchurnField({
      gpu: false,
      audio: scriptedAudio({ level: 0.9 }),
      presetIndex: index,
      autoCycle: false,
    });
    run(field, 50);
    // Full coverage is normal — MilkDrop fills the frame. The failure is a
    // flat field of the brightest shade, which carries no image at all.
    let full = 0;
    let painted = 0;
    for (const row of field.rasterizeCells(BOUNDS, THEME)) {
      for (const cell of row) {
        if (!cell) continue;
        painted += 1;
        if (cell.char === "█") full += 1;
      }
    }
    if (full / cells > 0.9) saturated += 1;
    if (painted / cells > 0.02) rendered += 1;
  }
  // The brightness governor is what makes this zero: without it ten presets
  // accumulate into a flat white field, having lost the composite shader that
  // would have held them down.
  assertEquals(saturated, 0, `${saturated} presets saturated the desktop on the software path`);
  assert(rendered > 100, `the software fallback should still render many presets, got ${rendered}`);
});

Deno.test("butterchurn: the output palette stays inside the painter's style cache", () => {
  // The desktop painter caches ANSI styles per colour and drops the whole cache
  // at 8192 entries. Unquantized this field mints hundreds of new colours per
  // tick, which would flush that cache every couple of seconds.
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio({ level: 0.9 }) });
  const palette = new Set<number>();
  let now = 0;
  for (let frame = 0; frame < 600; frame += 1) {
    now += 125;
    field.advance({ bounds: BOUNDS, now });
    for (const row of field.rasterizeCells(BOUNDS, THEME)) {
      for (const cell of row) {
        if (!cell) continue;
        const [red, green, blue] = cell.foreground;
        palette.add((red << 16) | (green << 8) | blue);
      }
    }
  }
  assert(palette.size > 8, "a visualizer with under a dozen colours is not rendering a gradient");
  assert(palette.size < 4913, `palette grew past the quantization grid: ${palette.size}`);
});

Deno.test("butterchurn: survives resizing and rejects an empty rect", () => {
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio() });
  run(field, 40);

  let now = 40 * 125;
  const wide = { column: 0, row: 0, width: 120, height: 40 };
  for (let frame = 0; frame < 20; frame += 1) {
    now += 125;
    assertEquals(field.advance({ bounds: wide, now }), true);
  }
  const rows = field.rasterizeCells(wide, THEME);
  assertEquals(rows.length, wide.height);
  assertEquals(rows[0]!.length, wide.width);

  // A rect the field has not simulated paints nothing rather than reading off
  // the end of the buffer it does have.
  assertEquals(field.rasterizeCells(BOUNDS, THEME).length, 0);
  assertEquals(field.advance({ bounds: { column: 0, row: 0, width: 0, height: 0 }, now: now + 125 }), false);
});

Deno.test("butterchurn: the pointer leaves a mark and dispose leaves an injected source alone", () => {
  let closed = false;
  const tracked: ExomuxAudioSource = { ...scriptedAudio({ level: 0.2 }), close: () => (closed = true) };
  const withPointer = new ExomuxButterchurnField({ gpu: false, audio: tracked, autoCycle: false, presetIndex: 0 });
  for (let frame = 0; frame < 30; frame += 1) {
    const now = (frame + 1) * 125;
    withPointer.setPointer({ column: BOUNDS.column + 1, row: BOUNDS.row + 1 }, now);
    withPointer.advance({ bounds: BOUNDS, now });
  }
  assert(withPointer.rasterizeCells(BOUNDS, THEME)[1]![1], "the pointer should deposit ink under the cursor");

  withPointer.clearPointer();
  // The field did not open this source, so it must not close it either.
  withPointer.dispose();
  assertEquals(closed, false);
});

Deno.test("butterchurn: a stalled desktop tick fades rather than freezing", () => {
  const steady = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), autoCycle: false });
  run(steady, 40);
  const before = inkStats(steady).brightness;
  // One 400 ms tick is worth several frames of decay; the field must apply it
  // instead of treating the gap as a single frame and leaving a bright ghost.
  steady.advance({ bounds: BOUNDS, now: 40 * 125 + 400 });
  const after = inkStats(steady).brightness;
  assert(after > 0, "a stall should not blank the field");
  assert(after < before * 1.6, `a stalled tick brightened the field: ${before} -> ${after}`);
});

Deno.test("releaseExomuxIdleBackgrounds: frees the microphone when another background takes over", () => {
  const disposals: string[] = [];
  const disposable = (name: string): ExomuxDisposableBackground => ({
    setPointer: () => {},
    clearPointer: () => {},
    advance: () => true,
    rasterizeCells: () => [],
    dispose: () => disposals.push(name),
  });
  const plain = (): ExomuxAnimatedBackground => ({
    setPointer: () => {},
    clearPointer: () => {},
    advance: () => true,
    rasterizeCells: () => [],
  });

  const fields = new Map<ExomuxBackgroundId, ExomuxAnimatedBackground>([
    ["butterchurn", disposable("butterchurn")],
    ["jungle", plain()],
  ]);

  // The selected field keeps its resource; a plain field is never disturbed, so
  // switching away and back still resumes its simulation.
  releaseExomuxIdleBackgrounds(fields, "butterchurn");
  assertEquals(disposals, []);
  assertEquals([...fields.keys()].sort(), ["butterchurn", "jungle"]);

  // Selecting something else releases the microphone and drops the field, so
  // the next selection rebuilds it rather than reviving a closed handle.
  releaseExomuxIdleBackgrounds(fields, "jungle");
  assertEquals(disposals, ["butterchurn"]);
  assertEquals([...fields.keys()], ["jungle"]);

  // Tearing the desktop down releases everything left.
  fields.set("butterchurn", disposable("again"));
  releaseExomuxIdleBackgrounds(fields);
  assertEquals(disposals, ["butterchurn", "again"]);
  assertEquals([...fields.keys()], ["jungle"]);
});

Deno.test("butterchurn: reports which renderer is drawing", () => {
  // The software fallback resolves far fewer presets than the GPU path, so its
  // symptom — most presets rendering nothing — looks exactly like a broken
  // background. The field has to be able to say which one it is on.
  const software = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio(), autoCycle: false });
  assertEquals(software.renderer, "software", "gpu off resolves immediately, with no starting window");
  assertEquals(software.gpuActive, false);
  run(software, 5);
  assertEquals(software.renderer, "software", "and stays there");

  // With the GPU wanted, the field reports "starting" until the device request
  // is answered, rather than claiming a renderer it does not have yet.
  const wanting = new ExomuxButterchurnField({ audio: scriptedAudio(), autoCycle: false });
  assertEquals(wanting.renderer, "starting");
  assertEquals(wanting.gpuActive, false);
  wanting.dispose();
});

Deno.test("butterchurn: never blanks the desktop while waiting on the GPU", () => {
  // The field used to hand the frame to the GPU as soon as a device was ready,
  // before any GPU frame had actually been read back. Everything the software
  // renderer had drawn stopped updating at that moment, so the desktop sat
  // black for as long as the device took to answer — and indefinitely if it
  // never did. The software renderer keeps drawing until the GPU has proved it
  // can produce a frame, so there is no window where nothing is painted.
  const field = new ExomuxButterchurnField({ gpu: false, audio: scriptedAudio({ level: 0.9 }), autoCycle: true });
  let blankRun = 0;
  let longestBlank = 0;
  let now = 0;
  for (let frame = 0; frame < 240; frame += 1) {
    now += 125;
    field.advance({ bounds: BOUNDS, now });
    let painted = 0;
    for (const row of field.rasterizeCells(BOUNDS, THEME)) {
      for (const cell of row) if (cell) painted += 1;
    }
    // The first frames legitimately start from an empty field.
    if (frame <= 4) continue;
    blankRun = painted === 0 ? blankRun + 1 : 0;
    longestBlank = Math.max(longestBlank, blankRun);
  }
  // Not "never blank": the software path cannot resolve every preset, and the
  // order is shuffled, so landing on one that draws nothing is expected. What
  // must hold is that the field notices and moves on quickly — the regression
  // this guards left the desktop black for every remaining frame.
  // `DEAD_PRESET_FRAMES` is 8; a couple of frames of slack for the crossfade.
  assert(
    longestBlank <= 10,
    `the desktop stayed black for ${longestBlank} frames running`,
  );
});

Deno.test("butterchurn: a preset that settles into one solid colour counts as blank", () => {
  // Coverage alone cannot see this: a solid field covers the whole desktop and
  // scores perfectly. Twenty of the catalog resolve to a flat wash, usually
  // blown-out white where the feedback loop has run away, and sitting on one
  // for its full fifteen seconds is indistinguishable from a frozen desktop.
  const solid = (level: number) => exomuxPresetLooksBlank(1, level, level * level);
  assert(solid(1.6), "a saturated white field is blank");
  assert(solid(0.5), "so is a mid-grey one");

  // Nothing drawn at all, the case that was already handled.
  assert(exomuxPresetLooksBlank(0, 0, 0));
  assert(exomuxPresetLooksBlank(0.005, 0.01, 0.0001));

  // A rendered frame has structure. Half the cells dark and half bright is a
  // variance of 0.25 — two orders of magnitude above the threshold.
  assert(!exomuxPresetLooksBlank(1, 0.5, 0.5), "a field with real contrast is not blank");
  assert(!exomuxPresetLooksBlank(0.5, 0.3, 0.2), "nor is a sparse but varied one");

  // A mostly-empty desktop with a bright figure on it is the shape almost every
  // working preset takes here, and must never be mistaken for a wash.
  assert(!exomuxPresetLooksBlank(0.2, 0.2, 0.16));
});

Deno.test("butterchurn: custom waves and shapes produce drawable geometry", () => {
  const withPrims = source({
    name: "prims",
    waves: [{
      baseVals: { enabled: 1, samples: 64, a: 1, r: 1, g: 1, b: 1 },
      init: "t1 = 0.25;",
      frame: "",
      point: "x = sample; y = t1;",
    }],
    shapes: [{
      baseVals: { enabled: 1, sides: 6, rad: 0.4, x: 0.5, y: 0.5, a: 1, a2: 1, r: 1, g2: 1, border_a: 0.5 },
      init: "",
      frame: "rad = rad + 0.1 * bass;",
    }],
  });
  const preset = new ExomuxButterchurnPreset(withPrims, { random: () => 0.5 });
  preset.setSize(60, 20);
  const waveform = new Float32Array(256).map((_, i) => Math.sin(i / 9));
  preset.advance(
    { bass: 1, mid: 1, treb: 1, bassAttack: 1, midAttack: 1, trebleAttack: 1, waveform },
    0.5,
    2,
    8,
  );

  const kinds = preset.prims.map((prim) => prim.kind);
  assertEquals(kinds, ["triangles", "line", "line"], "a shape fan, its border, then the wave");

  const fan = preset.prims[0]!;
  assertEquals(fan.vertexCount, 6 * 3);
  // The frame equations ran: rad grew from 0.4 by 0.1 * bass, so a rim vertex
  // sits half the grown radius from centre on x (times the aspect correction).
  const rim = Math.hypot(fan.vertices[8]! - fan.vertices[0]!, fan.vertices[9]! - fan.vertices[1]!);
  assert(rim > 0.3, `rim radius ${rim} should reflect the equation-grown 0.5`);

  const wave = preset.prims[2]!;
  assertEquals(wave.vertexCount, 64);
  // point_eqs read t1 from init: y = 0.25 in [0,1] space is +0.5 NDC, then
  // stretched by MilkDrop's inverse aspect (width over doubled height, 1.5).
  assertAlmostEquals(wave.vertices[1]!, 0.75, 0.01);
  // sample sweeps 0..1, so x sweeps -1..1.
  assertAlmostEquals(wave.vertices[0]!, -1, 0.01);
  assertAlmostEquals(wave.vertices[(63) * 8]!, 1, 0.01);
});

Deno.test("butterchurn: a shapes-only preset is no longer a black screen", () => {
  // Two thirds of the catalog draws with custom waves and shapes; before they
  // were ported, a preset with no basic waveform rendered nothing at all on
  // the software path.
  const shapesOnly = source({
    name: "shapes only",
    baseVals: { wave_a: 0.001 },
    shapes: [{
      baseVals: { enabled: 1, sides: 8, rad: 0.5, x: 0.5, y: 0.5, a: 1, a2: 1, r: 1, g: 0.5, border_a: 0 },
      init: "",
      frame: "",
    }],
  });
  const field = new ExomuxButterchurnField({
    gpu: false,
    audio: scriptedAudio(),
    autoCycle: false,
    catalog: [shapesOnly],
  });
  run(field, 16);
  let painted = 0;
  for (const row of field.rasterizeCells(BOUNDS, THEME)) for (const cell of row) if (cell) painted += 1;
  assert(painted > 10, `a preset drawing only shapes painted ${painted} cells`);
});

Deno.test("exomuxButterchurnDebugLines composes the mode and preset readout", () => {
  const [top, bottom] = exomuxButterchurnDebugLines("WebGPU", 3, 289, "Flexi - mom");
  assertEquals(top, " butterchurn · WebGPU · 3/289");
  assertEquals(bottom, " ▸ Flexi - mom");
});

Deno.test("Debug overlay draws the CPU/WebGPU + preset readout in the lower-left, and logs", () => {
  const logs: string[] = [];
  const field = new ExomuxButterchurnField({
    audio: scriptedAudio(),
    gpu: false, // forces the software path, so the overlay reads "CPU"
    autoCycle: false,
    debug: true,
    // An injected logger keeps the test off the filesystem (no logs/ file).
    debugLogger: { log: (category, message) => logs.push(`${category}: ${message}`), dispose: () => {} },
  });
  try {
    run(field, 3);
    const grid = field.rasterizeCells(BOUNDS, THEME);
    const readRow = (row: number, length: number): string => {
      const cells = grid[row] ?? [];
      let text = "";
      for (let column = 0; column < length; column += 1) text += cells[column]?.char ?? " ";
      return text;
    };
    const clip = (line: string): string => line.slice(0, BOUNDS.width);
    const [top, bottom] = exomuxButterchurnDebugLines(
      "CPU",
      field.presetIndex + 1,
      EXOMUX_BUTTERCHURN_PRESETS.length,
      field.presetName,
    );
    // The two overlay lines land on the bottom two grid rows.
    assertEquals(readRow(BOUNDS.height - 2, clip(top).length), clip(top));
    assertEquals(readRow(BOUNDS.height - 1, clip(bottom).length), clip(bottom));
    // The field init and the software-renderer transition reached the logger.
    assert(logs.some((line) => line.startsWith("field:")), `no field log: ${logs.join(" | ")}`);
    assert(
      logs.some((line) => line.startsWith("renderer:") && line.includes("software")),
      `no software renderer log: ${logs.join(" | ")}`,
    );
  } finally {
    field.dispose();
  }
});

Deno.test("Debug overlay is absent when debug is off", () => {
  const field = new ExomuxButterchurnField({ audio: scriptedAudio(), gpu: false, autoCycle: false });
  try {
    run(field, 3);
    const grid = field.rasterizeCells(BOUNDS, THEME);
    let text = "";
    for (const cell of grid[BOUNDS.height - 1] ?? []) text += cell?.char ?? " ";
    assert(!text.includes("butterchurn"), `overlay leaked without debug: "${text}"`);
  } finally {
    field.dispose();
  }
});

Deno.test("The GPU preset list is a non-empty GPU-drawable subset of the full catalog", () => {
  assert(EXOMUX_BUTTERCHURN_GPU_PRESETS.length > 0, "GPU list must not be empty");
  assert(
    EXOMUX_BUTTERCHURN_GPU_PRESETS.length < EXOMUX_BUTTERCHURN_PRESETS.length,
    "the GPU subset should be smaller than the full catalog (some presets render black on the GPU)",
  );
  const catalog = new Set(EXOMUX_BUTTERCHURN_PRESETS.map((preset) => preset.name));
  for (const preset of EXOMUX_BUTTERCHURN_GPU_PRESETS) {
    assert(catalog.has(preset.name), `GPU preset "${preset.name}" is not in the catalog`);
  }
});

Deno.test("The software preset list is a non-empty CPU-drawable subset of the full catalog", () => {
  assert(EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS.length > 0, "software list must not be empty");
  assert(
    EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS.length < EXOMUX_BUTTERCHURN_PRESETS.length,
    "the software subset should be smaller than the full catalog",
  );
  const catalog = new Set(EXOMUX_BUTTERCHURN_PRESETS.map((preset) => preset.name));
  for (const preset of EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS) {
    assert(catalog.has(preset.name), `software preset "${preset.name}" is not in the catalog`);
  }
});

Deno.test("The software butterchurn field renders on the CPU and never shows the GPU notice", () => {
  const field = new ExomuxButterchurnField({
    audio: scriptedAudio(),
    gpu: false,
    catalog: EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS,
    autoCycle: false,
  });
  try {
    run(field, 50);
    assertEquals(field.renderer, "software");
    let painted = 0;
    let text = "";
    for (const row of field.rasterizeCells(BOUNDS, THEME)) {
      for (const cell of row) {
        if (cell) painted += 1;
        text += cell?.char ?? " ";
      }
    }
    assert(painted > 20, `a curated software preset should paint, got ${painted}`);
    // errorWithoutGpu is off here, and gpu:false never reaches the "unavailable"
    // state, so the "no GPU" notice must never appear on the software field.
    assert(!text.includes("WebGPU"), "the software field must never show the GPU notice");
  } finally {
    field.dispose();
  }
});

Deno.test("The GPU-error notice names the software background as the alternative", () => {
  const joined = exomuxButterchurnGpuErrorLines().join(" ");
  assert(joined.includes("WebGPU"), `notice should mention WebGPU: "${joined}"`);
  assert(joined.includes("butterchurn cpu"), `notice should point at the CPU background: "${joined}"`);
});
