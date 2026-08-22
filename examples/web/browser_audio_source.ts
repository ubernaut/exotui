// A browser-backed implementation of exomux's pull-based audio contract, so
// audio-hungry backgrounds (butterchurn) run on the web from the same field
// code. Before the microphone is granted — browsers demand a gesture — a
// gentle synth keeps the visual alive, exactly the stance exomux's own
// capture takes while parec warms up.

import {
  EXOMUX_AUDIO_BANDS,
  EXOMUX_AUDIO_WAVEFORM,
  type ExomuxAudioFrame,
  type ExomuxAudioSource,
} from "../../packages/exomux/audio.ts";

/** A browser audio source: synth until the mic is granted, mic after. */
export interface BrowserAudioSource extends ExomuxAudioSource {
  /** Asks for the microphone; call from a user gesture. */
  enableMicrophone(): Promise<void>;
}

export function browserAudioSource(): BrowserAudioSource {
  const bands = new Float32Array(EXOMUX_AUDIO_BANDS);
  const waveform = new Float32Array(EXOMUX_AUDIO_WAVEFORM);
  const frequency = new Uint8Array(1024);
  const domain = new Uint8Array(2048);
  let analyser: AnalyserNode | undefined;
  let context: AudioContext | undefined;
  let lastBass = 0;

  const synthFrame = (now: number): ExomuxAudioFrame => {
    const t = now / 1000;
    for (let band = 0; band < bands.length; band += 1) {
      bands[band] = Math.max(0, 0.35 + 0.3 * Math.sin(t * 1.7 + band / 2.1) - band / bands.length * 0.3);
    }
    for (let i = 0; i < waveform.length; i += 1) {
      waveform[i] = Math.sin(t * 4 + i / 9) * 0.35 + Math.sin(t * 7 + i / 23) * 0.2;
    }
    const bass = 0.4 + 0.3 * Math.sin(t * 2.1);
    const beat = bass > 0.62 && lastBass <= 0.62;
    lastBass = bass;
    return {
      level: 0.45,
      bass,
      mid: 0.4 + 0.25 * Math.sin(t * 1.3 + 1),
      treble: 0.3 + 0.2 * Math.sin(t * 3.1 + 2),
      bands,
      waveform,
      beat,
      source: "synth",
    };
  };

  return {
    frame(now = performance.now()): ExomuxAudioFrame {
      if (!analyser) return synthFrame(now);
      analyser.getByteFrequencyData(frequency);
      analyser.getByteTimeDomainData(domain);
      const usable = frequency.length;
      for (let band = 0; band < bands.length; band += 1) {
        const from = Math.floor(Math.pow(usable, band / bands.length));
        const to = Math.max(from + 1, Math.floor(Math.pow(usable, (band + 1) / bands.length)));
        let peak = 0;
        for (let bin = from; bin < to && bin < usable; bin += 1) {
          if (frequency[bin]! > peak) peak = frequency[bin]!;
        }
        bands[band] = peak / 255;
      }
      const step = domain.length / waveform.length;
      for (let i = 0; i < waveform.length; i += 1) {
        waveform[i] = (domain[Math.floor(i * step)]! - 128) / 128;
      }
      const slice = (fromHz: number, toHz: number): number => {
        // 1024 bins over ~24 kHz: ~23.4 Hz per bin.
        const from = Math.max(0, Math.floor(fromHz / 23.4));
        const to = Math.min(usable, Math.ceil(toHz / 23.4));
        let sum = 0;
        for (let bin = from; bin < to; bin += 1) sum += frequency[bin]!;
        return to > from ? sum / (to - from) / 255 : 0;
      };
      const bass = slice(20, 160);
      const beat = bass > 0.5 && bass > lastBass * 1.35;
      lastBass = bass;
      let level = 0;
      for (let bin = 0; bin < usable; bin += 1) level += frequency[bin]!;
      return {
        level: level / usable / 255,
        bass,
        mid: slice(160, 2000),
        treble: slice(2000, 12000),
        bands,
        waveform,
        beat,
        source: "mic",
      };
    },
    label: () => (analyser ? "mic:web" : "synth"),
    async enableMicrophone(): Promise<void> {
      if (analyser) return;
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: true });
        context = new AudioContext();
        const node = context.createAnalyser();
        node.fftSize = 2048;
        node.smoothingTimeConstant = 0.6;
        context.createMediaStreamSource(media).connect(node);
        analyser = node;
      } catch {
        // Refused: the synth stays, honestly labelled.
      }
    },
    close(): void {
      void context?.close();
      analyser = undefined;
      context = undefined;
    },
  };
}
