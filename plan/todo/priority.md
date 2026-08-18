# Priority queue

Ordered list of open work. A task not in this list is not expected of anyone. Updated August 18 2026.

## Active

1. **`044` Focus as a first-class concept.** _(User direction, Aug 18.)_ Selection and focus are conflated: a list
   paints its selected row with the accent whether or not that list is the thing receiving keys. Give exotui a focus
   model that components and themes can both see, and a paint vocabulary that distinguishes "this is the current item"
   from "this is where your typing goes". Library-level; exomux is the first consumer.

2. **`025` Production demo application showcases.** Reactivated Aug 17. Orbital Command and GlyphForge are the named
   targets; the remaining eight concepts stay parked until those two have fixture-backed hero slices.

3. **`039` Window and menu animations.** Implementation complete Aug 17; **awaiting the maintainer's live visual
   check**, because animations only play on a real terminal. Nothing else blocks on it.

## `deno task health` is red — six gates, all pre-existing

Verified at `origin/main` (`ab98acbc`), so none of these came from this session's work. They are listed here because the
trunk is supposed to stay releasable and currently is not.

- **`format`** — 11 unformatted files at `origin/main`, 7 after this branch fixes its own two. The rest are generated
  Unicode tables, three completed plan files, `docs/exomux-component-audit.md`, and `packages/exomux/audio_scripted.ts`.
  Some are formatted per `packages/exomux`'s own config and disagree with the root's; that conflict needs deciding
  before running `deno fmt` over them.
- **`api-inventory`** — duplicate exported symbol `createApp` in `src/app/app.ts` and `src/tooling/init_templates.ts`.
- **`api-reference`** — `docs/api-reference.md` is stale. Regenerating is a 3,620-line diff, so it has been stale for a
  while. Note that `deno task api-reference` PRINTS the reference; only `--check=` verifies it, which is how it looked
  like it was passing.
- **`package-check`**, **`release-check`**, **`web-pages-build`** — failing; causes not yet diagnosed.

Worth one `bug/health-gates` branch rather than being absorbed into unrelated work.

## Gate failures found August 18 2026 — both fixed

Both surfaced the first time `deno task health` was run after the pointer refactor; neither is in either test suite,
which is why they went unnoticed. Both are fixed. They are not the six gates above, which are older and still red.

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

## Follow-ups carried from completed work

Small, real, and worth doing when adjacent code is next touched:

- **`042` — finish the token-to-painter wiring.** Window chrome, menus, list selection, scrollbars and modal buttons
  read their control tokens; the rest of the vocabulary resolves and is editable but still paints from the ten-colour
  spec. Mechanical.
- **`042` — a prefix binding for the theme editor.** It opens from settings only.
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
