// Copyright 2023 Im-Beast. MIT license.

// A deterministic scripted audio source for diagnostics and audits.
// Every fidelity instrument must drive BOTH renderers with the same
// non-silent signal: under silence, waveform-driven presets degenerate
// (a mode-1 wave collapses to a single point and rasterizes nothing on
// the GPU while the CPU's fixed ink budget still deposits), which
// contaminated the fleet "CPU renders, GPU can't" bucket with audio
// artifacts that had nothing to do with renderer fidelity (033).

import {
  EXOMUX_AUDIO_BANDS,
  EXOMUX_AUDIO_WAVEFORM,
  type ExomuxAudioFrame,
  type ExomuxAudioSource,
} from "./audio.ts";

/** Creates the deterministic scripted source (level 0.7, beat each 8). */
export function createScriptedExomuxAudio(options: { readonly level?: number } = {}): ExomuxAudioSource {
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
      return {
        level,
        bass: level * (0.5 + 0.4 * kick),
        mid: level * 0.6,
        treble: level * 0.5,
        bands,
        waveform,
        beat: frames % 8 === 0,
        source: "synth",
      } as ExomuxAudioFrame;
    },
    label: () => "scripted",
    close: () => {},
  } as ExomuxAudioSource;
}
