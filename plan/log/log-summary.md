# Project log — summary

The narrative history. Read this to see where things stand; `log-detail.md` has the decisions, dead ends, and repro
details behind it. Newest first.

## August 21 2026 — the desktop learns phones, and grows a start menu

Two asks in one breath — "make it responsive for mobile, add a start menu" — that turn out to be one design. The host's
compact-auto watches the tiled workspace's minimums, which an all-floating desktop never trips, so the phone answer is
exomux's, imported wholesale: below 72×20, presenting a window maximizes it, exactly one full-screen window owns the
body (the host hides the floating peers from the projection on its own), and the start menu is the app switcher. Resizes
refit in both directions — into phone size the active window takes the screen; out of it the maximized window restores
and the host's `recover-all` pulls off-screen floating windows back into reach. Verified headless by driving the real
host at 43×45 and back to 60×24, since a phone cannot be attached to a test.

The launcher grew into the start menu that makes that switching legible: a header, per-demo glyphs, a separator before
the outward links, summaries only when there is room, full-width on phones. One layout function feeds the painter and
the pointer router — the exomux lesson about clicks landing on the pixels they were aimed at, applied on the first day
rather than retrofitted. Mouse hover moves the selection; touch never needs it, because activation only happens on a
down. The landing bundle is 685 KB, still under its 780 KB ceiling.

## August 21 2026 — three more windows: the catalog, the clock, and three ascii

"Add some demos!" Three, each exercising a different seam. The **visualization catalog** walks every renderer in the
registry over four live sample streams (one per data rank, labelled as harmonics, the terminal preview's stance), which
makes it the first consumer to drive `drawStream` across the whole catalog at arbitrary window sizes. The **clock** is
eight lines of honest data — the wall clock through `dial`. And **three ascii** is the one the plan called real work:
the WebGPU pipeline stays out of the landing bundle behind a variable-specifier dynamic import (`desktop-three.js`, 140
KB, `three` external), and the `ThreeAsciiObject` draws on the shared canvas only while its window is topmost, the
launcher closed, and nothing could legitimately cover it — placeholder text otherwise. Scene switching swaps retained
geometry in place, as the standalone page does. The landing bundle grew 3 KB.

## August 21 2026 — the desktop becomes the docs landing page

The maintainer asked for an exomux-like windowing demo as the default docs target, with the demos launchable inside it.
The pieces were already on the shelf, which was the point of the parity work: `WorkbenchWindowHost` is library code and
web-clean, the web host already delivers pointer and keyboard events in cell coordinates, and every demo touched
recently had grown an honest render seam. `examples/web/desktop_page.ts` is the assembly: the host owns focus, dragging,
snapping, minimize/maximize, the shelf and double-click-maximize — `handlePointer` took the browser's pointer events
without adaptation — while the page owns a cell-grid painter (wallpaper, title bars, controls, shelf, launcher) and a
demo adapter contract of one `render(width, height)` plus optional key and pointer handlers.

Four windows: a welcome note, the browser monitor (extracted to `browser_monitor.ts`, shared verbatim with the
standalone page), the neon suite (ANSI lines through a small SGR parser, `ansi_cells.ts`, tested headless), and a
GRWizard theme gallery. The API workbench kept its whole page — embedding it in a window is real work, so the launcher
links out to `docs/workbench.html` instead of pretending. `docs/index.html` is now the desktop; the e2e gate grew
budgets for both artifacts (desktop 680 KB against a 780 KB ceiling) and the probe gate holds the desktop to the same
seventeen guarded references as the web root. The neon suite's `PanelRender.body` and the monitor's `composeScreen` both
blit into a window's client rect unchanged — the "render into a rect" discipline paying out exactly as promised.

## August 21 2026 — web parity: the surface, the ratchet, and a browser monitor

"Work on web parity" turned out to mean three things. First the export gap: `mod.web.ts` lacked twenty-nine modules the
terminal root exports that are pure computation — the theme family, keymaps, i18n, permissions, surface animation, the
perf family, and the last three canvas modules. All are web-clean by evidence, not assertion: an esbuild browser probe
of the grown root produced exactly the same seventeen guarded `Deno.*` references as before the change.

Second, the ratchet. Those seventeen are now a pinned allowlist in `scripts/build_web_docs.ts`, which probe-bundles
`mod.web.ts`, both viz entrypoints and the new browser page on every docs build — the viz surfaces at zero references. A
terminal-bound export reaching the web root now fails the `web-pages-build` gate instead of a user's page. The workbench
bundle grew from 568 KB to 829 KB when the exports landed, because only `unicode/width.ts` was marked side-effect-free;
marking the added pure modules (and the i18n/perf directories) tree-shake-safe brought it to 567 KB — under budget and
smaller than before.

Third, the proof by application: `examples/web/exomonitor_page.ts` runs the terminal monitor's own compose, feeds and
tiles in a browser tab, fed by what a browser can honestly measure — the microphone through an AnalyserNode (behind the
gesture browsers require; the tiles wait until granted, as they do on a machine with no GPU) and the JS heap where the
browser reports one. One import fix fell out: the showcase's `theme.ts` reached through the terminal root `mod.ts` for
one palette table, dragging `node:async_hooks` into every consumer; it imports the module itself now.

## August 21 2026 — release 0.5.0

Everything since 0.4.0 in one cut: the kitty graphics passthrough (relay, string sequences, APC boundary, host probe,
XTWINOPS answers), the Three.js scenes as `@ubernaut/exotui/viz/three`, the lock-up fix with its restored per-entry
cost, the microphone source, two themes, and the kill confirmation as the first overlay-turned-window. Version bumped in
`deno.jsonc`, changelog written, `v0.5.0` tagged — CI publishes to JSR on the version move and builds the exomux
binaries on the tag.

## August 21 2026 — the kill confirmation becomes a window

First step of the agreed overlays-as-windows refactor. The kill confirmation was the simplest overlay — one question,
two buttons — so it went first: `EXOMUX_KILL_WINDOW_ID` is now a registry window born `closed` (a state that never
appears in the shelf), presented by the pending-kill signal and closed by its clearing. A projection watcher covers the
third path: a kill window that vanishes while the question is pending — the chrome [x], anything — is a cancel, because
a confirmation nobody saw must never default to killing. Painting goes through the ordinary window dispatcher
(`paintKillWindow` fills the client area; the host draws the chrome), which means stacking, dragging and kitty-graphics
occlusion all come from the window host with no overlay footprint and no transient surface registration.

Input capture stays modal for this step — `modalOpen()` checks the pending-kill signal explicitly while
`exomuxDesktopOverlayOpen` (the graphics predicate) drops it — and the pointer router now derives the button rects from
the projected `clientRect` through the same `exomuxKillWindowButtons` the painter uses, so a click always lands on the
pixels it was aimed at. The bounds-derived `exomuxKillLayout` is gone. One incidental find: `reflowFloatingWindows`
"rescued" the closed kill window on every resize — it now skips every non-`normal` window, which is what closed always
should have meant. The quit modal is the next candidate; the modal input capture relaxes once a general
focused-modal-window grammar exists.

## August 20 2026 — kitty graphics passthrough, first pass

exomux sits between applications that draw images and a host terminal — Ghostty — that can show them. Swallowing the
sequences was honest; relaying them is better, and the maintainer asked for it directly. The design splits along the
same line as everything else here: a pure relay (`src/runtime/kitty_passthrough.ts`) that rewrites sequences and returns
actions, and a thin flush loop in the exomux client that owns visibility, translation and stdout.

The relay's rules are each a test: ids are remapped through per-session blocks so two children calling their image `i=1`
cannot collide at the host; a display command carries the cursor cell it was issued at, a bare transmit does not;
continuation chunks of a chained transmission are relayed untouched and position-free; responses are quieted (`q=2`)
unless the child asked, so a host OK per frame does not land with nobody waiting; delete-all from a child expands to
per-id deletes of that child's images only; and `release()` produces the deletes for everything live, because an image
the compositor cannot account for must not stay on screen.

Queries round-trip. The child's probe is remapped out; Ghostty's reply arrives on the client's stdin as an APC — which
the input reader used to split at the interior ESC of its own terminator and decode as an alt-chord. APC is now one
input boundary and a `terminalApc` event; the controller routes the reply to the relay that claims it and writes it to
that child's pty with the id translated back. This is what makes an application that _probes_ — terminal-browser does —
conclude honestly that graphics work, while the sanitised environment keeps applications that merely sniff env deciding
text. The input envelope refuses APC by design: a terminal reply is not semantic input, and schema v1 says so now.

Policy, deliberately narrow: only the active terminal window's graphics reach the host; a window that stops being active
or stops existing has everything it displayed deleted; inactive windows' streams are drained and dropped, since a
frame-streaming app repaints and a megabyte backlog helps nobody. The client decides whether any of this is on from its
own environment — it is the process that genuinely sits inside the host — via `detectKittyGraphicsCapability`, which now
recognises Ghostty.

Not yet seen on a real terminal, which is the check that matters and is the maintainer's to make: tode inside exomux
inside Ghostty, images landing where the window says. Known limits, recorded: no clipping (an image can overhang a small
window), z-order is the host's image plane rather than exomux's window order, and only the active window relays.

## August 20 2026 — a wall of base64, and the two lies behind it

The maintainer ran tode — a VS Code fork that draws in the terminal — inside exomux, and got a full screen of base64.
The payload was a kitty graphics transmission: tode checks `GHOSTTY_RESOURCES_DIR` and friends to decide whether its
terminal draws images, exomux's PTY children inherit the daemon's environment, and the daemon runs under Ghostty. So
tode was told, in effect, "you are talking to Ghostty" — and exomux's screen model then failed the other half of the
contract, because `parseTerminalControlSequence` knew OSC, CSI and ESC but not APC, and printed the entire
`ESC _ G …
ESC \` transmission as text.

Two fixes, one per lie. The emulator now parses DCS/APC/PM/SOS as string sequences terminated by ST only — BEL is an
OSC-only concession — pending across arbitrary chunk boundaries, with a discard-until-ST mode when a payload outgrows
the 64 KB pending cap, because a single kitty transmit can run to megabytes and dropping the buffer used to mean
printing whatever half arrived next. And the daemon now materialises a full, sanitised environment for every PTY child:
host-terminal identity variables stripped, `TERM=xterm-256color`, `TERM_PROGRAM=exomux`, `COLORTERM=truecolor`, the
spawn request's own env winning over everything. One of the tests runs tode's actual detection predicate against the
sanitised environment and asserts it concludes text-only.

What remains for real support is recorded in the priority queue: the emulator answers no queries (tode's OSC 10/11/4
colour probes fall back gracefully; DSR and DA are simply unanswered), and nothing yet decodes or passes through the
graphics themselves. Those are design tasks — the reply channel has to live daemon-side, and passthrough has to
translate placements — not patches.

## August 19 2026 — the Three.js visualisations, first pass

`@ubernaut/exotui/viz/three` exists: an optional entrypoint like the layout solvers, because the core has no runtime
dependencies and `./viz` keeps that promise. Its projected charts are arithmetic and draw anywhere; this is the other
path, retained geometry through the ASCII pipeline, which costs `three` and buys shading and depth a wireframe cannot
reach.

A scene is deliberately not a `Visualization`. That contract is `render(data) => frame` — synchronous cells — and a
scene is retained geometry rendered on its own schedule. Pretending otherwise would put a GPU pass inside a call meant
to be pure arithmetic. So the shape is build once, update when the data changes, dispose when the tile goes. Everything
else is the same vocabulary: a `DataScene` declares `minimum`, `perEntry`, `weight` and `suits`, and `fitDataScenes`
ranks through the same `scoreFit`, so the two registries are on one scale and a caller can concatenate them.

Three scenes, and the same finding as the flat ones: the demos are not data-driven. The map slab's height field is
`sin(x) * cos(y)` and the rest turn on a pointer signal. What carried over is the form. `three-surface` is a matrix as a
height field, `three-lattice` a volume as a cloud of points that skips empty cells rather than drawing them faintly,
`three-rings` a matrix as a stack of closed loops. Geometry is rebuilt only when the data changes shape, because a
monitor pushes a new reading of the same size sixty times a second.

Tested without a renderer, which is the part worth testing: a flat field is flat, a peak stands above the plain, an
empty volume draws nothing, and a differently shaped reading rebuilds rather than writing past the end.

First pass, and it looks like one: nothing has been seen through the ASCII renderer at a terminal yet, the hex shell and
capture cage have no data reading yet, and no application uses any of it.

## August 19 2026 — exomonitor becomes the worked example (0.4.0)

It moved into `examples/showcases/exomonitor/` beside Inkstone, Orbital Command and GlyphForge, and its tests joined the
root suite as `tests/exomonitor_*.test.ts`. That is where it belonged from the start: nearly every feature of the
visualisation layer exists because building a system monitor needed it, and a library whose worked example lives in
another repository is a library whose worked example drifts.

The README grew a Visualizations section that explains the layer rather than listing it — the rank-and-history model,
what `fitVisualizations` is for and why crowding is reported apart from score, how to draw a frame, how to tile a
screen, and what each file of exomonitor demonstrates. Its numbers were checked against the running code rather than
written from memory; two of them were wrong and are now what the code prints.

Released as 0.4.0 rather than the unpublished 0.3.1, because eleven visualisations, a drawing toolkit, a tiling layer,
an axis layer and the unification of the two charting stacks are not a patch.

The standalone checkout it came from was retired rather than left to drift. Its working tree held nothing the vendored
copy lacked — the only differences were a modal bug already fixed here and a README describing commands that no longer
exist — but its seven commits had no remote, so the history went to a git bundle, verified by restoring it and diffing
the result before anything was deleted.

## August 19 2026 — one charting stack, and the btop graph

The maintainer's call: `src/visual` stays the measuring layer, `src/viz` is the painting one. `visual` answers where
things go and never learns about colour; `viz` decides what glyph and what colour go there. Every duplicate between them
is gone — ticks were already delegated, and now rasterisation lives in `visual/raster.ts` so a line and a series cannot
land one cell apart, `resampleToWidth` sits beside min-max and LTTB in `visual/downsample.ts`, and `viz`'s quadrant
primitive is replaced by a `DotPainter` over `visual`'s `MarkCanvas`.

That last one is the payoff. The mark canvas already had a logical dot space, braille through full-cell backends, and
capability-checked degradation; what it could not express is that a cell has a colour, which is the one thing `viz`
exists for. Wrapping rather than reimplementing gave braille — eight dots to a cell — for the cost of noticing that a
dot space has to be sized for the _resolved_ backend, since a space scaled for braille rasterises to twice the rows
through quadrants.

With that, the overlay became the btop CPU graph: one braille trace per core over the window, each in its own colour,
sixteen of them crossing without becoming a block. It accepts a history of vectors as well as a matrix, because a
sampler produces "every series at each instant" and a chart wants "one series across all instants". Colours run out
before cores do, so beyond the theme's own the palette spins hues at golden-ratio spacing.

Identity by colour alone is the trade a dot backend makes — a braille cell holds eight dots and one colour, so there is
no glyph left to vary. Where that trade is wrong the psychograph draws the same data with a pip per series at cell
resolution, which survives a monochrome terminal. Both are in the ranking; the overlay leads.

`cpu:cores` in exomonitor states no preference any more. It used to ask for a waterfall on the grounds that history per
core is what one frame cannot show — and the overlay shows the same history, more legibly, so stating a preference would
only have been a way of getting it wrong later.

## August 19 2026 — a psychograph of several lines, and a charting stack nobody had used

The psychograph draws one line or many. Several series overlay on one set of axes — a left and a right channel spectrum
on the same graph, three histories against each other — each with its own pip and its own colour, because colour alone
fails a monochrome terminal and a reader who cannot separate two hues. A single series keeps the value ramp: with
nothing to compare against, height says more than identity. Where two series meet the crossing is drawn rather than one
of them being quietly overwritten, which matters precisely because two audio channels agree most of the time and a chart
that hides one for it is a chart claiming they differ.

That needed a model change worth its own line: `accepts` takes a list. One series over time, several over time, and
several read at one instant are the same picture of differently shaped data, and splitting them into three
visualisations would make a caller choose by name rather than by data. `drawStream` picks the accepted kind that best
matches the stream, preferring an exact match so history is not dropped when both are on offer.

exomonitor grew the stereo capture to go with it: `parec` records two channels, the spectra are computed per channel and
the mono mix kept for the existing feed, and `audio:channels` is a `2dt` matrix of one row per channel. Measured at 61
Hz on the maintainer's machine.

Then the maintainer said there was already a version of this somewhere. There was. `src/visual/` is a complete charting
subsystem — eleven modules, eleven test files, exported from `mod.ts` — and nothing imports it. Multi-series overlay, a
mark canvas with braille through full-cell backends and capability degradation, six kinds of scale, axis tick layout
with collision thinning, LTTB downsampling, heatmaps with colour-target degradation, annotations, crosshair and brush
interactions, linked charts, and SVG export. `src/viz/` was built without knowing, and duplicated some of it.

The tick duplicate is gone: `viz/axes.ts` paints over `visual`'s `buildAxis` now, which brought Intl formatting,
emoji-aware label widths and deterministic thinning for free, and turned up a floating-point bug in the shared tick
generator on the way — three times 0.2 is 0.6000000000000001, and it was reaching the tick list. What remains is
recorded in the priority queue: the two stacks meet at colour, and which way that goes is a design call rather than a
refactor to start blind.

## August 19 2026 — the demos, combed for what was actually a visualisation

Thirty-six visualisations across the neon, monitor and neon3d families, and the finding that mattered came before any of
them moved: they are not data-driven. `app/visualizations.ts` renders from a `VisualizationDrive` — phase, cadence,
volatility — and the three.js scenes from a pointer signal. Their "psychograph" is `sin(x·k + phase)`, not a plot of
anything. So nothing was a move; each one is a form re-driven by data, which is a design decision per renderer.

What did port mechanically is what they are all built on: a drawing toolkit. `plot`, lines, paths, arcs, ellipses,
rectangles, and quadrant sub-cells that light a quarter of a character each. The versions in
`app/visualization_primitives.ts` write characters into a string matrix; a visualisation needs a colour per cell, so
these write `VizCell`s. Until this existed every renderer plotted cell by cell and a dial was not writable.

Eleven renderers came out of it, taking the catalogue from twelve to twenty-three. A dial whose sweep is the value; an
odometer for a number that has to read across a room; a strip chart; a honeycomb; a status grid of labelled pills; an
overlay of several series; a scatter at quadrant resolution; and four projected ones — a surface, a ring stack, a point
cloud and a vector field.

Two model gaps surfaced while fitting them. `perEntry` was one-dimensional, which cannot describe a renderer that lays
entries out in a grid — eighty-eight tiles fit a box that is neither eighty-eight columns nor eighty-eight rows — so it
grew a `cells` term and crowding is now bounded by area as well as by each axis. And rank alone cannot separate a
scatter from a heatmap, since both take a matrix, so a visualisation can declare `suits(shape)` and is left out of the
ranking rather than ranked badly when the answer is no.

The projection is arithmetic rather than three.js, deliberately: the core has no runtime dependencies and a wireframe
chart should not add one. The shaded, post-processed look those scenes have is what a `./viz/three` entrypoint would be
for, and it is not started.

Also `src/viz/axes.ts`, which closes a gap the plan has carried since the visualisations shipped: ticks at round
numbers, a value axis, a time axis that drops labels rather than truncating them, and a legend. A layer rather than
something each renderer grew, because a tile two rows tall cannot afford an axis — and nothing in it shrinks the chart
it labels, which is the one bug it must not have.

## August 19 2026 — what fits depends on the data (0.3.1)

A visualisation used to declare one minimum size, which cannot answer the question a tile actually asks. Eighty-eight
cores drawn as bars want eighty-eight columns; four cores want four. Same renderer, same box, right answer in one case
and unreadable in the other.

Each visualisation now declares what one entry costs it — a column for bars and waterfall, a row for rack, nothing for
the scalar views, which draw history rather than entries — plus a weight ranking it among equals. `scoreFit` combines
the absolute floor with that crowding and returns both a score and a reason in words: "fits comfortably", "88 entries
are tight here". `fitVisualizations` ranks every candidate for a shape at a size. Crowding is reported separately from
the score because it answers a different question: the score ranks candidates against each other, crowding says whether
the winner is worth drawing at all.

An `area` renderer joined them, and immediately became the default for anything `0dt`. The psychograph plots one point
per column, which is honest and reads as scatter; a filled body gives the eye an edge to follow. Seeing the two side by
side is what settled it, which is why exomonitor grew a `scripts/preview.ts` that prints a composed screen at any size
without a terminal to resize.

`VisualizationView`'s run pool now grows on demand instead of being fixed at construction. It still draws only into
slots that predate the frame — dependency tracking is asynchronous, so a slot positioned in the frame it was created in
would not move — which costs one clipped frame after a resize and buys a screen-sized composition that cannot run out.

A trace renderer joined them — the vector as a continuous line rather than bars from a baseline. Bars answer "how much
of each" and a trace answers "what shape is this", which is what an equaliser and an oscilloscope are asking. It
resamples across the box, so it declares no per-entry appetite and takes no crowding penalty for two hundred and fifty
six points in forty columns; what it does declare is a floor on entries, because a line between two of them is not a
trace of anything.

That broke a test worth recording rather than just fixing. "Eighty-eight entries score worse than four in the same tile"
had been asserted on the top-ranked fit, and stopped being true once a renderer existed that resamples — the winner
changes identity, and two renderers' scores are not on the same scale. Compared renderer for renderer the claim holds
exactly as before. The general lesson: a ranking test should name the thing it is ranking.

Two renderer bugs surfaced from looking at real feeds. A bar chart scaled to its own data range puts the smaller of any
pair at zero, so `↓1019K/s ↑698K/s` drew one full bar and one empty one — a ranking drawn as a chart. Bars, racks and
areas now take their floor from zero unless the data goes below it, and a caller's domain still wins. And crowding could
not catch the opposite mistake: two entries in thirty-five columns fit perfectly and a spectrogram of them is two
coloured slabs, so a field renderer declares the entries it wants before it earns its weight.

Audio then had to run at sixty. It had been analysing one non-overlapping window per four buffered — 5.9 spectra a
second, three quarters of the audio discarded — and the screen was reading it once a second on the sample tick. Windows
now overlap with a hop of `sampleRate / 60`, sliced at hop boundaries rather than at whatever boundary the recorder
happens to hand over, which is the difference between 50 Hz and 60.0 Hz measured. A feed can declare itself live: its
tile is drawn by its own listener at its own rate, on a second view above the screen, so sixty frames a second costs one
chart rather than the whole terminal — 8.3 ms of a 16.7 ms budget for a 77x18 spectrogram.

exomonitor was rebuilt on it: sources became feeds (overall CPU and per-core load are different questions, not one
panel), the density table became equal tiles, and the panel-to-visualisation mapping became a ranking against live
cardinality. An 18x4 terminal reads `cpu 42%  mem 70%  gpu 10%  net 20K/s` with no special case for it — that is what
falls out when no candidate clears the crowding floor and the tile keeps its number. The settings modal is Box, Frame,
Tabs and List rather than hand-drawn text, with a Display page that shows the registry's own reason for each choice and
lets one be pinned; a pin that stops fitting is ignored rather than obeyed.

## August 18 2026 — animations confirmed (039)

The maintainer ran exomux and confirmed the window and menu animations on a real terminal — the one check headless
mounts cannot perform, and the only thing 039 had been waiting on since Aug 17. Closed.

## August 18 2026 — focus stops meaning selection (044)

Four slices. The task asked for a focus authority; `src/focus.ts` already had one, so the work was extending it rather
than building the second authority `040` had just finished removing. What it genuinely lacked was `disabled`: a probe
showed a disabled control losing its look on a focus change it was not part of, then taking the keyboard on the next
one.

The sketch's other half could not be built as written. It wanted `selected-unfocused` as a component state, but
`ThemeState` indexes `Theme` directly, so a fifth member would demand a fifth style from every theme. Selection belongs
to a row and focus to a component — one list is a single focusable drawing many rows — so the distinction became its own
`SelectionPaintState`, resolved from the two facts that decide it.

Then the colour (two tokens, because the vocabulary requires every foreground to name its ground), the call sites, and
exomux. `Tree` nearly shipped permanently muted: it draws through a `List` it owns that is never focused, and sharing
the tree's state signal would have handed that list every key press the tree receives. It takes an explicit `focusState`
instead.

exomux turned out to have the opposite bug to the one the task was opened for — its panels drew _no_ highlight when
unfocused, losing the user's place rather than de-emphasising it. They now keep it, muted.

Confirmed at a real terminal by the maintainer the same day. The lesson worth keeping is from the follow-up: the first
version's label was unreadable in all fifteen presets, and no test caught it, because every test asserted the two
selections _differed_ rather than that either could be read. Measuring the vocabulary's own `against` pairs found it.

## August 19 2026 — dimensional visualisations (0.3.0)

`@ubernaut/exotui/viz` is published. Data is described by rank and by time — `0d` a number, `0dt` its history, `1d` an
array read now, `1dt` that array over time, up through `3d` — and a visualisation declares the kind it draws while a
stream declares the kind it carries. Pairing them wrongly throws rather than drawing something quietly false. History
can be dropped but never invented, and rank never converts.

Nine renderers: meter, sparkline and psychograph; bars, rack and waterfall; heatmap, the 2D lattice and a volume
projection. The lattice is the flat half of the wireframe lattice, split from its Three.js twin so a flat chart does not
drag a renderer dependency behind it. Colours come from a `viz:*` token group falling back through the chrome and status
tiers, so every existing theme paints charts without knowing they exist.

exomonitor is the exercise that kept it honest, and it earned its keep three times: per-cell colour cannot go through a
Text at all; a component created after the first frame ignores later rectangle changes, which is why the view fixes its
geometry at construction; and the audio equaliser proved the model generalises, because audio bands are `1dt` — the same
kind as per-core CPU load — and are drawn by the same renderers with no audio-specific code. A spectrogram is a
waterfall whose array happens to be frequencies.

## August 19 2026 — exomux published, and the showcase kernel promoted (0.2.0)

`@ubernaut/exomux@0.1.0` is on JSR, and `@ubernaut/exotui@0.2.0` with it. Publishing exomux so someone can build on it
turned out to require answering a question the repository had avoided: exomux imported the showcase kernel from
`examples/showcases/shared/`, and `examples/` is not published. A module the flagship application imports in three files
is not an example, so it moved to `src/showcase/` and ships as `./showcase`.

The other half was the proving ground itself. exomux develops against the working tree, which is the point of it, but a
published package cannot ship `../../mod.ts`. Deno's `links` field resolves that: the manifest declares
`jsr:@ubernaut/exotui@^0.2.0`, and `links` points local resolution at the tree. Confirmed by the sandbox's own refusal
to fetch anything published today — a resolution that reached the network would have failed, and it did not.

Forty-five publish blockers in exomux, thirty-eight of them the same inferred-Signal shape. The promotion also exposed
two in the showcase kernel, which had never been public API and so had never been checked.

## August 19 2026 — published, as exotui (0.1.0)

`@ubernaut/exotui@0.1.0` is on JSR. Nothing had ever been published, though it was easy to believe otherwise: the
`release-check` gate has reported "ok release dry run" for months, and a dry run proves a package _would_ publish, not
that it has — the same trap as `api-reference`, whose task printed the reference instead of checking it.

The package was renamed before its first publish. It had been `@ubernaut/deno-tui`, after the project it is forked from,
while everything else called it exotui; the published name is permanent, so it was the last cheap moment to fix it. 83
files, and not cosmetic — `src/tooling/init_templates.ts` scaffolds projects that import the specifier, so a mismatch
would have broken every generated project.

Publishing runs from GitHub Actions over OIDC, with no stored secret, and runs `release-check` before `deno publish`
because JSR versions are immutable. The push triggered two runs, since the workflow file arrived in the push that
triggered it; both succeeded, because `deno publish` skips a version that already exists.

The slow-type work done for the `release-check` gate the day before turned out to be the actual precondition: those
thirteen annotations were JSR's requirement, not a local nicety.

## August 18 2026 — seven red health gates, four causes

`deno task health` had been red at `main` for a while. The six the plan listed collapsed into four causes once they were
read properly, and a seventh was never listed.

`release-check` was not its own failure: it shells out to `package_check.ts --quiet`, so it exited with that script's
code and printed nothing. Underneath was a real one — `deno publish --dry-run` rejecting 13 JSR slow-type sites.
`api-inventory` reported a duplicate `createApp` and a module that does not exist, both because its scanner is a regex
over raw source and `src/tooling/init_templates.ts` embeds four scaffolded projects as template literals; it was reading
that embedded source as the module's own API. `package-check` wanted two modules `040` and `042` had promoted to be
declared in the ratchet as well as the baseline. `web-pages-build` failed on a bare specifier esbuild cannot resolve.
`format` and `api-reference` were stale rather than broken.

The masking fix is the one worth remembering. The first version blanked module specifiers too, cutting the inventory
from 4,231 symbols to 1 — caught by diffing the whole symbol list before and after rather than trusting an exit code.
The finished version removes exactly the seven phantom symbols and nothing else.

`e2e` was red at `main` too and appeared in no list. Its bundle budget had been reading a stale artifact, because a
failing `web:pages:build` leaves the last good bundle checked in; the true size is 566,013 against a 500,000 ceiling set
when the bundle was 373,457. Raised to 600,000 deliberately, with the measurements recorded, because the bundle is
already minified and tree-shaken and no single input is above 6.5% of it.

## August 18 2026 — the wrap that got 60x slower

`render/textbox-wrap-250` had been failing its 5 ms budget at 10.9–15.0 ms. Bisected to `795e2d70` (Jul 21), which made
textbox wrapping grapheme-aware — correct for emoji, combining marks and CJK, and 60x slower. Profiling put 77% of the
cost in the grapheme segmenter rather than the wrap loop everyone would have looked at first.

Inside ASCII, every rule that joins two scalars into one cluster needs a code point at or above U+0080; the single
exception is CR × LF. So an ASCII fast path is exact rather than approximate. It took `graphemeBoundaries` from 7.07 ms
to 0.43 ms, and the case from 10.9–15.0 ms to 1.3–2.3 ms. Verified three ways: the official UAX #29 break test still
passes, boundaries agree with `Intl.Segmenter` across every ASCII code point in context, and wrap output is
byte-identical to a fixture captured from the previous implementation.

## August 18 2026 — planning structure

Adopted the [vibe-plan](https://github.com/ubernaut/vibe-plan) layout: `plan/PLAN.md` became the user-owned
`plan/plan.md`, and `arch/`, `test/`, `log/`, `refs/`, `todo/priority.md`, and `todo/hiatus/` were populated from the
repository as it actually is. Two stale claims in the old plan were corrected in the process: kitty graphics is not "not
started" (`src/runtime/kitty_graphics.ts`, 360 lines), and `025` is not on hiatus (reactivated Aug 17).

## August 18 2026 — theme editor (042)

A theme editor as a first-class exotui feature, in five slices: a vocabulary of forty-one control tokens with fallback
chains, pure editing functions over the interchange document, an OKLCH colour picker, the editor controller and theme
library, and the exomux window that hosts it.

It exists because three rounds of picking a palette by hand went wrong. The vocabulary names what is on screen (an
active title bar, a scrollbar thumb) instead of only what it means (an accent), and each foreground declares the
background it is read against, so the editor answers "can this be read" instead of leaving it to taste.

Corrected the same day on user direction: presets are read-only, opening the editor starts a new theme based on the
selected one, and the entry point moved from the start menu to a `[ new ]` button in the settings theme header.

## August 18 2026 — hardening from field reports

- **Sessions.** A terminated exomux session no longer lingers as a "stopped" row holding its number; probing reconciles
  and sweeps, so `-n` takes the lowest free number back.
- **Version skew (041 follow-up).** A newly installed client bricked reattachment to a daemon started before it: the
  shared-state message it sent was unknown to that host, which closed the connection and took every live terminal with
  it. Capabilities are now advertised in the descriptor and gated on; an unknown message from an authenticated client is
  refused, not fatal.
- **Modals.** Responsive sizing that truncated its own contents is not responsive. Prose wraps, the key reference
  reflows from two columns to one to stacked and scrolls, and boxes size around their wrapped bodies.

## August 17–18 2026 — multi-client shared state (041)

Two clients on one daemon now agree on the desktop: session removal reconciles everywhere, appearance and window
lifecycle ride a generic shared-state channel on the host. Geometry deliberately stays local — a phone and a laptop do
not want the same rectangles — and so do maximize and focus, which the mobile layout derives from the viewport.

## August 17 2026 — pointer input architecture (040)

The mouse stack was rebuilt around one authority after chained fixes stopped holding. Ordered pointer targets, a
transform applied once at ingress, a pure gesture reducer, and a golden hit map as the safety net. The slowest pointer
test file went from 11 s to 378 ms. The user's verdict that prompted it — "you're trying to chain hacks instead of
thinking about how the big picture should fit together" — is the reason the plan structure now insists on discrete,
independently testable modules.

## August 2026 — exomux as the proving ground (027–039)

Active backgrounds, output backpressure, butterchurn favourites and GPU fidelity, transparent window stacking, the
network panel with Tailscale and scp, a UX and multi-client hardening pass, a demo QA pass, and window and menu
animations. Field reports from daily use drove nearly all of it.

## July–August 2026 — back-feeding the library (031, 036, 037)

The compositing surface, richer List/Tree/Modal/Input/ContextMenu, a real TerminalScreen, window-host niceties, and the
animated-background and software-cursor helpers were promoted from exomux into exotui, and exomux rewritten to consume
them. Textual and OpenTUI parity was catalogued as a backlog to pull from rather than a checklist to complete.

## Earlier 2026 — library foundations (001–022)

Web console parity and the GitHub Pages build, terminal portability, the windowing and overlay API, widget interaction
contracts, JSDoc coverage, visual regression, the form system, theme standardisation, performance benchmarks, API
stability and packaging, an end-to-end web suite, a top-to-bottom architecture audit and the refactor that followed, a
range-aware render queue, and a repo-shape reduction.
