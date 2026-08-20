import { assert, assertEquals, assertThrows } from "./deps.ts";
import { decodePcm16, fft, hann, spectrumBands } from "../examples/showcases/exomonitor/sources/spectrum.ts";

/** A pure tone, as PCM would deliver it. */
function tone(hz: number, sampleRate: number, length: number, amplitude = 0.8): Float64Array {
  const out = new Float64Array(length);
  for (let i = 0; i < length; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

Deno.test("the FFT puts a tone in the bin it belongs in", () => {
  const size = 1024;
  const sampleRate = 48000;
  // Exactly 8 cycles per window, so the tone lands on bin 8 with no leakage.
  const hz = (8 * sampleRate) / size;
  const real = tone(hz, sampleRate, size);
  const imag = new Float64Array(size);
  fft(real, imag);
  let peak = 0;
  let peakBin = 0;
  for (let bin = 1; bin < size / 2; bin += 1) {
    const magnitude = Math.hypot(real[bin]!, imag[bin]!);
    if (magnitude > peak) [peak, peakBin] = [magnitude, bin];
  }
  assertEquals(peakBin, 8);
});

Deno.test("the FFT refuses a length it cannot process rather than returning noise", () => {
  assertThrows(() => fft(new Float64Array(6), new Float64Array(6)), RangeError, "power-of-two");
});

Deno.test("a window tapers to nothing at both ends", () => {
  const window = hann(64);
  assert(window[0]! < 1e-9);
  assert(window[63]! < 1e-9);
  assert(window[32]! > 0.99, "and is open in the middle");
});

Deno.test("a low tone lights the low bands and leaves the high ones dark", () => {
  const bands = spectrumBands(tone(120, 48000, 4096), { sampleRate: 48000, bands: 16 });
  assertEquals(bands.length, 16);
  const low = Math.max(...bands.slice(0, 5));
  const high = Math.max(...bands.slice(10));
  assert(low > high, `a 120 Hz tone lit the high bands: low ${low.toFixed(2)} high ${high.toFixed(2)}`);
});

Deno.test("a high tone lights the high bands", () => {
  const bands = spectrumBands(tone(9000, 48000, 4096), { sampleRate: 48000, bands: 16 });
  const low = Math.max(...bands.slice(0, 5));
  const high = Math.max(...bands.slice(10));
  assert(high > low, `a 9 kHz tone lit the low bands: low ${low.toFixed(2)} high ${high.toFixed(2)}`);
});

Deno.test("silence reads as silence, not as noise", () => {
  const bands = spectrumBands(new Float64Array(2048), { sampleRate: 48000, bands: 12 });
  assertEquals(bands.length, 12);
  assert(bands.every((value) => value === 0), `silence produced ${bands.join(",")}`);
});

Deno.test("bands are log-spaced, so bass is not crushed into one bar", () => {
  // Two tones an octave apart in the bass must land in different bands; with
  // linear spacing they would share the first one.
  const lower = spectrumBands(tone(80, 48000, 4096), { sampleRate: 48000, bands: 24 });
  const upper = spectrumBands(tone(160, 48000, 4096), { sampleRate: 48000, bands: 24 });
  const peakOf = (bands: number[]) => bands.indexOf(Math.max(...bands));
  assert(peakOf(lower) !== peakOf(upper), "80 Hz and 160 Hz landed in the same band");
});

Deno.test("a buffer too short to analyse yields silent bands rather than throwing", () => {
  assertEquals(spectrumBands(new Float64Array(1), { bands: 4 }), [0, 0, 0, 0]);
  assertEquals(spectrumBands(new Float64Array(0), { bands: 3 }), [0, 0, 0]);
});

Deno.test("PCM decodes to -1..1 and averages channels", () => {
  // Two frames, stereo: full positive then full negative.
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setInt16(0, 32767, true);
  view.setInt16(2, 32767, true);
  view.setInt16(4, -32768, true);
  view.setInt16(6, -32768, true);
  const samples = decodePcm16(bytes, 2);
  assertEquals(samples.length, 2);
  assert(Math.abs(samples[0]! - 1) < 0.001);
  assertEquals(samples[1], -1);
});
