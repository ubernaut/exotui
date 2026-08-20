// Live audio capture, as a stream of equaliser bands.
//
// The capture end is a subprocess reading raw PCM; everything that decides what
// the bars show lives in spectrum.ts and is pure. A machine with no capture
// tool, or no permission to run one, simply has no audio panel.

import { decodePcm16, decodePcm16Channels, spectrumBands } from "./spectrum.ts";

export type AudioSourceKind = "system" | "mic";

/** Signed 16-bit mono, which is what every recorder here is asked for. */
const BYTES_PER_SAMPLE = 2;

/** Points in a reported waveform: enough to fill a wide tile, few enough to draw. */
const WAVEFORM_POINTS = 256;

/**
 * Reduces a window to `points`, keeping the largest excursion of each bucket.
 *
 * Averaging would be wrong here: a waveform is symmetric about zero, so the
 * mean of any bucket tends to nothing and a loud signal draws as a flat line.
 */
export function downsampleWaveform(samples: ArrayLike<number>, points: number): number[] {
  const out = new Array(points).fill(0);
  if (samples.length === 0 || points <= 0) return out;
  const per = samples.length / points;
  for (let index = 0; index < points; index += 1) {
    const start = Math.floor(index * per);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((index + 1) * per)));
    let peak = 0;
    for (let at = start; at < end; at += 1) {
      const value = samples[at]!;
      if (Math.abs(value) > Math.abs(peak)) peak = value;
    }
    out[index] = peak;
  }
  return out;
}

export interface AudioCaptureOptions {
  readonly kind?: AudioSourceKind;
  readonly sampleRate?: number;
  readonly bands?: number;
  /** Samples per analysis window; a power of two keeps the FFT exact. */
  readonly windowSize?: number;
  /**
   * Spectra per second.
   *
   * Independent of the window size, because the two answer different questions:
   * the window decides frequency resolution, the hop between windows decides how
   * often a new spectrum appears. Analysing only on whole non-overlapping
   * windows ties them together and caps the rate at `sampleRate / windowSize` —
   * 23 Hz at 48 kHz and 2048 samples, which looks like lag.
   */
  readonly updatesPerSecond?: number;
  /**
   * Channels to record.
   *
   * Two by default, so a stereo display is possible at all. A mono source
   * recorded as two gives two identical spectra, which draws as one line with
   * every point marked as a crossing — honest, and visibly different from a
   * source that is genuinely centred.
   */
  readonly channels?: number;
}

interface Recorder {
  readonly command: string;
  args(kind: AudioSourceKind, sampleRate: number, channels: number): string[] | undefined;
}

/**
 * Recorders in order of preference.
 *
 * parec and pw-record can both capture what is *playing* by recording a sink's
 * monitor, which is what an equaliser usually wants; arecord cannot, so it only
 * offers the microphone.
 */
const RECORDERS: readonly Recorder[] = Object.freeze([
  {
    command: "parec",
    args: (kind, rate, channels) => [
      "--format=s16le",
      "--rate",
      String(rate),
      `--channels=${channels}`,
      // Small fragments, or the recorder hands over a tenth of a second at a
      // time and no amount of analysis downstream can go faster than that.
      "--latency-msec=8",
      // The default sink's monitor, which is what "what is playing" means.
      // `--monitor-stream` looks right and silently yields nothing.
      ...(kind === "system" ? ["--device=@DEFAULT_MONITOR@"] : []),
    ],
  },
  {
    command: "pw-record",
    args: (kind, rate, channels) => [
      "--format=s16",
      "--rate",
      String(rate),
      `--channels=${channels}`,
      "--latency=480/48000",
      ...(kind === "system" ? ["--target=0"] : []),
      "-",
    ],
  },
  {
    command: "arecord",
    // No monitor capture, so it answers only for the microphone.
    args: (kind, rate, channels) =>
      kind === "mic"
        ? ["-f", "S16_LE", "-r", String(rate), "-c", String(channels), "-t", "raw", "-q", "--period-size=480"]
        : undefined,
  },
]);

/** One analysis of one window: the same audio, read two ways. */
export interface AudioFrame {
  /** Band magnitudes, 0-1, low frequency first. */
  readonly bands: readonly number[];
  /**
   * One band array per recorded channel, in order.
   *
   * `bands` is their average, which is the right reading for "how loud is it";
   * these are the right reading for "how do the channels differ", and averaging
   * destroys that.
   */
  readonly channels: readonly (readonly number[])[];
  /**
   * The window itself, downsampled to a drawable number of points, -1 to 1.
   *
   * What an oscilloscope shows. Downsampled by peak rather than by average,
   * because an average of a waveform tends to zero and draws a flat line
   * through the middle of a signal that is not flat at all.
   */
  readonly waveform: readonly number[];
}

export interface AudioCapture {
  /** The most recent analysis. */
  frame(): AudioFrame;
  /**
   * Called with every analysis, at the analysis rate.
   *
   * Polling would alias: a 60 Hz poll against a 60 Hz analysis drops and doubles
   * frames as the two drift. The listener sees each one exactly once.
   */
  onFrame(listener: (frame: AudioFrame) => void): void;
  readonly label: string;
  close(): void;
}

/**
 * Starts capturing, or returns undefined when nothing on this machine can.
 *
 * Never throws: an absent recorder is an absent panel, not a crashed monitor.
 */
export async function startAudioCapture(options: AudioCaptureOptions = {}): Promise<AudioCapture | undefined> {
  const kind = options.kind ?? "system";
  const sampleRate = options.sampleRate ?? 48000;
  const bandCount = options.bands ?? 24;
  const windowSize = options.windowSize ?? 2048;
  const updatesPerSecond = options.updatesPerSecond ?? 60;
  const channels = Math.max(1, Math.floor(options.channels ?? 2));

  for (const recorder of RECORDERS) {
    const args = recorder.args(kind, sampleRate, channels);
    if (!args) continue;
    let process: Deno.ChildProcess;
    try {
      process = new Deno.Command(recorder.command, { args, stdout: "piped", stderr: "null" }).spawn();
    } catch {
      continue;
    }

    let latest: AudioFrame = {
      bands: new Array(bandCount).fill(0),
      channels: Array.from({ length: channels }, () => new Array(bandCount).fill(0)),
      waveform: new Array(WAVEFORM_POINTS).fill(0),
    };
    let closed = false;
    const listeners: ((frame: AudioFrame) => void)[] = [];
    // One window of audio, always the most recent one. Windows overlap: the
    // hop is how much new audio is required before the next spectrum, and it is
    // far smaller than the window, which is what decouples the update rate from
    // the frequency resolution.
    // A frame is one sample per channel; the window holds `windowSize` frames
    // whatever the channel count, so the frequency resolution does not change
    // with it.
    const bytesPerFrame = BYTES_PER_SAMPLE * channels;
    const window = new Uint8Array(windowSize * bytesPerFrame);
    const hopBytes = Math.max(
      bytesPerFrame,
      Math.round(sampleRate / updatesPerSecond) * bytesPerFrame,
    );
    let held = 0;
    // Audio that arrived but has not yet completed a hop. A recorder hands over
    // whatever it has when it has it, and those boundaries have nothing to do
    // with the rate spectra are wanted at.
    let carry = new Uint8Array(0);

    const append = (bytes: Uint8Array): void => {
      if (bytes.length >= window.length) {
        window.set(bytes.subarray(bytes.length - window.length));
        held = window.length;
        return;
      }
      window.copyWithin(0, bytes.length);
      window.set(bytes, window.length - bytes.length);
      held = Math.min(window.length, held + bytes.length);
    };

    (async () => {
      try {
        for await (const chunk of process.stdout) {
          if (closed) break;
          // One spectrum per hop, not one per chunk: chunk boundaries are the
          // recorder's business and produced 50 Hz where 60 was asked for.
          const combined = new Uint8Array(carry.length + chunk.length);
          combined.set(carry);
          combined.set(chunk, carry.length);
          let offset = 0;
          while (combined.length - offset >= hopBytes) {
            append(combined.subarray(offset, offset + hopBytes));
            offset += hopBytes;
            if (held < window.length) continue;
            const perChannel = decodePcm16Channels(window, channels);
            const spectra = perChannel.map((samples) => spectrumBands(samples, { sampleRate, bands: bandCount }));
            const mixed = decodePcm16(window, channels);
            latest = {
              bands: channels === 1 ? spectra[0]! : spectrumBands(mixed, { sampleRate, bands: bandCount }),
              channels: spectra,
              waveform: downsampleWaveform(mixed, WAVEFORM_POINTS),
            };
            for (const listener of listeners) listener(latest);
          }
          carry = combined.slice(offset);
        }
      } catch {
        // The recorder died or the stream closed; the panel simply stops moving.
      }
    })();

    // Long enough to notice a recorder that dies immediately, but not long
    // enough to matter: parec takes a second or two to deliver its first chunk,
    // so the panel starts silent and fills in either way.
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      frame: () => latest,
      onFrame: (listener) => void listeners.push(listener),
      label: `${recorder.command} (${kind})`,
      close() {
        if (closed) return;
        closed = true;
        try {
          process.kill();
        } catch {
          // Already gone.
        }
      },
    };
  }
  return undefined;
}
