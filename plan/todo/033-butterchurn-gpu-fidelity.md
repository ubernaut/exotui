# Butterchurn GPU render fidelity — closing the GPU-vs-CPU gap

Status: in progress Aug 14 2026. Two systematic fixes landed; a residual truly-black set remains and is characterised
below. Driven by user direction: "GPU curation isn't really ideal. it'd be better to fix the broken presets."

## The real numbers (measured, not guessed)

`scripts/diag_butterchurn_gap.ts` renders every preset on **both** renderers with identical parameters (80-frame warmup,
same coverage function) and buckets the result. This replaced the earlier belief that "the GPU renders far fewer presets
than the CPU," which came from comparing two audit scripts with different thresholds — not a fair test.

| Bucket                                      | Baseline | After floor + ribbon |
| ------------------------------------------- | -------- | -------------------- |
| both render (≥3%)                           | 200      | 223                  |
| both blank (<3%)                            | 91       | 79                   |
| GPU renders, CPU can't                      | 112      | 124                  |
| **CPU renders, GPU can't** (the regression) | **69**   | **46**               |
| — of those truly black (GPU <0.5%)          | 54       | 28                   |
| — of those dim (0.5–3%)                     | 15       | 18                   |

Head to head, the GPU renders **more** of the catalog than the CPU (347 vs 269 after the fixes). The "GPU is worse"
framing was wrong. The genuine regression is the narrow "CPU renders, GPU black" set — 69, now 46.

With the fixes plus the realigned keep threshold (below), the regenerated auto-cycle rotation
(`butterchurn_gpu_rotation.ts`) grew from **306 to 369 of 472** — now more than the CPU field's 365-preset rotation, so
the GPU no longer curates more aggressively than the CPU.

## Root causes

1. **Dim/absent basic-waveform colour.** Many presets set `wave_r/g/b` near zero (some negative → clamp to black). The
   CPU spends a fixed `WAVE_INK` energy budget so a dim wave still reads; the GPU drew it faithfully faint → nothing.
   **Fixed:** `floorWaveColor()` in `butterchurn_background.ts` lifts a dim wave colour to a minimum peak (hue
   preserved); already-bright and genuinely-black colours are left alone. Rescued ~8.
2. **The resolve filter averages thin features away.** The GPU renders at 512×(128–512) and box-filters down to the
   96×28 cell grid; the resolve pass's own comment says "a one-pixel waveform vanishes on the way down." A preset whose
   only content is the basic waveform (e.g. `Rovastar + Geiss - Hurricane Nightmare`: bright wave, no shaders/prims)
   therefore resolved to black on the GPU while the cell-native CPU kept it. **This is our own shader math, not
   driver-specific**, so a sandbox fix transfers to the user's Intel. **Fixed:** the basic waveform is now drawn as a
   ~1.5-cell-tall triangle-strip ribbon (`WAVE_RIBBON_CELLS` in `butterchurn_gpu.ts`) instead of a 1px line, so it
   survives the downsample like the CPU's deposit. Rescued ~23 (regression 69 → 46).
3. **Rotation threshold was stricter than the runtime.** The audit kept only presets ≥3% coverage, but the runtime
   dead-skips only below 1% (`DEAD_PRESET_COVERAGE`). ~a dozen presets render a real, sparse figure at 1.5–2.9% and were
   needlessly excluded. **Fixed:** the audit keep threshold is now 1.5%, just above the runtime dead-skip, so auto-cycle
   visits every preset that renders above the strobe-guard.

## What remains — the truly-black set (~28)

These are shader-heavy presets whose CPU look is built from ink the GPU only seeds from feedback, so on the GPU they
stay black. High-CPU-coverage examples that are 0% on GPU: `Goody - The Wild Vort` (98.5%),
`stahlregen - old school,
baby` (94%), `Flexi - crush ice 72` (81.7%), `cope - digital sea` (53.7%),
`flexi - bouncing balls` (38.5%), `baked - mushroom rainbows` (40.1%). Seed-structure dumps show these have a black
basic waveform and either no prims or **feedback-textured** prims (a triangle that samples the previous frame — which
starts black, so it never lights up). Their content is meant to come from the warp/comp shaders acting on a seed the GPU
path never establishes.

This is **heterogeneous** — likely a mix of: (a) the warp/comp WGSL translation subtly differing from the author's
intent; (b) hardcoded uniforms (scale1/bias1) that some comps depend on; (c) feedback-only seeding that needs an initial
spark the GPU doesn't provide. Debugging each blind (no reference butterchurn output, can't repro the user's exact
Intel) is expensive. They stay out of the auto-cycle rotation (so no strobe) and remain selectable by index.

### Candidate next steps (not yet done)

- **Seed the feedback loop.** MilkDrop/butterchurn seed the first frame with the waveform even when `wave_a` is tiny; a
  feedback-textured prim on a black frame stays black. Verify the GPU deposits the basic waveform (now a ribbon)
  _before_ the feedback-textured prims sample it, and consider a one-frame noise/seed so feedback-only presets ignite.
- **Audit the warp/comp uniform coverage.** The hardcoded scale1=1/bias1=0 path (`#writeUniforms`) may starve comps that
  read scale2/3 or bias2/3; confirm every `shade()` uniform a black preset reads is actually written.
- **Diff a black preset's translated WGSL against a known-good port** for one representative (e.g.
  `Goody - The Wild
  Vort`) to see whether the warp shader's procedural term is being dropped or const-folded to zero.

## Verification

- `scripts/diag_butterchurn_gap.ts` — the CPU-vs-GPU bucketing above; rerun to measure any further fix.
- `scripts/audit_butterchurn_gpu.ts` — regenerates `butterchurn_gpu_rotation.ts` (the auto-cycle subset).
- `floorWaveColor` has unit tests in `tests/backgrounds_butterchurn.test.ts`; the ribbon is verified by the audit (GPU
  rendering needs a real device, which the stub-based `butterchurn_gpu.test.ts` can't provide).
