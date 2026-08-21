# Priority queue

Ordered list of open work. A task not in this list is not expected of anyone. Updated August 19 2026.

## Active

1. **Visualisation follow-ups, from building exomonitor on the published package.** The dimensional model and the
   fitness ranking are in and green; these are the gaps building a real application found and did not close:
   - **No `2dt` renderer.** The kind exists and a stream can carry it; nothing draws it. A matrix over time is the
     natural shape for per-core load _and_ history together, which is the one thing exomonitor cannot show.
   - ~~No axis, tick or legend layer.~~ Closed Aug 19: `src/viz/axes.ts` — `niceTicks`, `drawValueAxis`, `drawTimeAxis`,
     `drawLegend`, and `valueAxisWidth` so a caller can measure the gutter first. Deliberately a layer rather than
     something each renderer grew: a tile two rows tall cannot afford an axis and must not be given one, and nothing
     here shrinks the chart it labels.
   - ~~exomonitor is unpublished~~ — it moved into `examples/showcases/exomonitor/` on Aug 19 and ships with the
     repository as the worked example for `./viz`. The standalone `~/projects/exomonitor` checkout is now a second copy
     of the same code; it should be retired rather than kept, because two copies of a thing is the drift this release
     spent a day undoing.
2. **`025` Production demo application showcases.** Reactivated Aug 17. Orbital Command and GlyphForge are the named
   targets; the remaining eight concepts stay parked until those two have fixture-backed hero slices.

## `deno task health` — seven red gates, fixed August 18 2026

All of them predated the branch that fixed them (`bug/health-gates`, cut from `ab98acbc`). The six listed here turned
out to be four distinct causes, and a seventh — `e2e` — was never listed at all.

- **`package-check`** — `040` and `042` exported `src/app/pointer_gestures.ts` and `src/app/theme_editor.ts` from the
  stable root and recorded them in `budgets/public_api.json`, but not in `docs/api-stable-app-modules.json`, the ratchet
  that says which `src/app` modules may be stable. Added there.
- **`release-check`** — not an independent failure. It shells out to `package_check.ts --quiet` and exits with that
  script's code and an empty message, which is why it looked like its own problem. What remained once `package-check`
  passed was real: `deno publish --dry-run` rejected 13 JSR slow-type sites, each now annotated. `CORE_METRICS` keeps
  its literal catalog in a named const so `keyof typeof CORE_METRICS` is unchanged.
- **`web-pages-build`** — `app/api_workbench_hit_targets.ts`, added by the `040` follow-up, imported `@ubernaut/exotui`.
  `deno check` resolves that through the import map; the esbuild docs bundle cannot. Relative now, like every one of its
  siblings.
- **`api-inventory`** — the scanner is a regex over raw source, so a module carrying source code as data reported that
  data as its own API. `src/tooling/init_templates.ts` embeds four scaffolded projects as template literals, which is
  where the phantom second `createApp` and the target `src/tooling/${name.replaceAll(.ts` came from. Literal text is
  masked before scanning — tracked for every literal kind, blanked selectively, because the re-export scanner needs the
  quoted specifier and blanking those cut the inventory from 4,231 symbols to 1 on the first attempt. Also 100%
  documentation coverage (the gate's `--min-doc-coverage=1` is a fraction, so 99.8% failed) and a regenerated baseline.
- **`format`** and **`api-reference`** — stale rather than broken. The two generated Unicode tables now carry
  `// deno-fmt-ignore` emitted by their generators, with the reviewed digests repinned, so a later regeneration cannot
  reopen the gate.
- **`e2e`** — never listed, and red at `origin/main` too. See the bundle follow-up below.

Two claims in the previous version of this section were wrong and are worth not repeating: `packages/exomux` does not
format differently from the root (both set `lineWidth: 120`, and both produce the same output for `audio_scripted.ts`),
and `release-check` was never its own bug.

## Gate failures found August 18 2026 — both fixed

Both surfaced the first time `deno task health` was run after the pointer refactor; neither is in either test suite,
which is why they went unnoticed. Both are fixed, as are the seven older gates above.

- **`render/textbox-wrap-250` missed its budget by ~60x** — fixed Aug 18 by `ab98acbc`. It ran 10.9–15.0 ms against a 5
  ms ceiling, having measured **0.179 ms** at `1c692900` where it was added; bisected to **`795e2d70` ("muxstone",
  Jul 21)**, which made textbox wrapping grapheme-aware. Profiling put 77% of the cost in the grapheme segmenter rather
  than the wrap loop. The decision was to optimise rather than raise the budget, because inside ASCII the fast path is
  exact, not approximate: every rule joining two scalars into one cluster needs a code point at or above U+0080, and the
  sole exception is CR × LF. `graphemeBoundaries` went 7.07 ms → 0.43 ms and the case 10.9–15.0 ms → 1.3–2.3 ms, with
  the UAX #29 break test, an `Intl.Segmenter` cross-check over every ASCII code point in context, and a byte-identical
  wrap fixture as the evidence.
- **`api-workbench:check` was broken by plan 040** — fixed Aug 18. The two workbench demos imported `HitTargetStack`,
  which 040 deleted from the library; they now carry their own copy in `app/api_workbench_hit_targets.ts`, because
  immediate-mode demos genuinely want a per-frame LIFO stack and the library genuinely wants one pointer authority.
  _Lesson recorded in the log: `deno task health` covers files that neither suite reaches._

## Two charting stacks, unified August 19 2026

Found August 19 2026, and the reason the visualisation work kept reinventing things.

`src/visual/` is a complete charting subsystem — 1,442 lines across eleven modules, exported from `mod.ts`, covered by
eleven test files — and **nothing imports it**. Not a component, not an example, not exomux, not `src/viz/`. It holds:

- `series.ts` — line, stepped-line, area, scatter and stacked-area, with a `grid` option that overlays passes, which is
  multi-series charting that already worked.
- `marks.ts` — a mark canvas over one logical dot space with braille (2x4), sextant (2x3), quadrant (2x2) and full-cell
  backends, and capability-checked degradation that names both the requested and the used backend.
- `scales.ts` — linear, log, symlog, time, ordinal and band scales.
- `axes.ts` — tick layout with Intl formatting, emoji-aware label widths and deterministic collision thinning.
- `downsample.ts` — min-max, LTTB and a streaming downsampler.
- `heatmap.ts`, `annotations.ts`, `interactions.ts` (crosshair, brush), `linked_charts.ts`, `chart_export.ts` (data,
  cells, SVG, description).

`src/viz/` was built without knowing it existed, and duplicated parts of it: tick generation, sub-cell plotting, and
`resample` against `downsample`. The tick duplicate is gone — `viz/axes.ts` now paints over `visual`'s `buildAxis`,
which is strictly better than what it replaced. The rest is open:

1. **`viz`'s sub-cell plotting should be `visual`'s `MarkCanvas`.** Braille is four times the resolution of the
   quadrants `viz/draw.ts` has, and the capability degradation is already written.
2. **`resample` should be `lttbDownsample`.** LTTB preserves shape by area rather than by picking extremes.
3. **The unresolved question is colour.** `visual` renders into `string[][]` and has no notion of a cell's colour, which
   is exactly why `viz` exists. Either `visual` grows a colour-aware target, or it stays the measuring layer and `viz`
   stays the painting one. That is a design call for the maintainer, not a refactor to start blind.
4. **`visual`'s other half has no consumer at all** — annotations, crosshair and brush interactions, linked charts, and
   chart export. Either something should use them or they should be understood as an unreleased surface.

## Supporting terminal applications that draw — found via tode, August 20 2026

[tode](https://terminal-code.com) — a VS Code fork that runs in a terminal — painted a full screen of base64 into an
exomux window. Two causes, both fixed; two capabilities remain open, and they are what "support this app properly"
means:

- **Fixed: the emulator did not know APC.** `parseTerminalControlSequence` knew OSC/CSI/ESC only, so a kitty graphics
  transmission (`ESC _ G … ESC \`) printed its payload as text. DCS/APC/PM/SOS are now parsed and consumed whole,
  pending across chunk boundaries, with a discard-until-ST mode for payloads over the 64 KB pending cap. A stream that
  opens a string sequence and never sends ST is swallowed until one arrives — bounded misbehaviour for a malformed
  stream, and what tmux does too.
- **Fixed: PTY children inherited the daemon's host-terminal identity.** The daemon runs under Ghostty; children saw
  `GHOSTTY_RESOURCES_DIR` and `TERM=xterm-ghostty` and reasonably used Ghostty's protocols. `terminal_env.ts` now
  materialises a full environment per spawn: host identities stripped, `TERM=xterm-256color`, `TERM_PROGRAM=exomux`,
  `COLORTERM=truecolor`, request env winning. tode's own detection logic runs against the sanitised env in a test and
  concludes text-only.
- **Open: the emulator answers no queries.** Not OSC 10/11/4 colour queries (tode asks, then falls back), not DSR, not
  DA. Answering needs a reply channel from the ingest side back to PTY stdin — daemon-side, since replies must beat a
  round trip through a client — so it is a design task, not a patch.
- **Open: actually drawing the graphics.** The real endgame is kitty-graphics support in exomux windows: parse the APC
  (done), decode the image, composite it — or pass it through to the host terminal when the host really is Ghostty, with
  placements translated. `src/runtime/kitty_graphics.ts` and `todo/hiatus/kitty-graphics-integration.md` are the
  starting points. Until then, honest text fallback is the supported mode.

## Overlays as windows — direction agreed August 21 2026

The maintainer proposed refolding exomux's modal overlays into the window host as special-case windows. The direction is
right, and it is this codebase's own doctrine — the host already carries modal semantics (`topModalId`), and a modal
that is a window gets stacking, occlusion, minimize and input routing from the one authority instead of from eight
bespoke painters. What blocks doing it in one move: each overlay carries its own paint, its own input capture rules (a
modal blocks everything; the start menu dismisses on outside click; the switcher is keyboard-transient), composited
widget syncing, and the transition ghosts that composite above modal chrome. The migration is incremental: new overlays
land as host modal windows from the start; existing ones move one at a time, the kill confirmation first because it is
the simplest. Until each moves, the overlay-footprint registry (`controller.overlayFootprints`, painters reporting the
rect they painted) is the bridge that keeps the graphics relay honest about what covers what.

**Done — kill confirmation (August 21 2026).** `EXOMUX_KILL_WINDOW_ID` is a registry window born `closed` (never in the
shelf); the pending-kill signal presents and closes it, a projection watcher treats a vanished-while-pending window as a
cancel, and `paintKillWindow` paints the client area through the normal window dispatcher — so it stacks, drags, and
occludes kitty graphics as a window, with no overlay footprint and no transient surface. Input stays modal for now:
`modalOpen()` gains an explicit pending-kill check while `exomuxDesktopOverlayOpen` loses its (the graphics relay no
longer needs telling), and the pointer router derives button rects from the projected `clientRect` via the same
`exomuxKillWindowButtons` the painter uses. Incidental fix: `reflowFloatingWindows` now skips every non-`normal` state —
it was "rescuing" closed windows nobody could see. Next candidate: the quit modal, then relax the modal input capture
once a general focused-modal-window grammar exists.

## Follow-ups carried from completed work

Small, real, and worth doing when adjacent code is next touched:

- **Two presets have a weak _focused_ selection.** Measuring 044's new tokens across all fifteen themes surfaced a
  pre-existing one: `seaglass` (1.98:1) and `parchment` (2.37:1) paint their accent selection so close to the panel
  background that the focused row barely reads as selected — `t2` also has its muted row (9.17) louder than its accent
  (6.56). Nothing to do with 044, which only made it measurable; fixing it means adjusting those themes' accents, which
  is a design call for the maintainer.
- **`044` — exomux's start menu and settings panes still decide focus by hand.** Each computes a per-row `focused`
  boolean rather than resolving through `resolveSelectionPaint`. Correct on screen, so this is consistency debt; worth
  converting when that code is next touched.
- **`042` — finish the token-to-painter wiring.** Window chrome, menus, list selection, scrollbars and modal buttons
  read their control tokens; the rest of the vocabulary resolves and is editable but still paints from the ten-colour
  spec. Mechanical.
- **`042` — a prefix binding for the theme editor.** It opens from settings only.
- **The API workbench web bundle is over its original budget.** `docs/assets/api-workbench.js` is 566,013 bytes; the
  `e2e` ceiling moved from 500,000 to 600,000 on Aug 18 rather than the bundle being optimised. It is already minified
  and tree-shaken, and its weight is spread over 155 modules with nothing above 6.5% — marking
  `src/layout/capabilities.ts` (33 KB of frozen data, the second-largest input) tree-shake-safe recovered zero bytes,
  because the demo genuinely references it. Getting back under 500,000 means changing what the workbench demo imports,
  not how it is built. The 532,789 the gate reported for a while was a stale artifact, not a smaller bundle.
- **`033` — the residual butterchurn echo-amplifier class**, characterised for a readback-probe pass.
- **`032` — a manual performance pass** for transparent window stacking on the maintainer's laptop.

## On hiatus

- **`todo/hiatus/html-css-layout-engine.md`** — partially delivered (`src/markup/`, `src/layout/`,
  `docs/html-css-layout.md`). The remaining scope is an authoring story, not a rendering one; pull forward when an
  application wants it.
- **`todo/hiatus/kitty-graphics-integration.md`** — `src/runtime/kitty_graphics.ts` exists, so this is further along
  than the old plan claimed ("not started"). Needs a status pass before it is worth scheduling.

## Not scheduled

- **`036` / `037`** — Textual and OpenTUI parity, and the 200-feature programme. A backlog to pull specific items from
  when a task or demo needs them, not a queue to run top to bottom.
