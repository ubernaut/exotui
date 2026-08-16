# Butterchurn GPU render fidelity — closing the GPU-vs-CPU gap

Status: in progress; fourth systematic fix (UNORM feedback rectification) landed Aug 16 2026 — regression 36 → 30,
truly-black 29 → 21, rotation 369 → 383 of 472. The remaining ~21 (comp-side echo dynamics) are the open tail. Driven by
user direction: "GPU curation isn't really ideal. it'd be better to fix the broken presets."

## The real numbers (measured, not guessed)

`scripts/diag_butterchurn_gap.ts` renders every preset on **both** renderers with identical parameters (80-frame warmup,
same coverage function) and buckets the result. This replaced the earlier belief that "the GPU renders far fewer presets
than the CPU," which came from comparing two audit scripts with different thresholds — not a fair test.

| Bucket                                      | Baseline | After floor + ribbon | After mv + borders (Aug 15) |
| ------------------------------------------- | -------- | -------------------- | --------------------------- |
| both render (≥3%)                           | 200      | 211*                 | 233                         |
| both blank (<3%)                            | 91       | 103*                 | 79                          |
| GPU renders, CPU can't                      | 112      | 100*                 | 124                         |
| **CPU renders, GPU can't** (the regression) | **69**   | **58***              | **36**                      |
| — of those truly black (GPU <0.5%)          | 54       | 49*                  | 29                          |
| — of those dim (0.5–3%)                     | 15       | 9*                   | 7                           |

\* The Aug 15 re-measurement of the pre-seed state (same sandbox, same thresholds, fresh run) — run-to-run variance
against the Aug 14 numbers comes from audio-driven warmup differences. The before/after pair in the last two columns is
same-day, same-environment: the motion-vector/border seeding cut the regression **58 → 36** and lifted total GPU renders
311 → 357 of 472.

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

### Aug 15 2026 findings (the three candidate steps, worked)

- **Uniform coverage — audited, not the cause.** `scale1..3`/`bias1..3` are all written (1/0 for all three), which is
  self-consistent with the unnormalized blur chain; the nine-tap gaussian weights sum to 1.0 (brightness-preserving). No
  `shade()` uniform a black preset reads is missing. The fixed 0..1 blur range does clip >1 energies a real butterchurn
  would range-compress (dimmer blooms), but that cannot produce black.
- **WGSL diff — translation intact.** `Goody - The Wild Vort`'s translated warp (`blur1·scale1 + bias1 − main`) and comp
  (the video-echo mix, ×2.4 gamma, then squared) carry every term of the author's shader; nothing is dropped or
  const-folded. The blackness is loop dynamics, not translation.
- **Seed the feedback loop — root cause found and fixed.** The black set's real seed in MilkDrop is geometry we never
  drew on _either_ renderer: the **motion-vector trail grid** (`mv_x/y/dx/dy/l/r/g/b/a`, up to 64×48, drawn every frame
  — `Goody` sets `mv_a 0.2`) and the **inner/outer screen borders** (`ib_*`/`ob_*`). Both are now built by
  `ExomuxButterchurnPreset` per frame (per-frame-equation animatable) into a GPU-only draw list (`gpuPrims`: vectors
  under the custom prims, borders over them) — kept away from the software renderer's fixed ink budget so CPU output is
  unchanged. Unit-tested; spot measurement on the regression set immediately lit a dozen formerly-0% presets (several at
  50–100% coverage).

### What still stays black

`Goody - The Wild Vort`-class presets whose picture is an **echo amplifier**: the warp is a pure high-pass
(`blur1 − main`) and the additive full-screen textured shape re-injects only ~0.75× of the previous frame, so with our
pipeline the loop settles near 0.03 luminance — below the cell rasterizer's `MIN_INK` (0.1) — while real butterchurn
reaches saturation.

### Aug 16 2026: the readback probe and the UNORM rectification fix

The probe (`scripts/probe_butterchurn_readback.ts`, driving `ExomuxButterchurnGpu.debugMainStats()`) read the feedback
texture directly and settled the question: after 120 frames Goody's loop held a **signed oscillating field** — 12–13% of
texels negative (min ≈ −0.4), mean pinned at 0.034. Real butterchurn stores every pass in 8-bit UNORM, whose stores
rectify negatives to zero — a nonlinearity that pumps net energy into the loop each cycle; our half-float feedback
("keep highlights from clipping") faithfully preserved the negatives and let the oscillation cancel. **Fix:**
`MAIN_FORMAT` is now `rgba8unorm`, matching the storage contract presets were authored against. Fleet measurement:
regression 36 → 30, truly-black 29 → 21, both-render 233 → 239, auto-cycle rotation 369 → 383 of 472.

**Remaining tail (~21):** rectification raised Goody's loop mean 0.034 → 0.043 (all-positive now) but it still
equilibrates below `MIN_INK` — the injected energy (mv grid at 0.2 alpha + 0.75× echo shape) balances the high-pass loss
linearly, so real butterchurn's saturation must come from comp-side dynamics or a loop term we still model differently.
Next probe: compare the comp output (not just main) against the loop, and check whether real butterchurn's blur textures
store range-compressed values whose decompression amplifies (`scale1` > 1 in the authored data rather than our hardcoded
1).

## Verification

- `scripts/diag_butterchurn_gap.ts` — the CPU-vs-GPU bucketing above; rerun to measure any further fix.
- `scripts/audit_butterchurn_gpu.ts` — regenerates `butterchurn_gpu_rotation.ts` (the auto-cycle subset).
- `floorWaveColor` has unit tests in `tests/backgrounds_butterchurn.test.ts`; the ribbon is verified by the audit (GPU
  rendering needs a real device, which the stub-based `butterchurn_gpu.test.ts` can't provide).
