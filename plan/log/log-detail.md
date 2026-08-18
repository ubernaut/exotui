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
