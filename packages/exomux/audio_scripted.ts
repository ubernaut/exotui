// Copyright 2023 Im-Beast. MIT license.

// A deterministic scripted audio source for diagnostics and audits.
// Every fidelity instrument must drive BOTH renderers with the same
// non-silent signal: under silence, waveform-driven presets degenerate
// (a mode-1 wave collapses to a single point and rasterizes nothing on
// the GPU while the CPU's fixed ink budget still deposits), which
// contaminated the fleet "CPU renders, GPU can't" bucket with audio
// artifacts that had nothing to do with renderer fidelity (033).

import { EXOMUX_AUDIO_BANDS, EXOMUX_AUDIO_WAVEFORM, type ExomuxAudioFrame, type ExomuxAudioSource } from "./audio.ts";

/** Options for the scripted source. */
export interface ScriptedExomuxAudioOptions {
  /** Signal amplitude, 0-1. The default is deliberately non-silent. */
  readonly level?: number;
  /**
   * Emit a beat every N frames. `0` never beats, which is what a test wants
   * when it is measuring something other than beat response.
   */
  readonly beatEvery?: number;
}

/** Creates the deterministic scripted source (level 0.7, beat each 8). */
export function createScriptedExomuxAudio(options: ScriptedExomuxAudioOptions = {}): ExomuxAudioSource {
  const level = options.level ?? 0.7;
  const beatEvery = options.beatEvery ?? 8;
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
        beat: beatEvery > 0 && frames % beatEvery === 0,
        source: "synth",
      } as ExomuxAudioFrame;
    },
    label: () => "scripted",
    close: () => {},
  } as ExomuxAudioSource;
}
