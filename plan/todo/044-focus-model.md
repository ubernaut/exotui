# Focus as a first-class concept

Status: in progress August 18 2026 — slices A, B and C (List) landed.

User direction (Aug 18 2026): "I think we also need a exotui grounded feature for what element has the current focus.
currently we conflate selected items with items that have focus."

## Problem

Selection and focus are different facts and the codebase treats them as one:

- **Selection** is "this is the current item of this collection" — the highlighted row of a list, the active tab. It
  belongs to the collection and survives the collection losing focus.
- **Focus** is "this is where the keyboard is going" — exactly one thing in the whole application at a time.

Painting the selected row with the accent regardless of focus makes a screen with three lists look like it has three
active cursors, and gives the user no way to see which one their arrow keys will move. The theme model has always had a
`focused` state and a `withFocusCue` helper; what is missing is the thing that knows _which element_ has focus, so that
state can be resolved.

## Design sketch

Refined August 18 2026 after auditing what exists. The sketch below was written expecting to build a focus authority;
one already existed, so most of this task is smaller than it looked and one part of it is different.

**What was already there.** `src/focus.ts` holds `FocusManager` — register, focus, next, previous, clear, inspect — plus
`FocusScope` for modals, `bindFocusNavigation` for Tab and Shift-Tab, `bindModalFocus`, and `focusCommands` in
`src/app/focus_commands.ts` wiring it to the command registry. It is the authority the sketch asked for, at
`src/focus.ts` rather than under `src/app`. Extending it in place beats moving it: the move would be a public API break
for no behavioural gain.

**What was actually broken.** The authority did not know what `disabled` means. Proved with a three-item manager, one
disabled:

- the first `next()` overwrote the disabled item's state with `base`, so it lost its look without ever being focused —
  `applyFocus` painted every registered item on every focus change;
- the second `next()` focused it, so a disabled control took the keyboard.

Both are fixed and pinned in `tests/focus_model.test.ts`: traversal skips disabled items and still wraps, `focus()`
refuses one asked for by name, a screen of entirely disabled controls leaves focus alone instead of spinning, and no
path — `next`, `clear`, `unregister` — paints over a disabled state.

**Where the sketch was wrong.** `selected-unfocused` cannot be a component state. `ThemeState` is
`base | focused | active | disabled` and indexes `Theme` directly, so a fifth member would demand a fifth style from
every theme. Selection is a property of a _row_, not of the component: a list is one focusable that draws many rows. So
the third state lives in its own union, `SelectionPaintState` (`selected | selected-unfocused | unselected`), resolved
by a pure `resolveSelectionPaint({ selected, collectionFocused })`, with `FocusManager.isFocused(item)` supplying the
second argument so call sites stop reading `manager.index`.

**What is left.** The token (`control:background-selected-unfocused`, falling back to a muted surface so existing themes
are unchanged), the component call sites that still take a bare `selected: boolean`, and exomux.

## Risks

- Every surface that paints a selection is a call site. The change is broad even if each edit is small, so it wants a
  vocabulary that lets the old behaviour keep working until each site is converted.
- exomux's window focus and a component-level focus can disagree. The rule has to be stated once — window focus gates
  component focus — and enforced in the authority rather than at each call site.

## Acceptance

- [x] A focus authority, pure and testable, with tests for move, wrap, disabled elements, and removal of the focused
      element. It lives at `src/focus.ts`, not `src/app` — see the design sketch.
- [x] A resolved paint state that tells `selected` from `selected-unfocused`, and `FocusManager.isFocused` to decide it.
- [ ] Components resolve `focused` / `selected` / `selected-unfocused` from it rather than from an ad-hoc boolean.
      `List` does, with `selectedUnfocusedStyle` and a third argument on `rowStyle`/`markerFor`. `Tree`, `ContextMenu`
      and `VirtualList` still take a bare boolean.
- [x] A token for the unfocused selection, editable in the theme editor, falling back so existing themes are unchanged.
      Two of them: the background and the text read against it, because the vocabulary's rule is that every foreground
      names its ground.
- [ ] exomux: with two lists on screen, only the one receiving keys shows an active selection; the other shows a muted
      one. Verified in a mounted test, not by eye.
- [ ] `arch/overview.md`'s "focus and selection are conflated" note is removed because it is no longer true.

## Slices

- **A — the model.** Done Aug 18. Disabled-aware traversal, `isFocused`, `SelectionPaintState`, `resolveSelectionPaint`.
- **B — the token.** Done Aug 18. `control:background-selected-unfocused` falling back to `chrome:muted`, plus
  `control:foreground-selected-unfocused` read against it. Both reach the editor through `themeEditorGroups`, which
  enumerates the registry, so no editor change was needed.
- **C — the List call site.** Done Aug 18. The paint state is an _additional_ argument rather than a replacement, and
  `selectedUnfocusedStyle` is optional, so a caller that never asked for the distinction paints exactly as before — both
  pinned. The pure `visibleListRowsInto` renders as though focused and says so, because it has no component and
  therefore no focus to consult; a parameter for it can be added when something actually needs one.
- **C2 — the remaining call sites.** `Tree`, `ContextMenu`, `VirtualList`. Same additive shape as `List`.
- **D — exomux.** The first consumer, with the two-list mounted test.
