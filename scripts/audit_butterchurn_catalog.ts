// Copyright 2023 Im-Beast. MIT license.

/**
 * Renders every preset in the vendored catalog and regenerates
 * `packages/exomux/butterchurn_rotation.ts` — the subset the butterchurn
 * background actually cycles through.
 *
 * Curation is necessary rather than fastidious. Roughly a third of the catalog
 * draws its image with custom waves, custom shapes and a composite shader; the
 * terminal renderer runs none of those, so those presets resolve to an empty
 * screen no matter how the ink is tuned. A few others saturate to a flat field
 * or freeze. Cycling through them would show a blank desktop for fifteen
 * seconds at a time.
 *
 * The audit runs against whichever renderer the field selects, which on a
 * machine with a GPU means the preset's own shaders. Rerun it if that changes:
 * the software fallback resolves far fewer presets to an image.
 *
 * Every preset stays available by index in `EXOMUX_BUTTERCHURN_CATALOG`; this
 * only decides what auto-cycling walks.
 *
 *   deno run -A scripts/audit_butterchurn_catalog.ts
 */

import { EXOMUX_BUTTERCHURN_CATALOG } from "../packages/exomux/butterchurn_catalog.ts";
import { ExomuxButterchurnField } from "../packages/exomux/butterchurn_background.ts";
import { EXOMUX_AUDIO_BANDS, EXOMUX_AUDIO_WAVEFORM } from "../packages/exomux/audio.ts";
import type { ExomuxAudioFrame, ExomuxAudioSource } from "../packages/exomux/audio.ts";
import { exomuxTheme } from "../packages/exomux/model.ts";

const OUTPUT = new URL("../packages/exomux/butterchurn_rotation.ts", import.meta.url);
const WIDTH = 100;
const HEIGHT = 28;
const BOUNDS = { column: 0, row: 0, width: WIDTH, height: HEIGHT };
const THEME = exomuxTheme("midnight");
const CELLS = WIDTH * HEIGHT;

/** Frames rendered before the first measurement, so feedback reaches steady state. */
const WARMUP_FRAMES = 60;
/** Frames between the two samples used to measure motion. */
const MOTION_GAP = 10;

/** A preset must cover at least this share of the desktop to be worth cycling. */
const MIN_COVERAGE = 0.04;
/** Above this it is a flat wash rather than an image. */
const MAX_COVERAGE = 0.9;
/** Share of cells that must change over `MOTION_GAP` frames. */
const MIN_MOTION = 0.02;
/** Per-frame budget at this size; the desktop tick is 125 ms. */
const MAX_FRAME_MS = 40;

/** Deterministic stand-in for a track: a steady beat with moving harmonics. */
function auditAudio(): ExomuxAudioSource {
  const bands = new Float32Array(EXOMUX_AUDIO_BANDS);
  const waveform = new Float32Array(EXOMUX_AUDIO_WAVEFORM);
  let tick = 0;
  return {
    frame(): ExomuxAudioFrame {
      tick += 1;
      const time = tick * 0.125;
      const kick = Math.max(0, Math.sin(time * Math.PI * 2));
      for (let band = 0; band < bands.length; band += 1) {
        bands[band] = Math.max(0, 0.5 + 0.3 * Math.sin(time * (1 + band * 0.2) + band));
      }
      for (let index = 0; index < waveform.length; index += 1) {
        const phase = index / waveform.length;
        waveform[index] = Math.sin(phase * Math.PI * 6 + time * 4) * (0.35 + kick * 0.5) +
          Math.sin(phase * Math.PI * 23 + time) * 0.15;
      }
      return {
        level: 0.6 + 0.3 * kick,
        bass: 0.45 + 0.4 * kick,
        mid: 0.5,
        treble: 0.4 + 0.2 * Math.sin(time * 1.7),
        bands,
        waveform,
        beat: kick > 0.97,
        source: "synth",
      };
    },
    label: () => "audit",
    close: () => {},
  };
}

interface Verdict {
  readonly name: string;
  readonly coverage: number;
  readonly motion: number;
  readonly frameMs: number;
  readonly keep: boolean;
  readonly reason: string;
}

function snapshot(field: ExomuxButterchurnField): string[] {
  return field.rasterizeCells(BOUNDS, THEME).map((row) => row.map((cell) => cell?.char ?? " ").join(""));
}

async function audit(index: number): Promise<Verdict> {
  const name = EXOMUX_BUTTERCHURN_CATALOG[index]!.name;
  // Audit the CPU renderer explicitly: this list drives the software-only
  // background, which never touches the GPU, so a machine with a working device
  // must not silently audit the (much larger) set of presets its shaders resolve.
  const field = new ExomuxButterchurnField({ audio: auditAudio(), presetIndex: index, autoCycle: false, gpu: false });
  let now = 0;
  const started = performance.now();
  // The GPU path reads back asynchronously, so each frame needs a turn of the
  // event loop to land. Auditing without that would measure an empty buffer.
  const step = async (): Promise<void> => {
    now += 125;
    field.advance({ bounds: BOUNDS, now });
    await new Promise((resolve) => setTimeout(resolve, 2));
  };
  for (let frame = 0; frame < WARMUP_FRAMES; frame += 1) await step();
  const before = snapshot(field);
  for (let frame = 0; frame < MOTION_GAP; frame += 1) await step();
  const frameMs = (performance.now() - started) / (WARMUP_FRAMES + MOTION_GAP);
  const after = snapshot(field);

  let painted = 0;
  let changed = 0;
  for (let row = 0; row < HEIGHT; row += 1) {
    const left = before[row]!;
    const right = after[row]!;
    for (let column = 0; column < WIDTH; column += 1) {
      if (right[column] !== " ") painted += 1;
      if (left[column] !== right[column]) changed += 1;
    }
  }
  const coverage = painted / CELLS;
  const motion = changed / CELLS;

  field.dispose();
  let reason = "ok";
  if (coverage < MIN_COVERAGE) reason = "blank";
  else if (coverage > MAX_COVERAGE) reason = "saturated";
  else if (motion < MIN_MOTION) reason = "static";
  else if (frameMs > MAX_FRAME_MS) reason = "slow";
  return { name, coverage, motion, frameMs, keep: reason === "ok", reason };
}

if (import.meta.main) {
  const verdicts: Verdict[] = [];
  for (let index = 0; index < EXOMUX_BUTTERCHURN_CATALOG.length; index += 1) {
    verdicts.push(await audit(index));
    if ((index + 1) % 40 === 0) console.error(`  audited ${index + 1}/${EXOMUX_BUTTERCHURN_CATALOG.length}`);
  }

  const kept = verdicts.filter((verdict) => verdict.keep);
  const counts = new Map<string, number>();
  for (const verdict of verdicts) counts.set(verdict.reason, (counts.get(verdict.reason) ?? 0) + 1);
  const summary = [...counts].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${count} ${reason}`).join(", ");

  const module = `// Copyright 2023 Im-Beast. MIT license.

// GENERATED FILE — do not edit by hand.
// Regenerate with: deno run -A -c packages/exomux/deno.json scripts/audit_butterchurn_catalog.ts
//
// The presets the SOFTWARE-only butterchurn background ("butterchurn cpu")
// cycles through, chosen by rendering each on the CPU renderer and keeping those
// that resolve to a moving image at terminal resolution. Of ${verdicts.length} presets in the
// catalog: ${summary}.
//
// The excluded ones are not broken — most draw with custom waves, custom shapes
// and a composite shader, none of which the CPU renderer runs, so they resolve
// to an empty screen there (the GPU background renders them from their shaders).
// Every preset remains selectable by index through \`EXOMUX_BUTTERCHURN_CATALOG\`;
// this list only decides what the software field auto-cycles.

/** Names of the CPU-drawable presets, in catalog order. */
export const EXOMUX_BUTTERCHURN_ROTATION: readonly string[] = ${JSON.stringify(kept.map((v) => v.name), null, 2)};
`;
  await Deno.writeTextFile(OUTPUT, module);
  // Formatted here so regenerating never leaves the tree failing `deno fmt`.
  await new Deno.Command(Deno.execPath(), { args: ["fmt", OUTPUT.pathname], stdout: "null", stderr: "null" }).output();
  console.log(`${verdicts.length} audited: ${summary}`);
  console.log(`wrote ${kept.length} names to ${OUTPUT.pathname}`);
}
