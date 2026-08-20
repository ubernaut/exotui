# Project log — detail

Decisions, dead ends, and reproductions, in enough detail that the same ground is not retrodden. This file is long by
design: consult it when about to attempt something that may have been tried, rather than reading it start to finish.

Entries begin August 17 2026, when this log was started; earlier history is in the task files under `todo/done/` and in
`git log`.

---

## Dead ends and corrections

**A coordinate-space model for padding that did not exist (Aug 17).** Built a 183-line `pointer_space.ts` plus 213 lines
of tests to correct terminal padding between pixel and cell coordinates — before measuring. Measured against real
Ghostty afterwards: `CSI 14 t` reports the text area as exactly `columns × cellWidth`, so the padding model was
identically zero in every case. Deleted. _Rule: measure the real terminal before modelling it._

**Tests that asserted the bug (Aug 17).** While fixing the block-cursor pointer redirect, two tests were written that
pinned the broken behaviour — "a click acts where the block cursor is, not where the press claims" — and passed happily.
_Rule: a test states the intent; if it reads like a description of the current code, it is not a test._

**Chained pointer fixes (Aug 16–17).** Shelf swallowing releases, double-click stealing drags, the cursor lying over
buttons, and the background getting first refusal were each fixed in place until the stack stopped holding. The rebuild
(`040`) replaced them with one router, ordered targets, and a golden hit map. _Rule: the third fix in the same area is a
design signal, not a bug._

**Two parsers, and the screen used the one without APC (Aug 20).** The repository has a complete incremental terminal
parser (`terminal_parser.ts`, TERM-001) that knows every string sequence — and `TerminalScreenController` does not use
it; it parses with `parseTerminalControlSequence` from `terminal_sequences.ts`, which knew OSC/CSI/ESC only. The same
shape as `visual`/`viz`: a capability existed, unreferenced by the code that needed it, and a grep for the capability
rather than for callers would have found it. The surgical fix taught the second parser string sequences rather than
refactoring the screen onto the first; unifying them is real work because the token shapes differ.

**An environment is a claim about who is listening (Aug 20).** exomux's PTY children inherited the daemon's environment,
Ghostty identity included, and tode believed it — its comment even says a protocol probe costs a tty round trip, which
is why terminals advertise by environment at all. A multiplexer that passes its host's identity through is telling every
child a lie about who is on the other end of the fd. The child env is now materialised in full per spawn, which also
makes it deterministic rather than dependent on what happened to launch the daemon.

**Dropping a per-entry cost in a rewrite (Aug 19).** `overlay` declared `perEntry: { rows: 2 }` until it was rewritten
as the btop chart, and the rewrite did not carry it over. Nothing failed: the fitness pass then scored two hundred and
fifty-six series as "fits comfortably", the settings page offered it for a 256-point waveform feed, a pin took it, and
the tile cost 49 ms a frame at 60 Hz — two of them, so roughly six cores' worth of work asked of one. The monitor locked
up.

Found by measuring rather than reading: composition of the automatic layout was 0.45 ms and presenting 0.98 ms, which
ruled out everything until the probe was re-run against the maintainer's actual config, pins included. The pins were the
whole story.

Two lessons. A renderer whose cost scales with the data must say so in `perEntry`, because that declaration is the only
thing standing between a settings page and an offer it cannot honour. And a performance probe built from defaults tests
the defaults; the configuration that is actually slow is the one somebody chose. _Rule: reproduce with the user's
config, not with a plausible one._

**A modal that resized itself per page (Aug 19).** exomonitor's settings window sized its height to the number of rows
the current page had, which looked tidier and was wrong twice over. The list drew against the rectangle the previous
page had left — thirteen rows rendered, two drawn — and the rows the shrinking box vacated were never repainted, so the
Sources page bled through underneath the Display page. Neither symptom points at resizing. One size for every page, from
the library's own `layoutWorkbenchModal`, has neither problem. _Rule: a container whose geometry depends on its contents
has to erase what it gives up, and it is cheaper not to give any up._

**Building a charting layer next to one that already existed (Aug 19).** `src/viz/` grew axes, sub-cell plotting and a
resampler without anyone noticing `src/visual/` had all three, better, exported from `mod.ts` and covered by eleven test
files. Nothing imports `src/visual/`, which is why it never surfaced in a search for callers, a grep of the examples, or
the reachability gate — that gate checks a module is imported by _something_, and `mod.ts` re-exporting it counts.
_Rule: before adding a capability to a library, grep the library for the capability, not for its callers._

**A pitch that looked up instead of down (Aug 19).** `camera` rotated by pitch with the sign inverted, so a positive
pitch put far points _below_ near ones. The symptom was not an upside-down picture — it was a surface whose front edge
was missing, because the floating horizon then hid the front behind the back. Worth remembering as a shape: a projection
error shows up as an occlusion bug, one layer away from its cause.

**A flat domain reading as half (Aug 19).** `safeDomain` centres a domain with no span, which is right for a line chart
— a flat signal has to sit somewhere and the middle is honest — and wrong for a point cloud, where the question is
occupancy. A volume of all zeroes normalised every cell to 0.5 and drew eighty-three points of solid fog. Occupancy is a
question about zero, not about position in a range; the test that caught it asserts an empty volume draws nothing.

**Reading a permission failure as an absent device (Aug 19).** exomonitor's `/proc` reader caught every error and
returned undefined, commented "a source that cannot be read is a source this machine does not have". Deno gates `/proc`
behind `--allow-all` specifically — `--allow-read=/proc` is refused too — so a monitor started with narrower permissions
concluded the machine had no CPU, no memory and no network. Worse, `reconcile` then filtered the stored configuration by
what was available that run, and the next save wrote the loss to disk: one run without permission permanently deleted
the user's selection. Two rules, both now pinned by tests: a read failure and an absent device are different facts, and
configuration is filtered for drawing, never for saving.

**A density table instead of a measurement (Aug 19).** exomonitor's first layout carried a table of which panels each
terminal size was allowed to show, and a per-panel list of preferred visualisations. Every new machine shape needed a
new row: a 4-core laptop and an 88-core workstation want different charts at the same size, and no table indexed by
terminal size can say so. Replaced by scoring candidates against live cardinality. _Rule: when a table needs a column
for every machine, the thing being tabulated is a measurement._

**The psychograph as the default scalar chart (Aug 19).** It was chosen because it uses the whole box, which is true,
and read as scattered dots, which is also true. A filled area chart of the same data at the same size is immediately
legible. Neither renderer changed; what changed was looking at them side by side, which needed
`exomonitor/scripts/preview.ts` to exist. _Rule: for anything visual, build the way to look at it before arguing about
it._

**Quantising the ramp to save components (Aug 19).** `rampGradient` was made to snap to 32 steps so neighbouring cells
of a heatmap would merge into runs. Measured: 2,564 runs became 2,514 on random data. Kept — it is free and helps real
data, where neighbours are genuinely similar — but it did not solve the problem, and the pool growing on demand did.
_Rule: measure the saving before designing around it._

**Shadowing a preset (Aug 18).** The theme editor originally let a saved theme shadow a built-in of the same name, on
the theory that "fixing a shipped theme" was the common case. The user's direction was the opposite: presets are the
floor everyone can get back to. Saving over one is now refused, and opening the editor starts a copy. Two test files had
to be rewritten because they pinned the old rule.

---

## Reproductions worth keeping

**Version skew between a new client and an old daemon (Aug 18).** Reproduced by `git worktree add <dir> 22edad56` and
running that build's `serveExomuxHost` against the current `connectExomuxWebSocket`: publishing the shared-state message
throws "connection closed" and every later attach fails the same way. This is the general recipe for any protocol
change.

**Wheel scrolling that never reached its handler (Aug 18).** The modal catcher answered every scroll with `true`, and
the desktop's paint signature omitted the scroll offset, so the frame stayed put even when the offset moved. Neither was
visible by reading the code; both were obvious the moment a test turned the wheel and read the frame back.

**Theme edits that repainted the previous theme (Aug 18).** `controller.theme` was a `Computed` over `themeId` alone.
While editing, the id is stable and only the colours change, so the Computed handed back the pre-edit spec. It now
depends on `themeRevision`.

**A geometry function that depended on its content (Aug 18).** The kill modal's layout briefly took the terminal name it
displays, to size itself around the wrapped text. The pointer router lays the same modal out to hit-test a click and has
no name to hand it, so the buttons would have been drawn in one place and clicked in another. Geometry now reserves rows
instead.

**Session switching to a black screen (Aug 17).** `Tui.destroy()` does not emit the `destroy` event — that event means
"the user interrupted us, exit the process". The switch loop awaited it, so the promise never resolved, the event loop
drained, and the client exited. Pinned by `tests/tui_destroy_contract.test.ts`.

**Keys that went to the shell instead of the window (Aug 18).** The theme editor's whole keyboard — arrows, Tab, and its
letter bindings — was typed into the active terminal rather than the editor. exomux only routes a key to the app when a
modal is open, a prefix is pending, or `shouldRouteAsWorkbenchKey` recognises the active window, and that function had
never heard of the theme editor. Every controller-level test passed throughout, because they called the controller
directly. Found by driving the keyboard in a mounted test, which is now how the editor's keys are covered. _Rule: a new
window needs an entry in the key router, and a test that presses a key rather than calling a method._

**A button that looked enabled and refused (Aug 18).** The live preview registers itself in the theme catalog so every
painter finds it the ordinary way, which also made it satisfy "is a user theme" — so `[ edit ]` and `[ del ]` offered
themselves for a theme that had never been written to disk, then declined. The preview id is excluded explicitly now.

**A deleted theme that was not there (Aug 19).** Field report: "deleting a custom theme does not remove it from the
list." It did remove it. The theme editor's live preview registers itself in the catalog under `theme-editor-preview` —
it has to, or the desktop cannot paint what you are editing — and `exomuxThemeSpecFromDocument` gives every spec
`label: document.name`. So while editing "Miami Neon custom" the catalog held two entries whose labels both read "Miami
Neon custom", and the settings list painted every catalog entry without filtering. Delete the real one and its twin
stayed, wearing its name.

Two wrong turns while finding it, both from reading the nearest plausible code instead of the code that runs.
`theme_storage.ts`'s `remove()` returns `Promise<void>` while `deleteTheme` does `!await remove(id)`, which looks
exactly like an always-false success check — but that is the storage _port_; the library `ThemeLibrary.remove` returns a
real boolean and is what `deleteTheme` calls. Then the preview id looked like the wrong argument to `deleteTheme`.
Neither was it. A twenty-line reproduction printed the catalog before and after and showed the answer immediately:
delete worked, `theme-editor-preview` remained.

Fixed by naming the distinction the catalog was missing: `exomuxThemeCatalog()` resolves every theme including the
preview, `exomuxSelectableThemes()` is what a person can choose, and every list and index in `app.ts` uses the second.
_Rule: an id that exists to be painted but not chosen needs both lists to exist, or someone eventually paints the wrong
one._

**A module no gate could see, and its duplicate (Aug 19).** `packages/exomux/audio_scripted.ts` was imported by nothing.
It type-checked, but only by luck: `deno check ./main.ts` does not reach it and neither did any test, so a break in it
would have left every suite green — the same shape as `040` deleting `HitTargetStack` while both suites passed. Found by
asking, for each top-level module in the package, whether anything imports it; it was the only one.

It was also not the only copy. `tests/backgrounds_butterchurn.test.ts` carried a byte-identical `scriptedAudio()`
helper, used a dozen times, differing only in taking a `beatEvery` option where the module hardcoded a beat every 8. So
the orphan was not dead code — it was the _unused half of a duplicated pair_, which is worse, because the live half kept
working and nothing pointed at the copy going stale.

Resolved on the maintainer's direction to keep it for deterministic testing: the option moved into the module
(defaulting to 8, its documented behaviour), the test's local body became a three-line shim preserving that file's own
"no beats unless asked" default, and the module gained direct tests for the properties it exists for — identical frames
across runs, and never silent, including a waveform that actually moves rather than merely being non-zero.

_Rule: "does anything import this?" is a question worth asking of a whole package occasionally. A type check of the
entrypoint answers a narrower question than it appears to._

**A component that ignores its rectangle after the first frame (Aug 19).** Building the visualisation view for `./viz`
meant allocating components before knowing what they would hold — a pool of rows, filled each frame. Nothing drew. The
minimal reproduction is in `tests/canvas_zero_width_draw.test.ts`: a `Text` created after the app has settled, whose
rectangle is derived from its text, never appears however often the text changes. The same component with a _fixed_
rectangle repaints fine.

Three wrong theories on the way, each disproved by a smaller probe. That it was the visibility bug again — no, these
components were visible throughout. That `addChild` drew too early — deferring it by a microtask changed nothing. That
zero width specifically was fatal — no, starting at width 1 and growing to 4 fails too. What actually distinguishes
working from broken is whether the _geometry_ changes after creation, not what it starts as.

`src/viz/view.ts` is built around the constraint rather than fighting it: rows are allocated once at full panel width
and only their text and style change. That costs one style per row instead of one per cell, which is affordable
precisely because every renderer in the package encodes magnitude in glyphs as well as colour — the property that also
makes them legible without colour at all.

_Rule: a component whose rectangle is derived from its own content is only safe if it exists before the first frame. Fix
the canvas and this workaround can go; the test says so._

**An unfocused selection nobody could read (Aug 18).** `044` slice B gave the muted selection two tokens and fell back
to `chrome:foreground` on `chrome:muted` — ordinary text on mid-grey. Every test passed and the feature shipped. It was
caught only when the maintainer asked _where_ to test it and the colours were resolved across all fifteen exomux presets
first: the label measured **1.52–2.86:1**, against 4.5:1 for readable text, in every single one. The band was visible;
the word on it was not. The fallback is `chrome:on-accent` now — the colour the vocabulary already defines as legible on
a solid block — which puts every preset between 4.89 and 11.09.

The reason no test caught it is the part worth keeping. There were tests for the token resolving, for it falling back
harmlessly, for it reaching the editor, for the paint state flipping with focus, and for two lists differing on screen.
Every one asserted the two selections were **different**. Not one asserted either could be **read**. A vocabulary whose
stated purpose is "each foreground declares the background it is read against, so the editor answers can this be read"
had a pair nobody ever asked that question of. _Rule: when a token pair declares an `against`, something must assert the
contrast, or the declaration is decoration._

**Measuring colour difference with the wrong instrument (Aug 18).** The regression test for the above first asserted
that the unfocused row must be "quieter" than the focused one, by WCAG contrast against the panel. `parchment` failed:
muted 3.03 versus accent 2.37. The assertion was wrong, not the theme. WCAG contrast is a **luminance** ratio, and the
two rows differ mostly in **hue** — a saturated accent against grey. By that instrument the two selections measured
1.04–2.58:1 apart and looked identical; in OKLab they are 0.096–0.323 apart against a just-noticeable difference near
0.02, which is to say obviously different. _Rule: contrast ratio answers "can this be read", not "can these be told
apart". For the second question use a perceptual distance; `src/theme_oklch.ts` already has the conversion._

The failed assertion did surface something real, which is now a follow-up in `todo/priority.md`: `seaglass` (1.98:1) and
`parchment` (2.37:1) paint their accent so close to the panel that the _focused_ selection barely reads as selected, and
`t2`'s muted row (9.17) is louder than its accent (6.56). Pre-existing, and a theme design call.

**A checked-in artifact no gate can see is stale (Aug 18).** Slice A of `044` changed `src/focus.ts`, which is in the
Pages bundle, and merged without regenerating `docs/assets/api-workbench.js`. Nothing failed. `deno task health` runs
`web-pages-build` at step 11, which _rewrites_ the bundle, and `e2e` measures it at step 28 — so the gate always grades
a copy it just built, and a stale committed one is invisible to it. The only trace is a dirty worktree after a health
run, which is easy to miss because health legitimately touches generated files. Caught here only by reading `git status`
after switching branches. _Rule: a gate that regenerates its input before measuring it is testing the build, not the
repository. Regenerate and commit generated artifacts in the slice that changes their sources._

**The focus authority 044 asked for already existed (Aug 18).** The task file's design sketch opened with "a focus
authority — one owner per application", written before anyone looked. `src/focus.ts` has had `FocusManager`,
`FocusScope`, `bindFocusNavigation` and `bindModalFocus` for a long time, with `src/app/focus_commands.ts` wiring it to
the command registry. Building a second one would have produced exactly the competing authority `040` was cleaning up.
What it lacked was any notion of `disabled`: a three-item manager with the middle item disabled showed `next()`
overwriting that item's state with `base` on the _first_ call — `applyFocus` repaints every registered item — and
focusing it on the second. So a disabled control both lost its look and could take the keyboard. _Rule: audit before
designing; a sketch written from the symptom will invent a component the repository already has._

**A fifth theme state that could not exist (Aug 18).** The same sketch asked for `selected-unfocused` as a resolved
state "per element", alongside `focused` and `selected`. `ThemeState` is `base | focused | active | disabled` and
indexes `Theme` directly, so adding a member demands a fifth style from every theme and every preset. The mismatch is
that selection belongs to a _row_ while focus belongs to a _component_ — one list is a single focusable drawing many
rows. Splitting them into `SelectionPaintState` left the theme model untouched.

**A mask that blanked the thing being parsed (Aug 18).** Fixing `api-inventory` meant stopping its regex scanner from
reading inside string and template literals. The first version masked every literal kind for both scanners — and
`mod.ts` is nothing but `export * from "./src/..."` lines, so blanking string contents erased every module specifier and
the crawl found nothing. The inventory went from 4,231 symbols to 1. The gate's exit code alone would not have shown
this, because a 1-symbol inventory has no duplicates and 100% doc coverage; dumping the full symbol list before and
after and diffing them did. The fix tracks every literal kind but blanks selectively: the symbol scanner never reads a
literal, the re-export scanner needs the quoted specifier. _Rule: when a change is meant to remove a few things, prove
it removed exactly those and not a category._

**A budget measuring an artifact nobody rebuilt (Aug 18).** `e2e` had been failing its 500,000-byte ceiling at 532,789.
That number was never the bundle's size — `web:pages:build` had been broken since the `040` follow-up, and a failing
build leaves the previous artifact checked in, so the gate was measuring something weeks stale. Once the build worked
the real figure was 566,013. Marking `src/layout/capabilities.ts` tree-shake-safe (33 KB of frozen data, the second
largest input) recovered zero bytes, because the demo references it. _Rule: a size gate on a checked-in artifact only
means something if the build that produces it is green._

**Reading the tail of a gate run and calling it green (Aug 18).** `deno task health` prints one line per gate; I ran it
piped through `tail -14`, saw fourteen `ok` lines, and reported that every gate passed. `format` runs first and was
failing, along with five others. The exit code is the only honest signal — and a pipeline's exit code is the last
command's, so `deno task health | tail` reports grep's success, not health's. Capture to a file and check `$?`.

**"PASS" from a task that only prints (Aug 18).** While checking whether those failures predated the branch I ran
`deno task api-reference` and recorded a pass because it exited 0. That task prints the reference to stdout; only
`--check=<path>` compares it to the checked-in file. The gate had been failing at origin/main too.

**A gate nobody ran (Aug 18).** Plan 040 deleted `HitTargetStack` from the library and both suites stayed green, because
`app/api_workbench.ts` and `examples/web/api_workbench_page.ts` are only type-checked by `deno task health`. The
breakage sat there through several commits. _Rule: `deno test` is not the gate; `deno task health` is._

---

**A terminal cell with an explicit background is opaque, always (Aug 19).** exomonitor ignored exomux's window opacity,
and the cause is one line in `src/runtime/terminal_palette.ts`:
`explicit ?? (transparent ? undefined :
defaultBackground)`, and only an undefined background is later blended against
the desktop. exomonitor painted the theme's ground on every cell — `blankFrame` fills with it, every renderer sets it,
`Tui.style` paints a box of it under everything, and the view substituted it for any run that lacked one. Four layers,
each individually reasonable. An application that wants to be composited behind must leave ground cells unset; a
full-screen object still has to exist under them, or nothing repaints a cell a chart has moved off.

**A component hidden over a bare canvas is not erased (Aug 19).** `DrawObject.erase()` repaints the objects _under_ the
one being erased. A real `Tui` with a `style` paints a background box at zIndex -1, so there is always something under
it; `createTestTerminalApp` does not, so a modal closed in a headless test stays on screen and the test fails for a
reason the application does not have. Mount the thing the modal covers, as the application does. Confirmed both ways
with a two-component probe.

---

## Environment hazards

- **Never drive the maintainer's live exomux** from a script or test: it attaches to the running daemon and a real tmux.
  Isolate with `XDG_STATE_HOME` and a private tmux socket. Read-only probes (list, brief attach and detach) are safe and
  have been used to verify fixes against the real daemon.
- **GUI applications launched from the sandbox** appear on the maintainer's session and every screenshot path returns
  black. Visual confirmation has to come from them.
- **GPU validation failures reproduce only on the maintainer's strict Intel laptop**, not in the lenient sandbox. Their
  debug logs are the evidence.
- **ICC task creation silently dry-runs on stale evidence.** Rebuild `build-git-history` and `index` first, then verify
  `task.json` exists.

---

## Standing user direction

Collected from field reports, because these recur:

- Software should be composed of discrete modules that are easy to test, swap, and understand. Chaining hacks is not
  acceptable, and neither is a refactor that leaves the pieces entangled.
- Dogfood the toolkit. exomux hand-drawing what exotui already provides is a defect in both.
- Presets and shipped defaults are a floor to get back to; user work never overwrites them.
- Say what was actually done, including the parts that were not. A tradeoff stated is fine; a tradeoff implied to be
  complete is not.
