# Theme editor

Status: complete August 18 2026.

User direction (Aug 18 2026): "I still don't think we're quite there with the miami theme. and that leads me to think we
should have a theme editor where users can CRUD their own themes. this would work by defining theme primitives like
button foreground/background active window border, active window titlebar foreground/background menu button
foreground/background button foreground/background selected control foreground/background scrollbar
foreground/background etc etc. we should be able to select a color via a color picker for each control and it should
show previously selected colors from the current theme so you can easily reuse them. this theme editor should get its
own window. make this a fundamental exotui feature."

The trigger matters for the acceptance test: three rounds of me guessing at a palette is three rounds too many. Done
means the user opens the editor, fixes Miami themselves, and saves it — without me.

## What already exists

This is not a green field. The library's theme system is substantial, and the plan is to finish it rather than to build
a second one beside it.

- `src/theme.ts` — seven core semantic tokens (`foreground muted accent success warning danger surface`), four states
  (`base focused active disabled`), `Style` = `(text) => string`, `createAnsiStyle`/`createAnsiThemeTokens` to build
  styles from a declarative `AnsiStyleSpec`.
- `src/theme_tokens.ts` — an OPEN registry: packages `declare("namespace:name", { fallback })` on top of the seven, and
  every declaration names an already-known token as its fallback, which makes the chains acyclic by construction. A
  plain seven-token theme therefore resolves every declared token without knowing it exists.
- `src/theme_interchange.ts` — `ThemeDocument` v2:
  `{ version, name, tokens: Record<string, Rgb>, computed?, requires? }` with validate/import/export/migrate. **Rgb
  values, not styles** — already the right shape for an editor to edit.
- `src/theme_contrast.ts` — `relativeLuminance`, `contrastRatio`, `enforceContrastConstraints`.
- `src/theme_oklch.ts` — `oklchToRgb`, `oklchInGamut`, tonal palettes. Perceptual axes for a picker that behaves.
- `src/theme_resolver.ts`, `theme_token_schemas.ts` — resolution and per-component coverage reports.
- `src/components/` — `slider`, `input`, `button`, `list`, `tabs`, `scroll_area`, `modal` to compose the UI from.

What is missing is the part the user is asking for: a NAMED vocabulary of control-level colours, a way to pick one, and
a place to do it.

## Architecture

Three layers, and the whole point is that only the middle one is new vocabulary. Values flow one way; the editor writes
documents, and everything downstream is derivation.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ThemeDocument (src/theme_interchange.ts)   the only editable truth  │
│   { name, tokens: { "accent": [247,101,184],                        │
│                     "titlebar:background-active": [198,24,118] } }  │
└───────────────┬─────────────────────────────────────────────────────┘
                │  resolveControlTokens()          NEW: theme_controls.ts
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Control tokens   ~40 named colours grouped by control               │
│   window: border / border-active / titlebar-fg / titlebar-bg / …    │
│   button: fg / bg / fg-active / bg-active / fg-disabled / …         │
│   menu:   fg / bg / fg-selected / bg-selected                       │
│   control:selected-fg / selected-bg   scrollbar:track / thumb …     │
│ Each declares a fallback to one of the seven core tokens, so a      │
│ theme that sets none of them still resolves all of them.            │
└───────────────┬─────────────────────────────────────────────────────┘
                │
    ┌───────────┴────────────┬──────────────────────────┐
    ▼                        ▼                          ▼
ThemeEngine/Style      ExomuxThemeSpec            Editor preview
(existing pipeline)    (10 fields, derived)       (paints the real
                                                   controls live)
```

The editor itself is a controller plus a view, in the library, so any exotui app embeds it; exomux supplies a window and
a place on disk.

```
ThemeEditorController (src/app/theme_editor.ts)      pure, no rendering
  ├── document: Signal<ThemeDocument>      the theme being edited
  ├── groups(): control tokens by group, each with its effective colour
  │             and whether that colour is an override or inherited
  ├── palette(): every distinct colour already in this document,
  │              most-used first — the "reuse what I already picked" list
  ├── contrast(): the readable/not verdict for every fg/bg pair
  ├── setToken / clearToken / rename / duplicate / delete / revert
  └── library: ThemeLibrary        list/load/save/remove documents
                     │
                     ▼
            ThemeStoragePort (injected)
               memory in tests · a directory of JSON on disk in exomux
```

Two rules that keep this from becoming another pile of special cases:

1. **The document is the only mutable state.** Groups, palette, contrast and preview are all derived. Nothing in the
   editor holds a second copy of a colour.
2. **A control token is never required.** Every one falls back, so a theme with seven colours is complete, an old
   document keeps working, and the editor shows inherited values greyed rather than empty.

## Slices

Each is independently testable and lands on its own; the vocabulary is the only one the others depend on.

- [x] **A — control token vocabulary** (`src/theme_controls.ts`). The ~40 namespaced tokens, grouped, each with a
      fallback, a description, and a role (`foreground` | `background` | `line`). Pure data plus the registry wiring.
      Tests: every token resolves against a bare seven-token theme; every fallback names a known token; groups cover
      every token exactly once; the names are pinned so a rename is a deliberate migration.

- [x] **B — editable model** (`src/theme_editor_model.ts`). Pure functions over a `ThemeDocument`: effective value of a
      token, set/clear, distinct-colour palette ordered by use, per-pair contrast report, and validation. No signals, no
      rendering. Tests: overrides beat fallbacks, clearing restores inheritance, the palette dedupes and orders, the
      contrast report flags the pair Miami got wrong (bright accent as text on a light ground).

- [x] **C — colour picker component** (`src/components/color_picker.ts`). A pure `colorPickerState` reducer first — hex
      parse/format, OKLCH lightness/chroma/hue axes, RGB axes, swatch selection, clamping into gamut — then the
      component that composes `Slider`/`Input`/`Button` around it. Keyboard and pointer both drive it. The swatch strip
      is fed by the editor's palette, which is the user's "show previously selected colors" requirement.

- [x] **D — editor controller** (`src/app/theme_editor.ts`) and view. CRUD over documents, live preview of the real
      controls, contrast warnings inline. `ThemeLibrary` + `ThemeStoragePort` for load/save/list/remove using the
      existing interchange JSON.

- [x] **E — exomux window**. A `theme-editor` window on the start menu, the editor's document applied to the live
      desktop as it is edited, saved themes registered into the catalog at launch, and the built-ins convertible to
      documents so Miami can be opened, fixed and saved as the user's own.

      Two things landed differently from the sketch. There is no prefix binding yet — the start menu opens it and
      Escape closes it; a binding is a one-line addition when the key is chosen. And painting had to meet the
      vocabulary halfway: `ExomuxThemeSpec` gained an optional `controls` map, and the chrome painters now read their
      colour through `exomuxControlColor(theme, token, fallback)`. Window borders, title bars (active and not) and
      menu selection are wired; the remaining tokens resolve and are editable but are not yet consulted by a painter,
      which is a mechanical follow-on rather than a design question.

## Non-goals

- Rebuilding exomux's painter on top of the library's `Style` pipeline. exomux keeps painting from `ExomuxThemeSpec`;
  the spec is derived from control tokens instead of hand-written. That refactor is a separate plan if it is ever worth
  doing.
- Editing the four component STATES (base/focused/active/disabled) as free-form styles. The editor edits colours; bold
  and underline stay with the component definitions.
- Sharing user themes between machines. The shared-state channel from plan 041 carries the ACTIVE theme id; a document
  that only exists on one machine is a later slice if it is wanted.
