# Priority queue

Ordered list of open work. A task not in this list is not expected of anyone. Updated August 18 2026.

## Active

1. **`044` Focus as a first-class concept.** _(User direction, Aug 18.)_ Selection and focus are conflated: a list
   paints its selected row with the accent whether or not that list is the thing receiving keys. Give exotui a focus
   model that components and themes can both see, and a paint vocabulary that distinguishes "this is the current item"
   from "this is where your typing goes". Library-level; exomux is the first consumer.

2. **`043` Edit a saved theme.** _(User direction, Aug 18.)_ `[ edit ]` beside `[ new ]` in the settings theme header,
   opening the editor on the selected theme when it is one of the user's. `[ new ]` keeps its meaning — a copy of the
   selected theme — and presets stay read-only.

3. **`025` Production demo application showcases.** Reactivated Aug 17. Orbital Command and GlyphForge are the named
   targets; the remaining eight concepts stay parked until those two have fixture-backed hero slices.

4. **`039` Window and menu animations.** Implementation complete Aug 17; **awaiting the maintainer's live visual
   check**, because animations only play on a real terminal. Nothing else blocks on it.

## Gate failures found August 18 2026 — both fixed

Both surfaced the first time `deno task health` was run after the pointer refactor; neither is in either test suite,
which is why they went unnoticed. `deno task health` is green as of Aug 18.

- **`render/textbox-wrap-250` misses its budget by ~60x** — 10.9–15.0 ms against a 5 ms ceiling. Not a stale budget: it
  measured **0.179 ms** at `1c692900`, the commit that added it. Bisected to **`795e2d70` ("muxstone", Jul 21)**, which
  made textbox wrapping grapheme-aware — `graphemeBoundaries` per line, then `textWidth` per grapheme inside the fitting
  loop. The correctness is right (emoji, combining marks, CJK all wrap properly now); the question is whether the
  per-grapheme `textWidth` call can be avoided for the ASCII fast path, which is what a 250-row wrap is mostly made of.
  Decide: optimise the loop, or accept the cost and raise the budget with a comment saying why.
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
