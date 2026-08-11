# Exomux

A terminal multiplexer built on `@ubernaut/deno-tui`: a detachable local host owning PTY-backed shells, and a floating
workbench client that can exit and reattach without disturbing them.

## Running

```sh
deno task start          # from this directory
deno task --cwd packages/exomux start   # from the repository root
./install-exomux.sh      # from the repository root: compile + install ~/.local/bin/exomux
```

`deno task exomux` at the repository root delegates here, and `install-exomux.sh` compiles a self-contained binary so
`exomux` works from any directory. `--memory` skips layout persistence, `--daemon` runs the host alone (it requires a
valid `EXOMUX_TOKEN` and is normally started for you by the client).

Settings open from the start menu into an ordinary floating window — drag its title bar, resize its borders, close it
from its chrome. Windows default to 85% opacity so the live desktop shows through terminal text, and the butterchurn
background defaults to 60 Hz; both are knobs in that window.

## Sessions

Exomux hosts are named sessions, tmux-style. A bare launch attaches to the one live session, creates the default session
(`main`) when none exists, and prints the list below instead of guessing when several are live. Each session is its own
detached host: its shells survive client exit and crash independently of every other session.

| Flag              | Behavior                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------- |
| _(none)_          | Attach to the single live session, or create `main` when there is none                   |
| `-a <name>`       | Attach to that session only; never launches a host                                       |
| `-n [name]`       | Create a new session (numeric names are generated when omitted); never reuses a live one |
| `--list-sessions` | Print every session: state, uptime, terminal count, and foreground commands              |
| `--reset-config`  | Reset saved settings to safe defaults and exit                                           |
| `-h`, `--help`    | List every flag and prefix command                                                       |

`-h`/`--help` prints the full list, and a launch that fails prints it too and suggests `--reset-config`.

```
NAME  STATE       UP      TERMINALS  RUNNING
main  attachable  3h 12m  2          nvim, htop
work  attachable  1d 2h   1          cargo
```

The default session keeps its state where pre-session Exomux kept it, so an already-running host and its persisted
layout carry across the upgrade unrenamed; named sessions live under `sessions/<name>/` beside it.

## Settings and config

Settings (theme, background, opacity, and every per-background knob) persist to `~/.config/exomux/exomux.json` —
separate from the per-session layout state, so they survive reboots and host termination and are shared across every
session. Choosing a background image copies it into `~/.config/exomux/images/`, so the wallpaper keeps working even if
the original file is later moved or deleted. A background image can be a PNG or a JPEG. `--reset-config` restores safe
defaults; `--config-dir=<path>` points at a different config directory. Click the session name at the top of the
settings window to rename the session — its attach key and on-disk state move together, live. The settings window is
built from real exotui components: the theme and background selectors are `List` widgets, each option row is a
`CheckBox` (the boolean) or a `Cycler` (the `< value >` picker, a new library component), and the action buttons are
`Button` widgets — all rendered off-screen (`widget_surface.ts`, `settings_surface.ts`, `settings_options.ts`) and
composited into the window like any terminal's screen grid. The pickers are bound two-way and driven natively (clicking,
arrowing, or scrolling a picker drives the real `List`); the option controls display the live value while the window's
routing cycles it. (Making `List` mouse-interactive and adding `Cycler` are companion changes in the core library.)

Inside Ghostty, the settings window gains a CRT shader section: pulsating/flickering scanlines and pincushion
distortion, each with adjustable intensity. Turning one on generates GLSL and a managed Ghostty config include under
`~/.config/exomux/shaders/`; Ghostty applies it on its next config reload. Add
`config-file = ~/.config/exomux/shaders/ghostty.conf` to your Ghostty config once, and reload Ghostty (or restart it)
after changing a shader.

A crash cannot wedge launching. If a recorded host's pid died — or was recycled by an unrelated process — its descriptor
is pruned and the session simply reports stopped; if the pid still looks like an Exomux daemon but never answers, the
descriptor is quarantined beside the live path (`host.json.unresponsive`, keeping the pid for a manual `kill`) and a
fresh host is launched. The status line reports either recovery.

## The butterchurn background

`butterchurn_background.ts` is a MilkDrop audio visualizer, selected like any other background with prefix `b`. It is
the ASCII port of [butterchurnxr](https://github.com/ubernaut/butterchurnxr)'s `asciichurn` rendered natively:
`asciichurn` proxies its pixels out to Butterchurn's WebGL2 renderer in headless Chromium, which a single compiled
binary running over a tailnet cannot do, so the renderer is rebuilt here against `navigator.gpu`.

The presets are the real ones. `butterchurn_catalog.ts` vendors every pack the upstream `butterchurn-presets` package
ships — 472 distinct MilkDrop presets — with each preset's base values, its three EEL equation blocks, and its warp and
composite shaders already translated to WGSL at build time.

| Module                      | Role                                                                          |
| --------------------------- | ----------------------------------------------------------------------------- |
| `eel.ts`                    | Interpreter for EEL2, the language preset equations are written in            |
| `butterchurn_preset.ts`     | Butterchurn's frame pipeline: base-value restore, `q` handling, the warp mesh |
| `glsl_wgsl.ts`              | Translates preset shaders from GLSL to WGSL                                   |
| `butterchurn_noise.ts`      | The noise textures and volumes preset shaders sample                          |
| `butterchurn_gpu.ts`        | The render graph: warp pass, blur chain, waveform, composite, readback        |
| `butterchurn_background.ts` | The desktop field: audio, preset cycling, and the software fallback           |

Preset shaders ship as GLSL — upstream already converted them from MilkDrop's HLSL — and all 724 shader bodies in the
catalog translate to WGSL at catalog-build time, so an untranslatable shader is a number the build prints rather than a
silent runtime fallback. WGSL is the stricter language of the two, so the translator infers a type for every expression
it builds: GLSL's `clamp(uv, 0.0, 1.0)` applies a scalar across a vector and WGSL demands all three agree, and a literal
subscript or an `int` counter must stay integral where every other literal becomes a float. The graph then runs what
MilkDrop runs: the `pixel_eqs` mesh drawn over the previous frame through the preset's warp shader, a three-level blur
chain (295 presets sample `sampler_blur1`), the waveform, and the composite shader where most presets do their colour
grading. The finished frame is downsampled to the cell grid and read back asynchronously, landing one frame late.

**Skipping presets.** Clicking bare desktop advances to the next preset; `Ctrl-N [` and `Ctrl-N ]` step backwards and
forwards. Presets otherwise auto-cycle every fifteen seconds, and one that renders nothing is skipped after one.

**The order is shuffled, not sequential.** A catalog walk shows the same handful of presets every session in the same
order, and the catalog is alphabetical, so those neighbours tend to be variations on one another. The field appends a
fresh permutation whenever its queue runs short, which means everything is seen once before anything repeats — not what
picking at random would give. History is kept alongside the queue, so `Ctrl-N [` retraces what was actually on screen
rather than landing on a catalog neighbour nobody has seen. A field built with a seed shuffles reproducibly.

**Telling which renderer is running.** The status line announces the renderer whenever it changes, and stepping a preset
reports it alongside the preset name — `Preset 47/289 · gpu · mic:parec: Geiss - Cauldron`. `software renderer` there
means preset shaders are not running. The label is only earned once a frame has actually come back from the GPU; it used
to be unreachable, and reported `software` however well the GPU was doing.

One WebGPU device serves the whole client, from `gpu_device.ts`. Deno allows exactly one per process, and the turbulence
background wants one too, so a private device meant whichever field initialised second never got one.

Preset transitions are prepared ahead of time: the next preset's equations are compiled and its shader pipelines built
three seconds before its slot starts, the pipelines asynchronously. Both were previously done on the frame of the
switch, where they stalled the desktop.

**The device is asked what it will allocate**, rather than trusted. An exhausted driver goes on advertising fourteen
gigabytes free while refusing allocations of a megabyte — less than one full-size render target, so every target failed
at once, at any ordinary terminal shape. WebGPU hands back invalid textures rather than throwing, and those still
completed their readbacks, so the stall watchdog never fired and the desktop sat black indefinitely. `create` probes for
the largest target the device will really give, fits the render size under it at the desktop's aspect, and returns
nothing at all if even the smallest fails — which leaves the software renderer running instead of a black screen.

What exhausted the driver was this background: see the pipeline cache below. The probe is the guard that keeps any such
shortage, whatever its cause, from turning into a desktop that never comes back.

**Compiled pipelines are kept for six presets only.** One entry is two render pipelines and the shader modules behind
them, and the rotation visits 289 presets; cached without a bound, a long session accumulated all of them and exhausted
the driver — for the whole machine, not just this process, so nothing else could obtain a device until exomux was
restarted. Eviction costs a recompile, which happens off the main thread three seconds before the switch anyway.

Bind group layouts are declared rather than derived. `layout: "auto"` builds a layout from the bindings the shader is
seen to reach and prunes the rest, so a preset declaring a sampler it never gets to produced a group with more entries
than its layout — invalid, cached, and therefore broken for every later frame of that preset.

**Software fallback.** With no GPU adapter — a headless tailnet host, or `--unstable-webgpu` absent — the field falls
back to a CPU renderer that runs the equations but not the shaders. It still works, but resolves far fewer presets to an
image, and a brightness governor stands in for the composite shader that would otherwise keep the feedback loop bounded.
`butterchurn_rotation.ts` holds the 289 presets the audit accepted; it predates the fixes above and is worth
regenerating.

Measured against a real device at a 220x55 grid, each preset given its own render graph and twenty-four frames of
varying audio: **199 of 293 resolve to an image**, 73 stay black, 13 blow out to white, 7 settle into a flat wash, and
one will not compile. The blank ones are skipped after a second rather than held for their slot — both kinds, since a
solid colour covers the whole desktop and passes a coverage test with full marks.

`MIN_WAVE_ALPHA` was worth re-testing on the GPU path, where the composite shader and blur chain do run and might have
made the floor unnecessary. Honouring each preset's own `wave_a` instead takes the count that render from 199 down to
119, so the floor stays: the presets that set it near zero really are relying on custom waves and shapes, and those are
still the missing piece.

**Custom waves and custom shapes are ported.** Each enabled wave and shape carries its EEL blocks through the catalog
and gets its own variable pool — seeded from the preset's globals and `q`s each frame, `t1..t8` restored to their
post-init values, user variables persisting per wave, which is MilkDrop's scoping. Waves run their point equations over
the smoothed time or spectrum arrays at MilkDrop's byte scales; shapes run their frame equations per instance and become
triangle fans with a border strip. On the GPU they draw between the warp and the basic waveform — line strips, dots and
triangle lists with additive or alpha blending; on the software path they splat into the ink buffer under one shared
budget, so a hundred-instance shape cannot saturate the desktop.

Honest caveat from measurement: porting them did not flip the formerly-black presets at the classifier's thresholds — a
sample of sixty re-tested at 5-9 renders both before and after, within run noise. The mechanism is verified directly (a
shapes-only preset now paints, and a synthetic fan through the real graph reads back at the expected brightness); what
keeps those presets dark is their composite grading and slow build-up under short synthetic audio, not missing geometry.
What the port buys is fidelity on the presets that already render, and texture for the software path.

Shape texturing (`textured: 1`, sampling the previous frame into the fan) is carried as untextured colour for now.

`audio.ts` captures the microphone through the first of `parec`, `pw-record` or `arecord` that produces samples, and
reduces it to spectrum bands, bass/mid/treble energy, a waveform and beat pulses. Capture is refcounted and lazy:
nothing spawns until the background is selected, and the recorder is killed when you switch away.

```sh
deno task audio          # print 3s of live levels and a spectrum strip
```

Each recorder defaults to the system default source, which is **not** always a microphone — on a PipeWire desktop it is
often the monitor of an output, which records digital silence on an idle machine. `EXOMUX_AUDIO_DEVICE` overrides it
with a name from `pactl list sources short`; point it at a real input, or at an output monitor to visualize whatever is
playing. With no working recorder at all the analyser synthesizes a signal so the field still moves.

Both generated files are checked in and rebuilt with:

```sh
deno task exomux:presets --presets ~/projects/butterchurnxr/node_modules/butterchurn-presets
deno task exomux:audit
```

`butterchurn-presets` is MIT licensed, Copyright (c) 2013-2018 Jordan Berg.

## Background settings

`b` inside the global settings modal (or its `[ b Background config ]` button) opens a per-background config modal. Only
backgrounds with genuinely tunable behaviour get knobs — every row is wired to a real constructor option, and a
background with nothing to tune says so instead of showing decorations. Matrix, rainy windows, circuit, biomech, ivy and
jungle expose their density; fire its intensity.

Butterchurn gets the full panel: a scrollable picker over the whole 472-preset catalog (Enter or click selects it live),
cycle time (5s to 120s, or Hold to pin the current preset — Hold also disables the dead-preset skip, because a pinned
preset stays pinned), update rate (5/10/15/30/60/120 Hz, which really changes the desktop tick and rescales the decay
math), and the sound source: microphone, system audio (the monitor of the default output), or the noise generator.
Settings persist with the workspace and rebuild the field on change.

The `image` background shows a picture of your own: its pane is a file browser (PNG only — the one common format
decodable without vendoring a codec), and the picture is box-filtered to the cell grid at the terminal's 2:1 cell aspect
and painted as shaded blocks, letterboxed in the desktop theme.

## Transparent windows

Terminal windows can show the desktop background through their text. `opacity` is a desktop-wide setting in the global
config modal and a per-window override in the titlebar one; a window ships on `Desktop`, meaning it follows the global
value, and can be pinned to its own instead.

At `Opaque` a window paints its own surface colour, as it always has. Below that, every cell the program has **not**
given a background of its own is blended from the desktop background toward the surface colour — so lower opacity means
a lighter, more see-through window, and higher means darker and more solid. Characters themselves always render at full
strength; only their ground changes. Cells a program deliberately coloured keep that colour, because a transparent
window that erased them would wipe out every block of colour on screen.

A terminal cell carries one background colour, so what shows through is the background field's glyph and colour
collapsed into a single colour, weighted by how much of the cell that glyph covers — the `░▒▓█` ramp the fields use is a
coverage ramp already.

One consequence worth knowing: the desktop background normally stops animating once windows cover it, which is a real
saving. Any window below `Opaque` keeps it running, since that is exactly when the background is still on screen.

## Why this is a separate package

Exomux has its own `deno.json` and its own `deno.lock`, and it is deliberately **not** a Deno workspace member. A
workspace shares one npm resolution, and `deno compile` materializes all of it rather than just the module graph — as a
workspace member or as a file inside the library's own config, the compiled binary carried roughly 48MB of packages it
never imports (esbuild and its platform binaries, three.js, the image codecs). Resolved against this config it is
122.5MB instead of 170.4MB, with the dependency set still fully locked.

## Depending on the library

The library is reached exclusively through its public entrypoints, aliased in `deno.json`:

| alias                         | today                   |
| ----------------------------- | ----------------------- |
| `@ubernaut/deno-tui`          | `../../mod.ts`          |
| `@ubernaut/deno-tui/app`      | `../../mod.app.ts`      |
| `@ubernaut/deno-tui/terminal` | `../../mod.terminal.ts` |
| `@ubernaut/deno-tui/testing`  | `../../mod.testing.ts`  |

No file here imports `../../src/...`. Once the library is published, those four path values become JSR specifiers and
nothing else changes — that is the whole point of routing them through the import map.

`@showcase/kit` still points into `examples/showcases/shared`, which Inkstone also uses. It supplies six symbols
(`ShowcaseKernel`, `createShowcaseTerminalStore`, `defineShowcaseManifest` and three provider types) and needs its own
home before Exomux can be published independently.

## Layout

Sources sit flat at the package root; `tests/` holds the suite. `main.ts` is the CLI entry, `mod.ts` the library
surface.
