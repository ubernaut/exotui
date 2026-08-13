// Copyright 2023 Im-Beast. MIT license.

import { assert, assertEquals } from "./deps.ts";
import { createExomuxAudioSource, EXOMUX_AUDIO_BANDS, EXOMUX_AUDIO_WAVEFORM } from "../audio.ts";

/** Runs the synth for `frames` fixed 125 ms ticks and snapshots each frame. */
function runSynth(seed: number, frames: number) {
  const source = createExomuxAudioSource({ mode: "synth", seed });
  const snapshots: {
    level: number;
    bass: number;
    mid: number;
    treble: number;
    bands: number[];
    waveform: number[];
    beat: boolean;
  }[] = [];
  let now = 1_000;
  for (let f = 0; f < frames; f += 1) {
    const frame = source.frame(now);
    now += 125;
    snapshots.push({
      level: frame.level,
      bass: frame.bass,
      mid: frame.mid,
      treble: frame.treble,
      bands: Array.from(frame.bands),
      waveform: Array.from(frame.waveform),
      beat: frame.beat,
    });
  }
  source.close();
  return snapshots;
}

Deno.test("Synth music stays within the published frame contract", () => {
  const source = createExomuxAudioSource({ mode: "synth", seed: 7 });
  assertEquals(source.label(), "synth");
  let now = 1_000;
  for (let f = 0; f < 64; f += 1) {
    const frame = source.frame(now);
    now += 125;
    assertEquals(frame.source, "synth");
    assertEquals(frame.bands.length, EXOMUX_AUDIO_BANDS);
    assertEquals(frame.waveform.length, EXOMUX_AUDIO_WAVEFORM);
    for (const value of [frame.level, frame.bass, frame.mid, frame.treble]) {
      assert(Number.isFinite(value) && value >= 0 && value <= 1, `energy ${value} out of 0..1`);
    }
    for (const band of frame.bands) assert(Number.isFinite(band) && band >= 0 && band <= 1, `band ${band} out of 0..1`);
    for (const sample of frame.waveform) {
      assert(Number.isFinite(sample) && sample >= -1 && sample <= 1, `waveform ${sample} out of -1..1`);
    }
  }
  source.close();
});

Deno.test("Synth music is periodic and moving, not a flat drone", () => {
  const run = runSynth(1234, 64);

  // It beats: the bass downbeat drives at least a handful of transients.
  const beats = run.filter((frame) => frame.beat).length;
  assert(beats >= 3, `expected recurring beats, got ${beats}`);

  // It is not static: consecutive spectra differ as notes come and go.
  let changed = 0;
  for (let f = 1; f < run.length; f += 1) {
    const before = run[f - 1]!.bands;
    const after = run[f]!.bands;
    if (before.some((value, index) => Math.abs(value - after[index]!) > 0.02)) changed += 1;
  }
  assert(changed > run.length / 2, `spectrum barely moved (${changed} changing frames)`);

  // All three registers light up over the run — low, mid, and high content.
  assert(Math.max(...run.map((f) => f.bass)) > 0.2, "no bass energy");
  assert(Math.max(...run.map((f) => f.mid)) > 0.1, "no mid energy");
  const highest = run.map((f) => f.bands.slice(EXOMUX_AUDIO_BANDS - 6).reduce((max, v) => Math.max(max, v), 0));
  assert(Math.max(...highest) > 0.05, "no high-band energy");
});

Deno.test("Synth music is deterministic per seed and varies across seeds", () => {
  const serialize = (run: ReturnType<typeof runSynth>) =>
    run.map((f) => `${f.level.toFixed(4)}:${f.bands.map((b) => b.toFixed(3)).join(",")}`).join("|");

  // Same seed and the same tick sequence reproduce the piece exactly.
  assertEquals(serialize(runSynth(42, 40)), serialize(runSynth(42, 40)));
  // A different seed writes a different piece.
  assert(serialize(runSynth(42, 40)) !== serialize(runSynth(99, 40)), "seeds produced identical music");
});
