// Turning PCM samples into equaliser bands.
//
// Pure by design: capture is a subprocess and untestable without a sound card,
// but everything that decides what the bars show is a function of a buffer, and
// a synthetic tone is a perfectly good input.

/** In-place radix-2 FFT. `real`/`imag` must be the same power-of-two length. */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new RangeError(`fft needs a power-of-two length, got ${n}`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j]!, real[i]!];
      [imag[i], imag[j]] = [imag[j]!, imag[i]!];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const uReal = real[i + j]!;
        const uImag = imag[i + j]!;
        const vReal = real[i + j + len / 2]! * curReal - imag[i + j + len / 2]! * curImag;
        const vImag = real[i + j + len / 2]! * curImag + imag[i + j + len / 2]! * curReal;
        real[i + j] = uReal + vReal;
        imag[i + j] = uImag + vImag;
        real[i + j + len / 2] = uReal - vReal;
        imag[i + j + len / 2] = uImag - vImag;
        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
}

/** A Hann window, which stops a tone that does not fit the window smearing across bins. */
export function hann(length: number): Float64Array {
  const window = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (length - 1)));
  }
  return window;
}

/**
 * Signed 16-bit little-endian PCM to floats in -1..1, one array per channel.
 *
 * Kept separate rather than averaged because the difference between the
 * channels is the point of a stereo display — averaged, a hard-panned signal
 * looks like a quiet centred one.
 */
export function decodePcm16Channels(bytes: Uint8Array, channels: number): Float64Array[] {
  const frames = Math.floor(bytes.length / 2 / channels);
  const out = Array.from({ length: channels }, () => new Float64Array(frames));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      out[channel]![frame] = view.getInt16((frame * channels + channel) * 2, true) / 32768;
    }
  }
  return out;
}

/** Signed 16-bit little-endian PCM to floats in -1..1, averaging channels. */
export function decodePcm16(bytes: Uint8Array, channels = 1): Float64Array {
  const frames = Math.floor(bytes.length / 2 / channels);
  const out = new Float64Array(frames);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16((frame * channels + channel) * 2, true) / 32768;
    }
    out[frame] = sum / channels;
  }
  return out;
}

export interface SpectrumOptions {
  readonly sampleRate?: number;
  readonly bands?: number;
  /** Lowest and highest frequency the bands span. */
  readonly minHz?: number;
  readonly maxHz?: number;
}

/**
 * Band magnitudes for one window of samples, 0-1.
 *
 * Bands are spaced logarithmically because hearing is: linear bands give half
 * the display to 10-20 kHz, where music has almost nothing, and squeeze every
 * bass note into the first bar. Magnitudes are converted to decibels for the
 * same reason — a linear magnitude bar barely moves for most music.
 */
export function spectrumBands(samples: Float64Array, options: SpectrumOptions = {}): number[] {
  const bands = Math.max(1, Math.floor(options.bands ?? 24));
  const sampleRate = options.sampleRate ?? 48000;
  const minHz = options.minHz ?? 40;
  const maxHz = Math.min(options.maxHz ?? 16000, sampleRate / 2);
  if (samples.length === 0) return new Array(bands).fill(0);

  // Largest power of two that fits, so the FFT has something to work with.
  let size = 1;
  while (size * 2 <= samples.length) size *= 2;
  if (size < 2) return new Array(bands).fill(0);

  const window = hann(size);
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  for (let index = 0; index < size; index += 1) real[index] = samples[index]! * window[index]!;
  fft(real, imag);

  const binHz = sampleRate / size;
  const out: number[] = [];
  for (let band = 0; band < bands; band += 1) {
    // Log-spaced edges across the audible span.
    const lowHz = minHz * Math.pow(maxHz / minHz, band / bands);
    const highHz = minHz * Math.pow(maxHz / minHz, (band + 1) / bands);
    const first = Math.max(1, Math.floor(lowHz / binHz));
    const last = Math.max(first + 1, Math.min(size / 2, Math.ceil(highHz / binHz)));
    let peak = 0;
    for (let bin = first; bin < last; bin += 1) {
      const magnitude = Math.hypot(real[bin]!, imag[bin]!) / (size / 2);
      if (magnitude > peak) peak = magnitude;
    }
    // -60 dB floor: quiet passages should still show shape, not flatline.
    const db = 20 * Math.log10(Math.max(peak, 1e-6));
    out.push(Math.min(1, Math.max(0, (db + 60) / 60)));
  }
  return out;
}
