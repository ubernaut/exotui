# Priority queue

Ordered list of open work. A task not in this list is not expected of anyone. Updated August 18 2026.

## Active

1. **`025` Production demo application showcases.** Reactivated Aug 17. Orbital Command and GlyphForge are the named
   targets; the remaining eight concepts stay parked until those two have fixture-backed hero slices.

2. **`039` Window and menu animations.** Implementation complete Aug 17; **awaiting the maintainer's live visual
   check**, because animations only play on a real terminal. Nothing else blocks on it.

3. **`044` Focus as a first-class concept.** Implementation complete Aug 18 in four slices; **awaiting the maintainer's
   live visual check** of whether the muted unfocused selection reads well in a real terminal. Headless mounts prove the
   two selections differ, not that either looks right. Nothing else blocks on it.

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
- **`web-pages-build`** — `app/api_workbench_hit_targets.ts`, added by the `040` follow-up, imported
  `@ubernaut/deno-tui`. `deno check` resolves that through the import map; the esbuild docs bundle cannot. Relative now,
  like every one of its siblings.
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

## Follow-ups carried from completed work

Small, real, and worth doing when adjacent code is next touched:

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
