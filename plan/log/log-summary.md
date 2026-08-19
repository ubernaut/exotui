# Project log — summary

The narrative history. Read this to see where things stand; `log-detail.md` has the decisions, dead ends, and repro
details behind it. Newest first.

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
