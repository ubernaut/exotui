# exotui — scope, goals, and direction

**This file is user-owned.** An assistant may read it freely and must have explicit permission before changing it.
Restructured into the vibe-plan shape on August 18 2026 from the previous `plan/PLAN.md`; the operating detail it used
to carry now lives in `todo/priority.md` (what is next) and `log/log-summary.md` (what happened).

## The problem

Terminal UI toolkits force a choice: a rich widget set that only works in one terminal, or a portable core with nothing
built on top of it. Neither gives you an application platform — something you can build a real, mouse-driven, themed,
multi-window program on and have it run in a terminal, over SSH, and in a browser without a rewrite.

## What this is

**exotui** — a Deno TUI library, forked from Im-Beast's deno_tui — plus **exomux**, a terminal multiplexer and desktop
built on it.

exomux is not a sample. It is the proving ground: a real application, used daily, whose demands decide what the library
needs next. Features are prototyped there under load and promoted into exotui as first-class, renderer-neutral
components once their shape is known.

## Users

- **Library users** building terminal applications in Deno who want components, layout, theming, and input handled.
- **exomux users** who want a multiplexer with windows, a mouse, themes, and a detachable daemon — reachable from a
  desktop terminal, a browser, or a phone.
- **The maintainer**, who uses exomux every day and whose field reports are the primary bug source.

## Goals

1. **A component library that behaves like one.** Windows, lists, trees, tables, inputs, modals, menus, terminals —
   renderer-neutral, individually testable, and documented by their tests.
2. **Terminal, browser, and remote parity.** The same application runs in a terminal, in a browser canvas, and over a
   remote link, without the application knowing which.
3. **exomux as a credible multiplexer.** Detachable daemon, multiple clients on one session, real PTYs, mouse and touch,
   themes, animated backgrounds, a network panel.
4. **Portability as a property, not a claim.** Capability detection over assumption; degrade rather than break.
5. **Performance that suits the hardware.** Range-aware rendering, GPU where a GPU exists, bounded work per frame.

## Non-goals

- A cross-language toolkit. This is Deno and TypeScript.
- Matching every Textual or OpenTUI feature for its own sake. `todo/done/036` and `037` catalogue the field as a backlog
  to pull from when something is actually needed.
- A general window manager. exomux is a terminal desktop, not a compositor for other people's programs.
- Runtime dependencies in the library core. See `arch/stack.md`.

## Success criteria

- An application can be written against the public API without reaching into `src/` internals, and the entrypoints stay
  within their documented export budgets.
- The full suite passes on every commit, and the health gate passes before release.
- exomux runs for days without restarting, survives client upgrades around a live daemon, and reattaches with scrollback
  intact.
- A change to a component is a change in one file with its own tests, not a sweep across the codebase.
- The maintainer's field reports get fixed at the cause, with a test that pins the fix.

## High-level plan

The build order that got here, and where it goes next:

1. **Library foundations** — rendering, layout, components, theming, portability. _(001–022, done.)_
2. **exomux as the proving ground** — PTY sessions, the daemon, windowing, the desktop. _(016, 017, 027–029, done.)_
3. **Back-feed** — promote what exomux proved into exotui as first-class components. _(031, 032, 036, 037, done; this is
   the standing principle rather than a finished phase.)_
4. **Hardening from field use** — the maintainer's reports drive UX, multi-client, input, and protocol fixes. _(033–035,
   038, 040–042, done.)_
5. **Showcases** — demo applications that exercise the library as a system rather than as a widget gallery. _(025, in
   flight.)_
6. **Open research** — an HTML/CSS authoring layer and terminal graphics protocols, pulled forward when a real need
   appears. _(`todo/hiatus/`.)_

Current queue and its ordering: `todo/priority.md`.
