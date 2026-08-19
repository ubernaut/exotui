# Changelog

This project follows a semver-oriented changelog policy. Stable public APIs should only break in a major release, or
with explicit pre-1.0 breaking-change notes while this fork stabilizes. Beta and experimental surfaces may change more
quickly, but the affected entrypoint or module family should be named here.

## Unreleased

## 0.3.1 — 2026-08-19

### Added

- **`readout`** — a rank-0 visualisation that draws the value as text, in as little as one cell. It completes the
  degradation ladder: a terminal can always be made small enough that a meter is a lie, and at that size the honest
  thing is the number. It is a visualisation like any other so the registry can choose it, rather than every caller
  carrying a special case for "too small to draw". `VizContext` gains an optional `format`, because only the caller
  knows whether a number is a percentage, a byte rate or a temperature.

## 0.3.0 — 2026-08-19

### Added

- **`@ubernaut/exotui/viz`** — dimensional visualisations. Data is described by rank and by whether history is kept:
  `0d` is one number, `0dt` its history, `1d` an array read now (per-core load, audio bands), `1dt` that array over
  time, and so on through `2d`/`2dt`/`3d`. A visualisation declares the kind it draws, a `DataStream` declares the kind
  it carries, and pairing them wrongly throws instead of drawing something quietly false.

  Ships `meter`, `sparkline` and `psychograph` for rank 0; `bars`, `rack` and `waterfall` for rank 1; `heatmap`,
  `lattice` and `volumeProjection` above that. The lattice is the 2D half of the wireframe lattice, separated from its
  Three.js twin so a flat chart does not drag a renderer dependency behind it.

  Colours come from a new `viz:*` control-token group that falls back through the chrome and status tiers, so a theme
  that has never heard of a chart still paints one.

## 0.2.1 — 2026-08-19

### Fixed

- **A widget revealed after its first frame now draws.** `Gauge`, `Sparkline` and `Chart` build their children inside
  `draw()`, which for a component that starts invisible runs from its own visibility subscriber — while the sibling
  Computeds of the same change are still stale. A panel that became visible and sized in one update built its child
  against a zero-width rectangle and stayed blank. The first draw is now deferred by a microtask so the batch settles.
  `Text` was never affected, which is why this went unnoticed.

## 0.2.0 — 2026-08-19

### Added

- **`@ubernaut/exotui/showcase`** — the showcase kernel is now part of the library. Manifests, providers, sessions and
  the terminal store moved from `examples/showcases/shared/` to `src/showcase/` and ship as a `./showcase` entrypoint.

  It moved because exomux depends on it. A module the flagship application imports in `main.ts`, `model.ts` and
  `controller.ts` is not an example, and leaving it under `examples/` — which is excluded from the published package —
  meant nobody could build on exomux without it silently missing. Anyone writing an application on this library, rather
  than beside it, wants the same pieces.

## 0.1.0 — 2026-08-19

The first published release. Everything below was written before anything shipped, so it describes how the library
arrived at 0.1.0 rather than what changed since a previous version.

The package is published as `@ubernaut/exotui`. It was called `@ubernaut/deno-tui` for most of its development, after
the deno_tui project it is forked from; the entries below have been written in the published name so that every
specifier in this file is one you can actually import.

### Breaking changes (pre-1.0)

- The Three.js-backed ASCII renderer moved off the default `.` entrypoint and now ships only from `./three-ascii`
  (`mod.three_ascii.ts`). `src/canvas/mod.ts` and `src/components/mod.ts` no longer re-export `./three_ascii.ts`, and
  `mod.ts` no longer re-exports `src/three_ascii/mod.ts`, so 83 stable symbols — `ThreeAsciiObject`, `ThreeAscii`,
  `AcerolaAsciiNode`, the renderer, glyph, readback, and probe families — must now be imported from `./three-ascii`.
  Those modules import `npm:three`, which put a WebGPU renderer in the dependency graph of every consumer of the default
  entrypoint; `mod.ts`, `mod.app.ts`, and `src/canvas/mod.ts` now resolve without `npm:three` at all.
- The pre-1.0 `MarkupWindowSnapshot` shape advances from V1 to V2 to persist floating rectangles, restore/snap metadata,
  groups, focus tiers, and active identity. Restore accepts and deterministically migrates supported V1 payloads;
  persisted writers and TypeScript consumers should emit the V2 shape.
- `PlatformInputEvents` and the beta `WebTuiHostEvents` contract now include normalized `pointerInput` events. Custom
  platform and browser-host event maps must expose that event alongside the legacy mouse adapters. Browser hosts emit
  both streams for compatibility; controller code should route one stream only, preferring `pointerInput` in new code.
- The stable `MouseInteractionTarget.zIndex` field now accepts `number | (() => number)`. Writers remain compatible;
  consumers that read or compare the field directly must resolve the function form before treating it as a number.
- `RouteManager` now owns snapshots of registered route objects. Code that relied on route object identity or mutated
  the original caller-owned object must instead mutate the managed `manager.routes.value[...]` view or use
  `register(route, { replace: true })`.
- `FormController` now defensively clones and owns object/array initial values, root replacements, and field writes.
  Code that relied on retained object identity or later caller-side mutations must update the controller's managed
  `values`/field signals instead.

### Added

- Exomux butterchurn backgrounds gained **preset favorites**. Right-clicking an active butterchurn desktop (GPU or
  software) adds a **Favorite ☐/☑** item to the menu (below Settings), which toggles whether the showing preset is a
  favorite (a checked box when it already is). The background-config **preset picker** also shows a ★/☆ per preset and
  toggles it with **Space** (Enter still selects). A new **Favorites only** background setting then restricts auto-cycle
  to the favorites — falling back to the whole catalog when none are set, and holding a lone favorite. The favorites
  list is shared across both renderers (each cycles the ones in its own catalog) and persists to the config file.
  Favoriting updates the live field without restarting the preset on screen; only the toggle rebuilds it. New surface:
  `exomuxStartMenuItems`, `controller.butterchurnFavorites` / `toggleButterchurnFavorite`, the field's
  `favorites`/`favoritesOnly` options and `setFavorites`.
- New **`WidgetSurface`** (`@ubernaut/exotui/app`): an off-screen component host for apps that paint their own retained
  grid by hand (a terminal multiplexer fusing PTY screens, translucent windows, and GPU backgrounds is the motivating
  case). It mounts a component subtree on an in-memory `Canvas`, renders it manually (no terminal, no loop, no stdout),
  forces a full redraw per pass so a snapshot is always exact, and exposes the cells through `cellAt` for the host to
  composite. Promoted from exomux's proven `ExomuxWidgetSurface`, which is now a thin alias — so the settings/background
  surfaces and composited input fields ride the library primitive.
- Exomux's software MilkDrop renderer is now its own background, **"butterchurn cpu"**, instead of a silent fallback of
  the GPU one. It never touches the GPU and cycles only the **365 of 472** presets that actually resolve to a moving
  image on the CPU path (audited by `scripts/audit_butterchurn_catalog.ts`, now run against the CPU renderer;
  `EXOMUX_BUTTERCHURN_SOFTWARE_PRESETS`) — so it no longer skips through blank presets roughly once a second the way the
  GPU field did when it had no device. The GPU **"butterchurn"** background, in turn, now shows a centered "no working
  WebGPU device — try butterchurn cpu" notice when no GPU is found, rather than limping along on the CPU renderer
  (`errorWithoutGpu`). Both share the same knobs (cycle time, update rate, sound source, debug overlay).
- The Exomux butterchurn background gained a **Debug overlay** toggle (in its background-config options). When on, it
  paints a two-line readout in the lower-left — the live renderer (`CPU` vs `WebGPU`) and the current preset name and
  position — as part of the background layer, so windows occlude it rather than it floating over their content. Turning
  it on also streams WebGPU diagnostics (adapter/device availability, `uncapturederror` validation messages, WGSL
  shader-compilation warnings/errors, per-preset compile success/failure, and device-lost fall-backs) plus any JS
  `console` output to a timestamped file under `logs/` in the working directory, so a GPU issue can be diagnosed after
  the fact. The logging is entirely opt-in and every filesystem touch is guarded, so it is a no-op when the toggle is
  off or the working directory is not writable. `logs/` is gitignored.
- Focused controls are now visible by default. A theme that does not give a control a `focused` (or `active`) look of
  its own defaults it to a reverse-video cue over the base, so the keyboard-focused widget always stands out —
  `hierarchizeTheme` derives it via the new exported `withFocusCue(base)`. Passing `focused` explicitly (even equal to
  `base`) still opts out, so existing themed apps are unchanged.
- New `Cycler` component: a compact value picker that shows one value flanked by `<` / `>` affordances and steps through
  a fixed set of options (left half / left-arrow / wheel-up step back, right half / right-arrow / wheel-down step
  forward), wrapping by default. It fills the gap between `Stepper` (a multi-step wizard indicator) and a settings row
  that cycles a single choice. `CyclerController` holds `options`/`activeIndex`/`wrap` with `move`/`setActive`/`handle*`
  helpers; `renderCycler` composes and clips the `< value >` row.
- `List` is now mouse-interactive. It handles `mousePress` (select — and, unless a drag, activate — the row under the
  pointer, resolved through its current scroll window) and `mouseScroll` (move one row per notch), and overrides
  `interact()` so it is a proper interactable focus target like `Slider` and `Button`; `ListController` gains
  `indexAtRow()` and `handleScroll()` for the window math. It was keyboard-only before.
- `List` gains three opt-in extras. `selectedStyle` draws the selected row as a full-width highlight (a `Text` overlaid
  above the base rows) rather than only the `>` marker. `scrollbar` (`{ track, thumb }` styles) draws a one-column bar
  down the right edge whose thumb size scales with the visible/total ratio and whose position tracks the scroll window.
  `markerFor(index, selected)` chooses each row's one-character leading marker, so a caller can mark a second state — a
  current/active item distinct from the cursor — reactively. All three are additive — off by default, no change to
  `drawTextRows` or other consumers.
- `List` gains **`rowStyle(index, selected)`**: a per-row reactive style. When set, each visible row is drawn as its own
  full-width styled `TextObject` (foreground and background) instead of the component's uniform theme — so rows can
  carry state colour (an active item bright, a stopped one muted) or a translucent "ground" background for a composited
  host to blit — and the styling tracks the scroll window (it colours by item, not screen row). Returning `undefined`
  falls back to the base style. Additive: off by default; the cached `drawTextRows` path and other consumers are
  unchanged.
- Exomux has an optional block mouse cursor (a new "Block mouse cursor" setting, off by default): a themed block drawn
  at the mouse cell. While on, Exomux enables any-motion mouse tracking (mode 1003) so it follows free movement — and
  keeps it re-asserted on a light keepalive so the library's own `ENABLE_MOUSE` (which only asks for button-event
  tracking and fires from `Tui.run()` after the desktop mounts) can never leave the cursor stuck updating on click
  alone. Since no TUI app can hide the terminal's own pointer, under Ghostty it also writes a managed `cursor.conf` with
  `mouse-hide-while-typing = true` (with its include) to cut the double-cursor. It restores mouse tracking on teardown.
- Double-clicking a window's title bar toggles maximize/restore, matching the desktop convention. The click lands on the
  bare title row (off the window's controls), and the first press still focuses; a quick second one on the same title
  bar runs `toggle-maximize` before the host can treat it as a move.
- The Exomux settings option rows are real exotui controls: a `CheckBox` for the boolean (overgrow inactive) and a
  `Cycler` for each discrete-value setting (opacity, scroll speed, overgrow time, border style), composited over the
  value column. They display the live value while the existing option routing drives changes; the dynamic Ghostty shader
  rows stay hand-drawn. `packages/exomux/settings_options.ts` carries the option-control host.
- The Exomux background-config modal is built from the same real controls: its preset/image pane is a real `List` (with
  a `·` marking the active preset, the selected-row highlight, and a content scrollbar), each background setting is a
  `Cycler` or `CheckBox`, and Close is a `Button` — all composited over the modal, driven by its existing routing.
  `packages/exomux/background_list.ts` carries the list-pane host.
- The Exomux settings window's theme and background selectors are real exotui `List` components, not hand-drawn rows.
  They are mounted on an off-screen `ExomuxWidgetSurface`, bound two-way to the controller's selection, and composited
  into the window; a click on a picker is forwarded straight into the `List` as a real `MousePressEvent`, which selects
  the row and applies it through the binding, while keyboard and wheel flow through the existing routing and reflect
  back into the list. Until a snapshot is ready the painter falls back to the hand-drawn rows, so a picker is never
  blank. `packages/exomux/settings_surface.ts` carries the picker host and its `ExomuxPickerBindings` seam.
- The Exomux settings window's action buttons ("Background config" and "Close") are real exotui `Button` components, not
  hand-drawn glyph runs. A new `ExomuxWidgetSurface` hosts a headless `Tui` over a `MemoryCanvasSink`, so library
  components render off-screen into an in-memory cell grid that the desktop composites into the window exactly as it
  composites any terminal's screen grid. Because component draws defer to microtasks while the desktop paints
  synchronously, `ExomuxSettingsWidgets` captures the buttons' styled cells into a snapshot the painter blits through a
  new `DesktopPainter.rawCell()`; a completed render schedules the repaint that shows it, and until a matching snapshot
  exists the painter falls back to the previous hand-drawn labels so a button is never blank. `packages/exomux/`
  `widget_surface.ts` and `settings_widgets.ts` carry the compositing surface and the button host.
- Exomux offers GLSL interface shaders in the settings window whenever Ghostty is available — running inside it, or just
  installed (`isGhosttyAvailable` checks the environment and PATH) — so the settings manage the same Ghostty shader
  config the installer sets up, even from another terminal. Each shader row is a real exotui control: a `CheckBox` per
  effect and a `< value >` `Cycler` per parameter, composited like every other option; adjusting one rewrites Ghostty's
  shader config. Two CRT effects ship: pulsating/flickering scanlines (scanline-depth, flicker, pulse) and pincushion
  distortion (magnitude), and **more than one can run at once** — each effect has its own on/off toggle and parameters,
  each enabled effect is generated to its own GLSL file and chained with a repeated `custom-shader` entry. Enabling a
  shader also **auto-installs the managed include** into the user's Ghostty config (idempotent, XDG/macOS-aware,
  reversible), so it takes effect on Ghostty's next reload without a manual edit — previously the one-time include had
  to be added by hand, which is why an enabled shader could appear to do nothing. `packages/exomux/ghostty.ts` carries
  the detection, shader generation, and config surface.
- The Exomux settings session-name field is a real exotui `Input` while a rename is edited: it owns the text and cursor
  natively (typing, backspace, cursor keys, and Enter to submit), composited over the field, and pushes the draft to the
  controller (a new `setSessionRenameDraft` re-applies the name filter and length cap). Escape still cancels and Enter
  still routes to the existing live-rename commit. `packages/exomux/session_name_field.ts` carries the editor host.
- The current Exomux session can be renamed from the settings window — a true rename of both the attach key and the
  on-disk state. Click the session name at the top of the settings window, type a new one, and press Enter: the daemon
  relocates its private descriptor to the renamed session's directory (a new `rename` protocol message, confined to the
  same state root), the window layout moves with it and the live layout store re-points, and the old name is freed. The
  session keeps running throughout; afterwards `exomux -a <newname>` attaches and the old name no longer resolves.
- Right-clicking the Exomux desktop opens the menu under the cursor, clamped to stay on screen, instead of only from the
  top-left start button. A terminal with mouse reporting on still owns its own right-click.
- Exomux settings now persist to a durable config file at `~/.config/exomux/exomux.json` (`$XDG_CONFIG_HOME`/`%APPDATA%`
  respected), separate from the per-session layout state, so the theme, background, and every settings knob survive
  reboots and host termination and are shared across sessions. The chosen background image is copied beside it under
  `images/`, so a wallpaper keeps working even if the original file is later moved or deleted. `exomux --reset-config`
  restores safe defaults, `exomux -h`/`--help` lists every flag and prefix command, and a launch failure now prints that
  help and suggests the reset. `packages/exomux/config.ts` carries the config surface.
- The image background decodes JPEG (`.jpg`/`.jpeg`) as well as PNG, via the vendored `jpeg-js`; the config browser
  lists both and dispatches by content signature.
- `install-exomux.sh` compiles Exomux and installs it to `~/.local/bin/exomux` for the current user, so `exomux` runs
  from any directory; re-running it refreshes the installed binary.
- Terminal backends now support consumer backpressure: `TerminalBackendSpawnOptions.onData` (and the pipe backend's
  `onOutputData`) may return a promise, and both the Sigma PTY poll loop and the process pipe pump await it before the
  next read. Callbacks that returned a value from a concise arrow must add braces — the return type is now
  `void | Promise<void>`.
- Exomux hosts are named sessions, tmux-style. A bare launch attaches to the single live session, creates the default
  session (`main`) when none exists, and lists the candidates — state, uptime, terminal count, foreground commands —
  instead of guessing when several are live. `-a <name>` attaches and never launches, `-n [name]` creates and never
  reuses (numeric names are generated when omitted), and `--list-sessions` prints the same listing and exits. The
  default session keeps its state where pre-session Exomux kept it, so an already-detached host and its persisted layout
  carry across the upgrade; named sessions live under `sessions/<name>/` beside it. `packages/exomux/sessions.ts`
  carries the naming, discovery, probing, and listing surface.
- The butterchurn background reports which renderer is drawing it. Falling back to the software renderer used to be
  silent, and its symptom — most of the rotation resolving to nothing — is indistinguishable from a broken background.
  The desktop now says so in the status line when the renderer changes, and the preset name shown when stepping presets
  carries the renderer and audio source alongside it.
- Butterchurn presets can be skipped by hand. Clicking bare desktop advances to the next one, and `Ctrl-N [` /
  `Ctrl-N ]` step backwards and forwards; both wrap. The catalog is 289 presets deep and each holds the screen for
  fifteen seconds, so waiting one out was the only way past it. `ExomuxPresetBackground` is the contract a field opts
  into to be steppable, and the controller records the request for the desktop to apply, since preset catalogs live with
  the fields rather than the controller.
- Terminal windows can be transparent. `opacity` is a new desktop-wide setting and a new per-window override, the latter
  defaulting to `Desktop` so a window follows the global value until it is pinned. At `Opaque` a window paints its own
  surface, as before; below that, every cell the program has not given a background of its own is blended from the
  desktop background toward the surface colour, so characters stay fully legible while their ground shows what is behind
  the window. Cells a program deliberately coloured are left alone. What shows through is the background field's glyph
  and colour collapsed to one colour, weighted by the glyph's coverage, since a terminal cell has only one background.
  Any window below `Opaque` also keeps the desktop background animating, which otherwise stops once windows cover it.
- Exomux gains a `butterchurn` desktop background: a microphone-reactive MilkDrop visualizer, and the twelfth selectable
  field. It is the ASCII port of butterchurnxr's `asciichurn` rendered natively — `asciichurn` proxies its pixels out to
  Butterchurn's WebGL2 renderer in headless Chromium, which a single compiled binary running over a tailnet cannot do,
  so the renderer is rebuilt here against `navigator.gpu` and resolved to terminal cell resolution. Presets cycle every
  15 s. Custom waves and custom shapes are the one part of a preset still not carried over.
- `packages/exomux/eel.ts` is an interpreter for EEL2, the expression language MilkDrop preset equations are written in:
  a tokenizer, a precedence parser and a closure compiler over a slot-allocated variable pool, covering the roughly
  thirty builtins the catalog uses along with `megabuf`/`gmegabuf` memory and the `loop`/`while`/`exec2` forms. 576 of
  the catalog's 579 equation blocks compile; the three that do not have an identifier split across a newline in the
  upstream JSON, which Butterchurn cannot parse either, and are skipped rather than failing the preset.
- `packages/exomux/butterchurn_catalog.ts` vendors the upstream `base` + `extra` preset packs — the same 293 MilkDrop
  presets asciichurn reports — as base values plus equation source. `butterchurn_preset.ts` runs them through
  Butterchurn's own pipeline: base values are restored every frame, which is what makes the catalog's ubiquitous
  self-referential oscillator idiom oscillate instead of diverging; `q1..q32` reset to their post-init values while user
  variables and registers persist; and MilkDrop's exact per-vertex warp composition drives the mesh the previous frame
  is resampled through. Each preset therefore moves the way it does upstream rather than being approximated.
- `packages/exomux/glsl_wgsl.ts` translates MilkDrop preset shaders from GLSL to WGSL. Preset shaders ship as GLSL —
  upstream already converted them from MilkDrop's HLSL — and all 500 shader bodies in the vendored catalog translate.
  The subset needed is small: declarations, swizzles, `if`/`else`, nineteen `for` loops across the whole catalog, and
  about twenty builtins. The one structural difference is swizzle assignment, which WGSL forbids beyond a single
  component and which is expanded into per-component writes.
- `packages/exomux/butterchurn_gpu.ts` is MilkDrop's render graph on WebGPU, so preset shaders actually run: the
  `pixel_eqs` mesh drawn over the previous frame through the preset's warp shader, a three-level separable blur chain
  (295 of the catalog's presets sample `sampler_blur1`), the waveform as line geometry, and the composite shader where
  most presets do their colour grading. The result is downsampled to the cell grid and read back asynchronously, landing
  one frame late the way `turbulence_background` does. `butterchurn_noise.ts` reproduces the 2-D noise textures and 3-D
  noise volumes those shaders sample, including MilkDrop's Catmull-Rom smoothing pass, without which the 173 presets
  that read noise render as static instead of flowing texture.
- `packages/exomux/butterchurn_rotation.ts` is now selected against the GPU renderer, where 289 of 293 presets resolve
  to a moving image — up from 171 on the software path. Every preset stays reachable by index through
  `EXOMUX_BUTTERCHURN_CATALOG`. Both generated files are checked in and rebuilt with `deno task exomux:presets` and
  `deno task exomux:audit`. `butterchurn-presets` is MIT licensed, Copyright (c) 2013-2018 Jordan Berg.
- `packages/exomux/audio.ts` captures the system microphone through the first of `parec`, `pw-record` or `arecord` that
  produces samples, and reduces it per frame to 24 log-spaced spectrum bands, bass/mid/treble energy, a 256-sample
  waveform, and beat pulses. Capture is refcounted and lazy: nothing spawns until a reactive background is selected, and
  the recorder is killed when the last reader releases it, so switching backgrounds stops recording. `deno task audio`
  prints live levels; `EXOMUX_AUDIO_DEVICE` overrides the capture device, which matters because the system default is
  often an output monitor rather than an input. With no working recorder the analyser synthesizes a signal so the field
  still moves instead of freezing on a blank desktop.
- `ExomuxBackgroundAdvanceOptions.solidObstacles` carries every window rect, including ones the desktop has begun
  reclaiming and therefore dropped from `obstacles`. Fields that model physical collision read it, so water pooled on an
  idle window's roof does not fall through the moment overgrowth starts.
- `ExomuxInteractiveBackground.picksOverWindows` lets a field claim clicks on cells it paints into the post-window
  overlay. Without it the rain drain plug, which sits on the bottom row, would be unreachable behind a tiled window.
- Added the Exomux `[ Network ]` menu and left-docked panel with remembered SSH hosts (persisted, deletable) and live
  Tailscale devices from a strict LocalAPI-with-CLI-fallback status source, with visibility-gated jittered polling and
  one-keystroke SSH session spawning through the detached host.
- Added a Exomux end-session control: a header `[ ✕ ]` button opening a Cancel / Detach / Terminate modal, where detach
  exits the client leaving the daemon running and terminate shuts the daemon down first.
- Added five selectable animated Exomux desktop backgrounds — dense matrix glyph rain, a window-aware procedural
  circuitboard whose wires route around windows, tap into their borders, and glow brighter toward the focused window, a
  full-coverage Giger-style biomechanical wall, a dense breeze-reactive palm-frond canopy, and a block-style
  vaporwave/outrun sunset with a rising/setting scanline sun and a grid that drives toward the viewer — all
  theme-derived, deterministic, pointer-aware, persisted, and cycled with prefix `b`.
- Exomux's network panel lists each host's open shells beneath it (persisted session→host mapping); activating a shell
  focuses its window.
- Added the beta `./app` entrypoint with `TerminalApp`, declarative app definitions, default interaction/lifecycle
  wiring, disposable input handling, component registration, and a focused runnable example.
- Added a headless `TerminalAppPilot` through `./testing` for deterministic key, pointer, paste, focus, resize, command,
  action, settle, wait, and canvas snapshot tests.
- Added parser-backed Markdown documents, terminal rendering, semantic styling, scrolling, and the `Markdown` component
  through the beta `./app` entrypoint.
- Added a renderer-neutral HTML/CSS-style layout foundation with markup parsing, CSS-like cascade, block/flex solving,
  computed layout boxes, and a runnable `deno task html-css-layout` example.
- Added markup widget hydration for common controls, including a default registry, focus order, controller lookup,
  dispatch helpers, and custom registry support.
- Added experimental Kitty graphics protocol helpers for command encoding, payload chunking, tmux passthrough wrapping,
  delete commands, and terminal support detection.
- Added a renderer-neutral graphics surface interface with no-op and Kitty command-surface implementations.
- Added the experimental `./layout/yoga` package subpath for the optional Yoga-backed Flexbox solver.
- Added the experimental `./layout/taffy` bridge protocol, strict backend validation, intrinsic-measurement callbacks,
  deterministic cell projection, lifecycle isolation, and a checked-in backend probe/adoption report.
- Added advanced Simple-solver Flexbox and sizing support for reverse axes, wrapped-line `align-content`,
  `space-evenly`, aspect ratios, content/border box sizing, percentage spacing, auto margins, and relative insets.
- Added renderer-neutral screen stacks, typed modal results, safe versioned persistence, router-owned named-mode
  projection, declarative tiled windows/modals, compact projection, and shared failure-atomic window undo/redo.
- Added a renderer-neutral advanced-windowing foundation with latent tiled and durable floating placement, constrained
  move and eight-edge resize, workspace/corner/dock snapping, grouped movement, deterministic normal/always-on-top focus
  tiers, bounds recovery, strict V1-to-V2 snapshots, capture-driven pointer gestures, and one-entry gesture undo/redo.
- Added the shared `WorkbenchWindowHostController` for renderer-neutral tiled/floating chrome, titlebar controls,
  separator and edge gestures, snap previews, minimized-window shelves, projection-aware MRU switching, semantic nodes,
  direct commands, exact window history, and terminal/browser pointer adapters over one workspace owner.
- Added Showcase Session V2 window-state persistence with V1 migration and commit-boundary writes, plus Inkstone as the
  first production-shaped terminal adopter with responsive tiled/floating projection, shared chrome, window commands,
  route-aware focus, row-level pointer targets, and deterministic recovery tests.
- Added nestable transactional history with compensation, poisoned-state recovery, fake-clock keyed coalescing, semantic
  boundaries, and explicit replay-safety barriers plus a versioned, causal, canonical action journal with deterministic
  pure replay, component-owned migration-aware checkpoints, and replay-safe count/byte/age retention.
- Added layered keymaps, named multi-stroke commands and leaders, caller-driven sequence deadlines, live remapping,
  typed host-owned plugin slots, and data-only core/markup/optional-view slot adapters.
- Added conservative terminal OSC services for theme/palette queries, title/background control, OSC 52 clipboard,
  desktop notifications, raw OSC routing, bounded parsing, and capability diagnostics.
- Added injected host and deterministic virtual monotonic schedulers with cancellable one-shot timers, stable
  same-deadline ordering, bounded advancement, error isolation, and no global timer replacement.
- Added structured parent/child task groups with propagated cancellation, deterministic joining, fail-fast/fail-late
  policies, always-settling results, and explicit supervisor ownership for detached work.
- Added one strict versioned input envelope shared by terminal, browser, remote, and test adapters, with per-factory
  monotonic sequencing, conservative trust defaults, opt-in bounded raw payloads, and canonical serialization.
- Added normalized mouse, touch, pen, and terminal pointer adapters plus explicit per-pointer capture ownership,
  deterministic transfer/release routing, bounded diagnostics, and device-independent controller seams.
- Added opaque secret values with callback-only reveal, best-effort byte disposal, fail-closed schema redaction, bounded
  JSON-safe log/history/persistence projections, and sanitized inspection and error surfaces.
- Added deterministic input lifecycle reconciliation for focus loss, transport disconnect, capture disposal, and host
  disposal, synthesizing only held-key releases and active pointer/gesture/drag cancellations.
- Added caller-clock deadline budgets with parent-child tightening, typed timeout/cancellation causes, external abort
  linkage, TaskGroup/task/resource propagation, and virtual-time inspection, plus bounded async channels with five
  explicit overflow policies, finite waiter limits, and FIFO rendezvous/backpressure semantics.
- Added strict versioned runtime permission manifests for filesystem, network, environment, subprocess, FFI, clipboard,
  notification, and remote-session adapters, including required/optional activation reports with provenance and
  pre-probe reports from process and PTY terminal backend providers.
- Added generated Unicode 17.0.0 grapheme-break, East Asian Width, and emoji data with pinned upstream hashes, immutable
  deterministic registries, binary lookups, and reproducible offline drift/update commands.
- Added a process-local structural resource-cache coordinator with ownership counts, bounded subscriptions, atomic
  status/value revisions, opaque diagnostics, and last-owner eviction without invalidating active reads.
- Added disposable `AsyncIterable` map, filter, merge, switch-latest, debounce, throttle, buffer, window, and retry
  operators with injected schedulers, bounded work, prompt cancellation, and exactly-once upstream cleanup.
- Added an experimental strict remote version/capability handshake and negotiated terminal client/bridge factories that
  reject incompatible peers and all application traffic before negotiation completes.
- Added exact Unicode 17.0.0 UAX #29 extended-grapheme segmentation, chunked scanning, boundary/range helpers, and
  grapheme-safe input, textbox, command-palette, and workbench editing backed by a reproducible compact browser pack.
- Added injectable-clock resource-cache freshness and retention policies with stale-while-revalidate focus/reconnect
  refresh, retained-data resurrection, deterministic inspection, and safe caller-owned scheduler integration.
- Added typed immutable nested form paths with canonical serialization, bounded get/set/delete helpers, path-aware
  diagnostics, nested registration/reset/dirty/error state, and recursively managed direct value mutations.
- Added versioned typed route locations with canonical parse/format support for params, query, fragments, and state,
  plus bounded immutable locations and synchronized read-only RouteManager observation.
- Added opt-in immutable Unicode 17 terminal-width profiles for UAX #11 ambiguous, combining, private-use, and
  unassigned policy, backed by pinned General Category data and a shared terminal/browser entrypoint corpus.
- Added independently cancellable resource-load handles with deduplicating join, supersede, and force-new policies,
  revision-guarded publication, bounded ownership, and exception-atomic reentrant transitions.
- Added grapheme-safe `TextBox` directional selection, selection-aware multiline edits and paste, terminal-cell-aware
  selection/cursor projection, and failure-atomic bounded literal find/replace APIs, plus Inkstone current-note
  find/replace and latest-wins, permission-scoped durable session/draft recovery with a deterministic in-memory
  fallback.
- Added typed field-array controllers with stable item IDs, structural mutations, per-item interaction metadata,
  caller-owned history transactions, and bounded identity-preserving external reconciliation.
- Added compiled typed route patterns with parameter codecs, deterministic build/match behavior, static/parameter/splat
  ranking, immutable registries, and bounded ambiguity diagnostics.
- Added a package stability manifest for terminal, browser, remote, experimental, and demo-only surfaces.
- Added `deno task package-check` to verify the Deno export map stays aligned with the stability manifest.
- Added `@ubernaut/exotui` package metadata, a lean JSR publish allowlist, and `deno task release-check` for strict
  publish dry runs with artifact-size reporting.

### Changed

- Exomux's SCP transfer prompt now hosts a **real composited `Input`** for its password field instead of a hand-drawn
  `•`-masked box: it masks (`*`), owns typing/cursor/backspace natively, and pushes its value back to the controller. It
  rides a new reusable `ExomuxInputField` (`packages/exomux/input_field.ts`) — the generalized form of the session-name
  editor's composited-Input pattern (masked or validated, `sync`/`handleKey`/`cellAt`/`ready`) — the first step of
  back-feeding exomux's hand-drawn controls onto real components. Keystrokes that beat the field's async mount are
  accumulated on the controller and seeded in, so none are lost.
- Exomux's fall-back music generator (what the butterchurn/reactive backgrounds visualize when no microphone or system
  audio is available) is now an actual on-the-fly composition instead of a flat drone. Three voices — a low bass, a mid
  melodic lead, and a high arpeggio — each run their own 16-step sequencer on their own rhythmic interval, drawing notes
  from a shared minor-pentatonic scale; the patterns re-roll every bar and the root and tempo drift every few bars, so
  the piece keeps mixing itself up. All choices come from a seeded PRNG (`createExomuxAudioSource({ seed })`), so it is
  fully reproducible for tests while seeding from the wall clock in normal use. The published `ExomuxAudioFrame` shape
  (24 spectrum bands, 256 waveform samples, bass/mid/treble, beat) is unchanged.
- Exomux scrolls one row per wheel notch by default instead of three, which reads far better in menus like the theme
  picker. Scroll speed is now a selectable desktop-wide setting and a per-window override (a window follows the desktop
  speed unless pinned). Utility lists — the session manager, the network tree, the settings panes — move one selection
  per notch regardless, the natural feel for a menu.
- Exomux's global settings left their modal behind: they now live in an ordinary floating window — movable, resizable,
  always-on-top, born minimized — so the desktop stays fully interactive while it is open. Keyboard behavior follows
  window focus (arrows, Tab, Enter, and Escape drive the settings only while the window is active), wheel scrolling
  moves the current pane's selection, the chrome close button tucks the window away, and the `[ b Background config ]`
  button now wears the theme's warning hue — theme-derived but deliberately distinct from the accent and the desktop
  background — so it reads at a glance.
- Exomux ships slightly translucent by default: the desktop-wide window opacity now defaults to 85% instead of opaque,
  and the butterchurn background's update-rate setting defaults to 60 Hz (the value list leads with 60, then 120, and
  wraps through the slower steps).
- Exomux's desktop repaint now invalidates on desktop-wide and per-window settings changes. Both reach the painter
  directly — border glyphs, window opacity — and previously only repainted because cycling a setting also rewrote the
  status line.
- The butterchurn background renders through the preset's own shaders when a WebGPU adapter is available, and falls back
  to a software renderer that runs the equations but not the shaders when one is not — a headless tailnet host, or
  `--unstable-webgpu` absent. The fallback resolves far fewer presets to an image, and gains a brightness governor
  standing in for the composite shader that would otherwise bound the feedback loop; without it ten presets accumulate
  into a flat white field. The exomux `start`, `memory`, `test` and `compile` tasks now pass `--unstable-webgpu`.
- Exomux's desktop drops a cached background field when it stops being the selected one, provided the field exposes
  `dispose`. Fields are otherwise retained so switching away and back resumes the same simulation; the butterchurn field
  owns the microphone handle and must not keep it once the desktop stops drawing it.
- Exomux's "rainy windows" background is now a rain-and-flood simulation rather than tinted matrix rain. Drops are drawn
  as vertical streaks — a leading head over a trail that thins from a solid line to a dotted thread by speed class —
  instead of katakana glyphs, and each one breaks on whatever it lands on. The water they leave behind is a 2-D
  compressible shallow-water field over the whole desktop: it flows, finds one level, presses back up under its own
  weight, and will flood the screen if left alone. Windows are solid to the water and transparent to the rain, so the
  pool never paints over terminal text but does pool on a window roof and pour off its edges, which subsumes the old 1-D
  window-edge puddle and side drizzle. A clickable drain plug sits in the bottom middle; pulling it opens a sump that
  empties a flooded desktop in about a dozen seconds, and clicking again closes it. Rain density is now per cell rather
  than per column, so a tall terminal no longer looks sparse or fills at a different rate from a short one.
- The waterline carries a damped 1-D wave field, so a landing drop sends a ring travelling outward and a settled pool
  keeps moving. The height solver is diffusive and therefore has no momentum — however fast it is made it can only
  smooth a disturbance away in place — so waves are integrated separately along the surface and rendered by displacing
  the sub-cell waterline, including crests that spill into the row above and troughs that drop it a row.
- Exomux's overgrowth frontier is now per-background. Rain reclaims an idle window from the top edge only, as ragged
  streaks running down the glass at varying lengths; every other organic background keeps closing in from all four
  borders. `exomuxOvergrowthThreshold`, `exomuxOvergrowthCovers` and `exomuxOvergrowthVisible` take an optional
  `ExomuxOvergrowthEdges` argument that defaults to the previous behaviour.
- Exomux moved out of `examples/showcases/exomux` into `packages/exomux`, a standalone package with its own `deno.json`
  and `deno.lock`. It now reaches the library only through its public entrypoints, aliased in its import map as
  `@ubernaut/exotui`, `/app`, `/terminal` and `/testing`; no file in the package imports `src/` any more, so publishing
  later means repointing four import-map values rather than rewriting imports. It is deliberately not a Deno workspace
  member: a workspace shares one npm resolution and `deno compile` materializes all of it rather than just the module
  graph, which is why the in-workspace binary carried ~48MB of packages Exomux never imports. Compiled against its own
  config it is 122.5MB rather than 170.4MB, with dependencies still fully locked. The root `exomux`, `exomux:memory`,
  `exomux:check` and `exomux:test` tasks delegate to it, and `exomux:compile` is new.
- `KeyPressEvent`, `MousePressEvent`, `MouseScrollEvent` and the rest of `src/input_reader/types.ts` are exported from
  the default entrypoint, and `decodeTerminalColor`/`encodeTerminalIndexedColor`/`encodeTerminalRgbColor` from
  `./terminal`. Nothing could write a key or mouse handler without naming the event shapes, but they had been reachable
  only by deep-importing an internal module; extracting Exomux surfaced them as the last things it could not express
  against the public API.
- The repository now commits a `deno.lock`. Every remote dependency — 10 JSR packages, 37 npm packages, and the
  `deno.land/x/crayon` modules — is integrity-checked instead of being re-resolved unpinned on each build. The optional
  PTY adapter moved from an inline `jsr:@sigma/pty-ffi@0.42.0` dynamic-import specifier to a `@sigma/pty-ffi` import-map
  entry so its version is pinned in one place.
- `deno lint` now excludes `docs`. Generated bundles under `docs/assets` were producing 4,187 of 4,276 diagnostics,
  which buried the 89 real findings in first-party code; those 89 are now fixed and the lint run is clean.
- Removed the stray `package.json` and `package-lock.json`. They declared an unrelated `@openai/codex` dependency, were
  ignored under `nodeModulesDir: "none"`, and caused `deno install` to seed `deno.lock` from npm metadata.
- Exomux's circuit gates are now a uniform 8x5 package rather than squares of varying size, so more of them fit and the
  board reads as one part family. Clicking a gate traces its whole net out in the highlight colour — every wire into it,
  its output wires, and both supply runs — and clicking it again, or clicking bare board, releases it. Cells where a net
  forks are drawn as a junction dot, so a branch reads as a connection rather than two wires that happen to cross.
- Exomux's circuit background now reads as a directed schematic: every gate takes its inputs on its left edge and drives
  its single output pin off its right edge, and wires are pinned through stubs so they leave a driver and reach a
  consumer heading east. VCC takes the top-left corner and GND the bottom-right, with a CLK generator in each of the
  other two corners and a third in the middle of a board large enough to warrant it; a source parked in a right-hand
  corner feeds west, and any source a window covers slides aside and returns to its corner when the window moves on.
- Exomux's circuit background drives an eight-lamp indicator array across the top of the desktop. Each lamp is a
  complete circuit — a feed from a gate's output into its anode on the left, and a return out of its cathode back to the
  GND rail — and lights only when both halves are physically routed, so a lamp a window has cut off goes dark instead of
  glowing on nothing. Lamps prefer a distinct gate each, and every gate's output now reaches a gate or a lamp, so no
  node is left with a dangling output.
- Exomux's circuit background now separates supply from signal. Both rails run to every gate on their own traces,
  reaching its VCC pin on the top edge and its GND pin on the bottom, and a gate counts as powered only because those
  runs exist — never because a logic path happens to pass through a rail. Each run is laid in the direction its current
  actually flows, down from VCC into the gate and out of the gate away to GND, so nothing ever reads as streaming out of
  ground; a gate's VCC run carries current while its output is high and its GND run while the output is low. The CLK
  nodes are signal generators and no longer stand in for a rail connection, and gate inputs carry signals only, so every
  gate's cone traces back to a generator.
- Exomux's circuit background now grows to cover the desktop instead of bunching into one corner: the gate ceiling
  scales with the board area, growth runs faster while the board is bare and settles as it fills, a new gate is seated
  just downstream of the gate it extends, and a gate that cannot fit there goes to the emptiest part of the board. Each
  rail hands its runs out across several terminals around its label rather than one cell, so VCC and GND read as wired
  into the circuit. Re-routing now coalesces while a window is still being dragged, which more than pays for the denser
  board.
- Exomux's circuit background now evolves instead of re-wiring itself. The board opens as a small circuit that is
  already valid — every gate supplied by both rails, driven by a signal, and read by something — and grows one gate at a
  time, either appended to an existing output or spliced into an existing wire; both moves preserve the invariant and
  keep the netlist acyclic. A repair pass runs only when a window despawns or relocates a gate.
- The Exomux showcase prefix key moved from tmux-conflicting Ctrl-B to Ctrl-N; double Ctrl-N forwards a literal Ctrl-N
  byte to the focused terminal.
- The Exomux network panel browses hosts and tailnet machines through the shared workbench `TreeController` hierarchy,
  and freshly spawned floating terminals open centered and focused above the panel.
- Text-row components now allocate and retire visible rows as their terminal height changes, including styled ANSI rows.
- Tightened the contributor API inventory gate to require duplicate-free public exports and 100% JSDoc coverage.
- Made every published entrypoint pass JSR fast-type and declaration-output validation without `--allow-slow-types`.
- Expanded the normalized layout capability inventory from 46 to 48 public fields while preserving legacy numeric
  spacing APIs and making solver-specific limitations inspectable.
- Mouse interaction targets can resolve z-order lazily, and app-level mouse dispatch now preserves source order across
  asynchronous capture handlers while dropping disabled or removed captured gestures without retargeting releases.

### Fixed

- The Exomux background-config **preset picker** now scrolls with the **mouse wheel**. The modal swallowed every wheel
  event, so its composited preset List could not be scrolled at all. The wheel over the list pane now scrolls the
  viewport in place (via the List's `scrollTop`) without moving the selection — arrow keys and clicks still move the
  selection and re-couple the viewport to it. Hit-testing and the hand-drawn fallback follow the same scrolled window,
  so clicks land on the row shown.
- Many more Exomux **butterchurn** presets now render on the GPU instead of strobing past as black. Measuring both
  renderers head-to-head with identical parameters (`scripts/diag_butterchurn_gap.ts`) corrected the earlier belief that
  the GPU drew far fewer presets than the CPU — an artifact of comparing two differently-thresholded audits. The real
  gap was 69 presets that render on the CPU but went black on the GPU, and it had two systematic causes, now fixed: (1)
  presets whose basic-waveform colour is dim or near-black rendered faithfully faint on the GPU while the CPU spends a
  fixed ink budget on them — `floorWaveColor` lifts a dim wave colour to a minimum peak (hue preserved), so the wave
  reads; (2) the GPU renders several times larger than the cell grid and box-filters back down, which averaged a
  one-pixel waveform away entirely — the basic waveform now draws as a ~1.5-cell-tall ribbon (`WAVE_RIBBON_CELLS`) that
  survives the resolve, exactly as the cell-native CPU deposit does. Together these rescued ~31 presets (the gap fell 69
  → 46). The auto-cycle rotation's keep threshold was also realigned from a self-imposed 3% down to just above the
  runtime dead-skip (1%), since a preset that renders above the floor the runtime uses to skip strobes is one auto-cycle
  should visit. Net: the GPU field now auto-cycles **369 of 472** presets (up from 306, and now more than the CPU
  field's 365), regenerated by `scripts/audit_butterchurn_gpu.ts`; every preset stays reachable by index. A residual ~28
  shader-heavy presets still resolve to black on the GPU (their look is built from ink the GPU only seeds from
  feedback); these stay out of auto-cycle and are characterised in `plan/todo/033-butterchurn-gpu-fidelity.md`.
- A handful of Exomux butterchurn presets failed to compile their shader and rendered black on strict WebGPU drivers
  (naga): the vendored preset WGSL sometimes divides by a literal zero (an accidental `x/0` from the source MilkDrop),
  which const-folds to `inf`/`nan` and fails the whole module. `sanitizeShaderBody` nudges a literal-zero divisor to a
  tiny epsilon so the value stays finite and the preset draws (confirmed: "suksma - coal drapes…" went from a compile
  error to a full render). Legitimate small divisors (`0.5`, `0.03`, `0.0001`) are left untouched.
- The Exomux GPU butterchurn background rendered every preset black on stricter WebGPU drivers (an Intel/Mesa laptop,
  where a software driver was fine), so the dead-preset watchdog skipped through the whole catalog about once a second.
  The waveform pass bound an **empty bind group at index 0** of a pipeline that declares no bindings (its shader reads
  only vertex attributes); a lenient driver ignores it, but a strict one rejects "group index 0", poisons the command
  buffer, and the frame renders nothing. The pass now binds no group, as it should. The debug build also logs the exact
  `createBindGroup` validation reason (via a validation error scope) so the next such driver quirk is one capture away.
- Scrolling an Exomux picker (the theme/background lists in Settings) no longer leaves a **duplicated row**. The
  off-screen surface those lists composite through renders incrementally, and the incremental renderer could skip a cell
  when a List's selection highlight — a higher-zIndex overlay — moved or hid in the same pass the rows scrolled, leaving
  the overlapped-but-changed row showing its previous item. The surface now forces a clean full redraw per snapshot
  (`Canvas.rerenderAll()`, factored out of the resize path) so a composited frame is always exact.
- The Exomux pincushion CRT shader gained an overscan zoom (`/ (1 + magnitude)`) so the midpoint of each screen edge is
  tangent with the window instead of sitting inside a thick margin; only the corners keep the unavoidable gap. And when
  the pincushion is on under Ghostty, the mouse is now mapped through the exact same distortion
  (`exomuxPincushionSource`) before hit-testing, so the block cursor — and clicks, drags, and scroll — land under the OS
  pointer instead of drifting outward in the distorted regions. The block cursor also blinks at 2 Hz, and turns into a
  resize/move glyph (`↔ ↕ ⤢ ⤡ ✥`) when it is over a floating window's draggable border.
- The Exomux block cursor no longer freezes in place while a modal or the start menu is open: the full-screen modal
  catcher used to swallow the hover-motion that moves the cursor, so it kept tracking only on the bare desktop. It now
  updates the cursor (and warps modal clicks through the pincushion the same way) while a modal is up, and drops the
  resize glyph for a plain block there since the windows underneath can't be dragged. `F1` now opens (and closes) the
  modal key reference from anywhere, instead of being sent to the focused terminal as an escape sequence.
- Exomux no longer writes stray `config-file` includes into the user's global Ghostty config from sandboxed runs. It
  only manages `~/.config/ghostty/config` when running against the real config directory; a run with an explicit
  `--config-dir` (the launch-lifecycle tests do this) writes nothing there. Previously, because Ghostty being merely
  _installed_ enabled the shader/cursor-config wiring, each such run appended a `config-file` include pointing at a temp
  dir, which then broke Ghostty on its next launch (`error opening config-file …/shaders/cursor.conf: FileNotFound`)
  once the temp dir was cleaned up.
- In the Exomux settings window the wheel now scrolls the theme/background list **under the pointer** by its viewport,
  and never changes a selection. Previously a wheel notch anywhere in the window cycled the _active_ pane's selection,
  so scrolling over the background list changed the theme. Settings scroll is routed by pointer position
  (`scrollSettingsListAt`), the pickers scroll their viewport instead of cycling, and the wheel over the options/chrome
  is consumed rather than cycling a value.
- The `List` wheel now scrolls the viewport through the items **without changing the selection**, so a long list can be
  browsed while a selection is kept; an arrow key re-anchors the viewport on the selection, and the selected-row
  highlight hides while it is scrolled out of view. `ListController` gains a `scrollTop` signal (`-1` follows the
  selection, as before) and `windowStart(height)`; `handleScroll(scroll, height)` now moves that viewport rather than
  the selection (it returns `void`), and `visibleListRows`/`visibleListRowsInto` take an optional `windowStart`. Compact
  selectors that want the old cycle-on-wheel keep it by calling `controller.move()` (as the Exomux theme/background
  pickers now do).
- The mouse wheel routes to whatever scrollable control sits **under the pointer**, not only the focused one — a
  component now receives `mouseScroll` when the pointer is within its bounds (the focused control still gets it as a
  fallback), so hovering a list and scrolling works like a desktop.
- The Three ASCII renderer no longer goes offline ("ASCII RENDERER OFFLINE — data must be an ArrayBuffer or an
  ArrayBufferView") the moment its scene resizes — e.g. when a control is focused or a window maximized. The WebGPU
  compatibility shim's `mappedAtCreation` `unmap` uploaded the shadow buffer as a bare `ArrayBuffer`, which some
  fallback/compat adapters reject in `writeBuffer`; it now uploads a `Uint8Array` view (also harmless if the buffer was
  detached). New mappedAtCreation buffers are created on resize, so the throw only appeared once the render grid changed
  size.
- Clicking a settings `< value >` control now respects which arrow was pressed: the left half (`<`) steps the value back
  and the right half (`>`) steps it forward. Every option click stepped forward before, so the `<` was decoration. Both
  the main settings window and the background-config modal route the click through a shared
  `exomuxOptionCycleDirection(rowRect, column)` that splits the right-aligned control at its midpoint.
- Exomux no longer strands remembered floating windows offscreen when it launches or is resized into a different-sized
  terminal. Floating windows are now refit to the current view at launch (not only on a later resize): a window too big
  for the view, or with most of its body off it, is shrunk to fit and re-centered — cascaded so several never land on
  one another — while a window only slightly off is nudged just far enough to sit fully on screen.
  `reflowFloatingWindows` gained the center/cascade/nudge policy and mount now runs an initial fit.
- Exomux window titlebar buttons (minimize/maximize/close) work again while the block mouse cursor is on. Its any-motion
  tracking (mode 1003) streams pure hover motion — a drag with no held button, which button-event tracking never emitted
  — and `routeWindowPointer` fed those into the window-host interaction router, leaving a phantom interaction "active"
  so the next real click was swallowed by the gesture instead of running the button. Bare hover motion is now
  short-circuited (it only updates the cursor position and forwards to a captured terminal); held-button drags still
  move and resize windows, and clicks still activate controls.
- The Exomux animated background no longer freezes solid while you type. It is deliberately held behind explicit input
  (so keystrokes never wait on a background frame), but the recency check never cleared under a held key or a streaming
  paste, so a lively 60 Hz field — butterchurn especially — stopped dead for as long as the input kept coming and only
  "came through" in the gaps. A stall cap (`EXOMUX_MAX_BACKGROUND_STALL_MS`) now advances the sim anyway once it has
  been frozen past ~200 ms, so sustained typing slows the background to a few fps instead of pausing it, and it snaps
  back to full rate the moment you stop. `exomuxMetaballsMayAdvance` takes the time-since-last-advance as a fourth
  argument.
- Exomux list windows (the settings pickers, the sessions manager, and the network tree) move one row per wheel notch
  again. A single physical notch fans out into several scroll events — the input reader emits a `mouseScroll` and the
  app layer a derived `pointerInput` wheel for the same motion, and high-resolution wheels emit several per notch — so a
  notch jumped many rows at once. Those windows now collapse a tight same-direction burst into a single move; terminal
  scrollback is unaffected and still honors the scroll-speed setting.
- The Exomux metaball background is a smooth gradient again, not scanline stripes. Each blob shades from its centre to
  its edge between the two most vivid, highest-contrast colours in the active theme — anchored on the most-saturated hue
  and partnered with the colour furthest from it in hue weighted by its own saturation, so a theme like `t2` renders
  pink and blue blobs rather than muted surface tones — and the alternate-row quantization that produced horizontal
  banding is gone.
- Transparent windows show the background flowing behind them over fluid fields like turbulence, instead of reading as
  opaque. A fluid field treated every window rectangle as a solid obstacle, so there was no flow behind a window and its
  translucent cells blended against a flat void that, in most themes, is nearly the window surface — so it looked opaque
  however low the opacity was set. Transparent windows are no longer field obstacles; only opaque ones are.
- The Exomux client no longer exits the instant it attaches. The new `-h`/`--help` and launch-failure handling wrapped
  the entrypoint in `Deno.exit(await runExomuxCli(...))`, but the interactive client returns as soon as its render loop
  is started and stays alive only through its own event listeners — so the forced exit killed the workbench the moment
  it attached to a session, which looked like being unable to attach at all. The entrypoint now force-exits only on a
  nonzero result; a successful launch settles naturally and keeps running. A PTY-driven regression asserts an attached
  client is still alive seconds later.
- Transparent windows now show the desktop through them on the default background. The default is the metaball field,
  which paints solid cells rather than a glyph grid, so it supplied no backdrop and a translucent window collapsed to a
  flat theme colour. The metaball levels now feed the same backdrop the animated fields do, so what shows through a
  window is exactly the glow it sits on.
- The image (and any static) background no longer freezes the menu and window buttons. The retained desktop only
  repainted when the background animation ticked, and several interaction states — the start menu, the settings window,
  the quit and paste modals, the window-config selection, the network selection — were not among its render
  dependencies, so once a static picture stopped animating those clicks produced no visible change. Every input-driven
  view state now invalidates the desktop directly, independent of the background.
- A flooding child can no longer wedge the Exomux daemon (plan/todo 028). A paused terminal game rendering full-screen
  TV static at 2–4 MiB/s used to overflow the per-client outbound queue — executing even a fast client as `slow-client`
  — and then pin the daemon at 100% CPU with unbounded memory growth once nobody was attached, leaving it too saturated
  to answer the next launch. Ingestion now applies flow control: a session whose every attached client sits above the
  outbound high-water mark waits for one of them to drain (fully stalled clients stop gating after a bounded wait and
  meet the existing 1013 quota), an unattached session is held to a small drain budget (`unattachedBytesPerSecond`,
  default 256 KiB/s) since it only feeds the replay ring, large backend batches yield to the event loop periodically so
  delivery and handshakes keep running, and every deferral aborts promptly when the session is killed. Validated against
  the real game: the attached client survives the full flood, unattached daemon CPU drops from 100%+ to under a third of
  a core, reconnect answers in milliseconds, and the flooding session still kills cleanly. Residual: the Sigma PTY FFI
  layer buffers internally, so a truly abandoned flood still grows daemon memory slowly until upstream grows a way to
  pause its pump.

- A crash could permanently block Exomux from launching. Bootstrap probed the recorded host pid only for existence, so
  after a hard crash — where the pid was recycled by an unrelated process, or the daemon survived wedged — every launch
  threw `The recorded Exomux host still appears alive but did not respond; its descriptor was retained` forever. The
  probe now reads the process's argv: a pid that is dead or no longer an Exomux daemon has its descriptor removed and a
  fresh host launches; a pid that still looks like a daemon but never answers has its descriptor quarantined beside the
  live path (`host.json.unresponsive`, keeping the pid and token for manual inspection) before a replacement host
  launches with a fresh startup window. The status line reports either recovery. The daemon itself now also treats
  uncaught errors and unhandled rejections as fatal: it shuts down within a bounded window, clears its descriptor, and
  force-exits if teardown wedges, so a faulting host can no longer linger half-alive.

- The butterchurn background stalled the desktop on preset transitions. Two costs landed on the frame of the switch:
  `createRenderPipeline` is synchronous and compiles a shader, which for a MilkDrop composite shader can block for
  hundreds of milliseconds, and compiling the incoming preset's equations costs up to 45 ms on its own. Pipelines now
  build through `createRenderPipelineAsync` while the software renderer carries the frame, and both the shaders and the
  equations of the next preset are prepared three seconds before its slot begins. Measured over 900 frames, no frame
  except the first exceeds the 125 ms tick, and the worst preset-change frame fell from 45 ms to 9 ms.

- The butterchurn background could sit on a black desktop. It handed the frame to the GPU as soon as a device was ready,
  before any GPU frame had been read back, so everything the software renderer had drawn stopped updating at that moment
  — leaving nothing painted for as long as the device took to answer, and indefinitely if it never did. The software
  renderer now keeps drawing until the GPU has produced a frame. A preset that renders nothing is also skipped after one
  second rather than two, since a run of consecutive dark presets multiplies that wait.

- The butterchurn background was permanently stuck on its software renderer whenever the background key was used to
  reach it. Deno allows one WebGPU device per process — a second `requestDevice` throws "Not enough memory left"
  whatever the GPU has spare — and the turbulence background requested its own and never released it. Turbulence sits
  immediately before butterchurn in the cycle order, so cycling to butterchurn always went through it first, leaving
  butterchurn without a device for the rest of the session. Both now share one device through
  `packages/exomux/gpu_device.ts`, which is how WebGPU is meant to be used regardless.

- Clicking a window's title bar, border or title-bar buttons stopped working while the butterchurn background was
  selected, taking window dragging, resizing and closing with it. The desktop offers a background first refusal on
  clicks and only withholds those landing on a window's _client area_, so a field is responsible for not claiming window
  chrome; butterchurn's skip-preset click claimed everything. It now checks the window rects it already receives each
  frame and claims only genuinely bare desktop.

- The butterchurn background froze after a few minutes on the GPU path. Its render graph created a texture view and a
  bind group for every resource it touched on every frame — roughly thirty-five GPU objects at 8 Hz — and those are only
  released on garbage collection. The driver's object budget ran out, after which every allocation failed, readback
  stopped, and the desktop sat on whatever frame it had last resolved. Because the budget is device-wide, it also left
  the GPU unusable for other processes on the machine until the client was restarted. Views and bind groups are cached
  now, and the per-frame vertex staging arrays are reused rather than reallocated; a steady frame allocates nothing.
- A GPU that stops delivering frames now falls back to the software renderer instead of leaving a still image on the
  desktop, and a lost device is detected rather than retried forever.
- A preset that renders nothing is skipped after two seconds rather than holding its fifteen-second slot. The rotation
  is selected against the GPU renderer, so on the software fallback a fair number of its presets resolve to an empty
  field, which was indistinguishable from a frozen desktop.

- Exomux's desktop repaint no longer saturates the render loop, which was making every animated background stutter —
  advancing, stalling, advancing — a few times a second, and worsening the longer a session ran as overgrowth and
  accumulated effects added painted cells. Measured on a 200x50 desktop, one full repaint cost 33ms on average (73ms at
  the tail); it now costs 7.7ms. Three things dominated, all of them per painted cell: the style cache lived on the
  painter, which is rebuilt every frame, so `createAnsiStyle` re-ran for every colour on every frame and its key
  allocated three throwaway strings; `exomuxGlyphColumns` measured the width of every non-ASCII glyph on every cell, and
  backgrounds are made entirely of non-ASCII glyphs; and `fill` resolved the style and glyph width separately for each
  cell it covered, including the full-desktop body fill. The style cache is now shared across frames and keyed by a
  packed integer, glyph widths are memoized, and a single-column `fill` resolves its painted string once for the whole
  rectangle.

- A compiled Exomux binary can start its own detached host. The launcher always built `deno run -A <main.ts> --daemon`
  and ran it through `Deno.execPath()`, but in a standalone binary `execPath()` is Exomux itself — it parses only
  Exomux's own flags and rejected the leading `run` with `Unknown Exomux option: run`, while `import.meta.url` resolved
  inside the virtual compile root to a path with no file behind it. Standalone builds now re-exec themselves with just
  the daemon flags, via the exported `exomuxDaemonLaunchArgs`.
- The Exomux host no longer hides a failed PTY. The optional PTY adapter loads a native library on first use, so it can
  fail for environmental reasons — no `--allow-ffi`, an offline or proxied machine, an unsupported platform — and the
  fallback to pipes was reached through an empty `catch`, leaving no way to tell a pipe-backed host from a real one. The
  selection is now reported by `ExomuxHostController.inspect().backend` with the rejection reason, and the host resolves
  it at startup instead of on the first spawn so a degraded host is observable before a terminal is opened.
- Exomux's circuit wires are drawn on large desktops again. The route search gave up after a fixed number of cells,
  which is fewer than a full-screen desktop holds, so it abandoned routes it could have found and the wire was never
  drawn — gates appeared with no inputs. The search visits each cell at most once, so it is now bounded by the board's
  own size, which both finds every route and lets a genuinely blocked one still fail in a single sweep. The pass that
  guarantees every gate output reaches a gate or a lamp may now use a gate's fourth and fifth input pins, or hand over a
  lamp whose signal is already visible elsewhere, so no output is left dangling on a board full of gates.
- Double-width glyphs keep their two columns paired. The screen model marks the column a wide glyph also occupies, and
  breaking either half — writing over one of them, deleting or inserting a character through the pair, erasing part of
  it, or narrowing the screen across it — now erases both, as a real terminal does. Exomux's renderer follows that mark
  instead of re-deriving the pairing by measuring the glyph, so a character written into the second column of a wide
  glyph is drawn rather than mistaken for its continuation and skipped.
- A bare line feed is an index again — down one row, same column — rather than a newline. Full-screen applications run
  the tty raw, so no ONLCR rewrites their output, and ncurses and tmux move down a row with terminfo `cud1`, a bare LF,
  expecting to keep the column. Treating it as a newline dragged every such move to column 0, which corrupted the left
  edge of a scrolling tmux pane exactly where it was drawing. VT and FF now index as well, ANSI mode 20 (LNM) restores
  the newline behaviour when an application asks for it, and the non-PTY process backend supplies the ONLCR its pipe has
  no tty to provide.
- The terminal screen model now consumes ECMA-35 charset designations (`ESC ( B`, `ESC ) 0`), keypad mode selects, and
  SO/SI shifts, rendering DEC Special Graphics as box-drawing glyphs; curses apps such as nano no longer leak `(B`-style
  artifacts or draw ACS borders as letters, including across chunk-split writes.
- The input reader no longer decodes SGR or legacy X10 horizontal-wheel codes as vertical scrolls, and legacy X10
  wheel-up bytes now decode as scroll events instead of drags.
- Exomux wheel input over an alternate-screen child without mouse tracking now sends cursor-key fallback bytes to the
  child instead of trapping the window in workbench copy mode, so full-screen apps scroll naturally.
- Three ASCII now verifies mapped GPU readback before selecting an adapter and falls back to a compatible software
  adapter when the primary device cannot support terminal readback.
- Three ASCII canvas objects keep their startup or last complete grid visible while deferred readback warms, including
  across terminal resizes.
- Screenshot generation serializes GPU access and rejects startup, fallback, sparse, or unavailable renderer captures;
  the Neon Exodus capture now exercises a maximized Three scene.
- Three ASCII block-glyph rendering preserves the renderer's mapped per-cell colors instead of collapsing scenes toward
  a nearly white foreground, in both terminal and browser workbench paths.
- Kept advanced-window host focus, responsive component focus, chrome clicks, shelf restore, task switching, and route
  changes synchronized without registering hidden surfaces; task switching also excludes responsively hidden tiled
  windows and safely rebases when the viewport changes while the switcher is open.
- Prevented focus-navigation Tab events from leaking into the newly focused input and prevented provisional window
  drag/resize frames from crossing Showcase persistence commit boundaries.
- Hardened the new history, journal, pointer, scheduler, task-group, secret, and window-history contracts against late
  async work, counter exhaustion, hostile arrays/thenables, false cancellation, reentrant cleanup, and inexact overlay
  restoration.
- Hardened input reconciliation, deadline trees, async-channel waiter cleanup, and permission parsing against hostile
  provenance, forged synthetic envelopes, deep cancellation, reentrant abort signals, proxy length races, and oversized
  JSON before parsing.
- Hardened Unicode packs, resource caches, async-iterable operators, and negotiated remote terminals against hostile
  reflection, reentrant disposal, late async completion, forged protocol results, unbounded inputs, and cleanup races.
- Hardened grapheme editing, temporal cache timers, nested forms, and typed routing against quadratic scans, oversized
  aggregate data, reentrant callbacks, raw descriptor/proxy escapes, aliasing, partial commits, forged signals,
  unbounded diagnostics, no-op emissions, and stale or uncancellable host work.
