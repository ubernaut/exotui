# Focus as a first-class concept

Status: planned August 18 2026.

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

To be refined when the work starts, after auditing what `src/app` already tracks.

- **A focus authority** — one owner per application, holding the focused element's id, with a way to move focus (next,
  previous, to a specific id) and to notify. The window host already knows its active window; this is the same idea one
  level down, and the two need to compose rather than compete: focus lives inside the active window.
- **A resolved state per element**: `focused` (has the keyboard), `selected` (current item of its collection),
  `selected-unfocused` (current item of a collection that does not have the keyboard). Components ask for it rather than
  deriving it from a boolean they were passed.
- **A paint vocabulary that distinguishes them.** The control-token vocabulary from `042` has
  `control:background-selected` and `control:border-focused` but nothing for the third state; a
  `control:background-selected-unfocused` (falling back to a muted surface) completes it.
- **Keyboard traversal** — Tab and Shift-Tab move focus between elements, arrows move selection within one. Today
  exomux's Tab moves between panes and the settings window has its own pane notion; both should become consumers of the
  same authority.

## Risks

- Every surface that paints a selection is a call site. The change is broad even if each edit is small, so it wants a
  vocabulary that lets the old behaviour keep working until each site is converted.
- exomux's window focus and a component-level focus can disagree. The rule has to be stated once — window focus gates
  component focus — and enforced in the authority rather than at each call site.

## Acceptance

- [ ] A focus authority in `src/app`, pure and testable, with tests for move, wrap, disabled elements, and removal of
      the focused element.
- [ ] Components resolve `focused` / `selected` / `selected-unfocused` from it rather than from an ad-hoc boolean.
- [ ] A token for the unfocused selection, editable in the theme editor, falling back so existing themes are unchanged.
- [ ] exomux: with two lists on screen, only the one receiving keys shows an active selection; the other shows a muted
      one. Verified in a mounted test, not by eye.
- [ ] `arch/overview.md`'s "focus and selection are conflated" note is removed because it is no longer true.
