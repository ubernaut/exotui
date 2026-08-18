# Edit a saved theme

Status: complete August 18 2026.

User direction (Aug 18 2026): "we also need the ability to edit user created themes. that should be a button next to
new. in the settings menu."

## Problem

`042` made presets read-only and gave `[ new ]` one meaning: start a copy of the selected theme. That is right for a
preset and wrong for a theme you already saved — there is currently no way back into your own theme except selecting it
and making yet another copy, which is how you end up with "Miami custom 2 copy".

## Design

A second button, `[ edit ]`, beside `[ new ]` in the settings window's Theme header.

- **`[ new ]`** — unchanged. Starts a new theme based on whatever the theme list has selected, preset or not.
- **`[ edit ]`** — opens the editor on the selected theme itself. Enabled only when that theme is one the user saved;
  drawn disabled over a preset, because a preset cannot be edited in place and a button that silently does something
  else is worse than a button that says no.

Both act on the theme list's selection rather than on the active theme, so the header reads as a toolbar for the list
under it.

`ThemeLibrary.isBuiltIn` already answers the enablement question; `exomuxThemeCatalog` and `isExomuxUserTheme` already
tell the header which entries are the user's.

## Acceptance

- [x] `[ edit ]` opens the editor on the selected saved theme, editing it in place: saving writes back to the same id
      and does not create a copy.
- [x] `[ edit ]` is disabled over a preset, and says why when clicked.
- [x] `[ new ]` keeps working exactly as it does now.
- [x] The header degrades sensibly when narrow: buttons drop out — delete first, then edit, keeping new — rather than
      overlapping the heading.
- [x] Tests: opening for edit, saving in place, refusal over a preset, and layout at four widths.

## Also delivered

The same user direction arrived in three parts; the other two landed here rather than as their own tasks.

- **Delete.** `[ del ]` beside the other two, and `deleteTheme(id)` on the controller so deletion no longer requires an
  editor to be open. A preset refuses.
- **The desktop background was unreachable.** It was editable all along, but as "Desktop" in the Desktop group — row
  thirty-three of a list showing twenty-five, in a window whose token list had no wheel. It is now "Desktop background"
  among the chrome basics, and the list scrolls: the wheel moves the view freely, and moving the selection pulls the
  view to it.
