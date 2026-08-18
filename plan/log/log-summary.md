# Project log — summary

The narrative history. Read this to see where things stand; `log-detail.md` has the decisions, dead ends, and repro
details behind it. Newest first.

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
