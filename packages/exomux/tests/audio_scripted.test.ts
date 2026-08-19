// Copyright 2023 Im-Beast. MIT license.

// The scripted source is the fixed signal fidelity work drives both renderers
// with. Its value is entirely in properties the runtime synth cannot promise:
// identical frames every run, and never silent. 033 recorded why the second
// matters — under silence a mode-1 waveform preset collapses to a point and
// rasterizes nothing on the GPU while the CPU's fixed ink budget still
// deposits, which put audio artifacts into the "CPU renders, GPU can't" bucket.

import { assert, assertEquals } from "./deps.ts";
import { createScriptedExomuxAudio } from "../audio_scripted.ts";
import { EXOMUX_AUDIO_BANDS, EXOMUX_AUDIO_WAVEFORM } from "../audio.ts";

/** A frame's numbers, detached — `frame()` reuses its arrays. */
function snapshot(source: ReturnType<typeof createScriptedExomuxAudio>) {
  const frame = source.frame();
  return {
    level: frame.level,
    bass: frame.bass,
    mid: frame.mid,
    treble: frame.treble,
    beat: frame.beat,
    bands: [...frame.bands],
    waveform: [...frame.waveform],
  };
}

Deno.test("two runs of the scripted source are frame-for-frame identical", () => {
  const first = createScriptedExomuxAudio();
  const second = createScriptedExomuxAudio();
  for (let frame = 0; frame < 40; frame += 1) {
    assertEquals(snapshot(first), snapshot(second), `frame ${frame} diverged`);
  }
});

Deno.test("the scripted source is never silent, on any frame", () => {
  const source = createScriptedExomuxAudio();
  for (let frame = 0; frame < 64; frame += 1) {
    const { bands, waveform, level } = snapshot(source);
    assert(level > 0, `frame ${frame} reported no level`);
    assert(bands.some((value) => value > 0), `frame ${frame} produced an all-zero band set`);
    // Not merely non-zero: a waveform that is one repeated value is the
    // degenerate case 033 was chasing, so require actual movement.
    const low = Math.min(...waveform);
    const high = Math.max(...waveform);
    assert(high - low > 0.1, `frame ${frame} produced a flat waveform (${low} to ${high})`);
  }
});

Deno.test("the signal fills the band and waveform widths the analyser expects", () => {
  const frame = createScriptedExomuxAudio().frame();
  assertEquals(frame.bands.length, EXOMUX_AUDIO_BANDS);
  assertEquals(frame.waveform.length, EXOMUX_AUDIO_WAVEFORM);
  assertEquals(frame.source, "synth");
});

Deno.test("beats arrive on the requested cadence, and never when asked for none", () => {
  const every3 = createScriptedExomuxAudio({ beatEvery: 3 });
  const beats: number[] = [];
  for (let frame = 1; frame <= 12; frame += 1) if (every3.frame().beat) beats.push(frame);
  assertEquals(beats, [3, 6, 9, 12]);

  const silentBeat = createScriptedExomuxAudio({ beatEvery: 0 });
  for (let frame = 0; frame < 12; frame += 1) {
    assertEquals(silentBeat.frame().beat, false, "beatEvery 0 never beats");
  }

  const byDefault = createScriptedExomuxAudio();
  const defaults: number[] = [];
  for (let frame = 1; frame <= 16; frame += 1) if (byDefault.frame().beat) defaults.push(frame);
  assertEquals(defaults, [8, 16], "the documented default is a beat every 8");
});

Deno.test("level scales the whole signal, so a quiet run is still a real one", () => {
  const loud = snapshot(createScriptedExomuxAudio({ level: 0.8 }));
  const quiet = snapshot(createScriptedExomuxAudio({ level: 0.2 }));
  assert(quiet.level < loud.level);
  assert(Math.max(...quiet.bands) < Math.max(...loud.bands));
  // Still non-silent, which is the property a fidelity audit depends on.
  assert(quiet.bands.some((value) => value > 0));
});

Deno.test("frame() reuses its arrays, so a caller keeping frames must copy", () => {
  // Documented rather than fixed: the source exists to be driven at frame rate,
  // and allocating two typed arrays per frame to protect a caller who should be
  // consuming immediately is the wrong trade. This test is the warning.
  const source = createScriptedExomuxAudio();
  const first = source.frame();
  const held = first.bands;
  const before = held[0]!;
  source.frame();
  assert(held === first.bands, "the same array instance comes back");
  assert(held[0] !== before, "and its contents have moved on");
});
